package android.app;

import android.content.Context;
import android.content.Intent;

/** 桩：android.app.PendingIntent。 */
public class PendingIntent {

    public static final int FLAG_ONE_SHOT = 0x40000000;
    public static final int FLAG_NO_CREATE = 0x20000000;
    public static final int FLAG_CANCEL_CURRENT = 0x10000000;
    public static final int FLAG_UPDATE_CURRENT = 0x08000000;
    public static final int FLAG_IMMUTABLE = 0x04000000;

    /**
     * 真实签名：
     * public static PendingIntent getActivity(Context context, int requestCode, Intent intent, int flags)
     */
    public static PendingIntent getActivity(Context context, int requestCode, Intent intent, int flags) {
        return null;
    }

    public void cancel() {}

    public void send() {}
}
