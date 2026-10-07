package android.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/**
 * 桩：android.app.Service
 *
 * 真实链是 Service extends ContextWrapper extends Context，本桩简化为 extends Context，
 * 这样 Service 子类内部可以直接调用 getSystemService()/getApplicationContext()。
 */
public abstract class Service extends Context {

    public static final int START_STICKY = 1;
    public static final int START_NOT_STICKY = 2;
    public static final int START_REDELIVER_INTENT = 3;
    public static final int START_STICKY_COMPATIBILITY = 0;

    /** 真实签名：public abstract IBinder onBind(Intent intent) */
    public abstract android.os.IBinder onBind(Intent intent);

    public void onCreate() {}

    /** 真实签名：public int onStartCommand(Intent intent, int flags, int startId) */
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    public void onDestroy() {}

    /**
     * 真实签名：public void onTaskRemoved(Intent rootIntent)
     * 这是 Service 自己定义的方法（用户从最近任务划掉应用时回调）。
     */
    public void onTaskRemoved(Intent rootIntent) {}

    /** 真实签名：public final void stopSelf() */
    public final void stopSelf() {}

    /** 真实签名：public final void stopSelf(int startId) */
    public final void stopSelf(int startId) {}

    /** 真实签名：public final boolean stopSelfResult(int startId) */
    public final boolean stopSelfResult(int startId) {
        return false;
    }

    /** 真实签名：public final void startForeground(int id, Notification notification) */
    public final void startForeground(int id, Notification notification) {}

    /** 真实签名（API 29+）：public final void startForeground(int id, Notification notification, int foregroundServiceType) */
    public final void startForeground(int id, Notification notification, int foregroundServiceType) {}

    public final void stopForeground(boolean removeNotification) {}

    // ---- 以下方法在真实 Android 里由 ContextWrapper（Service 的父类）提供「具体实现」，
    //      并非抽象方法。所以这里必须给具体实现，否则子类会被判为未实现抽象方法。 ----
    @Override
    public Context getApplicationContext() {
        return null;
    }

    @Override
    public Object getSystemService(String name) {
        return null;
    }

    @Override
    public ComponentName startService(Intent service) {
        return null;
    }

    @Override
    public ComponentName startForegroundService(Intent service) {
        return null;
    }

    @Override
    public boolean stopService(Intent service) {
        return false;
    }

    // ContextWrapper 同样为接收器注册提供了具体实现
    @Override
    public Intent registerReceiver(android.content.BroadcastReceiver receiver, android.content.IntentFilter filter) {
        return null;
    }

    @Override
    public void unregisterReceiver(android.content.BroadcastReceiver receiver) {}
}
