package com.getcapacitor;

import androidx.annotation.Nullable;

/**
 * 桩：com.getcapacitor.PluginCall（Capacitor 7.6.9）。
 * 只声明被本项目源码用到的方法，签名照抄真实源码。
 */
public class PluginCall {

    public void resolve(JSObject data) {}

    public void resolve() {}

    public void reject(String msg) {}

    public void reject(String msg, String code) {}

    public void reject(String msg, Exception ex) {}

    public void reject(String msg, JSObject data) {}

    public void reject(String msg, String code, Exception ex) {}

    public void reject(String msg, String code, JSObject data) {}

    public void reject(String msg, Exception ex, JSObject data) {}

    public void reject(String msg, String code, Exception ex, JSObject data) {}

    @Nullable
    public String getString(String name) {
        return null;
    }

    @Nullable
    public String getString(String name, @Nullable String defaultValue) {
        return defaultValue;
    }

    @Nullable
    public Integer getInt(String name) {
        return null;
    }

    @Nullable
    public Integer getInt(String name, @Nullable Integer defaultValue) {
        return defaultValue;
    }

    @Nullable
    public Long getLong(String name) {
        return null;
    }

    @Nullable
    public Long getLong(String name, @Nullable Long defaultValue) {
        return defaultValue;
    }

    @Nullable
    public Boolean getBoolean(String name) {
        return null;
    }

    @Nullable
    public Boolean getBoolean(String name, @Nullable Boolean defaultValue) {
        return defaultValue;
    }

    @Nullable
    public Double getDouble(String name) {
        return null;
    }

    public JSObject getData() {
        return null;
    }

    public String getCallbackId() {
        return null;
    }

    public void unimplemented() {}

    public void unavailable() {}
}
