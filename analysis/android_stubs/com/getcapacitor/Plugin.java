package com.getcapacitor;

import android.content.Context;
import androidx.appcompat.app.AppCompatActivity;

/** 桩：com.getcapacitor.Plugin（Capacitor 7.6.9）。 */
public class Plugin {

    protected Bridge bridge;

    public Plugin() {}

    /** 真实签名：public Context getContext() */
    public Context getContext() {
        return null;
    }

    /**
     * 真实签名：public AppCompatActivity getActivity()
     * 已核对 Capacitor 7.6.9 源码（Plugin.java:208）：此方法**没有** @Deprecated。
     */
    public AppCompatActivity getActivity() {
        return null;
    }

    public void setBridge(Bridge bridge) {
        this.bridge = bridge;
    }

    public Bridge getBridge() {
        return this.bridge;
    }

    public void load() {}

    public void handleOnStart() {}

    public void handleOnStop() {}

    public void handleOnDestroy() {}
}
