package android.app;

import android.content.Context;

/**
 * 桩：android.app.Notification
 *
 * 注意：真实 Notification 的字段极多，这里只保留类型本身 + 被链式调用的 Builder。
 */
public class Notification {

    /** 占位字段，保持与真实 API 同名的常用项。 */
    public int icon;

    public Notification() {}

    /**
     * 桩：Notification.Builder
     * 所有 setXxx 均返回 Builder 自身（真实行为），以支持链式调用。
     */
    public static class Builder {

        public Builder(Context context) {}

        public Builder(Context context, String channelId) {}

        public Builder setContentTitle(CharSequence title) {
            return this;
        }

        public Builder setContentText(CharSequence text) {
            return this;
        }

        public Builder setSmallIcon(int icon) {
            return this;
        }

        public Builder setContentIntent(PendingIntent intent) {
            return this;
        }

        public Builder setOngoing(boolean ongoing) {
            return this;
        }

        public Builder setShowWhen(boolean show) {
            return this;
        }

        /** 真实签名：public Notification build() */
        public Notification build() {
            return null;
        }
    }
}
