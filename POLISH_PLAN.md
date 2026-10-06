# 网络速度 App · 完善方案（交接清单）

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
| 并发失败退避偏重 | `www/js/engine.js` `_consecFail` | 全局计数，N 线程同时失败会迅速把退避推到 6s，短抖动恢复偏慢。属设计取舍 |
| 用量上限停止粒度 | `www/js/engine.js` | 已改为请求级即时判断（精确）；`_tick` 内保留兜底判断，属有意冗余 |
| 分块常量与注释 | `www/js/engine.js` | `CHUNK = 1MiB`；README 已同步为 1MiB，勿再写 2MiB |
| IP 归属接口稳定性 | `www/js/geo.js` | 已剔除两个死源；剩余 5 个 https 源仍受所在网络影响，失败会自动重试 2 轮 |

---

## 5. 通用验收流程

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

# 3) 出包验收（唯一真实验证途径）
git push origin main           # 触发 android-apk workflow
# 下载 artifact: network-speed-apk → 手机侧载 → 按第 3 节各条「验收」核对
```
