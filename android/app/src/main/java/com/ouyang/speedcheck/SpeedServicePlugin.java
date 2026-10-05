package com.ouyang.speedcheck;

import android.content.Intent;
import android.os.Build;
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
