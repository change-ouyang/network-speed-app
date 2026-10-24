// 原生能力桥：App 内经 Capacitor 调用 Android 服务；浏览器预览不执行原生能力
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

  let miguCached = null;
  let miguPending = null;
  let miguDiag = null;

  window.SpeedNative = {
    isNative,
    // 最近一次咪咕解析的分片落点 {host, v4:[], v6:[]}：说明页诊断行展示，
    // 供用户对照运营商定向流量白名单（HTTPS 下运营商只能按 IP/SNI 识别归属）
    get miguDiag() { return miguDiag; },
    // 短缓存减少下载循环中的桥调用；原生侧负责真正的有效期与前后台共用缓存。
    // source 区分视频/音乐动态节点，缓存按节点隔离，切换节点不会串地址。
    async resolveMigu(source) {
      const p = plugin("SpeedService");
      if (!isNative() || !p || !p.resolveMigu) {
        const e = new Error(isNative()
          ? "App 原生咪咕组件未加载，请更新安装包后重新打开"
          : "需要安装新版 Android App，浏览器仅支持预览");
        e.nodeUnavailable = true;
        throw e;
      }
      const src = String(source || "");
      if (miguCached && miguCached.source === src && Date.now() < miguCached.until) return miguCached.url;
      if (!miguPending) {
        miguPending = p.resolveMigu({ source: src }).then(r => {
          const u = new URL(r.url);
          // 视频：GSLB 调度链可能给出 http(:8080) 分片（App 已对 miguvideo.com 单域放行明文）；
          // 音乐：H5 策略接口签发的直链恒为 https 音频文件（*.migu.cn）
          const videoOk = (u.protocol === "https:" || u.protocol === "http:")
              && u.hostname.endsWith(".miguvideo.com") && u.pathname.endsWith(".ts");
          const musicOk = u.protocol === "https:"
              && u.hostname.endsWith(".migu.cn") && /\.(mp3|flac|m4a|aac)$/.test(u.pathname);
          if (!(videoOk || musicOk)) {
            throw new Error("咪咕未返回有效的媒体地址");
          }
          miguCached = { source: src, url: r.url, until: Date.now() + 30000 };
          if (r.host) miguDiag = {
            host: String(r.host),
            v4: Array.isArray(r.v4) ? r.v4 : [],
            v6: Array.isArray(r.v6) ? r.v6 : []
          };
          return r.url;
        }).finally(() => { miguPending = null; });
      }
      return miguPending;
    },
    async rejectMigu(url, source) {
      if (miguCached && miguCached.url === url) miguCached = null;
      const p = plugin("SpeedService");
      if (p && p.rejectMigu) await p.rejectMigu({ url: String(url || ""), source: String(source || "") });
    },
    // 预请求通知权限（App 启动时一次，避免首次开跑时弹系统对话框打断启动流程）
    async prepPermissions() {
      if (!isNative()) return false;
      const p = plugin("SpeedService");
      if (!p || !p.prepPermissions) return false;
      try { await p.prepPermissions(); return true; } catch (e) { return false; }
    },
    // 电池优化豁免：{exempt:boolean}；ask=true 且未豁免时拉起系统「忽略电池优化」对话框。
    // 这是 HyperOS 等国产 ROM 冻结后台进程的头号对策，必须在代码里主动申请，光靠提示没用。
    async batteryExempt(ask) {
      if (!isNative()) return { exempt: true };
      const p = plugin("SpeedService");
      if (!p || !p.batteryExempt) return { exempt: false, error: "原生插件未注册" };
      try { return await p.batteryExempt({ ask: !!ask }); } catch (e) { return { exempt: false, error: (e && e.message) || String(e) }; }
    },
    // 开启后台测速：启动前台服务（常驻通知 + CPU 唤醒锁）。
    // 返回 {ok, error}：失败必须带上原生侧真实原因（OEM ROM 限制五花八门，笼统提示没法排查）
    async bgEnable() {
      if (!isNative()) return { ok: false, error: "非 App 环境（浏览器预览）" };
      const p = plugin("SpeedService");
      if (!p || !p.enable) return { ok: false, error: "原生插件未注册" };
      try {
        const r = await p.enable();
        if (r && r.started) return { ok: true, notifGranted: r.notifGranted !== false };
        return { ok: false, error: (r && r.error) || "未知错误" };
      } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
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
    // 撤销授权并停泵；返回尚未并入总使用量的字节数（调用方必须 absorb，否则丢账）
    async disarmPump() {
      if (!isNative()) return 0;
      const p = plugin("SpeedService");
      if (!p || !p.disarmPump) return 0;
      try {
        const r = await p.disarmPump();
        const n = r && r.bytes != null ? Number(r.bytes) : 0;
        return isFinite(n) && n > 0 ? n : 0;
      } catch (e) { return 0; }
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
