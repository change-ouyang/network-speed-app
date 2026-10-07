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
    // ---- 后台泵：切后台/息屏时把下载交给前台服务的原生线程（此时 WebView 的 JS 会被系统冻结）----
    // 数值一律转成字符串传过去（原生侧用 getString 读取），避免依赖插件调用的数字取值 API。
    async pumpStart(url, threads, opts) {
      if (!isNative()) return false;
      const p = plugin("SpeedService");
      if (!p || !p.pumpStart) return false;
      const o = opts || {};
      try {
        const r = await p.pumpStart({
          url: String(url || ""),
          threads: String(Math.max(1, Math.min(32, threads | 0))),
          limitBps: String(Math.max(0, Math.round(o.limitBps || 0))),
          budgetBytes: String(Math.max(0, Math.round(o.budgetBytes || 0))),
          alreadyBytes: String(Math.max(0, Math.round(o.alreadyBytes || 0)))
        });
        return !!(r && r.started);
      } catch (e) { return false; }
    },
    // 停止后台泵并返回本轮原生侧消耗的字节（失败按 0 计，不回退污染总用量）
    async pumpStop() {
      if (!isNative()) return 0;
      const p = plugin("SpeedService");
      if (!p || !p.pumpStop) return 0;
      try {
        const r = await p.pumpStop();
        const n = r && r.bytes != null ? Number(r.bytes) : 0;
        return isFinite(n) && n > 0 ? n : 0;
      } catch (e) { return 0; }
    },
    // 查询后台泵状态 {running, bytes}（浏览器预览返回未运行）
    async pumpStats() {
      if (!isNative()) return { running: false, bytes: 0 };
      const p = plugin("SpeedService");
      if (!p || !p.pumpStats) return { running: false, bytes: 0 };
      try {
        const r = await p.pumpStats();
        const n = r && r.bytes != null ? Number(r.bytes) : 0;
        return { running: !!(r && r.running), bytes: isFinite(n) && n > 0 ? n : 0 };
      } catch (e) { return { running: false, bytes: 0 }; }
    },
    // 登记「允许息屏时由原生自动接管」的参数（测试中且开启保持后台运行时）
    async armPump(url, threads, opts) {
      if (!isNative()) return false;
      const p = plugin("SpeedService");
      if (!p || !p.armPump) return false;
      const o = opts || {};
      try {
        await p.armPump({
          url: String(url || ""),
          threads: String(Math.max(1, Math.min(32, threads | 0))),
          limitBps: String(Math.max(0, Math.round(o.limitBps || 0))),
          budgetBytes: String(Math.max(0, Math.round(o.budgetBytes || 0))),
          alreadyBytes: String(Math.max(0, Math.round(o.alreadyBytes || 0)))
        });
        return true;
      } catch (e) { return false; }
    },
    // 撤销授权并停泵（测试结束 / 关闭后台运行 / 退出应用）
    async disarmPump() {
      if (!isNative()) return false;
      const p = plugin("SpeedService");
      if (!p || !p.disarmPump) return false;
      try { await p.disarmPump(); return true; } catch (e) { return false; }
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
