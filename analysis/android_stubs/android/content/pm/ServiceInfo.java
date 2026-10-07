package android.content.pm;

/**
 * 桩：android.content.pm.ServiceInfo
 *
 * FOREGROUND_SERVICE_TYPE_DATA_SYNC 为 API 29 引入，值 1（与真实 AOSP 一致）。
 */
public class ServiceInfo {

    public static final int FOREGROUND_SERVICE_TYPE_DATA_SYNC = 1;

    public String name;
    public String packageName;
    public int flags;
    public String permission;

    public ServiceInfo() {}
}
