# 流量消耗器 · Android App

复刻 https://270666.xyz 「网络速度自查」的安卓端（仅 Android，debug 侧载包），2026-10-06 起应用显示名更改为「**流量消耗器**」（包名 `com.ouyang.speedcheck`、文件夹名、仓库名均不变）。Capacitor 7 WebView 壳 + 原生 HTML/CSS/JS 单页，打包流水线沿用 `stock_market_watch/build` 方案。

## 功能（与原站对齐）

- 多线程测速：1–32 线程滑块（默认 8），循环下载测试文件，支持运行中热切换节点/线程
- 内置 15 个节点（270专项 1 + 热门应用 9 + 运营商 5，整理自原站公开清单）+ 自定义地址（名称 + URL）
- 三指标卡：总使用量（**累计值，跨启动保留，点数字清零**；可设上限自动停止，上限只对**本次测试**生效）、实时/平均速度、网络带宽峰值（Mbps + 进度条）
- 传输策略自动适配（`engine.js`）：默认**整包循环下载**（与网页版口径一致）；仅在一次探测确认「服务端真支持 Range 且文件 > 1MiB」后才改 Range 分块，偏移严格取模，**永不发越界请求** —— 越界请求是 416/403 误报与白跑流量的根源
- 流式计量：边下边计数，慢链路也能实时出速率；请求被中止时已下载字节照样计入用量
- 抗误判：超时只看「有没有新字节」（连续 20s 零字节才中止该请求）；失败按线程各自退避；越界类 4xx 一律回卷重试；只有「整包请求被真正拒绝且期间零字节」或「45s 完全无数据」才自动停止；长时间零字节会先**自愈重建连接**
- 平均速度限速（只能限平均、限不了峰值，同原站）；按当前速率的用量预测
- 保持后台运行（前台服务 + WakeLock + **原生后台泵**）/ 自动运行开关，状态与原站键位一致存 localStorage。切后台/息屏后 WebView 的 JS 会被系统冻结（真机实测：红米 K70 / Android 16 息屏即停，页面未重载但数字停住），此时下载会**交棒给前台服务里的原生线程**继续消耗流量、通知栏实时显示累计用量；回到前台自动取回原生侧字节并重启引擎。服务启动失败会明确提示（不再静默失败），退出应用/划掉最近任务会自动停泵；注意 Android 15 对 dataSync 型前台服务有 6 小时/24 小时累计时长限制
- 全屏实时速率曲线、首次公告、说明（含当前版本号）、复制/分享测试链接（二维码）、深色模式自适应、防双击缩放、返回键逐层关闭浮层

## 与网页版的差异

| 项 | 网页版 | 本 App |
|---|---|---|
| 网络 | 浏览器 fetch，受 CORS/混合内容限制 | CapacitorHttp 走原生 OkHttp，无跨域限制 |
| 大文件 | 整文件循环下载 | Range 1MiB 分块（206 响应），内存可控 |
| IP 归属 | EdgeOne 边缘 /geo | ip.sb → ipwho.is → freeipapi → ipapi.co → 1.1.1.1 依次回退，缓存 10 分钟 |
| 海外节点 | 含 6 个全球海外节点 | 按需求停用（数据留档 `www/js/nodes.js` / `analysis/`）；朝夕光年游戏节点按需移除 |

> 注意：Android 9+ 默认禁明文传输，自定义节点仅支持 `https`（`http` 会被系统策略拦截）。

## 构建

本地：`npm install && npx cap sync android`，然后 `cd android && ./gradlew assembleDebug`（需 Android SDK）。本地预览网页层：`npm run preview`。
云端：push 到 GitHub main 分支，Actions 自动出 `app-debug.apk`（artifact: traffic-consumer-apk），手机侧载安装。
版本号：CI 每次构建用 `github.run_number` 自动递增 `versionCode` 与 `versionName`（形如 `1.0.<n>`）；`android/app/build.gradle` 里的值只是本地兜底默认值。
应用图标：替换 `assets/icon.png` 后执行 `npm run assets` 重新生成各密度图标与启动图。

## 目录

```
www/            Web 应用（index.html + css/theme.css + js/{engine,nodes,geo,store,ui}.js + vendor/）
android/        Capacitor 生成工程（cap sync 后入库）
analysis/       原站逆向记录与节点抓取存档（不入库）
PLAN.md         立项方案（逆向结论、路线、里程碑、已拍板决策）
```

测速引擎借鉴 MIT 协议开源项目 [ljxi/NetworkPanel](https://github.com/ljxi/NetworkPanel) 的思路；节点清单整理自互联网公开资源，可能失效，可在 App 内自定义替换。
