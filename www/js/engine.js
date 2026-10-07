// 测速引擎：按真实到达的字节计量，多线程循环下载
// 设计对齐原站（循环下载/实时速度/峰值带宽/用量预测/用量上限/热切换），并针对真实节点行为加固：
//   1. 默认「整包下载」，与网页版口径一致；只有在一次探测确认「服务端真支持 Range 且文件 > CHUNK」后
//      才切分块，且偏移严格取模 —— 永不发越界请求（越界是 416/403 误报与白跑流量的根源）
//   2. 流式计量：边下边计数（resp.body.getReader），慢链路上也能实时出速率，且请求被中止时
//      已下载的字节照样计入用量（这才是「流量消耗器」该有的口径）
//   3. 超时只看「有没有新字节」：连续 IDLE_TIMEOUT 无字节才中止该请求，慢链路不再被误杀
//   4. 失败按 worker 各自退避；只有「整包请求被真正拒绝 + 期间零字节」才自动停止，
//      越界/偏移类 4xx 一律回卷重试，绝不终止测试
//   5. 停滞自愈：长时间零字节先重建 worker，仍无数据才判定节点已死
(function () {
  "use strict";

  const CHUNK = 1024 * 1024;      // 分块大小（仅分块模式使用）
  const TICK = 1000;              // 速率统计周期 ms
  const IDLE_TIMEOUT = 20000;     // 单请求「无新字节」上限：超时只中止这一个请求，已收字节保留
  const HARD_TIMEOUT = 300000;    // 单请求硬上限（防极端挂死）
  const STALL_MS = 12000;         // 全局零字节持续多久 → 提示「响应缓慢」
  const REVIVE_MS = 25000;        // 全局零字节持续多久 → 重建 worker 自愈
  const DEAD_MS = 45000;          // 全局零字节持续多久 → 判定节点已死并停止

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class SpeedEngine {
    constructor() {
      // ---- 对外状态（ui.js 读取）----
      this.url = "";
      this.threads = 8;
      this.running = false;
      this.totalBytes = 0;      // 总使用量（累计值：跨启动/跨页面重载，可持久化后显示）
      this.sessionBytes = 0;    // 本次测试用量（用量上限与平均速度按它计算，不会被累计值污染）
      this.sessionStart = 0;    // 本次连续测试起点
      this.speed = 0;           // 实时速度 B/s
      this.avgSpeed = 0;        // 平均速度 B/s
      this.peakSpeed = 0;       // 历史峰值 B/s（网络带宽）
      this.history = [];        // [{t, s}] 全屏图表用
      this.maxUse = 0;          // 用量上限（0 = 无上限）
      this.speedLimit = 0;      // 平均速度限速（0 = 不限；只能限平均、限不了峰值）
      // ---- 传输策略（可观测，便于排查）----
      this.size = 0;            // 已知文件大小，0 = 未知
      this.mode = "whole";      // whole = 整包循环下载；chunk = Range 分块
      // ---- 内部 ----
      this._workers = [];
      this._offsets = [];
      this._epoch = 0;          // worker 世代：stop/自愈后旧的立即失效
      this._controllers = new Set();
      this._timer = null;
      this._window = [];        // [{t, b}] 滚动速率窗口
      this._rangeProbed = false;
      this._probeInFlight = false;
      this._rejStreak = 0;
      this._lastProgressBytes = 0;
      this._lastProgressAt = 0;
      this._lastTickAt = 0;
      this._lastReviveAt = 0;
      this._revives = 0;
      this._stalled = false;
      this._suspended = false;   // 页面切到后台时为 true：暂停「停滞/死亡」判定
      this._onTick = null;
      this._onStop = null;
      this._onError = null;
      this._onRecover = null;
      this._onStall = null;
    }

    on(evt, cb) {
      if (evt === "tick") this._onTick = cb;
      if (evt === "stop") this._onStop = cb;
      if (evt === "error") this._onError = cb;
      if (evt === "recover") this._onRecover = cb;
      if (evt === "stall") this._onStall = cb;
    }

    // 计量入口：所有字节都从这里进账；用量上限按「本次测试用量」即时判定（请求级精度）
    _addBytes(n) {
      if (!(n > 0)) return;
      this.totalBytes += n;
      this.sessionBytes += n;
      if (this.maxUse > 0 && this.sessionBytes >= this.maxUse && this.running) {
        this._finish("reachMaxUse");
        return;
      }
      // 后台时 WebView 的 setInterval 会被系统降频甚至冻结，计数与看门狗不能只靠定时器：
      // 只要还有字节到达就按秒节流补一次 tick，保证后台仍在计数、统计与自愈
      const now = Date.now();
      if (now - this._lastTickAt >= TICK) this._tick();
    }

    // 单次请求：返回 {status, bytes, total}；字节经 _addBytes 实时入账，中止时已收部分保留
    async _request(off) {
      const headers = {};
      if (off != null) headers.range = "bytes=" + off + "-" + (off + CHUNK - 1);
      const ctrl = new AbortController();
      this._controllers.add(ctrl);
      // 只要还在收到字节就不断续期；只有真正「零字节」才判超时
      let idle = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT);
      const bump = () => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT); };
      const hard = setTimeout(() => ctrl.abort(), HARD_TIMEOUT);
      try {
        const resp = await fetch(this.url, { headers, cache: "no-store", signal: ctrl.signal });
        const status = resp.status;
        if (!resp.ok && status !== 206) {
          const err = new Error("HTTP " + status);
          err.status = status;
          throw err;
        }
        const cr = resp.headers.get("content-range");
        let total = 0;
        if (cr) {
          const m = /\/(\d+)\s*$/.exec(cr);
          if (m) total = parseInt(m[1], 10) || 0;
        }
        let n = 0;
        const reader = resp.body && typeof resp.body.getReader === "function" ? resp.body.getReader() : null;
        if (reader) {
          for (;;) {
            const r = await reader.read();
            if (!r || r.done) break;
            const len = r.value ? r.value.byteLength : 0;
            if (len <= 0) continue;
            n += len;
            bump();
            this._addBytes(len);
            if (!this.running) break;
          }
        } else {
          // 无流式能力的环境：整包读取（靠 HARD_TIMEOUT 兜底）
          const buf = await resp.arrayBuffer();
          n = buf.byteLength;
          this._addBytes(n);
        }
        return { status, bytes: n, total };
      } catch (e) {
        if (e && e.name === "AbortError") {
          const err = new Error(this.running ? "响应超时" : "已停止");
          err.aborted = true;
          throw err;
        }
        throw e;
      } finally {
        clearTimeout(idle);
        clearTimeout(hard);
        this._controllers.delete(ctrl);
      }
    }

    // 探测结论：只有「206 + Content-Range 给出可信总大小 + 大小 > CHUNK」才值得分块
    _applyProbe(r) {
      this._rangeProbed = true;
      if (r.status === 206 && r.total > CHUNK) {
        this.size = r.total;
        this.mode = "chunk";
        this._offsets = this._offsets.map(() => 0);
      } else {
        // 小文件 / 总大小不可信 / 服务端忽略 Range：整包最稳，与网页版一致
        this.size = r.status === 206 ? r.total : 0;
        this.mode = "whole";
      }
    }

    async _worker(id, epoch) {
      let fails = 0;
      while (this.running && epoch === this._epoch) {
        if (id >= this.threads) return;   // 线程收缩：多余 worker 自行退出
        // 平均速度限速：按超出比例插入间隔（限平均、限不了峰值）
        if (this.speedLimit > 0 && this.avgSpeed > this.speedLimit) {
          const wait = Math.min(4000, (this.avgSpeed / this.speedLimit - 1) * this.threads * 200);
          if (wait > 0) await sleep(wait);
          if (!this.running || epoch !== this._epoch) return;
        }

        let off = null;
        let isProbe = false;
        if (this.mode === "chunk" && this.size > CHUNK) {
          // 严格取模：偏移永远落在文件内，不会产生越界请求
          off = (this._offsets[id] || 0) % this.size;
          this._offsets[id] = (off + CHUNK * this.threads) % this.size;
        } else if (!this._rangeProbed && !this._probeInFlight && id === 0) {
          isProbe = true;      // 每个会话只探测一次，且只占 0 号线程
          this._probeInFlight = true;
          off = 0;
        }

        try {
          const r = await this._request(off);
          if (!this.running) break;
          if (epoch !== this._epoch) return;
          if (isProbe) {
            this._probeInFlight = false;
            this._applyProbe(r);
          } else if (this.mode === "chunk" && r.total && r.total !== this.size) {
            // 直播切片等文件大小会变：立即重新对齐偏移，避免越界
            this.size = r.total;
            this._offsets = this._offsets.map(() => 0);
          }
          this._rejStreak = 0;
          if (fails > 0) {
            fails = 0;
            if (this._onRecover) this._onRecover();
          }
        } catch (e) {
          if (isProbe) this._probeInFlight = false;
          if (!this.running || epoch !== this._epoch) return;
          if (this._suspended) {
            // 后台挂起期间（含解冻瞬间那批「过期」超时定时器批量中止在途请求）：
            // 不报错、不计失败，等回前台的 resume() 统一重建连接，别用噪音轰炸用户
            await sleep(1000);
            continue;
          }
          const status = e && e.status;
          if (isProbe && (status === 416 || (status >= 400 && status < 500))) {
            // 连 0-0 都不给 Range：直接落到整包模式，别再无谓试探
            this._rangeProbed = true;
            this.mode = "whole";
            this.size = 0;
          }
          if (status === 416 || (off != null && off > 0 && status >= 400 && status < 500)) {
            // 偏移类响应（越界/防盗链拒绝）：回卷重来，不计失败、不打扰用户
            this._offsets[id] = 0;
            continue;
          }
          if (status >= 400 && status < 500) {
            // 其它 4xx：很可能这个节点不欢迎 Range —— 退回整包口径（网页版行为）
            this._rangeProbed = true;
            this.mode = "whole";
            this._offsets[id] = 0;
          }
          // 真正的「拒绝访问」：仅在整包请求上、连续多次、且期间零字节时才判定节点拒绝
          const hardReject = off == null && (status === 401 || status === 403 || status === 410);
          if (hardReject) {
            this._rejStreak++;
            if (this._rejStreak >= 3 && Date.now() - this._lastProgressAt > 10000) {
              this._finish("nodeRejected", "HTTP " + status + "，连续 " + this._rejStreak + " 次");
              return;
            }
          }
          fails++;
          if (this._onError) this._onError({ msg: e && e.message ? e.message : String(e), consecutive: fails });
          // 指数退避 + 抖动（按本 worker 的失败次数，不牵连其它线程）
          const backoff = Math.min(6000, 800 * Math.pow(2, Math.min(3, fails)));
          await sleep(backoff * (0.7 + Math.random() * 0.6));
        }
      }
    }

    _spawn(epoch) {
      this._workers = [];
      for (let i = 0; i < this.threads; i++) this._workers.push(this._worker(i, epoch).catch(() => {}));
    }

    // 停滞自愈：中止在途请求并重建全部 worker（保留已探明的传输策略）
    // 公开方法：从后台回到前台时由 UI 主动调用，立即恢复冻结/断流的 worker，不必等看门狗
    revive() {
      this._lastReviveAt = Date.now();
      this._revives++;
      this._epoch++;               // 先换代：旧 worker 的异常会被静默吞掉，不误报错误
      for (const c of this._controllers) {
        try { c.abort(); } catch (e) {}
      }
      this._controllers.clear();
      this._probeInFlight = false;
      this._offsets = new Array(this.threads).fill(0);
      this._spawn(this._epoch);
    }

    _tick() {
      const now = Date.now();
      this._lastTickAt = now;
      if (this.totalBytes !== this._lastProgressBytes) {
        this._lastProgressBytes = this.totalBytes;
        this._lastProgressAt = now;
        if (this._stalled) {
          this._stalled = false;
          if (this._onRecover) this._onRecover();
        }
      } else if (this.running && !this._suspended) {
        // 注意：页面在后台被冻结期间，系统不跑定时器；解冻后那些「过期」的定时器会立刻执行。
        // 若不挂起判定，它们会把「我被冻结的时间」当成「节点无响应的时间」→ 误判节点已死并停止测试。
        // 因此切后台一律 suspend()，回前台由 resume() 重置基准并重建 worker。
        const idle = now - this._lastProgressAt;
        if (idle > DEAD_MS) {
          this._finish("nodeDead", "连续 " + Math.round(idle / 1000) + " 秒没有收到任何数据");
          return;
        }
        if (idle > REVIVE_MS && now - this._lastReviveAt > REVIVE_MS) {
          this.revive();
        } else if (idle > STALL_MS && !this._stalled) {
          this._stalled = true;
          if (this._onStall) this._onStall();
        }
      }
      // 速率：3 秒滚动窗口
      this._window.push({ t: now, b: this.totalBytes });
      while (this._window.length > 1 && now - this._window[0].t > 3000) this._window.shift();
      const first = this._window[0];
      const dt = (now - first.t) / 1000;
      if (dt >= 1) {
        this.speed = Math.max(0, (this.totalBytes - first.b) / dt);
        this.avgSpeed = this.sessionBytes / Math.max(0.001, (now - this.sessionStart) / 1000);
        if (this.speed > this.peakSpeed) this.peakSpeed = this.speed;
        this.history.push({ t: now, s: this.speed });
        if (this.history.length > 600) this.history.shift();
      } else {
        this.speed = 0;
      }
      if (this._onTick) this._onTick(this);
      if (this.maxUse > 0 && this.sessionBytes >= this.maxUse && this.running) this._finish("reachMaxUse");
    }

    // 停止的唯一出口：保证 onStop 只触发一次
    _finish(reason, detail) {
      if (!this.running) return;
      this.stop();
      if (this._onStop) this._onStop(reason, detail);
    }

    start(url, threads) {
      if (this.running) return;
      this.url = url;
      this.threads = Math.max(1, Math.min(32, threads | 0));
      this.running = true;
      // 每次启动重新探明传输策略（换了节点/线路，旧结论不作数）
      this.size = 0;
      this.mode = "whole";
      this._rangeProbed = false;
      this._probeInFlight = false;
      this._rejStreak = 0;
      this._offsets = new Array(this.threads).fill(0);
      this._epoch++;
      // 连续测试：不清零 totalBytes（对齐原站「总使用量」跨启动累计），仅重置速率窗口与停滞状态
      if (!this.sessionStart) this.sessionStart = Date.now();
      this._window = [{ t: Date.now(), b: this.totalBytes }];
      this._lastProgressBytes = this.totalBytes;
      this._lastProgressAt = Date.now();
      this._lastReviveAt = Date.now();
      this._stalled = false;
      this._revives = 0;
      this._timer = setInterval(() => this._tick(), TICK);
      this._spawn(this._epoch);
    }

    setUrl(url) {
      this.url = url;
      this.size = 0;
      this.mode = "whole";
      this._rangeProbed = false;
      this._probeInFlight = false;
      this._offsets = this._offsets.map(() => 0);
    }

    setThreads(n) {
      n = Math.max(1, Math.min(32, n | 0));
      if (!this.running) { this.threads = n; return; }
      if (n > this.threads) {
        const from = this.threads;
        this.threads = n;
        for (let i = from; i < n; i++) {
          this._offsets[i] = 0;
          this._workers.push(this._worker(i, this._epoch).catch(() => {}));
        }
      } else {
        this.threads = n;
        this._offsets.length = n;   // 多余 worker 在循环开头按 id >= threads 自行退出
      }
    }

    stop() {
      this.running = false;
      this._epoch++;               // 让所有在途 worker 立即失效
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      // 中止在途请求：暂停即停流量，不再白跑完当前分块
      for (const c of this._controllers) {
        try { c.abort(); } catch (e) {}
      }
      this._controllers.clear();
      this._workers = [];
      this.speed = 0;
    }

    reset() {
      this.stop();
      this.totalBytes = 0;
      this.sessionBytes = 0;
      this.avgSpeed = 0;
      this.peakSpeed = 0;
      this.sessionStart = 0;
      this.history = [];
      this._rejStreak = 0;
    }

    // 回到前台时调用：丢弃后台期间的时间窗与停滞判定，避免速率跳变/误判节点已死
    resetRateWindow() {
      this._window = [{ t: Date.now(), b: this.totalBytes }];
      this._lastProgressBytes = this.totalBytes;
      this._lastProgressAt = Date.now();
      this._lastReviveAt = Date.now();
      this._stalled = false;
    }

    // 页面进入后台：停止「停滞/自愈/死亡」判定。
    // 后台期间照常按字节计数（有数据就仍然统计），但不做任何「节点不行了」的结论。
    suspend() {
      this._suspended = true;
    }

    // 回到前台：恢复判定、重置进度基准、重建全部 worker（后台可能已被冻结，连接也可能已断）
    resume() {
      this._suspended = false;
      this.resetRateWindow();
      if (this.running) this.revive();
    }

    // 用量预测：按当前实时速度外推
    predict() {
      const p = this.speed;
      return { min: p * 60, hour: p * 3600, day: p * 86400, mon: p * 86400 * 30 };
    }
  }

  // 字节格式化：mode 0=B/s 系（带/s），1=纯字节，2=bit 系（Bps→Gbps）
  window.formatBytes = function (bytes, mode) {
    const units = mode === 2
      ? ["bps", "Kbps", "Mbps", "Gbps", "Tbps"]
      : mode === 0
        ? ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"]
        : ["B", "KB", "MB", "GB", "TB", "PB"];
    let v = mode === 2 ? bytes * 8 : bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? Math.round(v) : v.toFixed(1)) + " " + units[i];
  };

  window.SpeedEngine = SpeedEngine;
})();
