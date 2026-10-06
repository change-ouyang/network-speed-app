// 原生能力桥：App 内经 Capacitor 调用 Android 前台服务 / App 插件；纯浏览器预览下全部降级为空操作
(function () {
  "use strict";

  function cap() {
    try { return window.Capacitor || null; } catch (e) { return null; }
  }
  function isNative() {
    try {
      const c = cap();
      return !!(c && c.isNativePlatform && c.isNativePlatform());
    } catch (e) { return false; }
  }
  function plugin(name) {
    try {
      const c = cap();
      return (c && c.Plugins && c.Plugins[name]) || null;
    } catch (e) { return null; }
  }

  window.SpeedNative = {
    isNative,
    // 开启后台测速：启动前台服务（常驻通知 + CPU 唤醒锁）
    async bgEnable() {
      if (!isNative()) return false;
      const p = plugin("SpeedService");
      if (!p) return false;
      try { await p.enable(); return true; } catch (e) { return false; }
    },
    // 关闭后台测速：停掉前台服务（未启动时为无害空操作）
    async bgDisable() {
      if (!isNative()) return false;
      const p = plugin("SpeedService");
      if (!p) return false;
      try { await p.disable(); return true; } catch (e) { return false; }
    },
    // 退出应用：只结束当前 Activity；已开启的前台服务/后台测速不受影响
    async exitApp() {
      const p = plugin("App");
      if (!isNative() || !p || !p.exitApp) return false;
      try { await p.exitApp(); return true; } catch (e) { return false; }
    },
    // 监听系统返回键：返回 true 表示已挂上（仅 App 内生效），cb 返回后由调用方决定行为
    async onBack(cb) {
      const p = plugin("App");
      if (!isNative() || !p || !p.addListener) return false;
      try { await p.addListener("backButton", cb); return true; } catch (e) { return false; }
    },
    // 应用信息 {name, id, version, build}；浏览器预览返回 null
    async getInfo() {
      const p = plugin("App");
      if (!isNative() || !p || !p.getInfo) return null;
      try { return await p.getInfo(); } catch (e) { return null; }
    },
    // 调起系统分享面板；浏览器预览返回 false（调用方回退复制链接）
    async share(opts) {
      const p = plugin("Share");
      if (!isNative() || !p || !p.share) return false;
      try { await p.share(opts); return true; } catch (e) { return false; }
    }
  };
})();
