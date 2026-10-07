# 流量消耗器（原「网络速度」）App · 完善方案（交接清单）

> 交接给其他模型执行。仓库：`E:\AI_Agent\network_speed_app`
> 生成时间：2026-10-06　制定：浮浮酱
> **执行前请先读第 0 节约束，避免白做工。**

---

## 0. 工程约束（务必先读）

| 项 | 事实 | 影响 |
|---|---|---|
| 技术栈 | Capacitor 7 WebView 壳 + 纯 HTML/CSS/JS 单页（`www/`）+ 少量原生 Java | 改 UI 只动 `www/`；改原生动 `android/app/src/main/java/com/ouyang/speedcheck/` |
| 出包方式 | 只走 CI（`.github/workflows/android.yml`），push `main` 出 debug APK | **本机无 Android SDK，无法本地出包**，只能用 CI 验证 |
| 网络层 | `capacitor.config.json` 开了 `CapacitorHttp.enabled` | `fetch` 被原生接管；**GET 走本地代理**（保留 Range/二进制/AbortController），非 GET 走 CapacitorHttp 插件 |
| 明文策略 | targetSdk 35，Manifest 未开 `usesCleartextTraffic` | **只有 https 可用**，http 一律失败 |
| 版本号 | CI 用 `github.run_number` 自动写 `versionCode` / `versionName` | 不要手改 `versionName` 当"发布版本" |
| JS 校验 | 无测试框架 | 改完至少跑 `node --check <file>`；资源改动参考 `analysis/res_audit.js` |

---

## 1. 状态总览

| # | 事项 | 优先级 | 状态 |
|---|---|---|---|
| 1 | `colors.xml` 缺失导致构建失败 | **P0** | ✅ 已完成 |
| 2 | 前台服务通知点不了 / 图标是系统图标 | P1 | ✅ 已完成 |
| 3 | 无返回键处理、「退出使用」无效 | P1 | ✅ 已完成 |
| 4 | 分享功能半成品（qrcode 已加载未用） | P1 | ✅ 已完成 |
| 5 | 说明弹窗不显示版本号 | P2 | ✅ 已完成 |
| 6 | 用量预测缺「每分钟」 | P2 | ✅ 已完成 |
| 7 | 文案与行为不一致（"支持 http"） | P2 | ✅ 已完成 |
| 8 | `package.json` 脚本过少 | P2 | ✅ 已完成 |
| 9 | 应用图标 | P1 | ✅ 已完成（核实发现图标此前已品牌化；本次补品牌化启动图并刷新背景层） |
| 10 | 原生分享面板（可选升级） | P2 | ✅ 已完成（@capacitor/share 7.0.4 + 系统分享按钮，浏览器回退复制链接） |
| 11 | 启动图品牌化确认 | P2 | ✅ 已完成（drawable*/splash.png 已为深底 #10131A + 居中 logo） |
| 12 | 无障碍 aria-label 补全 | P3 | ✅ 已完成（8 个图标按钮） |
| 13 | 自定义地址 URL 校验加固 | P3 | ✅ 已完成（new URL 结构校验 + 仅 https + 拒绝 http） |
| 14 | Android 15 dataSync 前台服务时长上限 | P3 | ✅ 已完成（README 已标注 6h/24h 限制，代码无需改） |
| 15 | 未使用的 `html2canvas.min.js` 处置 | P3 | ✅ 已完成（方案 A：已删除文件与引用，包体 -198KB） |
| 16 | release 正式签名 / 上架准备 | P4 | ⬜ 待办 |
| 17 | 国际化 | P4 | ⬜ 待办 |

> ✅ 的条目**已完成并自测过，请勿重复实现**（避免与现有代码冲突）。若要查看改了什么，见第 2 节。

---

## 2. 已完成明细（勿重复）

