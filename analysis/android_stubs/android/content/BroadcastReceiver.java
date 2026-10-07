package android.content;

/** 桩：android.content.BroadcastReceiver（只声明被真实源码用到的部分）。 */
public abstract class BroadcastReceiver {

    public BroadcastReceiver() {}

    /** 真实签名：public abstract void onReceive(Context context, Intent intent) */
    public abstract void onReceive(Context context, Intent intent);
}
