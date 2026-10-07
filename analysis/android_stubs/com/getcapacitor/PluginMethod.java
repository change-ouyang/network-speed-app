package com.getcapacitor;

/** 桩：com.getcapacitor.PluginMethod（真实位于 com.getcapacitor，不是 .annotation 子包）。 */
@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface PluginMethod {
    String RETURN_PROMISE = "promise";

    String RETURN_CALLBACK = "callback";

    String RETURN_NONE = "none";

    String returnType() default RETURN_PROMISE;
}
