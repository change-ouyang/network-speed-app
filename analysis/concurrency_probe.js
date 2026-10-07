// 并发探测：真实节点在 8/16/32 并发下的反应（状态码、失败率、耗时）
// 目的：验证「线程开到 32」是否会触发 CDN 限流/拒绝 —— 这正是用户报「连接不稳定/个别请求失败」的嫌疑点。
// 流量开销：每轮每个请求只读 256KB 后主动断开。
// 用法：node analysis/concurrency_probe.js [节点名过滤] [并发列表,如 8,16,32]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "www", "js", "nodes.js"), "utf8"),
  sandbox
);
const NODES = sandbox.window.NODE_GROUPS.flatMap((g) =>
  g.options.map((o) => ({ group: g.label, label: o.label, url: o.value }))
);

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const READ_LIMIT = 256 * 1024;

async function one(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  const out = { status: 0, bytes: 0, ms: 0, err: null };
  try {
    const resp = await fetch(url, {
      headers: { "user-agent": UA, accept: "*/*" },
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
    });
    out.status = resp.status;
    const reader = resp.body && typeof resp.body.getReader === "function" ? resp.body.getReader() : null;
    if (reader) {
      while (out.bytes < READ_LIMIT) {
        const r = await reader.read();
        if (!r || r.done) break;
        out.bytes += r.value ? r.value.byteLength : 0;
      }
      try { await reader.cancel(); } catch (e) {}
    }
  } catch (e) {
    out.err = (e && e.name ? e.name : "Error") + ": " + ((e && e.message) || e);
  } finally {
    clearTimeout(timer);
    out.ms = Date.now() - t0;
  }
  return out;
}

(async () => {
  const filter = process.argv[2] || "咕咪快游2";
  const levels = (process.argv[3] || "8,16,32").split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0);
  const node = NODES.find((n) => n.label.includes(filter)) || NODES[0];
  console.log(`并发探测节点：${node.label}（${node.group}）`);
  console.log(`地址：${node.url}`);
  console.log(`每轮每请求只读 ${READ_LIMIT / 1024}KB 后断开；每轮 3 次采样\n`);
  console.log("并发".padEnd(6) + "轮次".padEnd(6) + "状态码分布".padEnd(26) + "失败".padEnd(6) + "总字节".padEnd(12) + "耗时ms".padEnd(9) + "聚合Mbps");
  console.log("-".repeat(92));

  for (const n of levels) {
    for (let round = 1; round <= 3; round++) {
      const t0 = Date.now();
      const results = await Promise.all(Array.from({ length: n }, () => one(node.url, 15000)));
      const ms = Date.now() - t0;
      const codes = new Map();
      let bytes = 0;
      let fail = 0;
      for (const r of results) {
        const key = r.err ? "ERR(" + r.err.split(":")[0] + ")" : String(r.status);
        codes.set(key, (codes.get(key) || 0) + 1);
        bytes += r.bytes;
        if (r.err || r.status >= 400) fail++;
      }
      const dist = [...codes.entries()].map(([k, v]) => k + "×" + v).join(" ");
      const mbps = ((bytes * 8) / 1e6 / (ms / 1000)).toFixed(1);
      console.log(
        String(n).padEnd(6) + String(round).padEnd(6) + dist.padEnd(26) + String(fail).padEnd(6) +
          (bytes / 1048576).toFixed(2).padEnd(12) + String(ms).padEnd(9) + mbps
      );
    }
  }
  console.log("\n判读：若 32 并发时出现 403/429/ERR 明显增多，说明该节点对高并发有限流 —— 这正是旧版误报/误停的土壤；");
  console.log("     引擎 v2 对此的处理是「静默退避重试 + 绝不因此停止」，小文件还会自动退回整包循环下载。");
  process.exit(0);
})();
