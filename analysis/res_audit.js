// 审计 android res：找出悬空资源引用（这类问题会直接让 AAPT 链接失败 = 构建阻塞）
"use strict";
const fs = require("fs");
const path = require("path");

const MAIN = path.join(__dirname, "..", "android", "app", "src", "main");
const RES = path.join(MAIN, "res");
const MANIFEST = path.join(MAIN, "AndroidManifest.xml");

const TYPES = ["color", "string", "style", "dimen", "bool", "integer", "array", "attr"];
const defined = {};
TYPES.forEach((t) => (defined[t] = new Set()));
["drawable", "mipmap", "layout", "xml", "anim", "menu", "raw"].forEach((t) => (defined[t] = new Set()));

function walk(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else cb(p);
  }
}

walk(RES, (p) => {
  const rel = path.relative(RES, p);
  const dir = rel.split(path.sep)[0];
  const base = path.basename(p).replace(/\.[^.]+$/, "");
  if (dir === "values" || dir.startsWith("values-")) {
    const txt = fs.readFileSync(p, "utf8");
    for (const m of txt.matchAll(/<(color|string|style|dimen|bool|integer|array|attr)\s+name="([^"]+)"/g)) {
      defined[m[1]].add(m[2]);
    }
  } else if (dir.startsWith("drawable")) defined.drawable.add(base);
  else if (dir.startsWith("mipmap")) defined.mipmap.add(base);
  else if (dir.startsWith("layout")) defined.layout.add(base);
  else if (dir === "xml") defined.xml.add(base);
  else if (dir.startsWith("anim")) defined.anim.add(base);
});

const refs = [];
function scan(p) {
  const txt = fs.readFileSync(p, "utf8");
  for (const m of txt.matchAll(/@(color|string|style|drawable|mipmap|layout|xml|anim|menu|dimen|bool|integer|array|attr)\/([A-Za-z0-9_.]+)/g)) {
    refs.push({ type: m[1], name: m[2], file: p });
  }
}
walk(RES, (p) => { if (p.endsWith(".xml")) scan(p); });
scan(MANIFEST);

const seen = new Set();
const missing = [];
for (const r of refs) {
  const k = r.type + "/" + r.name;
  if (seen.has(k)) continue;
  if (!defined[r.type] || !defined[r.type].has(r.name)) { seen.add(k); missing.push(r); }
}

console.log("已定义资源数量：");
for (const t of Object.keys(defined)) if (defined[t].size) console.log("  " + t + ": " + defined[t].size);
console.log("\n=== 悬空引用（会导致构建失败）===");
if (!missing.length) console.log("  无 ✓");
else for (const m of missing) console.log("  @" + m.type + "/" + m.name + "   <- " + path.relative(MAIN, m.file));
