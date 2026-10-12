const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const media = 'https://hlszymgspvod.miguvideo.com/asset/part.ts';

function registeredAtStartup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speedcheck-startup-'));
  try {
    // 按 Capacitor 7 的生命周期契约建桩：super.onCreate 创建桥时取插件快照；
    // registerPlugin 只添加到 Builder。这里编译并运行项目真实的 MainActivity。
    const sources = {
      'android/os/Bundle.java': 'package android.os; public class Bundle {}',
      'com/getcapacitor/BridgeActivity.java': `package com.getcapacitor;
        import java.util.*;
        public class BridgeActivity {
          private final Set<Class<?>> pending = new HashSet<>();
          private Set<Class<?>> created;
          protected void onCreate(android.os.Bundle state) { created = new HashSet<>(pending); }
          public void registerPlugin(Class<?> plugin) { pending.add(plugin); }
          public boolean hasPlugin(Class<?> plugin) { return created.contains(plugin); }
        }`,
      'com/ouyang/speedcheck/SpeedServicePlugin.java':
        'package com.ouyang.speedcheck; public class SpeedServicePlugin {}',
      'StartupProbe.java': `import com.ouyang.speedcheck.*;
        public class StartupProbe {
          public static void main(String[] args) {
            MainActivity activity = new MainActivity();
            activity.onCreate(new android.os.Bundle());
            System.out.println(activity.hasPlugin(SpeedServicePlugin.class));
          }
        }`,
    };
    const files = [];
    for (const [name, content] of Object.entries(sources)) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      files.push(file);
    }
    const executable = name => process.env.JAVA_HOME
      ? path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : ''))
      : name;
    const compiled = spawnSync(executable('javac'), ['-encoding', 'UTF-8', '-d', dir, ...files,
      path.join(root, 'android/app/src/main/java/com/ouyang/speedcheck/MainActivity.java')], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.error?.message || compiled.stderr);
    const probe = spawnSync(executable('java'), ['-cp', dir, 'StartupProbe'], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.error?.message || probe.stderr);
    return probe.stdout.trim() === 'true';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('Android 启动后咪咕插件可用，开始下载不会误报浏览器环境', async () => {
  const registered = registeredAtStartup();
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Date,
    Capacitor: { isNativePlatform: () => true, Plugins: registered ? {
      SpeedService: { resolveMigu: async () => ({ url: media }) },
    } : {} },
    fetch: async url => {
      assert.equal(url, media);
      return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(512) };
    },
  });
  context.window = context;
  for (const name of ['nodes', 'native', 'engine']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'www/js', name + '.js'), 'utf8'), context);
  }
  const engine = new context.SpeedEngine();
  engine.maxUse = 512;
  const stopped = new Promise(resolve => engine.on('stop', (reason, detail) => resolve({ reason, detail })));
  try {
    engine.start(context.MIGU_VIDEO_SOURCE, 1);
    const result = await stopped;
    assert.equal(result.reason, 'reachMaxUse', '手机端异常停止：' + result.detail);
    assert.equal(engine.sessionBytes, 512);
  } finally { engine.stop(); }
});
