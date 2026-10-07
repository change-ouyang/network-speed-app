package android.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** 桩：android.app.Activity（真实链 Activity extends ContextThemeWrapper extends ... extends Context）。 */
public class Activity extends Context {

    /** 真实签名：protected void onCreate(@Nullable Bundle savedInstanceState) */
    protected void onCreate(Bundle savedInstanceState) {}

    protected void onStart() {}

    protected void onResume() {}

    protected void onPause() {}

    protected void onStop() {}

    protected void onDestroy() {}

    public Intent getIntent() {
        return null;
    }

    public void setContentView(int layoutResID) {}

    public Context getApplicationContext() {
        return this;
    }

    public Object getSystemService(String name) {
        return null;
    }

    public ComponentName startService(Intent service) {
        return null;
    }

    public ComponentName startForegroundService(Intent service) {
        return null;
    }

    public boolean stopService(Intent service) {
        return false;
    }
}
