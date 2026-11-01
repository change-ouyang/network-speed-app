const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const MB = 1024 * 1024;
// fetch 桩：挂起不返回（下载进度完全由测试驱动，不靠 fetch），但必须响应 abort——
// 否则 stop()/revive() 后残留的 idle/hard 定时器会把测试进程吊住
function setup() {
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Date,
    fetch: (url, opts) => new Promise((resolve, reject) => {
      const sig = opts && opts.signal;
      if (!sig) return;
      const onAbort = () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (sig.aborted) onAbort(); else sig.addEventListener("abort", onAbort);
    }),
  });
  context.window = context;
  for (const name of ['nodes', 'engine']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', name + '.js'), 'utf8'), context);
  }
  return context;
}

function runningEngine(c) {
  const e = new c.SpeedEngine();
  e.running = true;
  e.url = 'https://example.com/file.bin';
  e.threads = 1;
  e._lastReviveAt = c.Date.now() - 10 * 60000;   // 冷却早已过去，判定只受 sustain 窗口约束
  return e;
}

test('速率从 30MB/s 掉到 500KB/s 且持续 8 秒 → 自动重建连接（限流自愈）', () => {
  const c = setup();
  const e = runningEngine(c);
  let throttleEvents = 0;
  e.on('throttle', () => throttleEvents++);
  let now = c.Date.now();
  // 先跑出 30MB/s 峰值（对应真机：满速跑几分钟后被 CDN 限速）
  for (let i = 0; i < 10; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
  assert.equal(e._runPeak, 30 * MB);
  assert.equal(e._throttleRevives, 0);
  // 掉到 500KB/s：字节仍在到（这正是零字节停滞看门狗探测不到的场景）
  e.speed = 0.5 * MB;
  for (let i = 0; i < 9; i++) { e._checkThrottle(now += 1000); }   // 劣化累计 9 秒
  assert.equal(e._throttleRevives, 1, '劣化持续 8 秒后应触发一次限流自愈');
  assert.equal(e._revives, 1, '应执行 revive() 重建全部连接');
  assert.equal(throttleEvents, 1, '应发出 throttle 事件供 UI 提示');
  // 恢复满速：计数与冷却归零，下轮限流仍按 30s 冷却起步
  e.speed = 30 * MB;
  e._checkThrottle(now += 1000);
  assert.equal(e._throttleRevives, 0);
  e.stop();
});

test('连续劣化被瞬时恢复打断 → 重新计时，不触发自愈', () => {
  const c = setup();
  const e = runningEngine(c);
  let now = c.Date.now();
  for (let i = 0; i < 10; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
  // 「劣化 3 秒 → 抖回峰值 3 秒」循环 10 轮：速度抖回劣化线以上就重新数，不许累计
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < 3; i++) { e.speed = 0.5 * MB; e._checkThrottle(now += 1000); }
    for (let i = 0; i < 3; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
  }
  assert.equal(e._throttleRevives, 0);
  assert.equal(e._revives, 0);
  e.stop();
});

test('本身很慢的节点（峰值低于 2MB/s）不做限流判定', () => {
  const c = setup();
  const e = runningEngine(c);
  let now = c.Date.now();
  for (let i = 0; i < 10; i++) { e.speed = 1 * MB; e._checkThrottle(now += 1000); }
  for (let i = 0; i < 12; i++) { e.speed = 0.1 * MB; e._checkThrottle(now += 1000); }
  assert.equal(e._throttleRevives, 0, '慢节点的大幅波动是常态，不该反复重建连接');
  e.stop();
});

test('设置了平均速度限速后不做限流判定（速度低是用户自己限的）', () => {
  const c = setup();
  const e = runningEngine(c);
  e.speedLimit = 1 * MB;
  let now = c.Date.now();
  for (let i = 0; i < 10; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
  for (let i = 0; i < 12; i++) { e.speed = 0.2 * MB; e._checkThrottle(now += 1000); }
  assert.equal(e._throttleRevives, 0);
  e.stop();
});

test('限流自愈连续无效时冷却逐次拉长（30/60/90/120s），不无限空转', () => {
  const c = setup();
  const e = runningEngine(c);
  let now = c.Date.now();
  for (let i = 0; i < 10; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
  e.speed = 0.5 * MB;
  for (let i = 0; i < 9; i++) { e._checkThrottle(now += 1000); }          // 第 1 次：30s 冷却已过 → 触发
  assert.equal(e._throttleRevives, 1);
  for (let i = 0; i < 40; i++) { e._checkThrottle(now += 1000); }         // 40 秒 < 60s 冷却 → 不触发
  assert.equal(e._throttleRevives, 1);
  for (let i = 0; i < 25; i++) { e._checkThrottle(now += 1000); }         // 累计再 25 秒 ≥ 60s → 第 2 次
  assert.equal(e._throttleRevives, 2);
  e.stop();
});
