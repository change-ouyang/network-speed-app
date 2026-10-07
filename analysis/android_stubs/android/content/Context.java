package android.content;

/**
 * 桩：android.content.Context
 *
 * 真实继承链：Context <- ContextWrapper <- Service/Activity。
 * 为了让 Service 内能直接调用 getSystemService()/startForeground() 等，
 * 本桩把 Service 做成 extends Context。
 */
public abstract class Context {

    // ---- getSystemService 的名称常量（真实值必须一致，否则运行期拿不到服务） ----
    public static final String POWER_SERVICE = "power";
    public static final String NOTIFICATION_SERVICE = "notification";

    public abstract Object getSystemService(String name);

    /** 真实签名：public abstract Context getApplicationContext() */
    public abstract Context getApplicationContext();

    /** 真实签名：public abstract ComponentName startService(Intent service) */
    public abstract ComponentName startService(Intent service);

    /** 真实签名：public abstract ComponentName startForegroundService(Intent service) （API 26+） */
    public abstract ComponentName startForegroundService(Intent service);

    /** 真实签名：public abstract boolean stopService(Intent service) */
    public abstract boolean stopService(Intent service);
}
