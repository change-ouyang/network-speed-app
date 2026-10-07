// ui.js「后台交棒状态机」测试台：假 DOM + 假原生桥 + 真引擎，验证协作逻辑（不改动任何生产代码）
// 用法：node analysis/ui_handoff_harness.js
// 覆盖点（全部来自真实评审发现的 bug 类型）：
//   T1 正常交棒：切后台 → JS 引擎停、原生泵接管；回前台 → 引擎重启、原生字节只并入一次
//   T2 交棒竞态：起泵途中就切回前台 → 绝不允许「引擎被停掉」的僵尸态（评审阻断级 #1）
//   T3 反复结算：连续回前台多次 → 字节不重复计数
//   T4 真停止优先：交棒期间若发生真正的停止（如用量上限）→ 回前台不得自动重启
//   T5 退出清理：退出应用前必须停引擎 + disarm + 停服务，且把原生字节并入账
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WWW = path.join(__dirname, "..", "www");
const flush = () => new Promise((r) => setImmediate(r));

// ---------------- 假 DOM ----------------
function makeHarness() {
  const handlers = new Map();     // element -> Map(type -> fn)
  const byId = new Map();
  const docHandlers = new Map();

  function ctx2d() {
    return new Proxy({}, {
      get: (t, k) => (k === "canvas" ? fakeEl("canvas") : (typeof k === "string" ? () => {} : undefined)),
      set: () => true,
    });
  }
  function fakeEl(tag) {
    const el = {
      tagName: String(tag || "div").toUpperCase(),
      nodeName: String(tag || "div").toUpperCase(),
      style: {
        setProperty() {}, removeProperty() {}, getPropertyValue() { return ""; },
        cssText: "", display: "", width: "", height: "", transform: "", opacity: "",
      }, dataset: {}, children: [],
      textContent: "", innerHTML: "", value: "", checked: false, disabled: false, hidden: false,
      width: 300, height: 150,
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      },
      addEventListener(type, fn) {
        if (!handlers.has(el)) handlers.set(el, new Map());
        handlers.get(el).set(type, fn);
      },
      removeEventListener() {},
      appendChild(c) { el.children.push(c); return c; },
      insertBefore(c) { return c; }, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
      querySelector() { return fakeEl("div"); }, querySelectorAll() { return []; },
      getElementsByClassName() { return []; }, closest() { return null; },
      focus() {}, blur() {}, click() {}, scrollIntoView() {},
      getContext() { return ctx2d(); },
      getBoundingClientRect() { return { width: 300, height: 100, top: 0, left: 0, right: 300, bottom: 100 }; },
      contains() { return false; },
      insertAdjacentHTML() {},
    };
    handlers.set(el, new Map());
    return el;
  }

  const documentStub = {
    hidden: false,
    visibilityState: "visible",
    devicePixelRatio: 2,
    body: fakeEl("body"),
    documentElement: fakeEl("html"),
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, fakeEl("div"));
      return byId.get(id);
    },
    querySelector(sel) {
      if (!byId.has("sel:" + sel)) byId.set("sel:" + sel, fakeEl("div"));
      return byId.get("sel:" + sel);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return fakeEl(tag); },
    createDocumentFragment() { return fakeEl("fragment"); },
    addEventListener(type, fn) { docHandlers.set(type, fn); },
    removeEventListener() {},
  };

  const storage = new Map();
  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  const native = {
    calls: [],
    pumpRunning: false,
    pumpBytes: 0,          // 假原生泵「已消耗未领走」的字节
    deferStart: null,      // 设为 Promise 的 resolve 可延迟 pumpStart 完成（用于竞态测试）
    bgEnable: async () => { native.calls.push("bgEnable"); return { ok: true }; },   // 新形状：{ok, error}
    bgDisable: async () => { native.calls.push("bgDisable"); return true; },
    prepPermissions: async () => { native.calls.push("prepPermissions"); return true; },
    batteryExempt: async (ask) => { native.calls.push("batteryExempt" + (ask ? ":ask" : "")); return { exempt: true }; },
    pumpStart: async (url, threads) => {
      native.calls.push("pumpStart");
      if (native.deferStart) { await new Promise((r) => { native.deferStart = r; }); }
      native.pumpRunning = true;
      return true;
    },
    pumpStats: async () => { native.calls.push("pumpStats"); return { running: native.pumpRunning, bytes: native.pumpBytes }; },
    pumpStop: async () => {
      native.calls.push("pumpStop");
      const b = native.pumpBytes;
      native.pumpBytes = 0;
      native.pumpRunning = false;
      return b;
    },
    armPump: async () => { native.calls.push("armPump"); return true; },
    disarmPump: async () => {
      native.calls.push("disarmPump");
      const b = native.pumpBytes;
      native.pumpBytes = 0;
      native.pumpRunning = false;
      return b;
    },
    onBack: async (cb) => { native.calls.push("onBack"); native.backCb = cb; return true; },
    getInfo: async () => null,
    exitApp: async () => { native.calls.push("exitApp"); return true; },
    share: async () => false,
  };

  // 可推进的虚拟时钟：让「入账 → 下一秒统计」之间的时间真实发生（真实时间下 dt<1 会跳过速率计算，
  // 导致「后台整批被算成 1 秒速度」这类缺陷测不出来）
  let clockOffset = 0;
  class SandboxDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(Date.now() + clockOffset);
      else super(...args);
    }
    static now() { return Date.now() + clockOffset; }
  }

  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Math, JSON, isFinite, NaN, Number, String, parseInt, parseFloat,
    AbortController,
    Date: SandboxDate,
    requestAnimationFrame: (fn) => { return 0; },   // 不真的跑动画帧（ui.js 的图表渲染对测试无关）
    cancelAnimationFrame: () => {},
    fetch: () => Promise.reject(new Error("no network in harness")),
    navigator: { clipboard: { writeText: async () => {} }, userAgent: "harness" },
    location: { href: "https://localhost/", search: "" },
    localStorage: localStorageStub,
    document: documentStub,
    Alert: function () {},
    Image: function () { return fakeEl("img"); },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const load = (f) => {
    const p = path.isAbsolute(f) ? f : path.join(WWW, f);
    return vm.runInContext(fs.readFileSync(p, "utf8"), sandbox, { filename: p });
  };
  // 顺序与 index.html 一致；不加载 native.js（用假桥替代）
  load("js/nodes.js");
  load("js/store.js");

  // 预置已知晓公告，避免初始化弹窗干扰
  storage.set("acknowledged", "true");
  // 打开「保持后台运行」（默认关闭；不开就不会交棒，那是另一条路径）
  storage.set("keepBg", "true");

  load("js/engine.js");
  const RealEngine = sandbox.window.SpeedEngine;
  let engine = null;
  sandbox.window.SpeedEngine = function () {
    engine = new RealEngine();
    return engine;
  };
  sandbox.window.SpeedNative = native;
  // 变异测试用：UI_HARNESS_UI 可指向一份被故意改坏的 ui.js（验证测试台真的能发现问题）
  load(process.env.UI_HARNESS_UI || "js/ui.js");

  const el = (id) => documentStub.getElementById(id);
  const fireEl = (id, type, ev) => {
    const fn = handlers.get(el(id)) && handlers.get(el(id)).get(type);
    if (!fn) throw new Error(`未注册的处理器：${id}.${type}`);
    return fn(ev || { target: el(id), preventDefault() {}, key: "" });
  };
  const fireDoc = (type, ev) => {
    const fn = docHandlers.get(type);
    if (!fn) throw new Error(`未注册的 document 处理器：${type}`);
    return fn(ev || {});
  };
  const setHidden = async (hidden) => {
    documentStub.hidden = hidden;
    documentStub.visibilityState = hidden ? "hidden" : "visible";
    const p = fireDoc("visibilitychange");
    await flush(); await flush(); await flush();
    if (p && typeof p.then === "function") await p;
    await flush(); await flush();
  };

  return { native, engine: () => engine, el, fireEl, fireDoc, setHidden, storage, documentStub, advance: (ms) => { clockOffset += ms; } };
}

