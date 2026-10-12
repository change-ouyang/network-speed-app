package com.ouyang.speedcheck;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor 在 super.onCreate 中创建桥，插件必须提前登记。
        registerPlugin(SpeedServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
