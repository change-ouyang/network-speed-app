package android.os;

/** 桩：android.os.PowerManager（只声明被用到的 WakeLock 相关 API）。 */
public class PowerManager {

    /** 真实签名：public static final int PARTIAL_WAKE_LOCK = 0x00000001 */
    public static final int PARTIAL_WAKE_LOCK = 0x00000001;
    public static final int SCREEN_DIM_WAKE_LOCK = 0x00000006;
    public static final int SCREEN_BRIGHT_WAKE_LOCK = 0x0000000a;
    public static final int FULL_WAKE_LOCK = 0x0000001a;

    /**
     * 真实签名：public WakeLock newWakeLock(int levelAndFlags, String tag)
     */
    public WakeLock newWakeLock(int levelAndFlags, String tag) {
        return null;
    }

    public boolean isInteractive() {
        return true;
    }

    public boolean isDeviceIdleMode() {
        return false;
    }

    /** 桩：android.os.PowerManager.WakeLock（真实为 PowerManager 的内部 public 类）。 */
    public final class WakeLock {

        /** 真实签名：public void acquire() */
        public void acquire() {}

        /** 真实签名：public void acquire(long timeout) */
        public void acquire(long timeout) {}

        /** 真实签名：public void release() */
        public void release() {}

        /** 真实签名：public boolean isHeld() */
        public boolean isHeld() {
            return false;
        }

        /** 真实签名：public void setReferenceCounted(boolean value) */
        public void setReferenceCounted(boolean value) {}
    }
}
