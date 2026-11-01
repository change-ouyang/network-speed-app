const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const MB = 1024 * 1024;
// fetch 桩：挂起不返回（下载进度完全由测试驱动），但必须响应 abort——
// 否则 stop()/重建后残留的 idle/hard 定时器会把测试进程吊住
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

test('速率从 30MB/s 掉到 500KB/s 且持续 8 秒 → 触发静默重建（零请求 + 5 秒后重连）', async () => {
  const c = setup();
  const e = runningEngine(c);
  let throttleQuiet = 0;
  e.on('throttle', (q) => { throttleQuiet = q; });
  let now = c.Date.now();
  // 先跑出 30MB/s 峰值（对应真机：满速跑几分钟后被 CDN 限速）
  for (let i = 0; i < 10; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
  assert.equal(e._runPeak, 30 * MB);
  assert.equal(e._throttleRevives, 0);
  // 掉到 500KB/s：字节仍在到（这正是零字节停滞看门狗探测不到的场景）
  e.speed = 0.5 * MB;
  for (let i = 0; i < 9; i++) { e._checkThrottle(now += 1000); }   // 劣化累计 9 秒
  assert.equal(e._throttleRevives, 1, '劣化持续 8 秒后应触发一次限流自愈');
  assert.equal(e._revives, 1);
  assert.equal(throttleQuiet, 5000, '事件应携带首次静默时长 5 秒');
  assert.equal(e._workers.length, 0, 'JS worker 应已全部停车');
  assert.ok(c.Date.now() < e._quietUntil && e._quietUntil - c.Date.now() <= 5000, '应处于静默期且时长约 5 秒');
  // 恢复满速：计数归零，下轮限流重新按首次静默起算
  e.speed = 30 * MB;
  e._checkThrottle(now += 1000);
  assert.equal(e._throttleRevives, 0);
  e.stop();
});

test('静默期满自动重建连接；连续无效时静默时长翻倍（5s→10s→…→60s 封顶）', async () => {
  const c = setup();
  const e = runningEngine(c);
  e._quietMs = () => 80;   // 缩短静默以便测试等待（断言翻倍前恢复原方法）
  try {
    let now = c.Date.now();
    for (let i = 0; i < 10; i++) { e.speed = 30 * MB; e._checkThrottle(now += 1000); }
    e.speed = 0.5 * MB;
    for (let i = 0; i < 9; i++) { e._checkThrottle(now += 1000); }
    assert.equal(e._throttleRevives, 1);
    assert.ok(e._quietUntil > c.Date.now());
    await new Promise(r => setTimeout(r, 250));
    assert.equal(e._workers.length, 1, '静默期满应重建 worker');
    assert.equal(e._quietTimer, null);
    delete e._quietMs;   // 恢复原型方法：连续无效翻倍 5s→10s→20s→40s→60s 封顶
    assert.equal(e._quietMs(), 5000, '第 1 次自愈静默 5 秒');
    e._throttleRevives = 2;
    assert.equal(e._quietMs(), 10000, '第 2 次翻倍');
    e._throttleRevives = 4;
    assert.equal(e._quietMs(), 40000, '第 4 次');
    e._throttleRevives = 5;
    assert.equal(e._quietMs(), 60000, '第 5 次起封顶 60 秒');
  } finally {
    e.stop();   // 无论断言成败都要停车，pending fetch 的超时定时器不能吊住进程
  }
});

test('静默期内停滞看门狗挂起：不误报「响应缓慢」也不误判节点已死', () => {
  const c = setup();
  const e = runningEngine(c);
  let stalled = false, stopped = null;
  e.on('stall', () => { stalled = true; });
  e.on('stop', (r) => { stopped = r; });
  e._quietRebuild();
  // 把进度基准拨回 60 秒前：若判定未挂起，这已远超 DEAD_MS
  e._lastProgressAt = c.Date.now() - 60000;
  e._lastProgressBytes = e.totalBytes;
  e._tick();
  assert.equal(stalled, false, '静默期零字节是预期行为，不应报停滞');
  assert.equal(stopped, null, '静默期不应判死节点');
  assert.equal(e.running, true);
  e.stop();
});

test('stop() 取消静默定时器：静默期内手动停止不会再拉起 worker', async () => {
  const c = setup();
  const e = runningEngine(c);
  e._quietMs = () => 100;
  e._quietRebuild();
  e.stop();
  assert.equal(e._quietTimer, null);
  assert.equal(e._quietUntil, 0);
  await new Promise(r => setTimeout(r, 250));
  assert.equal(e._workers.length, 0, '停止后不得再 spawn');
});

test('限流切原生通道：park 停车清算、unpark 恢复下载、预算到点自动停止', () => {
  const c = setup();
  const e = runningEngine(c);
  e.park();
  assert.equal(e._parked, true);
  assert.equal(e._workers.length, 0);
  e.absorb(1024);
  e.absorb(1024);
  assert.equal(e.totalBytes, 2048, '清算字节应入账');
  assert.equal(e.sessionBytes, 2048);
  assert.equal(e._window[e._window.length - 1].b, 2048, '清算应作为速率窗口样本');
  e.unpark();
  assert.equal(e._parked, false);
  assert.equal(e._workers.length, 1, 'unpark 应恢复 JS 下载');
  // 预算到点：absorb 走统一 _finish 出口
  e.maxUse = 3000;
  e.absorb(1000);
  assert.equal(e.running, false, '达到用量上限应自动停止');
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
