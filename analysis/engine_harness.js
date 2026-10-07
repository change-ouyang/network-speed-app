// 测速引擎行为测试台：虚拟时钟 + 模拟 CDN，复现并验证 engine.js 在真实节点行为下的表现
// 用法：node analysis/engine_harness.js [engine.js 路径] [场景名过滤]
// 设计要点：所有时间都是虚拟时间（毫秒），因此 60 秒场景可瞬间跑完，结果可复现、无网络依赖
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REAL_SET_IMMEDIATE = setImmediate;
const REAL_DATE_NOW = Date.now;

// ---------------- 虚拟时钟 ----------------
let vnow = 0;
let timerId = 0;
let timers = new Map();
let runtimeErrors = [];
let netSetTimeout = null;   // 模拟「网络完成」任务：不受页面定时器节流影响

// 后台状态：页面切到后台后，Chromium 会把页面定时器降频（严格节流 1 分钟 1 次），
// 被 ROM 冻结时则一个页面任务都不跑。两者对引擎的影响完全不同，必须分别建模。
let bgState = { hidden: false, policy: "none", lastFire: -1e9 };

function installVirtualClock() {
  vnow = 0;
  timerId = 0;
  timers = new Map();
  runtimeErrors = [];
  bgState = { hidden: false, policy: "none", lastFire: -1e9 };
  const mk = (net) => (fn, ms) => {
    const id = ++timerId;
    timers.set(id, { at: vnow + (ms || 0), fn, ms: ms || 0, repeat: false, net });
    return id;
  };
  global.setTimeout = mk(false);          // 引擎自己的页面定时器：会被节流/冻结
  netSetTimeout = mk(true);               // 测试台的网络延时：不参与节流建模
  global.clearTimeout = (id) => timers.delete(id);
  global.setInterval = (fn, ms) => {
    const id = ++timerId;
    timers.set(id, { at: vnow + (ms || 1), fn, ms: ms || 1, repeat: true, net: false });
    return id;
  };
  global.clearInterval = (id) => timers.delete(id);
  Date.now = () => vnow;
}
function restoreClock() {
  Date.now = REAL_DATE_NOW;
  delete global.setTimeout;
  delete global.clearTimeout;
  delete global.setInterval;
  delete global.clearInterval;
}

const flush = () => new Promise((r) => REAL_SET_IMMEDIATE(r));

// 某个定时器「实际可执行」的时刻：
//   正常      → 到点即执行
//   后台节流  → 页面定时器最多每分钟一次；网络完成回调照常（JS 仍在跑，只是定时器被降频）
//   后台冻结  → 任何 JS 任务都不跑（网络在系统层继续，但 JS 观察不到，回前台后才续上）
function eligibleAt(t) {
  if (!bgState.hidden) return t.at;
  if (bgState.policy === "freeze") return Infinity;
  if (t.net) return t.at;
  return Math.max(t.at, bgState.lastFire + 60000);
}

// 推进虚拟时间到 target：直接跳到「下一个可执行定时器」，不做固定步长量化
// （固定步长会让「多段小延时」的流式读取被无端放大，导致对比失真）
async function tickTo(target) {
  for (;;) {
    let next = Infinity;
    for (const t of timers.values()) {
      const at = eligibleAt(t);
      if (at < next) next = at;
    }
    if (next > target) { vnow = target; break; }
    if (next > vnow) vnow = next;
    const due = [];
    for (const [id, t] of timers) if (eligibleAt(t) <= vnow) due.push([id, t]);
    if (!due.length) { vnow = Math.min(vnow + 1, target); await flush(); continue; }
    for (const [id, t] of due) {
      if (t.repeat) t.at = vnow + t.ms;
      else timers.delete(id);
      if (bgState.hidden && !t.net) bgState.lastFire = vnow;   // 记录页面定时器在后台的执行时刻，用于节流
      try { t.fn(); } catch (e) { runtimeErrors.push(String((e && e.stack) || e)); }
    }
    await flush();
  }
  await flush();
}

// ---------------- 模拟 CDN ----------------
const NET_CHUNK = 64 * 1024;

