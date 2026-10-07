package org.json;

/**
 * 桩：org.json.JSONObject
 *
 * com.getcapacitor.JSObject 真实是 extends JSONObject，因此本桩必须先存在。
 * 只声明 JSObject 会 override / 调用的方法。
 */
public class JSONObject {

    /** 真实 API 里的哨兵值（Capacitor 自身的 HttpRequestHandler 会用到 JSONObject.NULL）。 */
    public static final Object NULL = new Object();

    public JSONObject() {}

    public JSONObject(String json) throws JSONException {}

    /** 真实签名：public JSONObject put(String name, boolean value) throws JSONException */
    public JSONObject put(String name, boolean value) throws JSONException {
        return this;
    }

    public JSONObject put(String name, int value) throws JSONException {
        return this;
    }

    public JSONObject put(String name, long value) throws JSONException {
        return this;
    }

    public JSONObject put(String name, double value) throws JSONException {
        return this;
    }

    public JSONObject put(String name, Object value) throws JSONException {
        return this;
    }

    public Object opt(String name) {
        return null;
    }

    public String optString(String name) {
        return null;
    }

    public String getString(String name) throws JSONException {
        return null;
    }

    public int getInt(String name) throws JSONException {
        return 0;
    }

    public boolean has(String name) {
        return false;
    }

    public Object remove(String name) {
        return null;
    }

    @Override
    public String toString() {
        return "{}";
    }
}
