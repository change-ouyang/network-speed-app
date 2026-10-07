#!/usr/bin/env node
/**
 * java_check.js —— Android/Capacitor 源码「编译级」校验（不需要 Android SDK，不产出 APK）
 *
 * 原理：
 *   1) 用 javac 17 把 analysis/android_stubs/ 下的 Android/Capacitor 桩类编译到临时目录；
 *   2) 自动扫描 android/app/src/main/java/**\/*.java（新增文件会自动纳入校验），
 *      以该临时目录为 classpath 编译真实源码；
 *   3) 任一步失败 → 打印 javac 原文并以退出码 1 结束；全部通过 → 打印成功行并退出 0。
 *   4) 临时目录由脚本自己在 os.tmpdir() 下创建并删除。
 *
 * 只用 Node 内置模块（child_process / fs / path / os），无需安装依赖。
 * 用法：node analysis/java_check.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// 路径与常量
// ---------------------------------------------------------------------------

/** 项目根目录 = 本脚本所在目录（analysis/）的上一级 */
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STUBS_DIR = path.join(__dirname, 'android_stubs');
/** 真实源码根：只扫 main/java，故意排除 src/test 与 src/androidTest（它们依赖 JUnit，桩里没有） */
const REAL_SRC_ROOT = path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'java');
const TMP_PREFIX = 'java_check_';

/** javac 候选：优先 JAVA_HOME，其次本机已知的 JDK 17 位置，最后 PATH 上的 javac */
const JAVAC_CANDIDATES = [
  process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac')
    : null,
  'D:\\Actionsoft\\jdk17\\bin\\javac.exe',
  'javac',
].filter(Boolean);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** Windows 路径统一成正斜杠（javac 两种都认，统一后输出更好读） */
function toPosix(p) {
  return p.replace(/\\/g, '/');
}

/** 相对项目根的短路径，用于日志 */
function rel(p) {
  return toPosix(path.relative(PROJECT_ROOT, p));
}

/** 递归收集指定后缀的文件（排序返回，保证输出稳定可复现） */
function collectFiles(rootDir, suffix) {
  const found = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue; // 目录不存在/无权限；存在性由调用方单独检查
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix)) {
        found.push(full);
      }
    }
  }
  return found.sort();
}

const collectJavaFiles = (rootDir) => collectFiles(rootDir, '.java');

/** 取文件里的第一条 package 声明 */
function readPackageName(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = /^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m.exec(content);
  return match ? match[1] : null;
}

/**
 * 守卫：源码目录结构必须与 package 声明一致。
 * 不一致时 javac 会报 "class X is public, should be declared in a file named ..."，
 * 提前给出人类可读的提示比让使用者去读 javac 报错更省时间。
 */
function verifyPackagePaths(rootDir, files) {
  const problems = [];
  for (const file of files) {
    const pkg = readPackageName(file);
    if (pkg === null) {
      problems.push(`缺少 package 声明：${rel(file)}`);
      continue;
    }
    const expectedDir = path.join(rootDir, ...pkg.split('.'));
    if (path.resolve(path.dirname(file)) !== path.resolve(expectedDir)) {
      problems.push(
        `package 与目录不一致：${rel(file)}\n` +
          `      package ${pkg}; → 期望目录 ${rel(expectedDir)}`
      );
    }
  }
  return problems;
}

/** 找到可用的 javac，找不到返回 null */
function resolveJavac() {
  for (const candidate of JAVAC_CANDIDATES) {
    if (candidate === 'javac') {
      const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8', timeout: JAVAC_TIMEOUT_MS });      if (!probe.error && probe.status === 0) return candidate;
      continue;
    }
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 诊断语言开关：Windows 上的 JDK 会忽略 LANG/LC_ALL（跟随系统区域设置），
 * 中文区域下 javac 按 GBK 输出中文报错，而 Node 以 UTF-8 解码 → 乱码。
 * 用 -J-Duser.language=en 强制英文，报错即可读（不影响任何判定逻辑）。
 * 注意：-J 选项必须排在所有 javac 选项之前。
 */
const LANG_ARGS = ['-J-Duser.language=en', '-J-Duser.country=US'];

/** 单次 javac 调用的最长等待时间（防病态情况下卡死） */
const JAVAC_TIMEOUT_MS = 5 * 60 * 1000;

/** 裁剪 javac 输出，避免刷屏（保留头部定位 + 尾部汇总） */
function clampOutput(text, maxChars = 8000) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, 2500);
  const tail = text.slice(-(maxChars - 2500));
  return `${head}\n...（中间省略 ${text.length - maxChars} 字符）...\n${tail}`;
}