function delay(ms, signal, tag) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (timer) global.clearTimeout(timer);
      const e = new Error("aborted");
      e.name = "AbortError";
      reject(e);
    };
    const timer = netSetTimeout(() => {   // 走网络定时器：后台冻结/节流不该影响「网络何时完成」
      if (settled) return;
      settled = true;
      resolve();
    }, ms);
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function makeCdn(cfg, stats) {
  const SIZE = cfg.size;
  const BPS = cfg.bps;
  const msFor = (bytes) => (bytes / BPS) * 1000;

  function makeResp(status, len, contentRange, signal, stall) {
    const headers = {
      get(k) {
        const key = String(k).toLowerCase();
        if (key === "content-range") return contentRange || null;
        if (key === "content-length") return String(len);
        return null;
      },
    };
    const transferMs = stall ? Infinity : msFor(len);
    const body = {
      getReader() {
        let sent = 0;
        return {
          async read() {
            if (sent >= len) return { done: true, value: undefined };
            const step = Math.min(NET_CHUNK, len - sent);
            await delay(msFor(step), signal, "stream");
            sent += step;
            return { done: false, value: new Uint8Array(step) };
          },
          cancel() {},
        };
      },
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      body,
      async arrayBuffer() {
        await delay(transferMs, signal, "whole");
        return new ArrayBuffer(len);
      },
      async text() {
        await delay(transferMs, signal, "text");
        return "";
      },
    };
  }

  return async function mockFetch(url, init) {
    stats.requests++;
    const headers = (init && init.headers) || {};
    const rangeHdr = headers.range || headers.Range;
    const signal = init && init.signal;
    const stall = !!(cfg.stallEvery && stats.requests % cfg.stallEvery === 0);

    if (cfg.failRate && Math.random() < cfg.failRate) {
      const st = cfg.failStatus || 500;
      if (st === 429) stats.http429 = (stats.http429 || 0) + 1;
      else stats.http5xx++;
      return makeResp(st, 0, null, signal, false);
    }

    let wantStart = null;
    let wantLen = null;
    if (rangeHdr) {
      const m = /bytes=(\d+)-(\d+)/.exec(String(rangeHdr));
      if (m) { wantStart = parseInt(m[1], 10); wantLen = parseInt(m[2], 10) - wantStart + 1; }
    }

    let status, start, bodyLen, cr = null;
    if (cfg.mode === "reject" && wantStart != null && wantStart > 0) {
      // 越界请求被 CDN 直接拒绝（蜜罐式防盗链：非 0 偏移一律 403）
      stats.http403++;
      return makeResp(403, 0, null, signal, false);
    }
    if (cfg.mode === "honor" && wantStart != null && wantStart >= SIZE) {
      stats.http416++;
      return makeResp(416, 0, `bytes */${SIZE}`, signal, false);
    }
    if (cfg.mode === "ignore") {
      // 老式 CDN：完全不理会 Range，一律返回 200 + 整包
      return makeResp(200, SIZE, null, signal, stall);
    }
    if (wantStart != null) {
      status = 206;
      start = wantStart;
      bodyLen = Math.min(wantLen, SIZE - start);
      if (cfg.contentRange) cr = `bytes ${start}-${start + bodyLen - 1}/${SIZE}`;
    } else {
      status = 200;
      start = 0;
      bodyLen = SIZE;
    }
    if (!stats.firstStatus) stats.firstStatus = status;
    return makeResp(status, bodyLen, cr, signal, stall);
  };
}

// ---------------- 加载被测引擎 ----------------
function loadEngine(enginePath) {
  const code = fs.readFileSync(enginePath, "utf8");
  global.window = global;
  global.fetch = null;
  vm.runInThisContext(code, { filename: enginePath });
  return global.window.SpeedEngine;
}

