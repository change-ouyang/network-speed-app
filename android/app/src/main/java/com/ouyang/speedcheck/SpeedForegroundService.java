package com.ouyang.speedcheck;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 前台服务：保持后台测速时进程不被冻结/回收，并持有 CPU 唤醒锁。
 *
 * <p>后台泵（pump）：手机息屏或切到后台后，WebView 的 JS 会被系统冻结（真机实测：页面未重载但数字停住），
 * 此时由 JS 交棒给本服务，用纯原生线程继续下载同一地址消耗流量；回到前台时 JS 取回原生侧消耗的字节数。
 * 原生侧只做「持续下载 + 计数 + 重试 + 限速 + 预算上限」，不做任何「节点是否可用」的判断，避免误停。
 */
public class SpeedForegroundService extends Service {

    private static final String CHANNEL_ID = "speed_service";
    private static final int NOTIFY_ID = 1;
    private static final String UA =
            "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    private static final int READ_BUF = 64 * 1024;

    private PowerManager.WakeLock wakeLock;

    // ---------------- 后台泵状态（静态：插件与泵线程共用，无需绑定服务） ----------------
    private static final Object PUMP_LOCK = new Object();
    private static final AtomicLong PUMP_BYTES = new AtomicLong(0);
    private static final List<Thread> PUMP_WORKERS = new ArrayList<Thread>();
    private static final List<HttpURLConnection> PUMP_CONNS = new ArrayList<HttpURLConnection>();
    private static volatile boolean pumpRunning = false;
    private static volatile int pumpThreadCount = 1;
    private static volatile long pumpLimitBps = 0;      // 平均速率上限（0 = 不限）
    private static volatile long pumpBudgetBytes = 0;   // 交棒时剩余用量预算（0 = 不限）
    private static volatile long pumpBaseBytes = 0;     // 交棒时 JS 侧已消耗的总量（仅用于通知文案）
    private static volatile long pumpNoteAt = 0;
    private static volatile SpeedForegroundService instance = null;

