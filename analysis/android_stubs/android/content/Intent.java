package android.content;

/** 桩：android.content.Intent（只声明被真实源码用到的常量与构造/方法）。 */
public class Intent {

    public static final int FLAG_ACTIVITY_SINGLE_TOP = 0x20000000;
    public static final int FLAG_ACTIVITY_CLEAR_TOP = 0x04000000;

    public Intent() {}

    public Intent(Context packageContext, Class<?> cls) {}

    public Intent(String action) {}

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
