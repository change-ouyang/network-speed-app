const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Date,
    fetch: async () => new Promise(() => {}),
  });
  context.window = context;
  for (const name of ['nodes', 'engine']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', name + '.js'), 'utf8'), context);
  }
  return context;
}

const URL_A = 'https://example.com/a.mp4';
const URL_B = 'https://example.com/b.mp4';

test('切换节点重置计量：总使用量/本次用量/均值/峰值/历史全部归零', () => {
  const c = setup();
  const e = new c.SpeedEngine();
  e.setUrl(URL_A);
  e.totalBytes = 948 * 1024 * 1024;
  e.sessionBytes = 100 * 1024 * 1024;
  e.sessionStart = c.Date.now() - 60000;
  e.avgSpeed = 26.2 * 1024 * 1024;
  e.peakSpeed = 452 / 8 * 1024 * 1024;
  e.history = [{ t: 1, s: 1 }];

  const switched = e.setUrl(URL_B);
  assert.equal(switched, true);
  assert.equal(e.totalBytes, 0, '总使用量应清零');
  assert.equal(e.sessionBytes, 0, '本次测试用量应清零（用量上限按新节点重新起算）');
  assert.equal(e.sessionStart, 0, '未运行时均速基准应保持未开始');
  assert.equal(e.avgSpeed, 0);
  assert.equal(e.peakSpeed, 0, '网络带宽（峰值）应清零');
  assert.equal(e.history.length, 0);
  assert.equal(e.size, 0);
  assert.equal(e.mode, 'whole');
});

test('重复选择同一节点不重置计量', () => {
  const c = setup();
  const e = new c.SpeedEngine();
  e.setUrl(URL_A);
  e.totalBytes = 5 * 1024 * 1024;
  e.sessionBytes = 5 * 1024 * 1024;
  assert.equal(e.setUrl(URL_A), false, '同节点返回 false');
  assert.equal(e.totalBytes, 5 * 1024 * 1024, '计量应保留');
  assert.equal(e.sessionBytes, 5 * 1024 * 1024);
});

test('运行中热切换：字节从零重新入账，速率窗口按新基准计算', async () => {
  const c = setup();
  const e = new c.SpeedEngine();
  e.setUrl(URL_A);
  e.running = true;
  e.sessionStart = c.Date.now() - 30000;
  e.totalBytes = 1024;
  e.sessionBytes = 1024;
  e._lastProgressBytes = 1024;

  assert.equal(e.setUrl(URL_B), true);
  assert.equal(e.totalBytes, 0);
  assert.ok(e.sessionStart <= c.Date.now(), '运行中均速基准重置为当前时刻');
  assert.equal(e._window.length, 1);
  assert.equal(e._window[0].b, 0, '速率窗口应基于清零后的字节数');
  assert.equal(e._lastProgressBytes, 0);
  // 模拟新节点的字节继续入账
  e._addBytes(2048);
  assert.equal(e.totalBytes, 2048);
});