// ---------------- 场景定义 ----------------
const SCENARIOS = [
  {
    name: "S1 小文件(300KB)+规范 Content-Range",
    note: "理想节点",
    cfg: { size: 300 * 1024, bps: 4 * 1024 * 1024, mode: "honor", contentRange: true },
    seconds: 30,
  },
  {
    name: "S2 小文件+无 Content-Range",
    note: "节点省掉了 Content-Range 头（真实常见）",
    cfg: { size: 300 * 1024, bps: 4 * 1024 * 1024, mode: "honor", contentRange: false },
    seconds: 30,
  },
  {
    name: "S3 越界请求返回 403",
    note: "防盗链 CDN：非 0 偏移一律 403",
    cfg: { size: 300 * 1024, bps: 4 * 1024 * 1024, mode: "reject", contentRange: false },
    seconds: 30,
  },
  {
    name: "S4 慢链路(40KB/s)",
    note: "1MiB 分块需 26 秒，逼近 30 秒超时",
    cfg: { size: 8 * 1024 * 1024, bps: 40 * 1024, mode: "honor", contentRange: true },
    seconds: 60,
  },
  {
    name: "S5 中途挂起(每 3 个请求 1 个不返回)",
    note: "节点限流/半死状态",
    cfg: { size: 2 * 1024 * 1024, bps: 2 * 1024 * 1024, mode: "honor", contentRange: true, stallEvery: 3 },
    seconds: 60,
  },
  {
    name: "S6 服务器忽略 Range(整包 200)",
    note: "老式 CDN",
    cfg: { size: 2 * 1024 * 1024, bps: 3 * 1024 * 1024, mode: "ignore", contentRange: false },
    seconds: 30,
  },
  {
    name: "S7 咪咕式小切片(.ts)",
    note: "小文件 + 越界 403 + 无 Content-Range（对应用户的咕咪快游2）",
    cfg: { size: 512 * 1024, bps: 2 * 1024 * 1024, mode: "reject", contentRange: false },
    seconds: 30,
  },
  {
    name: "S8 慢链路+偶发挂起",
    note: "200KB/s 且每 5 个请求挂 1 个（对应「流量在跑但一直报错」）",
    cfg: { size: 4 * 1024 * 1024, bps: 200 * 1024, mode: "honor", contentRange: true, stallEvery: 5 },
    seconds: 60,
  },
  {
    name: "S9 小文件+越界 403+规范头",
    note: "有 Content-Range 但越界即 403（混合型节点）",
    cfg: { size: 300 * 1024, bps: 4 * 1024 * 1024, mode: "reject", contentRange: true },
    seconds: 30,
  },
  {
    name: "S10 上限 64MiB + 已恢复累计 200MiB",
    note: "回归测试：累计用量恢复后，上限只该管本次测试，不能一开测就停",
    cfg: { size: 300 * 1024, bps: 4 * 1024 * 1024, mode: "honor", contentRange: true, maxUse: 64 * 1048576, restoredTotal: 200 * 1048576 },
    seconds: 30,
  },
  {
    name: "S11 切后台 40s（定时器节流）",
    note: "对应「切到后台数字停住不动」：JS 照跑但 setInterval 被降频",
    cfg: { size: 4 * 1024 * 1024, bps: 1024 * 1024, mode: "honor", contentRange: true, bgAt: 15000, bgFor: 40000, bgPolicy: "throttle" },
    seconds: 70,
  },
  {
    name: "S12 切后台 50s（整页冻结）",
    note: "对应「切到后台完全停止」：含最坏时序——过期定时器先于恢复逻辑执行",
    cfg: { size: 4 * 1024 * 1024, bps: 1024 * 1024, mode: "honor", contentRange: true, bgAt: 15000, bgFor: 50000, bgPolicy: "freeze" },
    seconds: 80,
  },
  {
    name: "S13 冻结+过期 tick 竞态",
    note: "确定性复现：统计与到账对齐后切后台，过期定时器把冻结时长误判成节点无响应",
    cfg: { size: 4 * 1024 * 1024, bps: 1024 * 1024, mode: "honor", contentRange: true, bgAt: 15000, bgFor: 50000, bgPolicy: "freeze", bgSyncTick: true },
    seconds: 80,
  },
  {
    // 形状取自 2026-10-06 对真实节点的实测：咕咪快游2 = gcache.migu.cn 的 3.9MiB .ts 切片，
    // 支持 Range（206 + Content-Range 给出总大小 4065312），越界返回标准 416
    name: "S14 真实咕咪快游2(3.9MiB)+4G",
    note: "文件 > 1MiB 且总大小已知：复现用户节点在手机 4G(~2MB/s) 下的表现",
    cfg: { size: 4065312, bps: 2 * 1024 * 1024, mode: "honor", contentRange: true },
    seconds: 60,
  },
  {
    name: "S15 真实咕咪快游2+弱网",
    note: "同节点但只有 300KB/s：1MiB 分块需 3.5 秒、整包需 13 秒",
    cfg: { size: 4065312, bps: 300 * 1024, mode: "honor", contentRange: true },
    seconds: 60,
  },
  {
    name: "S16 真实节点+15% 服务器 500",
    note: "移动网络常见的瞬时 5xx：旧版会持续刷「连接不稳定」（用户实测就是这种）",
    cfg: { size: 4065312, bps: 2 * 1024 * 1024, mode: "honor", contentRange: true, failRate: 0.15 },
    seconds: 60,
  },
  {
    name: "S17 真实节点+20% 限流 429",
    note: "CDN 限流：必须退让后继续消耗，绝不能停测",
    cfg: { size: 4065312, bps: 2 * 1024 * 1024, mode: "honor", contentRange: true, failRate: 0.2, failStatus: 429 },
    seconds: 60,
  },
  {
    name: "S18 咕咪快游2 + 32 线程",
    note: "主人的真实配置：3.9MiB 小切片配 32 线程（分块数 4 < 32，按新规则应走整包）",
    cfg: { size: 4065312, bps: 2 * 1024 * 1024, mode: "honor", contentRange: true, threads: 32 },
    seconds: 60,
  },
  {
    name: "S19 咕咪快游2+32线程+15% 500",
    note: "主人配置叠加剧烈抖动：必须继续消耗且零可见提示",
    cfg: { size: 4065312, bps: 2 * 1024 * 1024, mode: "honor", contentRange: true, threads: 32, failRate: 0.15 },
    seconds: 60,
  },
  {
    name: "S20 大文件(38.9MiB)+32 线程",
    note: "爱奇艺式大文件：分块数 38 ≥ 32，应走分块且互不重叠",
    cfg: { size: 40777819, bps: 8 * 1024 * 1024, mode: "honor", contentRange: true, threads: 32 },
    seconds: 60,
  },
  {
    name: "S21 大文件+32线程+20% 429",
    note: "大文件 + 32 线程 + 限流：最容易被打成「节点拒绝」的组合",
    cfg: { size: 40777819, bps: 8 * 1024 * 1024, mode: "honor", contentRange: true, threads: 32, failRate: 0.2, failStatus: 429 },
    seconds: 60,
  },
];

