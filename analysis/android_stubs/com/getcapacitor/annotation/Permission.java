package com.getcapacitor.annotation;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/** 桩：com.getcapacitor.annotation.Permission（预留：未来源码若用声明式权限可免改桩）。 */
@Retention(RetentionPolicy.RUNTIME)
public @interface Permission {
    String[] strings() default {};

    String alias() default "";

    int requestCode() default 0;
}
