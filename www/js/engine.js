// 测速引擎：N 线程 Range 分块循环下载，按真实收到的字节计量
// 设计对齐原站行为（多线程循环下载/实时速度/峰值带宽/用量预测/用量上限/热切换），
// 差异点：大文件按 2MiB 分块（206 响应），避免单请求把大文件整块拉进内存
(function () {
  "use strict";

  const CHUNK = 1024 * 1024;     // 单请求分块大小（1MiB：慢速连接下也能在超时内完成）
  const TICK = 1000;             // 速率统计周期 ms
  const TIMEOUT = 30000;         // 单请求超时保护

  class SpeedEngine {
    constructor() {
      this.url = "";
      this.threads = 8;
      this.running = false;
      this.totalBytes = 0;      // 总使用量
      this.sessionStart = 0;    // 本次连续测试起点
      this.lastTickBytes = 0;
      this.lastTickTime = 0;
      this.speed = 0;           // 实时速度 B/s
      this.avgSpeed = 0;        // 平均速度 B/s
      this.peakSpeed = 0;       // 历史峰值 B/s（网络带宽）
      this.maxUse = 0;          // 用量上限（0 = 无上限）
      this.speedLimit = 0;      // 平均速度限速（0 = 不限，只能限平均、限不了峰值）
      this.history = [];        // [{t, speed}] 全屏图表用
      this._workers = [];
      this._timer = null;
      this._offsets = [];
      this._window = [];        // [{t, bytes}] 滚动速率窗口
      this._sizeKnown = 0;      // 从 Content-Range 学到的文件大小
      this._rangeMode = null;   // null=未探测 true=分块 false=整包
      this._onTick = null;
      this._onStop = null;
      this._onError = null;
      this._onRecover = null;
      this._onStall = null;
      this._consecFail = 0;     // 全局连续失败计数（供 UI 决定是否打扰用户）
      this._rejCount = 0;       // 连续 4xx 拒绝计数（判定节点拒绝访问）
      this._lastProgressBytes = 0;
      this._lastProgressAt = 0;
      this._wasStalled = false;
    }

    on(evt, cb) {
      if (evt === "tick") this._onTick = cb;
      if (evt === "stop") this._onStop = cb;
      if (evt === "error") this._onError = cb;
      if (evt === "recover") this._onRecover = cb;
      if (evt === "stall") this._onStall = cb;
    }

    _fetch(url, rangeStart) {
      // Range 是 CORS safelist 头（现代 WebView），不再附加其他自定义头以免触发预检
      const headers = {};
      if (rangeStart != null) headers.range = "bytes=" + rangeStart + "-" + (rangeStart + CHUNK - 1);
      // CapacitorHttp 启用时 fetch 走原生 OkHttp（无 CORS）；纯浏览器环境退化为常规 fetch
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
      return fetch(url, { headers, cache: "no-store", signal: ctrl.signal })
        .then(async (resp) => {
          if (!resp.ok && resp.status !== 206) throw new Error("HTTP " + resp.status);
          const cr = resp.headers.get("content-range");
          if (resp.status === 206) {
            // 服务器支持 Range：进入分块模式（浏览器下 Content-Range 可能被 CORS 隐藏，仅按状态判断）
            this._rangeMode = true;
            if (cr) {
              const m = /\/(\d+)$/.exec(cr);
              if (m) {
                this._sizeKnown = parseInt(m[1], 10) || 0;
                if (this._sizeKnown > 0 && this._sizeKnown <= CHUNK) this._rangeMode = false; // 小文件整包即可
              }
            }
          } else if (resp.status === 200) {
            this._rangeMode = false; // 服务器忽略 Range
          }
          const buf = await resp.arrayBuffer();
          return buf.byteLength;
        })
        .catch((e) => {
          if (e && e.name === "AbortError") throw new Error("请求超时");
          throw e;
        })
        .finally(() => clearTimeout(timer));
    }

    async _worker(id) {
      let throttleMs = 0;
      while (this.running) {
        if (id >= this.threads) return; // 线程收缩：多余 worker 自行退出
        // 平均速度限速：本轮请求前按限速目标插入间隔（限平均、限不了峰值）
        throttleMs = 0;
        if (this.speedLimit > 0 && this.avgSpeed > this.speedLimit && this.threads > 0) {
          const over = this.avgSpeed / this.speedLimit;
          throttleMs = Math.min(4000, (over - 1) * this.threads * 200);
        }
        if (throttleMs > 0) await new Promise(r => setTimeout(r, throttleMs));
        if (!this.running) break;

        let off = null;
        if (this._rangeMode !== false) {
          if (this._sizeKnown > CHUNK) {
            // 已知大小：线程间轮流取块，避免重复下载同一段
            off = this._offsets[id] || 0;
            this._offsets[id] = (off + CHUNK * this.threads) % this._sizeKnown;
          } else {
            // 未知大小：按线程步进取块，越界(416)后回卷
            off = this._offsets[id] || 0;
            this._offsets[id] = off + CHUNK * this.threads;
          }
        }
        try {
          const n = await this._fetch(this.url, off);
          if (!this.running) break;
          this.totalBytes += n;
          // 用量上限：请求级即时检查（比 _tick 的 1s 粒度更精确，避免高速网络下大幅超标）
          if (this.maxUse > 0 && this.totalBytes >= this.maxUse && this.running) {
            this.stop();
            if (this._onStop) this._onStop("reachMaxUse");
            break;
          }
          this._rejCount = 0;
          if (this._consecFail > 0) {
            this._consecFail = 0;
            if (this._onRecover) this._onRecover();
          }
        } catch (e) {
          if (!this.running) break;
          if (e && e.message === "HTTP 416" && off != null) {
            this._offsets[id] = 0; // 超出文件末尾，回卷从头继续
            continue;
          }
          // 4xx 明确拒绝（除 429 限频外）连续出现 3 次才停止：防止 CDN 单节点偶发拒绝误杀测试
          const rej = e && /^(HTTP 4(?!29)\d\d)$/.exec(e.message || "");
          if (rej) {
            this._rejCount = (this._rejCount || 0) + 1;
            if (this._rejCount >= 3) {
              this.stop();
              if (this._onStop) this._onStop("nodeRejected", rej[1] + "，连续 " + this._rejCount + " 次");
              return;
            }
            await new Promise(r => setTimeout(r, 1200 * this._rejCount));
            continue;
          }
          this._consecFail++;
          const msg = e && e.message ? e.message : String(e);
          if (this._onError) this._onError({ msg, consecutive: this._consecFail });
          // 指数退避 + 抖动：连续失败越多等得越久，避免火上浇油
          const backoff = Math.min(6000, 1200 * Math.pow(2, Math.min(3, this._consecFail)));
          await new Promise(r => setTimeout(r, backoff * (0.7 + Math.random() * 0.6)));
        }
      }
    }

    _tick() {
      const now = Date.now();
      // 停滞检测：运行中超过 8 秒没有任何新字节则通知 UI（节点限流/挂起）
      if (this.totalBytes !== this._lastProgressBytes) {
        this._lastProgressBytes = this.totalBytes;
        this._lastProgressAt = now;
        if (this._wasStalled) { this._wasStalled = false; if (this._onRecover) this._onRecover(); }
      } else if (now - this._lastProgressAt > 8000 && !this._wasStalled) {
        this._wasStalled = true;
        if (this._onStall) this._onStall();
      }
      this._window.push({ t: now, b: this.totalBytes });
      while (this._window.length > 1 && now - this._window[0].t > 3000) this._window.shift();
      const first = this._window[0];
      const dt = (now - first.t) / 1000;
      if (dt >= 1) {
        this.speed = Math.max(0, (this.totalBytes - first.b) / dt);
        this.avgSpeed = this.totalBytes / Math.max(0.001, (now - this.sessionStart) / 1000);
        if (this.speed > this.peakSpeed) this.peakSpeed = this.speed;
        this.history.push({ t: now, s: this.speed });
        if (this.history.length > 600) this.history.shift();
      } else {
        this.speed = 0;
      }
      if (this._onTick) this._onTick(this);
      if (this.maxUse > 0 && this.totalBytes >= this.maxUse) {
        this.stop();
        if (this._onStop) this._onStop("reachMaxUse");
      }
    }

    start(url, threads) {
      if (this.running) return;
      this.url = url;
      this.threads = threads;
      this.running = true;
      this._sizeKnown = 0;
      this._rangeMode = null;
      this._offsets = new Array(threads).fill(0);
      // 连续测试：不清零 totalBytes（对齐原站“总使用量”跨启动累计），仅重置速率窗口
      if (!this.sessionStart) this.sessionStart = Date.now();
      this._window = [{ t: Date.now(), b: this.totalBytes }];
      this._lastProgressBytes = this.totalBytes;
      this._lastProgressAt = Date.now();
      this._wasStalled = false;
      this._timer = setInterval(() => this._tick(), TICK);
      for (let i = 0; i < threads; i++) {
        this._workers.push(this._worker(i).catch(() => {}));
      }
    }

    setUrl(url) { this.url = url; this._sizeKnown = 0; this._rangeMode = null; this._offsets = this._offsets.map(() => 0); }

    setThreads(n) {
      n = Math.max(1, Math.min(32, n | 0));
      if (!this.running) { this.threads = n; return; }
      while (this.threads < n) { const id = this.threads++; this._offsets[id] = 0; this._workers.push(this._worker(id).catch(() => {})); }
      while (this.threads > n) { this.threads--; /* worker 循环内按 id>threads 自行退出 */ }
      this._offsets.length = this.threads;
    }

    stop() {
      this.running = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this._workers = [];
      this.speed = 0;
    }

    reset() {
      this.stop();
      this.totalBytes = 0;
      this.avgSpeed = 0;
      this.peakSpeed = 0;
      this.sessionStart = 0;
      this.history = [];
    }

    // 回到前台时调用：丢弃后台期间的时间窗，避免速率计算被拉低/跳变
    resetRateWindow() {
      this._window = [{ t: Date.now(), b: this.totalBytes }];
      this._lastProgressBytes = this.totalBytes;
      this._lastProgressAt = Date.now();
      this._wasStalled = false;
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
