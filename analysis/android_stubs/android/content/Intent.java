package android.content;

/** 桩：android.content.Intent（只声明被真实源码用到的常量与构造/方法）。 */
public class Intent {

    public static final int FLAG_ACTIVITY_SINGLE_TOP = 0x20000000;
    public static final int FLAG_ACTIVITY_CLEAR_TOP = 0x04000000;

    /** 真实取值：android.intent.action.SCREEN_OFF */
    public static final String ACTION_SCREEN_OFF = "android.intent.action.SCREEN_OFF";
    /** 真实取值：android.intent.action.SCREEN_ON */
    public static final String ACTION_SCREEN_ON = "android.intent.action.SCREEN_ON";

    public Intent() {}

    public Intent(Context packageContext, Class<?> cls) {}

    public Intent(String action) {}

    /** 真实签名：public String getAction() */
    public String getAction() {
        return null;
    }

    public Intent setFlags(int flags) {
        return this;
    }

    public int getFlags() {
        return 0;
    }

    public Intent setAction(String action) {
        return this;
    }
}
