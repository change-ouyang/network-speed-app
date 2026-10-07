// UI 编排：选择器、指标刷新、弹窗、全屏图表、海报分享、IP 卡
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const engine = new window.SpeedEngine();
  let currentNode = null;   // {label, value}

  // ---------- 通用 ----------
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms || 2200);
  }

  function openModal(title, bodyHTML, buttons) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = bodyHTML;
    const foot = $("modalFoot");
    foot.innerHTML = "";
    (buttons || []).forEach(b => {
      const btn = document.createElement("button");
      btn.className = "m-btn " + (b.cls || "primary");
      btn.textContent = b.text;
      btn.addEventListener("click", b.fn);
      foot.appendChild(btn);
    });
    $("modalMask").classList.add("open");
  }
  function closeModal() { $("modalMask").classList.remove("open"); }
  $("modalMask").addEventListener("click", (e) => { if (e.target === $("modalMask")) closeModal(); });

  // ---------- 节点选择器 ----------
  function allGroups() {
    const custom = Store.getCustomNodes();
    const groups = window.NODE_GROUPS.slice();
    if (custom.length) groups.push({ label: "自定义", options: custom });
    return groups;
  }
  function buildSelectPanel() {
    const panel = $("selPanel");
    panel.innerHTML = "";
    allGroups().forEach(g => {
      const gt = document.createElement("div");
      gt.className = "select-group-title";
      gt.textContent = g.label;
      panel.appendChild(gt);
      g.options.forEach(opt => {
        const item = document.createElement("div");
        item.className = "select-item" + (currentNode && currentNode.value === opt.value ? " active" : "");
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        item.textContent = opt.label;
        item.addEventListener("click", () => {
          selectNode(opt);
          toggleSelect(false);
        });
        panel.appendChild(item);
      });
    });
  }
  function selectNode(opt) {
    currentNode = opt;
    $("selLabel").textContent = opt.label;
    Store.setJSON(Store.K.lastNode, opt);
    engine.setUrl(opt.value);
    buildSelectPanel();
  }
  function toggleSelect(open) {
    $("sel").classList.toggle("open", open);
    const trig = document.querySelector("#sel .select-trigger");
    if (trig) trig.setAttribute("aria-expanded", open ? "true" : "false");
  }
  $("sel").addEventListener("click", (e) => {
    if (e.target.closest(".select-panel")) return;
    toggleSelect(!$("sel").classList.contains("open"));
  });
  // 键盘无障碍：触发区回车/空格展开，下拉项回车/空格选中（TalkBack 可操作）
  function isActivateKey(e) { return e.key === "Enter" || e.key === " " || e.key === "Spacebar"; }
  document.querySelector("#sel .select-trigger").addEventListener("keydown", (e) => {
    if (!isActivateKey(e)) return;
    e.preventDefault();
    toggleSelect(!$("sel").classList.contains("open"));
  });
  $("selPanel").addEventListener("keydown", (e) => {
    if (!isActivateKey(e)) return;
    const item = e.target.closest(".select-item");
    if (!item) return;
    e.preventDefault();
    item.click();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#sel")) toggleSelect(false);
  });

  // ---------- 线程数 ----------
  function applyThreadUI(n) {
    $("threadNum").textContent = n;
    const slider = $("threadSlider");
    slider.value = n;
    slider.style.setProperty("--pct", ((n - 1) / 31 * 100).toFixed(1) + "%");
  }
  $("threadSlider").addEventListener("input", (e) => {
    const n = parseInt(e.target.value, 10);
    applyThreadUI(n);
    Store.set(Store.K.threadNum, n);
    engine.setThreads(n);
  });

  // ---------- 开关 ----------
  $("swKeepBg").checked = Store.getKeepBg();
  $("swAuto").checked = Store.getAutoStart();
  $("swKeepBg").addEventListener("change", (e) => {
    Store.set(Store.K.keepBg, e.target.checked);
    syncBgService();
  });
  $("swAuto").addEventListener("change", (e) => Store.set(Store.K.autoStart, e.target.checked));

  // 后台运行 = 前台服务（测试中且开关开启时挂常驻服务，其余时候停掉）
  let bgWarned = false, bgHinted = false;
  function syncBgService() {
    if (engine.running && Store.getKeepBg()) {
      // 启动失败必须让用户知道（此前是静默失败，用户以为后台在跑其实没跑）
      window.SpeedNative.bgEnable().then((ok) => {
        if (!ok && !bgWarned) {
          bgWarned = true;
          toast("后台运行服务启动失败：请确认已允许通知权限（部分 ROM 还需允许本应用「后台运行/自启动」）", 4200);
        }
      });
    } else {
      window.SpeedNative.bgDisable();
    }
  }

  // ---------- 指标刷新 ----------
  function persistPeak() {
    if (engine.peakSpeed > Store.getMaxSpeed()) Store.set(Store.K.maxSpeed, Math.round(engine.peakSpeed));
  }
  function renderMetrics(e) {
    $("mUsed").textContent = window.formatBytes(e.totalBytes, 1);
    $("mSpeedLabel").textContent = e.running ? "实时速度" : "平均速度";
    const shown = e.running ? e.speed : e.avgSpeed;
    $("mSpeed").textContent = (e.running || e.avgSpeed > 0) ? window.formatBytes(shown, 0) : "-";
    const mbps = e.peakSpeed * 8 / 1e6;
    $("mBand").textContent = (mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1)) + " Mbps";
    $("bandBar").style.width = Math.min(100, mbps / 500 * 100).toFixed(1) + "%";
  }
  // 累计用量持久化：5 秒一次 + 停止时强制落盘，页面被系统回收重载后不会丢
  let lastPersistAt = 0;
  function persistTotalUse(force) {
    const now = Date.now();
    if (!force && now - lastPersistAt < 5000) return;
    lastPersistAt = now;
    Store.setTotalUse(engine.totalBytes);
  }

  engine.on("tick", (e) => {
    renderMetrics(e);
    persistPeak();
    persistTotalUse(false);
  });
  engine.on("stop", (reason, detail) => {
    let msg = "";
    if (reason === "reachMaxUse") { msg = "已达到用量上限（本次测试），自动停止"; toast(msg); }
    if (reason === "nodeRejected") { msg = "自动停止：「" + (currentNode ? currentNode.label : "节点") + "」拒绝访问（" + detail + "），请更换节点"; toast(msg, 4200); }
    if (reason === "nodeDead") { msg = "自动停止：「" + (currentNode ? currentNode.label : "节点") + "」" + detail + "，请更换节点或稍后重试"; toast(msg, 4200); }
    persistTotalUse(true);
    $("runStatus").textContent = msg || (detail || "");
    renderMetrics({ ...engine, running: false });
    refreshPlayUI();
    syncBgService();
  });
  let lastWarnToast = 0, lastInfoToast = 0;
  engine.on("error", (e) => {
    console.warn("[speedtest]", e.msg, "consecutive:", e.consecutive);
    const now = Date.now();
    const node = currentNode ? "「" + currentNode.label + "」" : "";
    if (e.consecutive >= 3) {
      // 连续失败：说明不是偶发抖动，明确提示且降低打扰频率
      if (now - lastWarnToast > 15000) {
        lastWarnToast = now;
        toast(node + "连接不稳定（" + e.msg + "），已自动重试；建议更换节点或降低线程数", 3200);
      }
    } else if (now - lastInfoToast > 30000) {
      // 偶发失败：静默重试即可，最多轻描淡写提一次
      lastInfoToast = now;
      toast("个别请求失败，已自动重试", 1800);
    }
  });
  engine.on("recover", () => {}); // 成功请求会把失败计数清零，无需打扰
  engine.on("stall", () => {
    toast("节点响应缓慢或已限流，正在等待恢复…", 3000);
    $("runStatus").textContent = "节点响应缓慢或已限流，正在等待恢复…";
  });

  function refreshPlayUI() {
    $("icPlay").style.display = engine.running ? "none" : "";
    $("icPause").style.display = engine.running ? "" : "none";
    if (engine.running) $("runStatus").textContent = "";
    if (!engine.running) {
      $("mSpeedLabel").textContent = "平均速度";
    }
  }

  $("btnPlay").addEventListener("click", () => {
    if (!currentNode) { toast("请先选择测试地址"); return; }
    if (engine.running) {
      engine.stop();
      refreshPlayUI();
      renderMetrics(engine);
      syncBgService();
    } else {
      engine.start(currentNode.value, Store.getThreadNum());
      refreshPlayUI();
      syncBgService();
    }
  });

  // ---------- 弹窗：用量上限 ----------
  function parseBytesInput(str) {
    if (!str) return 0;
    // 允许末尾带 "/s"（速率单位），这样「10MB/s」「10 MB/s」「10MB」都能正确解析
    const s = String(str).trim().replace(/\/s$/i, "").trim();
    const m = /^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i.exec(s);
    if (!m) return NaN;
    const mult = { "": 1, B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1 << 40 }[(m[2] || "").toUpperCase()];
    return Math.round(parseFloat(m[1]) * mult);
  }
  $("btnMaxUse").addEventListener("click", () => {
    const cur = Store.getMaxUse();
    openModal("用量上限",
      '<p>本次测试用量达到上限后自动停止（累计总使用量不受影响）。</p>' +
      '<input class="m-input" id="inMaxUse" placeholder="留空则无上限" value="' + (cur > 0 ? window.formatBytes(cur, 1) : "") + '">' +
      '<p class="muted">支持 500MB、2GB 或字节数</p>',
      [
        { text: "取消", cls: "plain", fn: closeModal },
        {
          text: "确定", fn: () => {
            const v = parseBytesInput($("inMaxUse").value || "");
            if (isNaN(v)) { toast("格式不正确"); return; }
            Store.set(Store.K.maxUse, v);
            engine.maxUse = v;
            closeModal();
            toast(v > 0 ? "用量上限已设置" : "已清除用量上限");
          }
        }
      ]);
  });

  // ---------- 弹窗：限速 ----------
  $("btnLimit").addEventListener("click", () => {
    const cur = Store.getSpeedLimit();
    openModal("速度限制",
      '<p>限制<b>平均速度</b>（只能限制平均速度，无法限制峰值速度!）</p>' +
      '<input class="m-input" id="inLimit" placeholder="留空则不限制" value="' + (cur > 0 ? window.formatBytes(cur, 0) : "") + '">' +
      '<p class="muted">例：10MB/s</p>',
      [
        { text: "取消", cls: "plain", fn: closeModal },
        {
          text: "确定", fn: () => {
            const v = parseBytesInput($("inLimit").value || "");
            if (isNaN(v)) { toast("格式不正确"); return; }
            Store.set(Store.K.speedLimit, v);
            engine.speedLimit = v;
            closeModal();
            toast(v > 0 ? "平均速度限速已设置" : "已取消限速");
          }
        }
      ]);
  });

  // ---------- 弹窗：用量预测 ----------
  $("btnPredict").addEventListener("click", () => {
    const p = engine.predict();
    const row = (k, v) => "<div class='custom-item'><span>" + k + "</span><b>" + (engine.running || engine.speed > 0 ? window.formatBytes(v, 1) : "-") + "</b></div>";
    openModal("按当前速率的用量预测",
      row("每分钟", p.min) + row("每小时", p.hour) + row("每天", p.day) + row("每月（按 30 天）", p.mon) +
      '<p class="muted">当前速率：' + (engine.running ? window.formatBytes(engine.speed, 0) : "未在测试") + "</p>",
      [{ text: "关闭", cls: "plain", fn: closeModal }]);
  });

  // ---------- 弹窗：自定义地址 ----------
  $("btnCustom").addEventListener("click", () => {
    renderCustomModal();
  });
  function renderCustomModal() {
    const list = Store.getCustomNodes();
    const items = list.map((n, i) =>
      "<div class='custom-item'><span>" + escapeHTML(n.label) + "</span>" +
      "<button class='icon-btn del' data-i='" + i + "' aria-label='删除 " + escapeHTML(n.label) + "'>删除</button></div>"
    ).join("") || "<p class='muted'>没有自定义地址</p>";
    openModal("自定义地址",
      items +
      "<p style='margin:10px 0 0'><b>添加地址</b></p>" +
      "<input class='m-input' id='inCName' placeholder='名称'>" +
      "<input class='m-input' id='inCUrl' placeholder='地址：https://...'>" +
      "<p class='muted'>注意：目标文件建议为较大文件；App 走原生网络栈，无浏览器跨域限制，但仅支持 https 地址（http 会被系统明文策略拦截）。</p>",
      [
        { text: "取消", cls: "plain", fn: closeModal },
        {
          text: "添加", fn: () => {
            const name = $("inCName").value.trim();
            const url = $("inCUrl").value.trim();
            if (!name) { toast("请填写名称"); return; }
            // 结构校验：必须是合法 URL 且为 https（App 明文策略拦截 http）
            let u;
            try {
              u = new URL(url);
            } catch (e) { toast("地址格式不正确，需完整 URL（如 https://example.com/file.jpg）"); return; }
            if (u.protocol !== "https:") { toast("仅支持 https 地址（http 会被系统明文策略拦截）"); return; }
            const arr = Store.getCustomNodes();
            arr.push({ label: name, value: u.href });
            Store.setJSON(Store.K.customNodes, arr);
            buildSelectPanel();
            renderCustomModal();
            toast("已添加");
          }
        }
      ]);
    document.querySelectorAll(".custom-item .del").forEach(b => {
      b.addEventListener("click", () => {
        const arr = Store.getCustomNodes();
        arr.splice(parseInt(b.dataset.i, 10), 1);
        Store.setJSON(Store.K.customNodes, arr);
        buildSelectPanel();
        renderCustomModal();
      });
    });
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- 复制 / 分享链接 ----------
  async function copyCurrentUrl() {
    if (!currentNode) return;
    try {
      await navigator.clipboard.writeText(currentNode.value);
      toast("已复制当前测试链接");
    } catch (e) {
      const inp = document.createElement("input");
      inp.value = currentNode.value;
      document.body.appendChild(inp);
      inp.select();
      try { document.execCommand("copy"); toast("已复制当前测试链接"); } catch (e2) { toast("复制失败"); }
      inp.remove();
    }
  }
  $("btnCopyUrl").addEventListener("click", copyCurrentUrl);

  // 分享面板：展示当前测试地址 + 二维码（复用已加载的 qrcode.min.js），支持一键复制
  $("btnShare").addEventListener("click", () => {
    if (!currentNode) { toast("请先选择测试地址"); return; }
    openModal("分享测试地址",
      "<p class='share-name'>" + escapeHTML(currentNode.label) + "</p>" +
      "<div id='qrBox' class='qr-box'></div>" +
      "<p class='muted center-url'>" + escapeHTML(currentNode.value) + "</p>",
      [
        { text: "关闭", cls: "plain", fn: closeModal },
        {
          text: "系统分享", fn: async () => {
            const ok = await window.SpeedNative.share({
              title: "流量消耗器",
              text: currentNode.label + " 测速地址",
              url: currentNode.value,
              dialogTitle: "分享测试地址"
            });
            if (!ok) { toast("当前环境不支持系统分享，已复制链接"); await copyCurrentUrl(); }
          }
        },
        { text: "复制链接", fn: copyCurrentUrl }
      ]);
    const box = $("qrBox");
    if (!box || !window.QRCode) return;
    box.innerHTML = "";
    try {
      new window.QRCode(box, {
        text: currentNode.value,
        width: 180,
        height: 180,
        colorDark: "#10131a",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch (e) {
      box.innerHTML = "<span class='muted'>二维码生成失败</span>";
    }
  });

  // ---------- 说明 / 公告 ----------
  $("btnAbout").addEventListener("click", async () => {
    const info = await window.SpeedNative.getInfo();
    const verLine = info
      ? "<p class='muted'>当前版本：" + escapeHTML(String(info.version)) + "（构建 " + escapeHTML(String(info.build)) + "）</p>"
      : "";
    openModal("使用说明",
      "<p><b>关于本页</b></p>" +
      "<p>1、本应用为「流量消耗器」（原「网络速度」）安卓端：多线程循环下载真实公开文件消耗流量并测速，实时显示总使用量、速度与带宽峰值；</p>" +
      "<p>2、<b>后台测速</b>：打开「保持后台运行」后切换到桌面/锁屏，测速会在前台服务中继续（通知栏有常驻提醒，CPU 保持唤醒）；部分国产 ROM 需在系统设置中允许本应用「后台运行/自启动」并把省电策略设为无限制；</p>" +
      "<p>3、请勿用于非法用途，使用本工具造成的一切后果由用户承担；</p>" +
      "<p>4、测试地址整理自互联网公开资源，可能随时间失效，可在「自定义地址」中添加替换；</p>" +
      "<p>5、App 端通过原生网络栈直连，无浏览器跨域限制；仅支持 https 地址（http 会被 Android 明文策略拦截）。</p>" +
      "<p>6、<b>总使用量</b>为累计值（跨启动保留），点一下该数字即可清零；<b>用量上限</b>只对本次测试生效。测试中若长时间收不到数据，会自动重建连接重试，不会直接停止。</p>" +
      verLine,
      [{ text: "关闭", cls: "plain", fn: closeModal }]);
  });

  function showNotice() {
    openModal("公告",
      "<p><b>🔥用前须知🔥</b></p>" +
      "<p>1、本应用仅供交流、学习、测试使用，可用于主动消耗网络流量、测试下行速率与链路稳定性；</p>" +
      "<p>2、请勿用于非法用途，使用本工具造成的一切后果由用户承担；</p>" +
      "<p>3、测试会产生真实的下载流量，请留意用量上限设置。</p>",
      [
        {
          text: "退出使用", cls: "danger", fn: async () => {
            const done = await window.SpeedNative.exitApp();
            if (!done) { closeModal(); toast("浏览器预览无法退出，请直接关闭页面"); }
          }
        },
        { text: "我已知悉", fn: () => { Store.set(Store.K.acknowledged, "true"); closeModal(); } }
      ]);
  }

  // ---------- 全屏图表 ----------
  let chartRAF = null;
  $("btnChart").addEventListener("click", () => {
    $("chartOverlay").classList.add("open");
    drawChart();
  });
  $("btnChartClose").addEventListener("click", () => {
    $("chartOverlay").classList.remove("open");
    if (chartRAF) cancelAnimationFrame(chartRAF);
  });
  function drawChart() {
    const cv = $("chartCanvas");
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const hist = engine.history.slice(-180);
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#409eff";
    const muted = css.getPropertyValue("--muted").trim() || "#909399";
    // 网格
    ctx.strokeStyle = muted; ctx.globalAlpha = .25; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = h * i / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (hist.length > 1) {
      const maxS = Math.max(...hist.map(p => p.s), 1);
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
      hist.forEach((p, i) => {
        const x = i / (hist.length - 1) * w;
        const y = h - (p.s / maxS) * (h - 20) - 10;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = accent; ctx.globalAlpha = .12; ctx.fill(); ctx.globalAlpha = 1;
      $("chartNow").textContent = window.formatBytes(engine.speed, 0);
    } else {
      ctx.fillStyle = muted;
      ctx.font = "14px sans-serif";
      ctx.fillText(engine.running ? "正在采集速率数据…" : "开始测速后展示实时曲线", 16, h / 2);
    }
    if ($("chartOverlay").classList.contains("open")) chartRAF = requestAnimationFrame(drawChart);
  }

  // ---------- IP 卡 ----------
  async function loadGeo(force, depth) {
    try {
      const info = await window.Geo.query(force);
      $("ipAddr").textContent = info.ip;
      $("ipGeo").textContent = info.text || "-";
    } catch (e) {
      $("ipAddr").textContent = "获取失败";
      $("ipGeo").textContent = "点击重试";
      // 首次加载失败自动再试两轮（换接口/网络抖动），不打扰用户
      const d = depth || 0;
      if (!force && d < 2) setTimeout(() => loadGeo(false, d + 1), 5000 * (d + 1));
    }
  }
  $("ipCard").addEventListener("click", () => loadGeo(true));


  // ---------- 初始化 ----------
  const last = Store.getLastNode();
  const groups = allGroups();
  const flat = [];
  groups.forEach(g => g.options.forEach(o => flat.push(o)));
  selectNode((last && flat.find(o => o.value === last.value)) || flat[0]);
  applyThreadUI(Store.getThreadNum());
  engine.maxUse = Store.getMaxUse();
  engine.speedLimit = Store.getSpeedLimit();

  // 恢复累计总使用量（跨启动保留：页面被系统回收重载后不再「被重置」），并支持点击清零
  engine.totalBytes = Store.getTotalUse();
  $("mUsed").textContent = window.formatBytes(engine.totalBytes, 1);
  function resetTotalUse() {
    engine.totalBytes = 0;
    engine.sessionBytes = 0;   // 累计清零时本次也归零，避免平均速度被历史用量污染
    Store.setTotalUse(0);
    renderMetrics(engine);
    toast("累计总使用量已清零");
  }
  $("mUsedTile").addEventListener("click", (e) => {
    if (e.target.closest("#btnMaxUse")) return;   // 上限按钮不触发清零
    resetTotalUse();
  });
  $("mUsedTile").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    resetTotalUse();
  });
  const savedPeak = Store.getMaxSpeed();
  if (savedPeak > 0) {
    engine.peakSpeed = savedPeak;
    const mbps = savedPeak * 8 / 1e6;
    $("mBand").textContent = (mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1)) + " Mbps";
    $("bandBar").style.width = Math.min(100, mbps / 500 * 100).toFixed(1) + "%";
  }
  loadGeo(false);
  if (!Store.get(Store.K.acknowledged, "")) showNotice();
  refreshPlayUI();

  // 自动运行
  if (Store.getAutoStart()) {
    setTimeout(() => {
      if (currentNode && !engine.running) {
        engine.start(currentNode.value, Store.getThreadNum());
        refreshPlayUI();
        syncBgService();
      }
    }, 600);
  }

  // 回到前台 / 切到后台
  let hiddenAt = 0, hiddenBytes = 0, bgFreezeWarned = false;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      hiddenBytes = engine.totalBytes;
      // 后台期间冻结「停滞/死亡」判定：否则解冻后过期的 1 秒定时器会把冻结时长误判成节点无响应
      engine.suspend();
      // 没开「保持后台运行」时系统可能冻结 WebView，测速会被暂停 —— 只提醒一次，别反复打扰
      if (engine.running && !Store.getKeepBg() && !bgHinted) {
        bgHinted = true;
        toast("未开启「保持后台运行」：切到后台后测速可能被系统暂停", 4200);
      }
      return;
    }
    if (engine.running) {
      const hiddenMs = Date.now() - hiddenAt;
      // 后台一字节都没消耗 = 系统把后台 JS/网络冻住了：这不是引擎能自救的，必须让用户去改系统设置
      const froze = hiddenAt > 0 && hiddenMs > 20000 && engine.totalBytes === hiddenBytes;
      engine.resume();   // 内含：重置进度基准 + 重建全部 worker（回前台不必等看门狗）
      renderMetrics(engine);
      if (froze && !bgFreezeWarned) {
        bgFreezeWarned = true;
        toast("后台期间没有消耗流量：系统可能冻结了本应用，请允许「后台运行/自启动」并把省电策略设为无限制", 5000);
      }
    } else {
      engine.resume();   // 未在测速也要恢复判定状态
    }
    syncBgService();   // 回前台重申一次前台服务，防止被系统回收后一直没恢复
  });

  // 系统返回键：优先关掉最上层浮层（弹窗 / 全屏图表 / 下拉），没有浮层时退出应用
  function closeTopLayer() {
    if ($("modalMask").classList.contains("open")) { closeModal(); return true; }
    if ($("chartOverlay").classList.contains("open")) {
      $("chartOverlay").classList.remove("open");
      if (chartRAF) cancelAnimationFrame(chartRAF);
      return true;
    }
    if ($("sel").classList.contains("open")) { toggleSelect(false); return true; }
    return false;
  }
  window.SpeedNative.onBack(() => {
    if (closeTopLayer()) return;    // 有关闭动作：拦截返回
    window.SpeedNative.exitApp();   // 无浮层：退出应用
  });

  // 防双击缩放（对齐原站）
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
})();
