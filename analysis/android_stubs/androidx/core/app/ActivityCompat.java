package androidx.core.app;

import android.app.Activity;

/** 桩：androidx.core.app.ActivityCompat。 */
public final class ActivityCompat {

    private ActivityCompat() {}

    /**
     * 真实签名：public static void requestPermissions(Activity activity, String[] permissions, int requestCode)
     */
    public static void requestPermissions(Activity activity, String[] permissions, int requestCode) {}

    public static boolean shouldShowRequestPermissionRationale(Activity activity, String permission) {
        return false;
    }
}
