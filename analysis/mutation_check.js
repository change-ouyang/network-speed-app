// 变异测试：验证 ui_handoff_harness.js「真的能发现问题」——测不出 bug 的测试等于没有测试
// 做法：把 www/js/ui.js 复制成临时文件、注入一个已知缺陷，用 UI_HARNESS_UI 指过去跑测试台，
//       期望「测试台必须失败」；再恢复原文件确认基线通过。
// 用法：node analysis/mutation_check.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const UI = path.join(ROOT, "www", "js", "ui.js");
const HARNESS = path.join(__dirname, "ui_handoff_harness.js");
const original = fs.readFileSync(UI, "utf8");

// 每个变异：{ 名称, 期望被哪组测试抓到, 替换 }
const MUTATIONS = [
  {
    name: "M1 去掉可见性代际守卫（评审阻断级 #1 的僵尸态）",
    expect: "T2",
    from: "if (myEpoch !== visEpoch || !document.hidden) {",
    to: "if (false) {",
  },
  {
    name: "M2 交棒后永不重启引擎",
    expect: "T1",
    from: "if (handedOff) {\n      handedOff = false;",
    to: "if (false) {\n      handedOff = false;",
  },
  {
    name: "M3 回前台不结算原生泵字节（丢账）",
    expect: "T1/T5",
    from: "absorbPumpBytes(await window.SpeedNative.pumpStop());   // 停泵并领走字节（含 renderMetrics）",
    to: "await window.SpeedNative.pumpStop();   // 变异：领走但不入账",
  },
  {
    name: "M4 交棒成功后仍不停 JS 引擎（JS 与原生双下）",
    expect: "T1",
    from: "    pumpOn = true;\n    handedOff = true;\n    engine.stop();",
    to: "    pumpOn = true;\n    handedOff = true;",
  },
  {
    name: "M5 入账后不重置速率窗口（后台整批被算成 1 秒速度、污染带宽峰值）",
    expect: "T6",
    from: "    engine.resetRateWindow();\n    renderMetrics(engine);",
    to: "    renderMetrics(engine);",
  },
];

function runHarness(uiPath) {
  const env = Object.assign({}, process.env);
  if (uiPath) env.UI_HARNESS_UI = uiPath;
  else delete env.UI_HARNESS_UI;
  const r = spawnSync(process.execPath, [HARNESS], { env, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = /结果：通过 (\d+) 项，失败 (\d+) 项/.exec(out);
  const failed = out.split("\n").filter((l) => l.includes("✗")).map((l) => l.trim());
  return { code: r.status, pass: m ? Number(m[1]) : -1, fail: m ? Number(m[2]) : -1, failedLines: failed };
}

let bad = 0;
console.log("变异测试：确认测试台能发现注入的缺陷\n" + "=".repeat(76));

// 0) 基线：未变异必须全绿
const base = runHarness(null);
const baseOk = base.code === 0 && base.fail === 0;
console.log(`\n基线（未变异）：通过 ${base.pass}，失败 ${base.fail}  →  ${baseOk ? "符合预期 ✓" : "不符合预期 ✗（测试台本身有问题）"}`);
if (!baseOk) bad++;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui_mutation_"));
try {
  MUTATIONS.forEach((mu, i) => {
    if (!original.includes(mu.from)) {
      console.log(`\n${mu.name}\n  跳过：源码中找不到锚点（可能是代码已改动，请更新变异脚本）`);
      bad++;
      return;
    }
    const tmp = path.join(tmpDir, `ui_mutant_${i}.js`);
    fs.writeFileSync(tmp, original.replace(mu.from, mu.to));
    const r = runHarness(tmp);
    const caught = r.code !== 0 && r.fail > 0;
    console.log(
      `\n${mu.name}\n  期望被 ${mu.expect} 抓到 → 结果：通过 ${r.pass} / 失败 ${r.fail}` +
        `  →  ${caught ? "已被抓到 ✓" : "**没抓到 ✗（测试台覆盖不足）**"}`
    );
    if (r.failedLines.length) r.failedLines.forEach((l) => console.log(`      ${l}`));
    if (!caught) bad++;
  });
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}

// 恢复校验：原文件必须一字未改
const after = fs.readFileSync(UI, "utf8");
console.log("\n" + "=".repeat(76));
console.log(`原 ui.js 未被改动：${after === original ? "是 ✓" : "否 ✗"}`);
if (after !== original) bad++;
console.log(bad ? `\n结论：有 ${bad} 项不符合预期 ✗` : `\n结论：测试台有效（${MUTATIONS.length} 个注入缺陷全部被抓住，基线全绿）✓`);
process.exit(bad ? 1 : 0);
