package com.getcapacitor.annotation;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/** 桩：随 CapacitorPlugin.permissions() 一起使用的注解（本桩仅作占位）。 */
@Retention(RetentionPolicy.RUNTIME)
public @interface PermissionCallback {
    String[] value() default {};
}
