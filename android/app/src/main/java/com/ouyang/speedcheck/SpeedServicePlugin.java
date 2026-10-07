package com.ouyang.speedcheck;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS 侧开关后台测速前台服务的桥。
 *
 * <p>所有失败都以 {@code started:false, error:"..."} 回给 JS（而不是 reject 后把原因丢在原生侧）：
 * 真机上 OEM ROM 的限制五花八门，只有把真实异常摆出来，用户截图才能定位到具体该开哪个权限。
 * catch 一律用 Throwable：部分 ROM 会抛 Error 子类，不能让桥崩掉。
 */
@CapacitorPlugin(name = "SpeedService")
public class SpeedServicePlugin extends Plugin {

    /** 通知权限请求码：enable 与 prepPermissions 共用（同一个系统对话框，重复请求无害）。 */
    private static final int REQ_NOTIFICATIONS = 1001;

    /** App 启动时预请求通知权限：避免首次开跑时弹系统对话框打断启动流程。 */
    @PluginMethod
    public void prepPermissions(PluginCall call) {
        try {
            requestNotificationsIfNeeded();
            call.resolve();
        } catch (Throwable t) {
            call.reject("prepPermissions failed: " + t.getMessage());
        }
    }

    /**
     * 电池优化豁免状态查询/申请。
     *
     * <p>HyperOS/MIUI 等国产 ROM 冻结后台进程的头号手段就是电池优化；未豁免时连原生前台服务的
     * 线程都可能被一起冻住。ask=true 且尚未豁免时拉起系统授权对话框（用户点一次允许即可）。
     */
    @PluginMethod
    public void batteryExempt(PluginCall call) {
        JSObject r = new JSObject();
        try {
            Context ctx = getContext();
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            String pkg = ctx.getPackageName();
            boolean exempt = pm != null && pm.isIgnoringBatteryOptimizations(pkg);
            r.put("exempt", exempt);
            if (!exempt && Boolean.TRUE.equals(call.getBoolean("ask"))) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + pkg));
                Activity activity = getActivity();
                if (activity != null) {
                    activity.startActivity(i);
                } else {
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                }
            }
            call.resolve(r);
        } catch (Throwable t) {
            // 某些 ROM 没有该设置页或禁止跳转：如实上报，引导用户去系统设置手动改
            r.put("exempt", false);
            r.put("error", t.getClass().getSimpleName() + ": " + t.getMessage());
            call.resolve(r);
        }
    }

    @PluginMethod
    public void enable(PluginCall call) {
        boolean notifGranted = requestNotificationsIfNeeded();
        try {
            Intent i = new Intent(getContext(), SpeedForegroundService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                getContext().startForegroundService(i);
            } else {
                getContext().startService(i);
            }
            JSObject r = new JSObject();
            r.put("started", true);
            r.put("notifGranted", notifGranted);
            call.resolve(r);
        } catch (Throwable t) {
            // 把真实原因透传给 JS：ForegroundServiceStartNotAllowedException / SecurityException / OEM 私有限制
            JSObject r = new JSObject();
            r.put("started", false);
            r.put("error", t.getClass().getSimpleName() + ": " + t.getMessage());
            android.util.Log.w("SpeedServicePlugin", "enable failed: " + t, t);
            call.resolve(r);
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), SpeedForegroundService.class);
            getContext().stopService(i);
            call.resolve();
        } catch (Throwable t) {
            call.reject("stop failed: " + t.getMessage());
        }
    }

    /** Android 13+ 通知需要运行时授权：弹系统对话框（拒绝仅隐藏通知，不阻塞服务启动）。返回是否已授权。 */
    private boolean requestNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) {
            return true;
        }
        Activity activity = getActivity();
        if (activity == null) {
            return false;
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        return false;
    }

    // ---------------- 后台泵：切后台/息屏时由 JS 交棒给原生线程继续消耗流量 ----------------
    // 数值一律以字符串传递（getString 对 JSON 数字同样返回其字符串形式），避免依赖插件调用的数字取值 API。

    @PluginMethod
    public void pumpStart(PluginCall call) {
        try {
            String url = call.getString("url");
            boolean ok = SpeedForegroundService.startPump(
                    url,
                    (int) parseLong(call.getString("threads"), 4L),
                    parseLong(call.getString("limitBps"), 0L),
                    parseLong(call.getString("budgetBytes"), 0L),
                    parseLong(call.getString("alreadyBytes"), 0L));
            JSObject r = new JSObject();
            r.put("started", ok);
            if (!ok) {
                r.put("error", url == null || url.length() == 0 ? "url 为空"
                        : "前台服务未运行（可能被 ROM 杀掉或启动失败）");
            }
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("pumpStart failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void pumpStop(PluginCall call) {
        try {
            long bytes = SpeedForegroundService.stopPump();
            JSObject r = new JSObject();
            r.put("bytes", String.valueOf(bytes));
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("pumpStop failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void pumpStats(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("running", SpeedForegroundService.isPumpRunning());
            r.put("bytes", String.valueOf(SpeedForegroundService.pumpBytesNow()));
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("pumpStats failed: " + t.getMessage());
        }
    }

    /** 登记息屏自动接管参数；disarm 时同时停泵。 */
    @PluginMethod
    public void armPump(PluginCall call) {
        try {
            SpeedForegroundService.armPump(
                    call.getString("url"),
                    (int) parseLong(call.getString("threads"), 4L),
                    parseLong(call.getString("limitBps"), 0L),
                    parseLong(call.getString("budgetBytes"), 0L),
                    parseLong(call.getString("alreadyBytes"), 0L));
            call.resolve();
        } catch (Throwable t) {
            call.reject("armPump failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void disarmPump(PluginCall call) {
        try {
            long bytes = SpeedForegroundService.disarmPump();
            JSObject r = new JSObject();
            r.put("bytes", String.valueOf(bytes));   // JS 侧必须把它计入总使用量，否则这批流量丢账
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("disarmPump failed: " + t.getMessage());
        }
    }

    private static long parseLong(String s, long fallback) {
        if (s == null) {
            return fallback;
        }
        try {
            return Long.parseLong(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
