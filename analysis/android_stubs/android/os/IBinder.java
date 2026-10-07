package android.os;

/** 桩：android.os.IBinder（真实为 interface）。 */
public interface IBinder {
    boolean pingBinder();

    boolean isBinderAlive();
}
