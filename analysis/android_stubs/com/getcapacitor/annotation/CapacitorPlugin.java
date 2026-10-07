package com.getcapacitor.annotation;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * 桩：com.getcapacitor.annotation.CapacitorPlugin
 *
 * 真实注解还有 requestCodes()/permissions()；本项目只用到 name()，为控制桩规模只保留 name()。
 */
@Retention(RetentionPolicy.RUNTIME)
public @interface CapacitorPlugin {
    String name() default "";
}
