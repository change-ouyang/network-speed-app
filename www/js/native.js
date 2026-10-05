// 原生能力桥：App 内经 Capacitor 调用 Android 前台服务；纯浏览器预览下降级为空操作
(function () {
  "use strict";

  function isNative() {
    try {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch (e) { return false; }
  }
  function plugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeedService;
    } catch (e) { return null; }
  }

  window.SpeedNative = {
    isNative,
    // 开启后台测速：启动前台服务（常驻通知 + CPU 唤醒锁）
    async bgEnable() {
      if (!isNative()) return false;
      const p = plugin();
      if (!p) return false;
      try { await p.enable(); return true; } catch (e) { return false; }
    },
    // 关闭后台测速：停掉前台服务（未启动时为无害空操作）
    async bgDisable() {
      if (!isNative()) return false;
      const p = plugin();
      if (!p) return false;
      try { await p.disable(); return true; } catch (e) { return false; }
    }
  };
})();
