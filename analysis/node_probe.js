// 真实节点探测：确认各节点对「整包 GET / Range 0-1MiB / 越界 Range」的真实反应，
// 用来校验 engine.js 的传输策略选择在现实中是否正确（本机直连，不是手机网络）。
// 用法：node analysis/node_probe.js [节点名过滤]
// 流量开销：每个节点最多读 64KB × 3 次，可忽略。
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 直接从 nodes.js 取清单，避免两处维护（window 用 vm 里的沙箱对象充当）
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
const MAX_READ = 64 * 1024;
const CHUNK = 1024 * 1024;

async function probe(url, rangeHeader) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const out = { status: 0, cr: null, cl: null, ar: null, bytes: 0, err: null };
  try {
    const headers = { "user-agent": UA };
    if (rangeHeader) headers.range = rangeHeader;
    const resp = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    out.status = resp.status;
    out.cr = resp.headers.get("content-range");
    out.cl = resp.headers.get("content-length");
    out.ar = resp.headers.get("accept-ranges");
    const reader = resp.body && typeof resp.body.getReader === "function" ? resp.body.getReader() : null;
    if (reader) {
      while (out.bytes < MAX_READ) {
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
  }
  return out;
}

const totalOf = (p) => {
  if (p.cr) {
    const m = /\/(\d+)\s*$/.exec(p.cr);
    if (m) return parseInt(m[1], 10) || 0;
  }
  const n = parseInt(p.cl || "0", 10) || 0;
  return n;
};
const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MiB" : n >= 1024 ? (n / 1024).toFixed(0) + " KiB" : n + " B");

(async () => {
  const filter = process.argv[2];
  const list = filter ? NODES.filter((n) => n.label.includes(filter)) : NODES;
  console.log(`真实节点探测：${list.length} 个节点，每节点 3 次请求、各最多读 ${MAX_READ / 1024}KB\n`);

  const rows = [];
  for (const n of list) {
    const plain = await probe(n.url, null);
    const ranged = await probe(n.url, `bytes=0-${CHUNK - 1}`);
    const size = ranged.status === 206 ? totalOf(ranged) : totalOf(plain);
    // 越界请求：正是旧引擎误判「节点拒绝」的元凶，看真实节点怎么回
    const oor = size > 0 ? await probe(n.url, `bytes=${size + CHUNK}-${size + 2 * CHUNK - 1}`) : { status: 0, err: "未知大小" };

    // 与 engine.js v2 的判定保持一致：仅「206 且总大小可信且 > 1MiB」才分块
    const mode = ranged.status === 206 && totalOf(ranged) > CHUNK ? "分块" : "整包";
    rows.push({
      label: n.label,
      group: n.group,
      plain: plain.err ? "ERR" : plain.status,
      ranged: ranged.err ? "ERR" : ranged.status,
      cr: ranged.cr || plain.cr || "-",
      size: size ? mb(size) : "-",
      oor: oor.err ? (oor.status ? oor.status + "(" + oor.err + ")" : "ERR") : oor.status,
      mode,
      err: plain.err || ranged.err || "",
    });
  }

  const pad = (s, w) => String(s).padEnd(w);
  console.log(pad("节点", 12) + pad("分组", 8) + pad("整包", 7) + pad("Range", 7) + pad("总大小", 11) + pad("越界", 8) + pad("引擎选择", 10) + "Content-Range");
  console.log("-".repeat(104));
  for (const r of rows) {
    console.log(
      pad(r.label, 12) + pad(r.group, 8) + pad(r.plain, 7) + pad(r.ranged, 7) + pad(r.size, 11) + pad(r.oor, 8) + pad(r.mode, 10) +
        (r.cr === "-" ? "-" : r.cr) + (r.err ? "  ⚠ " + r.err : "")
    );
  }

  console.log("\n结论：");
  const chunked = rows.filter((r) => r.mode === "分块");
  const whole = rows.filter((r) => r.mode === "整包");
  console.log(`  分块模式 ${chunked.length} 个：${chunked.map((r) => r.label).join("、") || "无"}`);
  console.log(`  整包模式 ${whole.length} 个：${whole.map((r) => r.label).join("、") || "无"}`);
  const badOor = rows.filter((r) => r.oor === 403 || r.oor === 400 || r.oor === 401);
  if (badOor.length) {
    console.log(`  ⚠ 越界会被拒（旧引擎在此误判「节点拒绝」并停止）：${badOor.map((r) => r.label + "→" + r.oor).join("、")}`);
    console.log(`    引擎 v2 对此的处理：偏移严格取模、永不越界；即便撞上也只回卷重试，不计失败、不停测`);
  } else {
    console.log("  越界请求未被硬拒（416 属正常语义，引擎 v2 会回卷重试）");
  }
  process.exit(0);
})();