// ---------------- 运行与统计 ----------------
async function runScenario(sc, EngineClass) {
  installVirtualClock();
  const stats = { requests: 0, http403: 0, http416: 0, http5xx: 0, firstStatus: 0 };
  global.fetch = makeCdn(sc.cfg, stats);

  const eng = new EngineClass();
  const restored = sc.cfg.restoredTotal || 0;
  eng.totalBytes = restored;   // 模拟「累计用量已从 localStorage 恢复」
  eng.sessionBytes = 0;
  const ui = { warnToasts: 0, infoToasts: 0, stopToasts: [], stalls: 0, lastWarn: -1e9, lastInfo: -1e9 };
  let errCount = 0;
  const errMsgs = new Map();

  eng.on("error", (e) => {
    errCount++;
    const key = String(e.msg).replace(/\d+/g, "N");
    errMsgs.set(key, (errMsgs.get(key) || 0) + 1);
    // 对齐 ui.js 现行策略：瞬时失败一律静默重试、不弹任何提示（用户明确反馈不需要），故此处不产生 toast
  });
  eng.on("stop", (reason) => ui.stopToasts.push(reason));
  eng.on("stall", () => ui.stalls++);

  eng.maxUse = sc.cfg.maxUse || 0;
  eng.speedLimit = 0;
  const THREADS = sc.cfg.threads || 8;
  if (process.env.HARNESS_DEBUG && sc.cfg.bgAt) {
    const realTick = eng._tick.bind(eng);
    eng._tick = () => {
      const idle = vnow - (eng._lastProgressAt || 0);
      if (vnow >= sc.cfg.bgAt) console.log(`    [tick] vnow=${vnow} total=${eng.totalBytes} idle=${idle} running=${eng.running}`);
      realTick();
    };
  }
  eng.start("https://mock.test/file.bin", THREADS);

  const total = sc.seconds * 1000;
  const bgAt = sc.cfg.bgAt || 0;
  const bgFor = sc.cfg.bgFor || 0;
  let midBytes = 0, bgBytes = 0, bgHist = 0, postBytes = 0, resumeStop = 0, resumeErr = 0;

  if (bgAt > 0) {
    await tickTo(bgAt);
    midBytes = eng.totalBytes;
    // 可选：让「最后一次统计」与「最后到账字节」对齐后再切后台。
    // 真实环境里节点停顿（几十秒无数据）时切后台就是这个状态，此时过期定时器会把
    // 「后台被冻结的时间」误当成「节点无响应的时间」，从而误判节点已死 —— 用它稳定复现该竞态。
    if (sc.cfg.bgSyncTick && typeof eng._tick === "function") eng._tick();
    // —— 切到后台：复刻 ui.js（有挂起保护就 suspend）——
    if (typeof eng.suspend === "function") eng.suspend();
    bgState.hidden = true;
    bgState.policy = sc.cfg.bgPolicy || "throttle";
    const bgBytes0 = eng.totalBytes, bgHist0 = eng.history.length, bgErr0 = errCount;
    await tickTo(bgAt + bgFor);
    bgBytes = eng.totalBytes - bgBytes0;
    bgHist = eng.history.length - bgHist0;
    // —— 回到前台：故意采用最坏时序 ——
    // 先解除冻结让「过期的 1 秒定时器」跑掉（现实里它可能先于 visibilitychange 恢复），
    // 再执行 ui.js 的恢复逻辑，看引擎会不会在这个窗口里误判节点已死
    bgState.hidden = false;
    bgState.policy = "none";
    await tickTo(bgAt + bgFor + 1);
    if (process.env.HARNESS_DEBUG) {
      console.log(`    [探针] vnow=${vnow} running=${eng.running} lastProgressAt=${eng._lastProgressAt} idle=${vnow - (eng._lastProgressAt || 0)} revives=${eng._revives} 采样=${eng.history.length} 停止=${ui.stopToasts.join(",") || "无"}`);
    }
    const stops0 = ui.stopToasts.length, err0 = errCount;
    if (typeof eng.resume === "function") eng.resume();
    else {
      if (eng.resetRateWindow) eng.resetRateWindow();
      if (eng.revive) eng.revive();
    }
    resumeStop = ui.stopToasts.length - stops0;
    resumeErr = errCount - err0;
    const post0 = eng.totalBytes;
    await tickTo(bgAt + bgFor + 11000);   // 回前台后 10 秒：看是否真的恢复消耗
    postBytes = eng.totalBytes - post0;
    await tickTo(total);
  } else {
    await tickTo(total / 2);
    midBytes = eng.totalBytes;
    await tickTo(total);
  }

  const running = eng.running;
  const totalBytes = eng.totalBytes;
  const avgSpeed = eng.avgSpeed;
  const peak = eng.peakSpeed;
  const histLen = eng.history.length;
  eng.stop();

  const okReq = stats.requests - stats.http403 - stats.http416 - stats.http5xx;
  return {
    name: sc.name,
    note: sc.note,
    seconds: sc.seconds,
    mb: totalBytes / 1048576,
    sessionMb: (totalBytes - restored) / 1048576,
    ackMbps: (avgSpeed * 8) / 1e6,
    peakMbps: (peak * 8) / 1e6,
    okRate: (100 * okReq) / Math.max(1, stats.requests),
    waste: ((100 * (stats.http403 + stats.http416 + stats.http5xx)) / Math.max(1, stats.requests)).toFixed(1),
    requests: stats.requests,
    http403: stats.http403,
    http416: stats.http416,
    http5xx: stats.http5xx,
    errors: errCount,
    errMsgs: [...errMsgs.entries()].map(([k, v]) => `${k}×${v}`).join(","),
    warnToasts: ui.warnToasts,
    infoToasts: ui.infoToasts,
    stops: ui.stopToasts.join("|") || "-",
    stalls: ui.stalls,
    stillRunning: running,
    histLen,
    threads: THREADS,
    mode: eng.mode,
    midMb: midBytes / 1048576,
    bgBytes: bgBytes / 1048576,
    bgHist,
    postMb: postBytes / 1048576,
    resumeStop,
    resumeErr,
    runtimeErrors: runtimeErrors.length,
  };
}

