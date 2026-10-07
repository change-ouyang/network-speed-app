package com.getcapacitor;

import androidx.annotation.Nullable;
import org.json.JSONObject;

/**
 * 桩：com.getcapacitor.JSObject（Capacitor 7.6.9 真实为 extends JSONObject）。
 *
 * 真实源码里 put(...) 会吞掉 JSONException 并 return this，因此桩里 put 不声明 throws。
 */
public class JSObject extends JSONObject {

    public JSObject() {
        super();
    }

    /** 真实签名：public JSObject(String json) throws JSONException（必须与被覆写的父类构造器一致） */
    public JSObject(String json) throws org.json.JSONException {
        super(json);
    }

    @Override
    @Nullable
    public String getString(String key) {
        return null;
    }

    @Nullable
    public String getString(String key, @Nullable String defaultValue) {
        return defaultValue;
    }

    @Override
    public JSObject put(String key, boolean value) {
        return this;
    }

    @Override
    public JSObject put(String key, int value) {
        return this;
    }

    @Override
    public JSObject put(String key, long value) {
        return this;
    }

    @Override
    public JSObject put(String key, double value) {
        return this;
    }

    @Override
    public JSObject put(String key, Object value) {
        return this;
    }

    /** 注意：真实 API 里这是新方法（非 @Override），签名与 JSONObject.put(String,Object) 并存。 */
    public JSObject put(String key, String value) {
        return this;
    }

    public JSObject putSafe(String key, Object value) throws org.json.JSONException {
        return this;
    }
}
