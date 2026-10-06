# 网络速度 · Android App

复刻 https://270666.xyz 「网络速度自查」的安卓端（仅 Android，debug 侧载包）。Capacitor 7 WebView 壳 + 原生 HTML/CSS/JS 单页，打包流水线沿用 `stock_market_watch/build` 方案。

## 功能（与原站对齐）

- 多线程测速：1–32 线程滑块（默认 8），循环下载测试文件，支持运行中热切换节点/线程
- 内置 15 个节点（270专项 1 + 热门应用 9 + 运营商 5，整理自原站公开清单）+ 自定义地址（名称 + URL）
- 三指标卡：总使用量（可设上限自动停止）、实时/平均速度、网络带宽峰值（Mbps + 进度条）
- 平均速度限速（只能限平均、限不了峰值，同原站）；按当前速率的用量预测
- 保持后台运行（前台服务 + WakeLock，常驻通知可点击回到应用）/ 自动运行开关，状态与原站键位一致存 localStorage；注意 Android 15 对 dataSync 型前台服务有 6 小时/24 小时累计时长限制，超长测速会被系统停止
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
云端：push 到 GitHub main 分支，Actions 自动出 `app-debug.apk`（artifact: network-speed-apk），手机侧载安装。
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
