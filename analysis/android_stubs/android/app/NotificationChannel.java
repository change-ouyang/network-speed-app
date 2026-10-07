package android.app;

/** 桩：android.app.NotificationChannel（API 26+）。 */
public class NotificationChannel {

    private final String mId;
    private final CharSequence mName;
    private final int mImportance;
    private CharSequence mDescription;

    /** 真实签名：public NotificationChannel(String id, CharSequence name, int importance) */
    public NotificationChannel(String id, CharSequence name, int importance) {
        this.mId = id;
        this.mName = name;
        this.mImportance = importance;
    }

    public String getId() {
        return mId;
    }

    public CharSequence getName() {
        return mName;
    }

    public int getImportance() {
        return mImportance;
    }

    /** 真实签名：public void setDescription(String description) */
    public void setDescription(String description) {
        this.mDescription = description;
    }

    public CharSequence getDescription() {
        return mDescription;
    }
}
