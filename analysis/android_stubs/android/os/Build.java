package android.os;

/**
 * 桩：android.os.Build
 *
 * 按任务要求用常量表示 VERSION.SDK_INT（真实是运行期读系统属性，编译期无法确定）。
 */
public class Build {

    public static class VERSION {
        public static final int SDK_INT = 34;

        /** 常用代号常量，便于以后 use 到 VERSION_CODES 时扩展。 */
        public static final String RELEASE = "14";
    }

    public static class VERSION_CODES {
        public static final int O = 26;
        public static final int P = 28;
        public static final int Q = 29;
        public static final int TIRAMISU = 33;
        public static final int UPSIDE_DOWN_CAKE = 34;
    }

    public static final String MANUFACTURER = "stub";
    public static final String MODEL = "stub";
}
