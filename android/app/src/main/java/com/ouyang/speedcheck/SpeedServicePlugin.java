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
}