| 事项 | 文件 | 要点 |
|---|---|---|
| 1 | `android/app/src/main/res/values/colors.xml` | **新增**。`styles.xml` 引用了 `@color/colorPrimary / colorPrimaryDark / colorAccent`，但工程里从未定义 → AAPT 链接失败、包打不出来。已按主题补 `#409EFF` / `#10131A` / `#409EFF` |
| 2 | `SpeedForegroundService.java` + `res/drawable/ic_stat_speed.xml` | **新增**单色通知矢量图；通知加 `setContentIntent`（`PendingIntent` 回 `MainActivity`，`SINGLE_TOP｜CLEAR_TOP`）；`setShowWhen(false)`；`buildNotification()` 合并为单条构建路径（去重复） |
| 3 | `www/js/native.js` + `www/js/ui.js` | `native.js` 新增 `exitApp()` / `onBack(cb)` / `getInfo()`，并把内部 `plugin()` 改为按名取（复用 `SpeedService` 与 `App`）；`ui.js` 新增 `closeTopLayer()`，返回键先关弹窗→全屏图表→下拉，无浮层才 `exitApp()`；公告「退出使用」改走 `exitApp()` |
| 4 | `www/index.html` + `www/js/ui.js` + `www/css/theme.css` | 顶栏新增 `#btnShare` 分享按钮；弹窗展示节点名 + 二维码（复用已加载的 `vendor/qrcode.min.js`）+ 地址 + 一键复制；复制逻辑抽成 `copyCurrentUrl()` 供两处复用；新增 `.qr-box / .share-name / .center-url` 样式 |
| 5 | `www/js/ui.js` | 「说明」弹窗改为 `async`，调 `SpeedNative.getInfo()` 显示 `当前版本：x.y（构建 n）`；浏览器预览下自动隐藏 |
| 6 | `www/js/ui.js` | 用量预测补 `每分钟` 行（对齐 PLAN 的每分钟/每小时/每天/每月） |
| 7 | `www/js/ui.js` + `README.md` | 说明与自定义地址提示均改为「仅支持 https（http 会被 Android 明文策略拦截）」；README 补对应注意事项 |
| 8 | `package.json` + `README.md` | 新增 `npm run assets`（`capacitor-assets generate`）、`npm run preview`（本地预览）；README 补版本号自增、图标生成、预览说明 |

**前几轮已修的 bug（同样勿重复）**：限速输入解析（`parseBytesInput` 支持 `/s`）、用量上限请求级即时停止、手动暂停刷新指标、移除失效节点「头条/抖音」（403）、移除死接口 geo 源（qifu 404 / ip-api 明文 http）、新增「270专项 → 咕咪快游2」并置顶、`versionName` 自动递增、`android.yml` 版本号步骤。

---

## 3. 待办详细方案

### ⬜ #9 应用图标仍是 Capacitor 默认 logo（P1，最该做）

**现状**：`assets/icon.png` 已存在且是 **1024×1024 RGBA**（尺寸合格），但从未生成到原生资源；`res/mipmap-*/ic_launcher*.png` 仍是 Capacitor 默认图标，桌面显示的是默认 logo。

**方案**：
1. 先确认 `assets/` 目录内容。当前**只有 `icon.png`，没有 `splash.png`**。
2. 执行 `npm run assets`（= `npx capacitor-assets generate`）。
   - 若命令要求启动图源文件，补一张 `assets/splash.png`（建议 2732×2732，居中放 logo），或加 `--android` 限定平台。
   - 若命令只生成图标而**覆盖了现有 `res/drawable*/splash.png`**，需回滚启动图相关改动（现有启动图已按深/浅色 + 横竖屏铺开，见 `res/drawable-port-*` / `drawable-land-*` / `*-night-*`）。
3. 生成后检查 `res/mipmap-anydpi-v26/ic_launcher.xml` 的 adaptive-icon 仍指向 `@mipmap/ic_launcher_background` / `@mipmap/ic_launcher_foreground`。

**验收**：`mipmap-*/ic_launcher.png` 不再是 Capacitor logo；CI 出包后桌面图标为自定义图；`node analysis/res_audit.js` 无悬空引用。

**风险**：`capacitor-assets` 会批量重写 `res/` 下大量二进制文件 → **属于批量修改，动手前先备份或用 git 暂存当前状态**。

---

### ⬜ #10 原生系统分享面板（P2，可选）

**现状**：分享 = 二维码 + 复制链接（见 #4）。没有调用 Android 系统分享面板。

**方案**（若要升级）：
1. `npm install @capacitor/share` → `npx cap sync android`（会写 `capacitor.settings.gradle` / `capacitor.build.gradle` / `assets/capacitor.plugins.json`）。
2. `native.js` 加 `share({title, url})`，内部走 `plugin("Share").share(...)`，浏览器预览返回 false。
3. 分享弹窗加「系统分享」按钮，失败时回退到 `copyCurrentUrl()`。

