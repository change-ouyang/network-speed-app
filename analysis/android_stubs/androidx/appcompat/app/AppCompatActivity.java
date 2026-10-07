package androidx.appcompat.app;

import android.app.Activity;

/**
 * 桩：androidx.appcompat.app.AppCompatActivity
 *
 * 真实链：AppCompatActivity extends FragmentActivity extends ... extends Activity。
 * 本桩直接继承 android.app.Activity 即可（Capacitor 的 Plugin.getActivity() 返回它，
 * 而调用方把它赋给 Activity 变量，因此必须是 Activity 的子类型）。
 */
public class AppCompatActivity extends Activity {

    public void setContentView(int layoutResID) {}

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {}
}