(async () => {
  const enginePath = process.argv[2] || path.join(__dirname, "..", "www", "js", "engine.js");
  const filter = process.argv[3];
  const list = filter ? SCENARIOS.filter((s) => s.name.includes(filter)) : SCENARIOS;

  console.log("被测引擎：" + enginePath);
  console.log("每场景 8 线程、虚拟时间运行，统计「用户可见后果」而非内部细节\n");

  const rows = [];
  for (const sc of list) {
    const EngineClass = loadEngine(enginePath);
    installVirtualClock();
    const r = await runScenario(sc, EngineClass);
    rows.push(r);
    console.log("─".repeat(96));
    console.log(`${r.name}\n  说明：${r.note}｜时长 ${r.seconds}s｜${r.threads} 线程｜策略 ${r.mode === "chunk" ? "Range 分块" : "整包"}｜平均 ${r.ackMbps.toFixed(2)} Mbps｜峰值 ${r.peakMbps.toFixed(2)} Mbps｜计入用量 ${r.mb.toFixed(1)} MiB`);
    console.log(`  请求 ${r.requests} 次（2xx ${r.okRate.toFixed(1)}%，403 ${r.http403}，416 ${r.http416}，5xx ${r.http5xx}，浪费 ${r.waste}%）`);
    console.log(`  报错 ${r.errors} 次 [${r.errMsgs || "无"}]`);
    console.log(`  UI 提示：连接不稳定 ${r.warnToasts} 次、个别请求失败 ${r.infoToasts} 次、停滞提示 ${r.stalls} 次（现行策略下前两类恒为 0）`);
    console.log(`  被自动终止：${r.stops}｜运行中：${r.stillRunning ? "是" : "否"}｜速率采样点 ${r.histLen}｜半程用量 ${r.midMb.toFixed(1)} MiB｜本次实耗 ${r.sessionMb.toFixed(1)} MiB`);
    if (sc.cfg.bgAt) {
      console.log(`  后台实测（${sc.cfg.bgPolicy}）：后台期间消耗 ${r.bgBytes.toFixed(1)} MiB、画面刷新 ${r.bgHist} 次｜回前台 10s 内消耗 ${r.postMb.toFixed(1)} MiB｜恢复时误停 ${r.resumeStop} 次、报错 ${r.resumeErr} 次`);
    }
    if (r.runtimeErrors) console.log(`  ⚠ 未捕获异常 ${r.runtimeErrors} 次`);
  }

  restoreClock();
  console.log("─".repeat(96));
  console.log("\n汇总（用户视角）：");
  console.log("场景".padEnd(34) + "平均Mbps".padStart(10) + "用量MiB".padStart(10) + "浪费%".padStart(8) + "报错".padStart(7) + "误报提示".padStart(9) + "被终止".padStart(8));
  for (const r of rows) {
    console.log(
      r.name.padEnd(34) +
        r.ackMbps.toFixed(2).padStart(10) +
        r.mb.toFixed(1).padStart(10) +
        r.waste.toString().padStart(8) +
        String(r.errors).padStart(7) +
        String(r.warnToasts + r.infoToasts).padStart(9) +
        (r.stops === "-" ? "否" : "是").padStart(8)
    );
  }
  process.exit(0);
})();