    // 「已授权自动接管」的参数：JS 开始测试时登记，息屏广播里据此自动起泵
    private static volatile String armedUrl = null;
    private static volatile int armedThreads = 4;
    private static volatile long armedLimitBps = 0;
    private static volatile long armedBudgetBytes = 0;
    private static volatile long armedBaseBytes = 0;
    private BroadcastReceiver screenReceiver = null;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        instance = this;
        startInForeground(buildNotification("后台测速进行中，点击回到应用"));
        PowerManager pm = (PowerManager) getApplicationContext().getSystemService(Context.POWER_SERVICE);
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SpeedCheck:bg");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) {
            wakeLock.acquire();
        }
        registerScreenReceiver();
        return START_STICKY;
    }

    /**
     * 息屏兜底：WebView 有时来不及触发 visibilitychange（或 JS 已被系统冻结），
     * 只要此前已被 armPump「授权」，息屏广播一到就由原生自己接管，保证息屏期间照样消耗流量。
     */
    private void registerScreenReceiver() {
        if (screenReceiver != null) {
            return;
        }
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent != null && Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                    String url = armedUrl;
                    if (url != null && !pumpRunning && instance != null) {
                        startPump(url, armedThreads, armedLimitBps, armedBudgetBytes, armedBaseBytes);
                    }
                }
            }
        };
        try {
            registerReceiver(screenReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF));
        } catch (Throwable t) {
            screenReceiver = null;
        }
    }

    @Override
    public void onDestroy() {
        stopPump();
        instance = null;
        if (screenReceiver != null) {
            try {
                unregisterReceiver(screenReceiver);
            } catch (Throwable ignored) {
            }
            screenReceiver = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        super.onDestroy();
    }

    /** 用户从最近任务里划掉应用：立刻停泵并停服务（否则原生泵会无人看管地一直消耗流量）。 */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopPump();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @SuppressWarnings("deprecation")
    private void startInForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFY_ID, notification);
        }
    }

    // ---------------- 后台泵：对外（插件）接口 ----------------

    /**
     * 启动后台泵。已在运行则直接返回 true（幂等）。
     *
     * @param url           要消耗的地址
     * @param threads       原生线程数
     * @param limitBps      平均速率上限（B/s，0 = 不限）
     * @param budgetBytes   本轮最多再消耗多少字节（0 = 不限，用于「用量上限」）
     * @param alreadyBytes  JS 侧已消耗的总量（仅用于通知文案）
     */
    public static boolean startPump(String url, int threads, long limitBps, long budgetBytes, long alreadyBytes) {
        if (url == null || url.length() == 0) {
            return false;
        }
        // 服务没在跑就没有唤醒锁，息屏后 CPU 会休眠、泵也没意义：如实返回失败，让 JS 侧继续自己跑
        if (instance == null) {
            return false;
        }
        synchronized (PUMP_LOCK) {
            if (pumpRunning) {
                return true;
            }
            pumpRunning = true;
            pumpThreadCount = Math.max(1, Math.min(32, threads));
            pumpLimitBps = Math.max(0, limitBps);
            pumpBudgetBytes = Math.max(0, budgetBytes);
            pumpBaseBytes = Math.max(0, alreadyBytes);
            PUMP_BYTES.set(0);
            pumpNoteAt = 0;
            for (int i = 0; i < pumpThreadCount; i++) {
                Thread t = new Thread(new PumpWorker(url), "speed-pump-" + i);
                PUMP_WORKERS.add(t);
                t.start();
            }
        }
        return true;
    }

    /** 停止后台泵并返回本轮原生侧消耗的字节数（读数即清零：重复调用只会得到 0，不会重复计数）。 */
    public static long stopPump() {
        long bytes;
        synchronized (PUMP_LOCK) {
            pumpRunning = false;
            for (int i = 0; i < PUMP_CONNS.size(); i++) {
                try {
                    PUMP_CONNS.get(i).disconnect();
                } catch (Throwable ignored) {
                    // 断开失败无所谓：读循环会自己超时退出
                }
            }
            PUMP_CONNS.clear();
            for (int i = 0; i < PUMP_WORKERS.size(); i++) {
                try {
                    PUMP_WORKERS.get(i).interrupt();
                } catch (Throwable ignored) {
                }
            }
            PUMP_WORKERS.clear();
            bytes = PUMP_BYTES.getAndSet(0);
        }
        return bytes;
    }

    /** 登记「允许息屏自动接管」的参数（JS 开始测试且开启保持后台运行时调用）。 */
    public static void armPump(String url, int threads, long limitBps, long budgetBytes, long alreadyBytes) {
        armedUrl = url;
        armedThreads = Math.max(1, Math.min(32, threads));
        armedLimitBps = Math.max(0, limitBps);
        armedBudgetBytes = Math.max(0, budgetBytes);
        armedBaseBytes = Math.max(0, alreadyBytes);
    }

    /** 撤销授权并停掉后台泵（测试结束 / 关闭保持后台运行 / 退出应用时调用）。 */
    public static void disarmPump() {
        armedUrl = null;
        stopPump();
    }

    public static boolean isPumpRunning() {
        return pumpRunning;
    }

    public static long pumpBytesNow() {
        return PUMP_BYTES.get();
    }

    // ---------------- 后台泵：工作线程 ----------------

    private static final class PumpWorker implements Runnable {
        private final String url;

        PumpWorker(String url) {
            this.url = url;
        }

        @Override
        public void run() {
            byte[] buf = new byte[READ_BUF];
            long windowStart = System.currentTimeMillis();
            long windowBytes = 0;
            while (pumpRunning) {
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(20000);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", UA);
                    // 按真实到达的字节计数：不要让 gzip 把字节数变形
                    conn.setRequestProperty("Accept-Encoding", "identity");
                    synchronized (PUMP_LOCK) {
                        PUMP_CONNS.add(conn);
                    }
                    int code = conn.getResponseCode();
                    if (code >= 400) {
                        sleepQuietly(1500);
                        continue;
                    }
                    InputStream in = conn.getInputStream();
                    int n;
                    while (pumpRunning && (n = in.read(buf)) > 0) {
                        long total = PUMP_BYTES.addAndGet(n);
                        if (pumpBudgetBytes > 0 && total >= pumpBudgetBytes) {
                            pumpRunning = false;   // 到达本次预算：停下即可，由 JS 侧决定后续
                            break;
                        }
                        if (pumpLimitBps > 0) {
                            windowBytes += n;
                            long perThread = Math.max(1, pumpLimitBps / Math.max(1, pumpThreadCount));
                            long expectMs = (windowBytes * 1000L) / perThread;
                            long elapsed = System.currentTimeMillis() - windowStart;
                            if (expectMs > elapsed) {
                                sleepQuietly(Math.min(2000L, expectMs - elapsed));
                                windowStart = System.currentTimeMillis();
                                windowBytes = 0;
                            } else if (elapsed > 3000) {
                                windowStart = System.currentTimeMillis();
                                windowBytes = 0;
                            }
                        }
                        maybeUpdateNotification();
                    }
                    try {
                        in.close();
                    } catch (Throwable ignored) {
                    }
                } catch (Throwable t) {
                    // 任何异常都只退避重试：原生侧绝不因此停止消耗
                    sleepQuietly(1500);
                } finally {
                    if (conn != null) {
                        synchronized (PUMP_LOCK) {
                            PUMP_CONNS.remove(conn);
                        }
                        try {
                            conn.disconnect();
                        } catch (Throwable ignored) {
                        }
                    }
                }
            }
        }
    }

    /** 泵在跑时把进度写进常驻通知（≤ 每 3 秒一次），用户锁屏也能看到后台确实在消耗。 */
    private static void maybeUpdateNotification() {
        long now = System.currentTimeMillis();
        if (now - pumpNoteAt < 3000) {
            return;
        }
        pumpNoteAt = now;
        SpeedForegroundService svc = instance;
        if (svc == null) {
            return;
        }
        try {
            NotificationManager nm = (NotificationManager) svc.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(NOTIFY_ID, svc.buildNotification("后台消耗中 · 累计 " + humanBytes(pumpBaseBytes + PUMP_BYTES.get())));
        } catch (Throwable ignored) {
            // 通知更新失败不影响下载
        }
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String humanBytes(long bytes) {
        if (bytes >= 1024L * 1024L * 1024L) {
            return String.format(java.util.Locale.US, "%.2f GB", bytes / 1073741824.0);
        }
        if (bytes >= 1024L * 1024L) {
            return String.format(java.util.Locale.US, "%.1f MB", bytes / 1048576.0);
        }
        if (bytes >= 1024L) {
            return String.format(java.util.Locale.US, "%.0f KB", bytes / 1024.0);
        }
        return bytes + " B";
    }

    // ---------------- 通知 ----------------

    /** 点击通知回到 App：singleTask + CLEAR_TOP 复用已有实例，不会重开一个页面。 */
    private PendingIntent contentIntent() {
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 0, launch, flags);
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "后台测速", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("后台测速进行中的常驻通知");
            nm.createNotificationChannel(ch);
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
                .setContentTitle("流量消耗器")
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat_speed)
                .setContentIntent(contentIntent())
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }
}