**验收**：真机点「系统分享」弹出 Android 分享面板；纯浏览器预览不报错。

**注意**：新增依赖会改 `package-lock.json`，CI 用 `npm ci` 需提交锁文件。

---

### ⬜ #11 启动图品牌化确认（P2）

**现状**：`res/drawable/splash.png` + `drawable-port-*` / `drawable-land-*` / `*-night-*` 系列已存在，`styles.xml` 的 `AppTheme.NoActionBarLaunch` 指向 `@drawable/splash`。

**方案**：确认这些启动图与自定义图标风格一致（同一张 logo / 同一底色 `#10131A`）。若 `#9` 用了 `capacitor-assets` 生成启动图，这里需统一验收。

**验收**：冷启动闪屏不出现 Capacitor 默认图；深色/浅色模式均正常。

---

### ⬜ #12 无障碍 aria-label 补全（P3）

**现状**：仅 `#btnPlay` 有 `aria-label`；`#btnCopyUrl` / `#btnShare` / `#btnCustom` / `#btnMaxUse` / `#btnPredict` / `#btnLimit` / `#btnChart` / `#btnChartClose` 只有 `title`。

**方案**：在 `www/index.html` 给这些 `button.icon-btn` 补 `aria-label`（值同 `title` 文案），成本极低。

**验收**：TalkBack 能读出每个按钮用途。

---

### ⬜ #13 自定义地址 URL 校验加固（P3）

**现状**：`ui.js` 的 `renderCustomModal()` 里只用 `/^https?:\/\//i` 粗校验，允许 http（真机上必然失败）。

**方案**：
1. 用 `new URL(url)` 做结构校验（try/catch），拒绝非法串。
2. 明确提示仅 https：非 `https:` 时给黄色警告但仍允许保存（保留浏览器预览用途），或直接拒绝。
3. 统一到已有的 `escapeHTML` 输出，防注入（当前已转义 label，URL 未转义显示在提示里）。

**验收**：输入 `abc` / `https://` / `http://x` 均有明确反馈；正常 https 可保存。

---

### ⬜ #14 Android 15 dataSync 前台服务时长上限（P3，知晓即可）

**现状**：`SpeedForegroundService` 用 `FOREGROUND_SERVICE_TYPE_DATA_SYNC`。Android 15（targetSdk 35）对后台 dataSync 有 **6 小时/24 小时** 累计限制，超时系统会停服务。

**方案**：测速场景通常是分钟级，可不改。若确需超长后台测速，考虑加 `specialUse` 类型（需在 Manifest 声明并附 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`）；侧载包无 Play 审核压力。

**验收**：无需改动即视为通过；文档标注限制即可。

---

### ⬜ #15 未使用的 `html2canvas.min.js` 处置（P3）

**现状**：`www/vendor/html2canvas.min.js`（198KB）在 `index.html` 里加载但**从未调用**——原计划的「生成海报」功能未实现。

**方案**：二选一（遵循 YAGNI）：
- **A（推荐）**：删掉该 vendor 文件与 `<script>` 引用，减小包体。
- **B**：补完海报功能（html2canvas 截图 + `QRCode` 合成 + 长按保存）→ 属新功能，需求确认后再做。

**验收**：方案 A 下浏览器控制台无 404、页面功能不受影响。

---

### ⬜ #16 release 正式签名 / 上架准备（P4）

**现状**：只出 debug 侧载包（`signingConfigs.debug` 用入库的 `debug.keystore`），release 未签名、`minifyEnabled false`。

**方案**：如需上架 → 生成正式 keystore（**密钥文件与口令不能入库**，用 GitHub Secrets 注入）、配 `signingConfigs.release`、CI 出 AAB、按需开 R8/ProGuard。

**验收**：仅在有上架需求时执行。

---

### ⬜ #17 国际化（P4）

**现状**：全中文硬编码（UI 文案、`strings.xml`）。

**方案**：如有多语言需求，Web 层抽文案表 + 原生 `values-en/strings.xml`。

---

## 4. 已知的非阻塞问题（不建议改，仅备案）

| 问题 | 位置 | 说明 |
|---|---|---|
| IP 归属接口稳定性 | `www/js/geo.js` | 已剔除两个死源；剩余 5 个 https 源仍受所在网络影响，失败会自动重试 2 轮 |
| 后台被 ROM 冻结 | 系统层 | 真机实测（红米 K70 / Android 16）：页面未重载但数字停住 = 后台 JS 被系统冻结，前端无法自救。**已落地彻底方案**：原生后台泵 + 息屏广播接管（见第 6 节）；仅当厂商连整个进程一起冻结时，才需要用户手动把省电策略设为「无限制」 |

> 旧的「并发失败退避偏重 / 用量上限停止粒度 / 分块常量与注释」三条已随引擎 v2 重写失效，见第 6 节。

---

## 5. 通用验收流程

> `analysis/` 默认不入库（`.gitignore` 第 7 行），但下列四个文件是文档点名的验收工具，已用 `git add -f` 显式入库：
> `engine_harness.js`（回归测试台）、`engine_v1_baseline.js` / `engine_v2a_nosuspend.js`（对比基线）、`res_audit.js`（资源自检）。
> 其余 `analysis/` 内容（节点抓包、本地预览脚本等）仍是本地临时区，改动无需提交。

```powershell
# 1) JS 语法
node --check www/js/engine.js
node --check www/js/ui.js
node --check www/js/native.js
node --check www/js/geo.js
node --check www/js/nodes.js
node --check www/js/store.js

