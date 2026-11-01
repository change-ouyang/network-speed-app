# 流量消耗器 · Android App

复刻 https://270666.xyz 「网络速度自查」的安卓端测速工具（Capacitor 7 WebView 壳 + 原生 HTML/CSS/JS 单页），应用名「流量消耗器」，包名 `com.ouyang.speedcheck`。

## 功能

- 多线程测速：1–32 线程滑块（默认 8），循环下载测试文件，运行中可热切换节点/线程
- 内置 16 个节点（270专项 2 + 热门应用 9 + 运营商 5）+ 自定义地址（名称 + URL）
- 「咪咕视频2」节点：运行时解析官方免费短视频的真实分片（play API → ddCalcu 签名 → GSLB 302 派发 → m3u8 → .ts，GSLB 失败自动回退全 https），无需登录、不经第三方媒体代理
- 三指标卡：总使用量（每次进入页面自动清零，可设本次测试生效的上限自动停止）、实时/平均速度、带宽峰值（Mbps + 进度条）
- 传输策略自动适配（`engine.js`）：默认整包循环下载；仅确认服务端支持 Range 且文件 > 1MiB 后才分块，偏移严格取模，永不发越界请求
- 流式计量：边下边计数，请求被中止时已下载字节照样计入；抗误判——超时只看「有没有新字节」（连续 20s 零字节才中止），越界类 4xx 回卷重试，长时间零字节先自愈重建连接
- 平均速度限速（只能限平均、限不了峰值，同原站）与按当前速率的用量预测
- 后台运行：前台服务 + WakeLock + 原生后台泵；切后台/息屏后 WebView JS 被系统冻结时，下载交棒给原生线程继续，通知栏实时显示用量，回前台自动取回字节并重启引擎
- 全屏实时速率曲线、测试链接复制/分享（二维码）、深色模式自适应、返回键逐层关闭浮层

## 安装 / 出包

- 手机直接下载最新版 APK：https://github.com/change-ouyang/network-speed-app/releases/latest/download/app-debug.apk（debug 侧载包，无需解压）
- 本地构建：`npm install && npx cap sync android`，然后 `cd android && ./gradlew assembleDebug`（需 Android SDK）
- 云端：push 到 GitHub main 分支，Actions 测试和构建通过后，自动将 `app-debug.apk` 发布到 [GitHub Releases](https://github.com/change-ouyang/network-speed-app/releases)
- 版本号：CI 每次构建用 `github.run_number` 自动递增 `versionCode` 与 `versionName`（形如 `1.0.<n>`），`android/app/build.gradle` 里的值只是本地兜底
- 换图标：替换 `assets/icon.png` 后执行 `npm run assets` 重新生成

## 注意事项

- Android 9+ 默认禁明文传输：自定义节点仅支持 `https`，唯一例外是咪咕官方域 `miguvideo.com`（官方调度链需要 http）
- Android 15 对 dataSync 型前台服务有 6 小时/24 小时累计时长限制；退出应用/划掉最近任务会自动停泵
- 咪咕定向流量是否免流以运营商账单为准（按分片落点 IP/SNI 识别，「说明」页显示实际落点）；需手机走蜂窝数据、关闭 VPN/代理、套餐确实包含咪咕视频定向
- 节点清单整理自互联网公开资源，可能失效，可在 App 内自定义替换

---

测速引擎思路源自开源项目 [ljxi/NetworkPanel](https://github.com/ljxi/NetworkPanel)（MIT），原站 270666.xyz 基于其构建。