/** 统计目录下 .class 数量：用于确认 javac 真的产出了东西 */
function countClassFiles(dir) {
  return collectFiles(dir, '.class').length;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/** 判定失败：交给 main 统一打印 + 置退出码，确保 finally 里的清理一定会执行 */
class CheckFailure extends Error {
  constructor(lines) {
    super('java check failed');
    this.lines = lines;
  }
}

function runCheck() {
  // --- 0. 临时输出目录（os.tmpdir() 下）---
  // 提前创建，并让后面所有步骤（含前置检查）都包在 try 里：
  // 这样无论在哪一步失败，finally 都一定会把这个目录删掉。
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  const outDir = path.join(tmpRoot, 'classes');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    runCheckInTmp(outDir);
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(`! 临时目录清理失败：${toPosix(tmpRoot)}（${err.message}）\n`);
    }
  }
}

function runCheckInTmp(outDir) {
  // --- 1. 前置检查 ---
  if (!fs.existsSync(STUBS_DIR)) {
    throw new CheckFailure([`✗ 找不到桩源码目录：${rel(STUBS_DIR)}`]);
  }
  if (!fs.existsSync(REAL_SRC_ROOT)) {
    throw new CheckFailure([`✗ 找不到真实源码目录：${rel(REAL_SRC_ROOT)}`]);
  }

  const javac = resolveJavac();
  if (javac === null) {
    throw new CheckFailure([
      '✗ 找不到 javac，已尝试：',
      ...JAVAC_CANDIDATES.map((c) => `    - ${c}`),
      '  请设置 JAVA_HOME，或修改本脚本的 JAVAC_CANDIDATES。',
    ]);
  }

  // --- 2. 收集源码 ---
  const stubFiles = collectJavaFiles(STUBS_DIR);
  const realFiles = collectJavaFiles(REAL_SRC_ROOT);

  if (stubFiles.length === 0) {
    throw new CheckFailure([`✗ 桩目录下没有任何 .java：${rel(STUBS_DIR)}`]);
  }
  if (realFiles.length === 0) {
    throw new CheckFailure([
      `✗ 未扫描到任何待校验的 Java 源文件：${rel(REAL_SRC_ROOT)}`,
      '  期望至少包含 MainActivity / SpeedForegroundService / SpeedServicePlugin。',
    ]);
  }

  // --- 3. 结构守卫 ---
  const structureProblems = [
    ...verifyPackagePaths(STUBS_DIR, stubFiles),
    ...verifyPackagePaths(REAL_SRC_ROOT, realFiles),
  ];
  if (structureProblems.length > 0) {
    throw new CheckFailure([
      '✗ 源码目录结构与 package 声明不一致（javac 必然失败），请先修这个：',
      ...structureProblems.map((p) => `    - ${p}`),
    ]);
  }

  // Windows 的 classpath 分隔符是 ';'，POSIX 是 ':'
  const pathSep = process.platform === 'win32' ? ';' : ':';
  // 参数一律用数组交给 spawnSync，彻底避开引号/转义问题
  const baseArgs = ['-encoding', 'UTF-8', '-proc:none', '-Xlint:-options', '-nowarn'];

  // --- 4. 先编译桩类 ---
  const stubResult = spawnSync(javac, [...LANG_ARGS, ...baseArgs, '-d', outDir, ...stubFiles.map(toPosix)], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: JAVAC_TIMEOUT_MS,
  });
  if (stubResult.error) {
    throw new CheckFailure([`✗ 调用 javac 失败：${stubResult.error.message}`]);
  }
  if (stubResult.status !== 0) {
    throw new CheckFailure([
      '✗ 桩类自身编译失败（问题在 analysis/android_stubs/，请先修桩）：',
      '',
      clampOutput(`${stubResult.stdout || ''}${stubResult.stderr || ''}`.trim()),
    ]);
  }

  // --- 5. 以桩为 classpath 编译真实源码 ---
  const realResult = spawnSync(
    javac,
    [...LANG_ARGS, ...baseArgs, '-d', outDir, '-classpath', `${toPosix(outDir)}${pathSep}`, ...realFiles.map(toPosix)],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: JAVAC_TIMEOUT_MS }
  );
  if (realResult.error) {
    throw new CheckFailure([`✗ 调用 javac 失败：${realResult.error.message}`]);
  }
  if (realResult.status !== 0) {
    throw new CheckFailure([
      '✗ Java 编译校验失败：',
      '',
      clampOutput(`${realResult.stdout || ''}${realResult.stderr || ''}`.trim()),
      '',
      `桩文件数：${stubFiles.length}，真实源文件数：${realFiles.length}`,
      `javac：${toPosix(javac)}`,
    ]);
  }

  // --- 6. 防「假通过」：确认真的产出了 class ---
  const classCount = countClassFiles(outDir);
  if (classCount === 0) {
    throw new CheckFailure(['✗ javac 退出码为 0，但没有产出任何 .class —— 校验并未真正执行。']);
  }

  process.stdout.write(`Java 编译校验通过 ✓（${realFiles.length} 个源文件）\n`);
}

function main() {
  try {
    runCheck();
    process.exit(0);
  } catch (err) {
    if (err instanceof CheckFailure) {
      process.stderr.write(`${err.lines.join('\n')}\n`);
    } else {
      process.stderr.write(`✗ 校验脚本自身异常：${err && err.stack ? err.stack : err}\n`);
    }
    process.exit(1);
  }
}

main();
