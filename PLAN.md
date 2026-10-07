# 网络速度自查 · Android App 复刻方案

> 2026-10-05 立项。目标：1:1 复刻 https://270666.xyz 「网络速度自查」工具的全部功能，打包为独立安卓 APK。
> 打包逻辑沿用 `E:\AI_Agent\stock_market_watch\build` 的 Capacitor 方案。
>
> **2026-10-06 更名**：应用显示名由「网络速度」改为「**流量消耗器**」。包名 `com.ouyang.speedcheck` 保持不变（改包名会被系统视为全新应用，无法覆盖升级已装的旧包）；本地文件夹名与远端仓库名同样不动。

## 1. 原站逆向结论（复刻依据）

原站为 Vue 3.5 + Element Plus 2.3 单页应用（Vite 构建，PWA），测速框架源自开源项目
**NetworkPanel by Whoami**（即 [ljxi/NetworkPanel](https://github.com/ljxi/NetworkPanel)，MIT 协议，971★）。
站点首页按环境指纹分发（浏览器见测速应用，curl 可见推广页），App 复刻对象为**测速工具本体**。

### 1.1 测速引擎机制（实测确认）

- 多线程循环下载：N 线程（1–32，滑块，默认 8）并发 GET 同一测试文件，完成后立即发起下一轮
- 测试文件为各节点真实公开资源（例：微软商店节点 = `https://cdn.microsoftstore.com.cn/media/.../4h0yzz2_360.jpg`，约 0.8MB/个）
- 字节计数：按「完成请求数 × 文件大小」累计（原站网页版受 CORS 限制，需节点允许跨域；实测 30 秒跑了 232 次请求、累计 273.8MB）
- 三指标卡：
  - **总使用量**（累计字节，可设上限，达到上限自动停止；「留空则无上限」）
  - **实时速度**（短窗口字节差/时间差，MB/s；测试中显示，另有平均速度口径）
  - **网络带宽**（峰值速率，Mbps 显示 + 进度条；可设峰值限制，提示「只能限制平均速度，无法限制峰值速度」）
- 用量预测：每分钟 / 每小时 / 每天 / 每月预计消耗
- 大圆形播放/暂停按钮；右下角全屏图表（速度曲线）
- 运行中热切换：改节点 / 线程数立即生效，无需重启

### 1.2 节点系统

内置 26 个节点、3 个分组（下拉分组选择器）：

| 分组 | 节点 |
|---|---|
| 热门应用 (11) | 微软商店、朝夕光年游戏、腾讯游戏、快手、Bilibili、爱奇艺、腾讯视频、头条/抖音、OPPO、VIVO、UC/夸克 |
| 运营商 (5) | 咪咕快游、咪咕视频、移动云盘、联通门户、天翼云桌面 |
| 全球海外 (6) | Cachefly、Cloudflare Speed、Vultr_SGP、Steam Akamai、Steam Cloudflare、Microsoft Akamai |

- 自定义节点：名称 + URL 两字段，附提示（网页版受 https 混编 / CORS 限制——App 端原生网络栈无此限制）
- 节点清单手动整理自互联网公开资源，会失效需可维护
- URL 复制按钮（分享当前测试链接）

### 1.3 开关与持久化

- 「保持后台运行」「自动运行」两个开关（自动运行 = 进页面自动开测，实测存 localStorage `autoStart`）
- 持久化项：线程数、两开关、用量上限、历史峰值、自定义节点、AccessToken（原站捐赠者榜单用，不复刻）

### 1.4 IP 信息

- 原站走 EdgeOne 边缘接口 `/geo`：返回 clientIp + ASN/ISP/城市/国家/经纬度 + 活动配置(base64)
- App 替代：通用 IP 归属直连接口（ipapi.co / ip-api.com，或国内淘宝/搜狐接口），CapacitorHttp 下无跨域问题
- 展示形态：IP 卡片（大号 IP + 「城市, ISP」小字）

### 1.5 周边功能

- 首次进入公告弹窗（用前须知 + 「退出使用 / 我已知悉」）
- 说明弹窗（使用说明、贡献/致谢、内容更新时间）
- 分享 / 生成海报（html2canvas 截图 + qrcode 二维码，长按保存）
- 深色模式自适应（prefers-color-scheme，暗色主题实测截图已存档）
- 防双击缩放（touchend 300ms 拦截）、字体（Noto Sans SC + Barlow Condensed 数字）
- PWA/添加到桌面 —— App 端由原生壳天然覆盖，不复刻
- 原站推广内容（移动签到/抽奖/活动链接、51la 统计）**不复刻**

## 2. 技术路线（沿用 stock_market_watch 打包逻辑）

| 项 | 方案 |
|---|---|
| 壳 | Capacitor 7 WebView（同 `stock_market_watch/build`：`@capacitor/android ^7`、`@capacitor/cli`、`@capacitor/assets`） |
| Web 层 | 纯 HTML/CSS/JS 单页（无框架依赖），暗色主题 1:1 复刻原站布局 |
| 网络 | `CapacitorHttp: enabled`（fetch 走原生 OkHttp）→ **无 CORS 限制**，任意节点可测、支持 http |
| 打包 | `npx cap sync android` + `./gradlew assembleDebug`；本地无 Android SDK 也可，由 GitHub Actions 云端出包（沿用 `android.yml`，改产物名） |
| 标识 | 包名 `com.ouyang.speedcheck`、应用名「网络速度」（已确认） → 2026-10-06 更名「**流量消耗器**」（包名不变） |
| 兼容 | minSdk 23（Android 6+），同参考项目 |

### 关键技术点

1. **测速引擎**：参考 MIT 协议的 NetworkPanel 引擎实现移植为独立 `engine.js`；App 端 CapacitorHttp 无 CORS，节点兼容性反而优于原站
2. **实时速度粒度**：速率按「请求完成」粒度刷新（8 线程下约 0.2–2s 一跳，与原站计数模式一致）。**2026-10-06 核实**：`CapacitorHttp.enabled` 下 `window.fetch` 被 native-bridge 劫持，**GET/HEAD 走 WebView 本地代理**（`/_capacitor_http_interceptor_` → `WebViewLocalServer` → OkHttp），响应以 InputStream 管道回传，Range/二进制/流式均保留、且 `Content-Range` 可读（同源，不落 CORS 隐藏）⇒ 原文担心的「无流式」不成立，**M4 的自定义流式 Java 插件不必做**；只有非 GET 请求才走 base64 插件通道
3. **后台运行**：「保持后台运行」映射 Android 前台服务（Foreground Service + WakeLock），防系统杀进程/休眠断流
4. **内存**：8 线程 × 1MiB 分块循环（常量见 `engine.js` 的 `CHUNK`），GET 不经 base64 回传（见上条核实结论），内存与吞吐可控；仍建议真机对比原站同网络数值确认吞吐计量精度
5. **存储**：localStorage 键位沿用原站命名（threadNum/autoStart/maxUse/maxSpeed/customNodes）；「保持后台运行」实际落 `keepBg`（原站为 `autoBg`）——App 是独立侧载包、不存在从网页版迁移 localStorage 的场景，故不改键位以免已装机用户的设置失效

## 3. 项目结构

```
E:\AI_Agent\network_speed_app\
├── www\                      # Web 应用（Capacitor webDir）
│   ├── index.html            # 单页：设置卡 + 指标卡 + 播放钮 + IP 卡 + 弹窗
│   ├── css\theme.css         # 暗色主题（亮/暗自适应）
│   └── js\
│       ├── engine.js         # 测速引擎：多线程调度、字节计数、速率/峰值/预测/上限
│       ├── nodes.js          # 26 内置节点（名称+URL+文件大小）+ 自定义节点管理
│       ├── geo.js            # IP 归属查询（可配置接口）
│       ├── store.js          # localStorage 适配层
│       └── ui.js             # 交互绑定、弹窗、海报分享（html2canvas + qrcode）
├── capacitor.config.json     # appId/appName/webDir/CapacitorHttp
├── package.json              # 同 stock_market_watch/build 依赖
├── android\                  # npx cap add android 生成后入库
└── .github\workflows\android.yml   # CI 出 APK（改自参考项目，产物名 traffic-consumer-apk）
```

## 4. 里程碑

1. **M1 引擎验证（风险集中点）**：engine.js + CapacitorHttp 在 WebView 里跑通 8 线程循环下载，真机对比原站同环境数值，确认吞吐计量准确、内存平稳 → CI 出首个 debug APK
2. **M2 UI 完整复刻**：测试地址分组下拉 + 滑块 + 双开关 + 三指标卡（含上限/峰值设置弹窗）+ 播放/暂停 + 全屏图表 + IP 卡 + 公告/说明弹窗 + 暗色主题
3. **M3 功能收口**：自定义节点、用量预测、分享海报、自动运行、节点热切换、URL 复制
4. **M4 打磨**：前台服务后台测速、启动图标（@capacitor/assets）、峰值限速细节、（可选）流式原生插件提升速率刷新粒度

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 内置节点公开 URL 失效/变更 | nodes.js 独立可维护；自定义节点兜底；实现时从 NetworkPanel 仓库同步节点数据并逐个验证 |
| CapacitorHttp base64 回传开销影响高速计量 | **2026-10-06 核实不成立**：GET 走 WebView 本地代理、响应以 InputStream 管道回传，不经 base64；引擎已改为流式逐块计量 |
| WebView 后台被杀/断流 | 前台服务 + WakeLock + 启动失败提示 + 回前台重申服务并重建 worker；若厂商 ROM 仍冻结后台 JS，引擎会给出可操作提示（真机判据：页面未重载但数字停住） |
| 云打包依赖 GitHub Actions | 参考项目已验证同套流水线可行；本地亦可临时装 SDK 兜底 |

## 6. 已拍板（2026-10-05）

1. 应用名「**网络速度**」，包名 `com.ouyang.speedcheck`（沿用参考项目反向域前缀，可随时改）；**2026-10-06 更名「流量消耗器」**，包名保持不变
2. 内置节点去掉「全球海外」组，保留 **热门应用 11 + 运营商 5 = 16 个**，URL 从原站逐个实测抓取
3. 只出 **debug 侧载包**（CI artifact 下载安装），不配正式签名
