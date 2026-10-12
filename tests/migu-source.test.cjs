const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const media = 'https://hlszymgspvod.miguvideo.com/asset/part.ts?encrypt=first';
function setup(plugin, fetch = async () => { throw new Error('不应下载'); }) {
  const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Date, fetch });
  context.window = context;
  if (plugin) context.Capacitor = { isNativePlatform: () => true, Plugins: { SpeedService: plugin } };
  for (const name of ['nodes', 'native', 'engine']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', name + '.js'), 'utf8'), context);
  return context;
}

test('32 个下载线程共享一次原生解析', async () => {
  let calls = 0;
  const c = setup({ resolveMigu: async () => { calls++; return { url: media }; } });
  const urls = await Promise.all(Array.from({ length: 32 }, () => c.SpeedNative.resolveMigu()));
  assert.ok(urls.every(url => url === media));
  assert.equal(calls, 1);
});

test('媒体被拒后清缓存，旧请求不清除新地址', async () => {
  let calls = 0;
  const c = setup({ resolveMigu: async () => ({ url: media + (++calls) }), rejectMigu: async () => {} });
  const old = await c.SpeedNative.resolveMigu();
  await c.SpeedNative.rejectMigu(old);
  const fresh = await c.SpeedNative.resolveMigu();
  await c.SpeedNative.rejectMigu(old);
  assert.equal(await c.SpeedNative.resolveMigu(), fresh);
  assert.notEqual(old, fresh);
  assert.equal(calls, 2);
});

test('解析期间停止或切换节点，不发起迟到的媒体请求', async () => {
  for (const action of ['stop', 'switch']) {
    let complete;
    let downloads = 0;
    const c = setup({ resolveMigu: () => new Promise(r => { complete = r; }) }, async () => { downloads++; });
    const e = new c.SpeedEngine();
    e.running = true;
    e.url = c.MIGU_VIDEO_SOURCE;
    const request = e._request(null);
    if (action === 'stop') e.stop(); else e.setUrl('https://example.com/other');
    complete({ url: media });
    await assert.rejects(request, error => error.aborted);
    e.stop();
    assert.equal(downloads, 0);
  }
});

test('只下载分片并按实际字节计量，403 会通知原生重取', async () => {
  let rejected;
  let deny = true;
  const c = setup({ resolveMigu: async () => ({ url: media }), rejectMigu: async ({ url }) => { rejected = url; } }, async url => {
    assert.equal(url, media);
    if (deny) return { ok: false, status: 403 };
    return { ok: true, status: 206, headers: { get: () => 'bytes 0-511/4096' }, arrayBuffer: async () => new ArrayBuffer(512) };
  });
  const e = new c.SpeedEngine();
  e.running = true;
  e.url = c.MIGU_VIDEO_SOURCE;
  try {
    await assert.rejects(e._request(null), error => error.status === 403);
    assert.equal(rejected, media);
    assert.equal(e.totalBytes, 0);
    deny = false;
    assert.equal((await e._request(null)).bytes, 512);
    assert.equal(e.totalBytes, 512);
  } finally { e.stop(); }
});

test('网页预览立即说明 Android 限制，不下载官网 HTML', async () => {
  const c = setup();
  const e = new c.SpeedEngine();
  const stopped = new Promise(resolve => e.on('stop', (reason, message) => resolve({ reason, message })));
  e.start(c.MIGU_VIDEO_SOURCE, 1);
  const result = await stopped;
  assert.equal(result.reason, 'nodeDead');
  assert.match(result.message, /Android/);
  assert.equal(e.totalBytes, 0);
});

test('原生插件缺失或版本过旧时，不把手机误报为浏览器', async () => {
  for (const plugins of [{}, { SpeedService: {} }]) {
    const c = setup();
    c.Capacitor = { isNativePlatform: () => true, Plugins: plugins };
    await assert.rejects(c.SpeedNative.resolveMigu(), error =>
      error.nodeUnavailable && /原生咪咕组件未加载/.test(error.message) && !/浏览器/.test(error.message));
  }
});

test('普通节点不经过咪咕解析', async () => {
  const c = setup({ resolveMigu: async () => { throw new Error('不应解析'); } }, async url => {
    assert.equal(url, 'https://example.com/file');
    return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  const e = new c.SpeedEngine();
  e.running = true;
  e.url = 'https://example.com/file';
  try { assert.equal((await e._request(null)).bytes, 8); }
  finally { e.stop(); }
});