# 2) Android 资源悬空引用（构建阻塞自检）
node analysis/res_audit.js     # 期望输出「悬空引用：无 ✓」

# 3) 引擎行为回归（虚拟时钟测试台，无网络依赖，十几秒跑完 17 个真实节点场景）
node analysis/engine_harness.js www/js/engine.js
# 期望：全部场景「浪费 0%、可见提示 0、不被误终止」，S10 只在本次用量到 64MiB 时停
# 对比用基线：analysis/engine_v1_baseline.js（重写前）、analysis/engine_v2a_nosuspend.js（后台挂起保护前）

# 4) 原生代码编译校验（本机无 Android SDK，用最小桩类做编译级体检，避免 CI 出包失败）
node analysis/java_check.js    # 期望「Java 编译校验通过 ✓」

# 5) 真实节点探测（需要联网；确认各节点对 整包/Range/越界 的真实反应）
node analysis/node_probe.js    # 2026-10-06 实测：15 个节点全部可达，越界均为标准 416，无硬拒

# 6) 出包验收（唯一真实验证途径）
git push origin main           # 触发 android-apk workflow
# 下载 artifact: traffic-consumer-apk → 手机侧载 → 按第 3 节各条「验收」核对
```

---

## 6. 引擎 v2 修复记录（2026-10-06，勿回退）

真机症状：①一直提示「<节点>连接不稳定 / 个别请求失败」但流量其实在跑；②总使用量/实时速度被终止；③切到后台停止消耗。

定位方式：`analysis/engine_harness.js`（虚拟时钟 + 模拟 CDN，可复现「小文件 / 无 Content-Range / 越界 403 / 慢链路 / 中途挂起 / 忽略 Range」）。基线 v1 实测：无 Content-Range 时 **49.9% 请求被 416 白跑**；越界 403 时 **2.3MiB 就被 `nodeRejected` 误终止**；慢链路必然误报「节点响应缓慢」。

| 症状 | 根因 | v2 修复 |
|---|---|---|
| 误报刷屏 | 固定 30s 整包超时 + 全局失败计数（8 线程共享）在慢链路/偶发挂起下必然触发 | 流式逐块计量；超时只看「有无新字节」（20s 无字节才中止该请求）；失败按 worker 独立退避 |
| 被自动终止 | Range 越界 → CDN 403/416 → 计入拒绝计数 → 连续 3 次即停止 | 默认整包下载（对齐网页版口径）；探测确认「真支持 Range 且文件 > 1MiB」后才分块，偏移严格取模**永不越界**；越界类 4xx 一律回卷重试不计失败；只有整包请求被真拒绝且期间零字节才停 |
| 慢链路误报停滞 | 8s 停滞阈值 vs 26s 的分块传输时间 | 停滞/死亡一律按「零字节」口径：12s 提示 → 25s 自愈重建 worker → 45s 才判定节点已死 |
| 总使用量被重置 | 累计值只在内存里 | 累计值持久化（`totalUse` 键），点击指标卡即可清零；**用量上限改为只对本次测试生效**（否则恢复的累计值会让新测试一开就停） |
| 后台停止计数 | 后台 WebView/定时器被系统降频冻结 | 有字节到达就按秒节流补 tick（不依赖 `setInterval`）；回前台立刻 `engine.revive()` 重建 worker、重申前台服务；服务启动失败会提示；后台零消耗时提示去改系统省电设置 |
| 切后台回来被测「节点已死」 | 冻结期间系统不跑定时器，解冻后那批**过期定时器**立刻执行，把「被冻结的时长」当成「节点无响应的时长」（S13 确定性复现：v2a 在 112MiB 处被 `nodeDead` 误终止，回前台 10s 消耗 0.0MiB） | `engine.suspend()` / `resume()`：切后台期间**停止一切「停滞/死亡」判定**，回前台重置进度基准并重建连接；挂起期间也不上报错误（解冻瞬间的批量超时属噪音） |
| 提示刷屏「连接不稳定 / 个别请求失败」 | 引擎把瞬时失败（5xx/限流/抖动）当用户可见事件上报 | **删掉这两类弹窗**（用户明确反馈不需要）：瞬时失败静默退避重试，失败次数只进「说明」页的诊断行；近期有字节到达时改用快速重试（250~700ms）而非指数退避——S16 吞吐因此 +44% |
| 息屏/后台彻底停止消耗 | WebView 的 JS 与定时器被系统冻结（真机：红米 K70 / Android 16，息屏即停），**前端无法自救** | 新增**原生后台泵**：切后台/息屏时 JS 交棒给前台服务的原生线程（`pumpStart/pumpStop/pumpStats`）；原生侧只做「持续下载 + 计数 + 重试 + 限速 + 用量预算」，绝不判断「节点是否可用」，因此不会误停；回前台取回字节数并重启引擎；通知栏实时显示累计用量；退出应用/划掉最近任务自动停泵（`onTaskRemoved`） |

验收基线（v2，`engine_harness.js` 全场景）：浪费 0%、报错 0 次、误报提示 0 次、无误终止；理想场景吞吐与 v1 持平（259.4 vs 258.9 Mbps），病态场景大幅提升（咪咕式小切片 4.0 → 464.0 MiB / 60s）。

### 验证证据（第 5 轮补记，勿删）

- **桩类忠实性已与真实源码比对**：`analysis/android_stubs` 里 Capacitor 部分逐条核对 `node_modules/@capacitor/android` 的真实 Java 源码——`JSObject.put` 的 6 个重载、`PluginCall.getString/resolve/reject`、`Plugin.getActivity()` 返回 `AppCompatActivity`、`BridgeActivity.registerPlugin(Class<? extends Plugin>)` 全部一致 ⇒ 本机 javac 通过即对 CI 有高置信度（Android 框架侧用的是 API 1~29 的长期稳定签名，且 `startForeground/Notification.Builder/WakeLock` 等已由既有出厂代码证明可用）。
- **`java_check.js` 真的拦下过一次错误**：加入息屏广播接管代码后，它报出 `Intent.ACTION_SCREEN_OFF` / `IntentFilter` / `Context.registerReceiver` 缺桩（9 个 error）→ 按真实签名补桩后才通过。说明这道闸门不是摆设。
- **真实节点探测**（`node_probe.js`）：15 个节点全部可达；越界请求一律标准 `416`（无硬拒）⇒ 旧版「越界被 403 → 误判节点拒绝 → 2.3MiB 就停」的触发条件是 CDN 差异，不是所有节点都会中。
- **并发探测**（`concurrency_probe.js`）：对用户的「咕咪快游2」压 8/16/32 并发各 3 轮 —— **全部 200、零失败、零限流** ⇒ 节点侧不拒绝 32 线程；主人遇到的「连接不稳定/个别请求失败」来自**手机侧**（移动网络 NAT/连接数限制导致部分请求超时或中断），所以正确对策是「静默退避重试、绝不因此停止」，而不是降低线程数或弹窗告警。
- **引擎回归**：21 场景（含 8/32 线程、真实节点形状、15% 5xx、20% 429、后台节流/冻结/过期定时器竞态）全部「浪费 0%、可见提示 0」；唯一「被终止」的是 S10 用量上限（设计行为）。
- **无人看管的原生泵**已加两道保险：退出应用/划掉最近任务（`onTaskRemoved`）停泵停服务；页面被系统回收后重载时，初始化阶段显式 `disarmPump()` + `bgDisable()`。