// ---------------- 断言 ----------------
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? "  ← " + extra : ""}`); }
}

(async () => {
  console.log("ui.js 后台交棒状态机测试台\n" + "=".repeat(76));

  // ---- T1 正常交棒与回前台 ----
  console.log("\nT1 正常交棒：切后台交棒 + 回前台清算并重启引擎");
  {
    const h = makeHarness();
    const eng = h.engine();
    h.fireEl("btnPlay", "click");
    await flush();
    check("点播放后引擎在跑", eng.running === true);
    const before = eng.totalBytes;

    await h.setHidden(true);
    check("后台期间 JS 引擎被停（避免与原生双下）", eng.running === false);
    check("原生泵已接管", h.native.pumpRunning === true);

    h.native.pumpBytes = 5 * 1048576;      // 原生侧在后台消耗 5MiB
    await h.setHidden(false);
    check("回前台后 JS 引擎重新在跑", eng.running === true);
    check("原生 5MiB 正好并入一次总用量", eng.totalBytes - before === 5 * 1048576, `实际 +${eng.totalBytes - before}`);
    check("原生泵已停", h.native.pumpRunning === false);
  }

  // ---- T2 交棒竞态（评审阻断级 #1 的回归测试）----
  console.log("\nT2 交棒竞态：起泵途中立刻切回前台 → 不允许僵尸态");
  {
    const h = makeHarness();
    const eng = h.engine();
    h.fireEl("btnPlay", "click");
    await flush();

    h.native.deferStart = () => {};        // 让 pumpStart 挂起
    const hiddenP = h.setHidden(true);     // 不 await：模拟交棒进行中
    await flush();
    h.documentStub.hidden = false;         // 用户立刻切回前台
    h.documentStub.visibilityState = "visible";
    await h.fireDoc("visibilitychange");
    await flush();
    if (h.native.deferStart) h.native.deferStart();   // 现在才让 pumpStart 完成
    await hiddenP;
    await flush(); await flush();

    check("引擎仍在跑（绝不能被旧分支停掉）", eng.running === true, `running=${eng.running}`);
    check("原生泵已被收回", h.native.pumpRunning === false);
    check("收回时调用了 pumpStop", h.native.calls.includes("pumpStop"));
  }

  // ---- T3 反复结算不重复计数 ----
  console.log("\nT3 反复回前台：字节不重复计入");
  {
    const h = makeHarness();
    const eng = h.engine();
    h.fireEl("btnPlay", "click");
    await flush();
    await h.setHidden(true);
    h.native.pumpBytes = 3 * 1048576;
    const before = eng.totalBytes;
    await h.setHidden(false);
    const after1 = eng.totalBytes;
    await h.setHidden(false);              // 再来一次（无新增字节）
    await h.setHidden(false);
    check("第一次结算 +3MiB", after1 - before === 3 * 1048576, `实际 +${after1 - before}`);
    check("后续结算不会重复加", eng.totalBytes === after1, `实际 +${eng.totalBytes - after1}`);
  }

  // ---- T4 交棒失败（服务被 ROM 杀掉）与「后台期间真停止」----
  console.log("\nT4 交棒失败 / 后台真停止：不得停掉引擎，也不得在回前台后擅自重启");
  {
    const h = makeHarness();
    const eng = h.engine();
    h.fireEl("btnPlay", "click");
    await flush();

    h.native.pumpStart = async () => { h.native.calls.push("pumpStart"); return false; };   // 服务没在跑
    await h.setHidden(true);
    check("交棒失败时不停引擎（继续跑总比停了好）", eng.running === true, `running=${eng.running}`);
    check("交棒失败时提示了用户", h.native.calls.filter((c) => c === "pumpStart").length === 1);

    // 未交棒的情况下，后台期间发生「真正的停止」（如用量上限/节点被拒）
    eng._finish("reachMaxUse");
    await flush();
    check("真停止后引擎已停", eng.running === false);
    await h.setHidden(false);
    check("回前台不擅自重启（尊重用户/上限的停止）", eng.running === false, `running=${eng.running}`);
  }

  // ---- T5 退出清理 ----
  console.log("\nT5 退出应用：停引擎 + disarm + 停服务 + 字节并入");
  {
    const h = makeHarness();
    const eng = h.engine();
    h.fireEl("btnPlay", "click");
    await flush();
    await h.setHidden(true);
    h.native.pumpBytes = 7 * 1048576;
    h.native.pumpRunning = true;
    await h.native.backCb();               // 系统返回键（无浮层）→ 应先收干净再退出
    await flush(); await flush(); await flush();
    check("退出前引擎已停", eng.running === false);
    check("退出前调用了 disarmPump", h.native.calls.includes("disarmPump"));
    check("退出前调用了 bgDisable", h.native.calls.includes("bgDisable"));
    check("退出前调用了 exitApp", h.native.calls.includes("exitApp"));
    check("退出时原生 7MiB 未丢账", eng.totalBytes >= 7 * 1048576, `total=${eng.totalBytes}`);
  }

  // ---- T6 后台整批流量不得被当成「1 秒速度」而污染带宽峰值（复审 S1 的回归测试）----
  // 注意必须走「息屏时原生自己接管、JS 没被停」这条路径：走交棒路径时 engine.start() 会顺带重置速率窗口，
  // 会把这个缺陷掩盖掉（浮浮酱第一版 T6 就是这么写错的，变异测试 M5 没抓到）。
  console.log("\nT6 原生自动接管后入账：不得污染实时速度与带宽峰值");
  {
    const h = makeHarness();
    const eng = h.engine();
    eng.peakSpeed = 0;
    h.fireEl("btnPlay", "click");
    await flush();
    h.native.pumpStart = async () => { h.native.calls.push("pumpStart"); return false; };  // 交棒失败：JS 继续跑
    await h.setHidden(true);
    h.native.pumpRunning = true;           // 息屏广播让原生自己接管了
    h.native.pumpBytes = 60 * 1048576;     // 后台挂了很久，原生侧一口气消耗 60MiB
    await h.setHidden(false);
    h.advance(1500);                       // 让时间真的往前走 1.5 秒（否则 dt<1 会跳过速率计算）
    eng._tick();                           // 让引擎记一次速率
    const mbps = (eng.speed * 8) / 1e6;
    check(
      "入账后实时速度没有被整批流量顶起来",
      eng.speed < 1048576,
      `speed=${(eng.speed / 1048576).toFixed(1)}MiB/s（${mbps.toFixed(0)}Mbps）`
    );
    check("带宽峰值未被污染", eng.peakSpeed < 1048576, `peak=${(eng.peakSpeed / 1048576).toFixed(1)}MiB/s`);
    check("总用量仍然入账了 60MiB", eng.totalBytes >= 60 * 1048576, `total=${(eng.totalBytes / 1048576).toFixed(1)}MiB`);
  }

  console.log("\n" + "=".repeat(76));
  console.log(`结果：通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("测试台自身异常：", e && e.stack ? e.stack : e);
  process.exit(2);
});
