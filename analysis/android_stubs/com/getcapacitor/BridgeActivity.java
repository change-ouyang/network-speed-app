package com.getcapacitor;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

/**
 * 桩：com.getcapacitor.BridgeActivity（真实 extends AppCompatActivity）。
 *
 * 关键点：真实 onCreate 是 protected，registerPlugin(Class<? extends Plugin>) 是 public。
 * MainActivity 用 public 覆写 onCreate —— 放宽可见性是合法的。
 */
public class BridgeActivity extends AppCompatActivity {

    protected Bridge bridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {}

    public void registerPlugin(Class<? extends Plugin> plugin) {}

    public Bridge getBridge() {
        return this.bridge;
    }
}
