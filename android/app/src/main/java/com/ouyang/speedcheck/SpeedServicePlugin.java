package com.ouyang.speedcheck;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS 侧开关后台测速前台服务的桥。 */
@CapacitorPlugin(name = "SpeedService")
public class SpeedServicePlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        try {
            // Android 13+ 通知需要运行时授权：弹系统对话框（不阻塞服务启动，拒绝仅隐藏通知）
            if (Build.VERSION.SDK_INT >= 33) {
                Activity activity = getActivity();
                if (activity != null && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
                }
            }
            Intent i = new Intent(getContext(), SpeedForegroundService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                getContext().startForegroundService(i);
            } else {
                getContext().startService(i);
            }
            JSObject r = new JSObject();
            r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), SpeedForegroundService.class);
            getContext().stopService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("stop failed: " + e.getMessage());
        }
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
            call.resolve(r);
        } catch (Exception e) {
            call.reject("pumpStart failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pumpStop(PluginCall call) {
        try {
            long bytes = SpeedForegroundService.stopPump();
            JSObject r = new JSObject();
            r.put("bytes", String.valueOf(bytes));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("pumpStop failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pumpStats(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("running", SpeedForegroundService.isPumpRunning());
            r.put("bytes", String.valueOf(SpeedForegroundService.pumpBytesNow()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("pumpStats failed: " + e.getMessage());
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
