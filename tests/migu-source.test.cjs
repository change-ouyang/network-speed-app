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

test('解析结果携带分片落点诊断，供对照运营商定向流量白名单', async () => {
  const c = setup({ resolveMigu: async () => ({
    url: media,
    host: 'hlszymgspvod.miguvideo.com',
    v4: ['39.134.91.91', '39.134.91.89'],
    v6: ['2409:8087:1e01:14::104']
  }) });
  await c.SpeedNative.resolveMigu();
  const diag = c.SpeedNative.miguDiag;
  assert.equal(diag.host, 'hlszymgspvod.miguvideo.com');
  assert.deepEqual(diag.v4, ['39.134.91.91', '39.134.91.89']);
  assert.deepEqual(diag.v6, ['2409:8087:1e01:14::104']);
});

test('官方 GSLB 调度给出 http:8080 分片时照常放行下载', async () => {
  // 官方播放器走 GSLB 302 派发，分片常见 http://host:8080/....ts（App 对 miguvideo.com 单域放行明文）
  const gslbMedia = 'http://hlszymgspvod.miguvideo.com:8080/asset/part_0-0.ts?msisdn=x';
  let downloaded = null;
  const c = setup({ resolveMigu: async () => ({ url: gslbMedia }) }, async url => {
    downloaded = url;
    return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(256) };
  });
  assert.equal(await c.SpeedNative.resolveMigu(), gslbMedia);
  const e = new c.SpeedEngine();
  e.running = true;
  e.url = c.MIGU_VIDEO_SOURCE;
  try {
    assert.equal((await e._request(null)).bytes, 256);
    assert.equal(downloaded, gslbMedia);
  } finally { e.stop(); }
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

// ---------- 咪咕音乐动态节点 ----------
const music = 'https://freetyst.nf.migu.cn/public/product9th/product45/60054704037163944.mp3?Tim=1&Key=2';

test('音乐节点走动态解析后下载，直链为 *.migu.cn 音频', async () => {
  let downloaded = null;
  const c = setup({ resolveMigu: async ({ source }) => {
    assert.equal(source, c.MIGU_MUSIC_SOURCE);
    return { url: music };
  } }, async url => {
    downloaded = url;
    return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(128) };
  });
  const e = new c.SpeedEngine();
  e.running = true;
  e.url = c.MIGU_MUSIC_SOURCE;
  try {
    assert.equal((await e._request(null)).bytes, 128);
    assert.equal(downloaded, music);
  } finally { e.stop(); }
});

test('音乐直链校验：非 migu.cn 域或非音频后缀被拒绝', async () => {
  for (const url of ['https://evil.example/song.mp3', 'https://freetyst.nf.migu.cn/x/seg.ts', 'http://freetyst.nf.migu.cn/x/song.mp3']) {
    const c = setup({ resolveMigu: async () => ({ url }) });
    await assert.rejects(c.SpeedNative.resolveMigu(c.MIGU_MUSIC_SOURCE), /有效的媒体地址/);
  }
});

test('视频/音乐节点缓存隔离，切换节点重新桥调解析', async () => {
  const resolved = [];
  const c = setup({ resolveMigu: async ({ source }) => {
    resolved.push(source);
    return source === c.MIGU_MUSIC_SOURCE
      ? { url: music, host: 'freetyst.nf.migu.cn' }
      : { url: media };
  } });
  assert.equal(await c.SpeedNative.resolveMigu(c.MIGU_MUSIC_SOURCE), music);
  // 同一节点 30 秒内走短缓存，不再桥调
  assert.equal(await c.SpeedNative.resolveMigu(c.MIGU_MUSIC_SOURCE), music);
  // 切到视频节点：不是同一节点的缓存，必须重新桥调（JS 侧单槽缓存被顶掉；原生侧另有进程级缓存）
  assert.equal(await c.SpeedNative.resolveMigu(c.MIGU_VIDEO_SOURCE), media);
  assert.deepEqual(resolved, [c.MIGU_MUSIC_SOURCE, c.MIGU_VIDEO_SOURCE]);
  assert.equal(c.SpeedNative.miguDiag.host, 'freetyst.nf.migu.cn');
});
