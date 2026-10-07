package android.app;

/** 桩：android.app.NotificationManager（真实链 NotificationManager implements Manager）。 */
public class NotificationManager {

    public static final int IMPORTANCE_NONE = 0;
    public static final int IMPORTANCE_MIN = 1;
    public static final int IMPORTANCE_LOW = 2;
    public static final int IMPORTANCE_DEFAULT = 3;
    public static final int IMPORTANCE_HIGH = 4;

    /** 真实签名：public void notify(int id, Notification notification) */
    public void notify(int id, Notification notification) {}

    /** 真实签名：public void notify(String tag, int id, Notification notification) */
    public void notify(String tag, int id, Notification notification) {}

    public void cancel(int id) {}

    public void cancel(String tag, int id) {}

    /** 真实签名：public void createNotificationChannel(NotificationChannel channel) （API 26+） */
    public void createNotificationChannel(NotificationChannel channel) {}

    public void deleteNotificationChannel(String channelId) {}
}
