// UI 编排：选择器、指标刷新、弹窗、海报分享、IP 卡
(function () {
  "use strict";

  // 致命错误可见化：白屏/黑屏时至少把报错摆出来（真机无控制台，用户截图即能定位）
  window.addEventListener("error", function (e) {
    var bar = document.getElementById("fatalBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "fatalBar";
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.textContent = "脚本错误：" + (e.message || (e.error && e.error.message) || "unknown");
  });

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
  // 端口阵列即线程可视化：亮灯数量 = 线程数，运行中按端口序错相闪烁
  // n 由调用方传入（滑杆当前值/存储值）；engine.threads 只在 start/setThreads 后才同步，
  // 直接读它会出现「配置 32 灯只亮 8」的错位
  function updatePortGrid(n) {
    const grid = $("portGrid");
    if (!grid) return;
    const count = n || engine.threads;
    for (const p of grid.children) {
      const port = parseInt(p.dataset.port, 10);
      p.classList.toggle("on", port <= count);
      if (!p.style.getPropertyValue("--d")) p.style.setProperty("--d", ((port - 1) % 8 * 0.09).toFixed(2) + "s");
    }
  }
  function applyThreadUI(n) {
    $("threadNum").textContent = n;
    const slider = $("threadSlider");
    slider.value = n;
    slider.style.setProperty("--pct", ((n - 1) / 31 * 100).toFixed(1) + "%");
    updatePortGrid(n);
  }
  $("threadSlider").addEventListener("input", (e) => {
    const n = parseInt(e.target.value, 10);
    applyThreadUI(n);
    Store.set(Store.K.threadNum, n);
    engine.setThreads(n);
  });

  // ---------- 主题切换（铭牌栏对比度图标：跟随系统 → 暗色 → 亮色 循环） ----------
  const THEMES = ["auto", "dark", "light"];
  const THEME_NAMES = { auto: "跟随系统", dark: "暗色", light: "亮色" };
  function applyTheme(t) {
    document.documentElement.dataset.theme = (t === "dark" || t === "light") ? t : "";
    document.documentElement.style.colorScheme = t === "auto" ? "light dark" : t;
  }
  applyTheme(Store.get(Store.K.theme, "auto") || "auto");
  $("btnTheme").addEventListener("click", () => {
    const cur = Store.get(Store.K.theme, "auto") || "auto";
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    Store.set(Store.K.theme, next);
    applyTheme(next);
    toast("主题：" + THEME_NAMES[next]);
  });

  // ---------- 开关 ----------
  $("swKeepBg").checked = Store.getKeepBg();
  $("swAuto").checked = Store.getAutoStart();
  $("swKeepBg").addEventListener("change", (e) => {
    Store.set(Store.K.keepBg, e.target.checked);
    syncBgService();
  });
  $("swAuto").addEventListener("change", (e) => Store.set(Store.K.autoStart, e.target.checked));

  // 后台运行 = 前台服务（测试中/原生后台泵在跑 且 开关开启时挂常驻服务，其余时候停掉）
  let bgWarned = false, bgHinted = false;
  // 原生后台泵与后台统计的状态（声明放在使用点之前，避免 TDZ）
  // handedOff：引擎是「被交棒停掉」的（不是用户/自动停止）——回前台必须把它重新跑起来
  let pumpOn = false, pumpTotal = 0, bgCount = 0, bgMs = 0, lastArmAt = 0, handedOff = false;
  // 服务启动失败的真实原因（原生透传，进诊断行，真机排查有据可依）
  let lastBgError = "";
  function syncBgService() {
    if ((engine.running || pumpOn) && Store.getKeepBg()) {
      // 启动失败必须让用户知道（此前是静默失败，用户以为后台在跑其实没跑）
      window.SpeedNative.bgEnable().then((res) => {
        if (res && !res.ok) {
          lastBgError = res.error || "未知错误";
          if (!bgWarned) {
            bgWarned = true;
            toast("后台服务启动失败：" + lastBgError + "。请允许通知权限，并在系统设置里允许「后台运行/自启动」", 6000);
          }
        } else {
          lastBgError = "";
          if (res && res.notifGranted === false) toast("未授予通知权限：后台将没有常驻通知，部分 ROM 会更容易杀后台", 4200);
        }
      });
      // 登记息屏自动接管参数：万一 WebView 没来得及触发 visibilitychange，原生也能在息屏时接管
      if (engine.url) {
        lastArmAt = Date.now();
        window.SpeedNative.armPump(engine.url, engine.threads, {
          limitBps: engine.speedLimit,
          budgetBytes: engine.maxUse > 0 ? Math.max(0, engine.maxUse - engine.sessionBytes) : 0,
          alreadyBytes: engine.totalBytes
        });
      }
    } else {
      // 撤销授权并停泵；返回的原生字节必须 absorb（否则这批流量丢账）
      window.SpeedNative.disarmPump().then(absorbPumpBytes);
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
    $("bandBar").style.setProperty("--w", Math.min(100, mbps / 500 * 100).toFixed(1) + "%");
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
    maintainNativePump();   // 自节流（3 秒一次）：清算原生泵字节 + 刷新息屏授权参数
  });
  engine.on("stop", (reason, detail) => {
    handedOff = false;   // 任何「真正的停止」（用户手动/自动停止）都要清掉交棒标记，回前台不再自动重启
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
  // 失败提示原则：流式下载里瞬时失败是常态，引擎已自动退避重试并保持消耗；
  // 把重试细节弹给用户只会制造焦虑（用户明确反馈过「这提示有必要吗」——没必要）。
  // 只保留「长时间收不到数据」（stall）与「自动停止」两类真正需要用户动作的提示；
  // 失败次数照常统计，可在「说明」页的诊断行里查看。
  engine.on("error", (e) => {
    console.warn("[speedtest]", e.msg, "kind:", e.kind, "consecutive:", e.consecutive);
  });
  engine.on("recover", () => {}); // 成功请求会把失败计数清零，无需打扰
  engine.on("stall", () => {
    toast("节点响应缓慢或已限流，正在等待恢复…", 3000);
    $("runStatus").textContent = "节点响应缓慢或已限流，正在等待恢复…";
  });

  function refreshPlayUI() {
    $("icPlay").style.display = engine.running ? "none" : "";
    $("icPause").style.display = engine.running ? "" : "none";
    // 机柜状态灯与端口闪烁都挂在这个类上（电源钮描边、RUN 灯、端口 blink）
    document.body.classList.toggle("running", engine.running);
    const grid = $("portGrid");
    if (grid) grid.classList.toggle("running", engine.running);
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

  // ---------- 弹窗：单位下拉 ----------
  // 自定义面板而非原生 <select>：系统弹层的定位与样式不可控（用户实测错位），
  // 且 .modal-body 是 overflow:auto 会裁剪内嵌浮层，故面板挂 body、fixed 定位右对齐触发钮
  const unitDD = {
    val: {},   // id -> 单位字节数
    html(id, units, idx) {
      this.val[id] = units[idx][1];
      return '<div class="unit-dd" id="' + id + '">' +
        '<button type="button" class="unit-dd-btn" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="unit-dd-val">' + units[idx][0] + '</span>' +
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor"/></svg>' +
        '</button></div>';
    },
    bind(id, units) {
      const btn = $(id).querySelector(".unit-dd-btn");
      const label = $(id).querySelector(".unit-dd-val");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if ($(id).__open) { closeUnitPanel(); return; }
        closeUnitPanel();
        const panel = document.createElement("div");
        panel.className = "unit-dd-panel";
        panel.__owner = id;
        $(id).__open = true;
        units.forEach(u => {
          const it = document.createElement("button");
          it.type = "button";
          it.className = "unit-dd-item" + (this.val[id] === u[1] ? " active" : "");
          it.textContent = u[0];
          it.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.val[id] = u[1];
            label.textContent = u[0];
            closeUnitPanel();
          });
          panel.appendChild(it);
        });
        document.body.appendChild(panel);
        panel.classList.add("show");   // 先显示再量宽：display:none 时 offsetWidth 为 0，定位会整列偏移
        const r = btn.getBoundingClientRect();
        // 与触发钮右对齐；贴近视口左缘时收回（左对齐兜底）
        panel.style.left = Math.max(8, Math.min(r.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8)) + "px";
        panel.style.top = (r.bottom + 5) + "px";
        btn.setAttribute("aria-expanded", "true");
      });
    }
  };
  function closeUnitPanel() {
    document.querySelectorAll(".unit-dd-panel").forEach(p => {
      const box = document.getElementById(p.__owner);
      if (box) {
        box.__open = false;
        const b = box.querySelector(".unit-dd-btn");
        if (b) b.setAttribute("aria-expanded", "false");
      }
      p.remove();
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".unit-dd-panel") && !e.target.closest(".unit-dd-btn")) closeUnitPanel();
  });

  // ---------- 弹窗：用量上限 ----------
  const USE_UNITS = [["MB", 1048576], ["GB", 1073741824]];
  $("btnMaxUse").addEventListener("click", () => {
    const cur = Store.getMaxUse();
    const isGB = cur >= 1073741824;
    const num = cur > 0 ? String(+ (cur / (isGB ? 1073741824 : 1048576)).toFixed(2)) : "";
    openModal("用量上限",
      '<p>本次测试用量达到上限后自动停止。</p>' +
      '<div class="unit-row"><input class="m-input" id="inMaxUse" inputmode="decimal" placeholder="留空则无上限" value="' + num + '">' +
      unitDD.html("ddMaxUse", USE_UNITS, isGB ? 1 : 0) + '</div>',
      [
        { text: "取消", cls: "plain", fn: closeModal },
        {
          text: "确定", fn: () => {
            const raw = $("inMaxUse").value.trim();
            if (!raw) {
              Store.set(Store.K.maxUse, 0); engine.maxUse = 0;
              closeModal(); toast("已清除用量上限"); return;
            }
            const n = parseFloat(raw);
            if (!(n > 0) || isNaN(n)) { toast("请输入正数"); return; }
            const v = Math.round(n * unitDD.val.ddMaxUse);
            Store.set(Store.K.maxUse, v);
            engine.maxUse = v;
            closeModal();
            toast("用量上限已设置：" + window.formatBytes(v, 1));
          }
        }
      ]);
    unitDD.bind("ddMaxUse", USE_UNITS);
  });

  // ---------- 弹窗：限速 ----------
  const LIMIT_UNITS = [["MB/s", 1048576], ["GB/s", 1073741824]];
  $("btnLimit").addEventListener("click", () => {
    const cur = Store.getSpeedLimit();
    const isGB = cur >= 1073741824;
    const num = cur > 0 ? String(+ (cur / (isGB ? 1073741824 : 1048576)).toFixed(2)) : "";
    openModal("速度限制",
      '<p>限制<b>平均速度</b>（限不了峰值）。</p>' +
      '<div class="unit-row"><input class="m-input" id="inLimit" inputmode="decimal" placeholder="留空则不限制" value="' + num + '">' +
      unitDD.html("ddLimit", LIMIT_UNITS, isGB ? 1 : 0) + '</div>',
      [
        { text: "取消", cls: "plain", fn: closeModal },
        {
          text: "确定", fn: () => {
            const raw = $("inLimit").value.trim();
            if (!raw) {
              Store.set(Store.K.speedLimit, 0); engine.speedLimit = 0;
              closeModal(); toast("已取消限速"); return;
            }
            const n = parseFloat(raw);
            if (!(n > 0) || isNaN(n)) { toast("请输入正数"); return; }
            const v = Math.round(n * unitDD.val.ddLimit);
            Store.set(Store.K.speedLimit, v);
            engine.speedLimit = v;
            closeModal();
            toast("平均速度限速已设置：" + window.formatBytes(v, 0) + "/s");
          }
        }
      ]);
    unitDD.bind("ddLimit", LIMIT_UNITS);
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
  // 诊断行：把「重试/失败/后台/交棒」的硬数字摆出来，替代以前那种打扰式弹窗（真机排查也有据可依）。
  // 顺带暴露省电豁免状态与最近一次服务启动失败的真实原因——后台问题九成出在这两处。
  async function diagLine() {
    const s = engine.stat || {};
    const sizeTxt = engine.size > 0 ? window.formatBytes(engine.size, 1) : "未知";
    const modeTxt = engine.mode === "chunk" ? "Range 分块" : "整包";
    let envTxt = "";
    try {
      const bat = await window.SpeedNative.batteryExempt(false);
      if (bat && bat.exempt === false) envTxt += "；省电豁免：未开启（后台易被系统冻结）";
    } catch (e) {}
    if (lastBgError) envTxt += "；最近服务启动失败：" + lastBgError;
    // 咪咕节点：分片实际落点（域名 + DNS 解析出的 IP）——定向流量按落点识别，摆出来才能对答案
    let miguTxt = "";
    const diag = window.SpeedNative.miguDiag;
    if (diag && diag.host) {
      const ips = (diag.v4 || []).concat(diag.v6 || []);
      miguTxt = "；咪咕分片落点 " + escapeHTML(diag.host) +
        (ips.length ? "（" + escapeHTML(ips.join("、")) + "）" : "") +
        "，是否计入定向流量以运营商对该域名/IP 段的白名单为准";
    }
    return "<p class='muted'><b>本次诊断</b>：请求 " + (s.req || 0) + " 次（成功 " + (s.ok || 0) +
      "、越界 416 " + (s.s416 || 0) + "、限流 429 " + (s.s429 || 0) + "、其它 4xx " + (s.s4xx || 0) +
      "、5xx " + (s.s5xx || 0) + "）；超时 " + (s.timeout || 0) + "、网络错误 " + (s.netErr || 0) +
      "、重建连接 " + (engine._revives || 0) + " 次；策略 " + modeTxt + "（文件 " + sizeTxt + "）" +
      "；进入后台 " + bgCount + " 次共 " + Math.round(bgMs / 1000) + " 秒" +
      (pumpTotal > 0 ? "，其中原生后台泵消耗 " + window.formatBytes(pumpTotal, 1) : "") +
      miguTxt + envTxt + "。</p>";
  }

  $("btnAbout").addEventListener("click", async () => {
    const info = await window.SpeedNative.getInfo();
    const verLine = info
      ? "<p class='muted'>当前版本：" + escapeHTML(String(info.version)) + "（构建 " + escapeHTML(String(info.build)) + "）</p>"
      : "";
    openModal("使用说明",
      "<p>多线程循环下载真实文件，主动消耗流量并测速。<b>总使用量</b>进入页面自动清零（点数字可手动清零）；<b>用量上限</b>只对本次测试生效。</p>" +
      "<p><b>后台测速</b>：开「后台运行」后切后台/息屏，下载交棒原生线程继续；部分 ROM 需在系统设置允许本应用后台运行并忽略电池优化。</p>" +
      "<p><b>咪咕视频/音乐节点</b>走官方调度链实时解析；是否计入定向流量以运营商账单为准（需蜂窝网络 + 关闭 VPN，统计有延迟）。</p>" +
      "<p>自定义地址仅支持 https；测试地址来自公开资源，可能失效。</p>" +
      (await diagLine()) +
      verLine,
      [{ text: "关闭", cls: "plain", fn: closeModal }]);
  });

  // 退出前先收干净：停掉测试、停掉原生后台泵、停掉前台服务
  // （否则原生泵会在服务里一直消耗流量，用户却已经看不到任何控制入口）
  async function shutdownBeforeExit() {
    try {
      engine.stop();
      absorbPumpBytes(await window.SpeedNative.disarmPump());   // 停泵 + 撤销息屏接管，字节计入
      pumpOn = false;
      await window.SpeedNative.bgDisable();
    } catch (e) {}
  }

  function showNotice() {
    openModal("公告",
      "<p><b>🔥用前须知🔥</b></p>" +
      "<p>1、本应用仅供交流、学习、测试使用，可用于主动消耗网络流量、测试下行速率与链路稳定性；</p>" +
      "<p>2、请勿用于非法用途，使用本工具造成的一切后果由用户承担；</p>" +
      "<p>3、测试会产生真实的下载流量，请留意用量上限设置。</p>",
      [
        {
          text: "退出使用", cls: "danger", fn: async () => {
            await shutdownBeforeExit();
            const done = await window.SpeedNative.exitApp();
            if (!done) { closeModal(); toast("浏览器预览无法退出，请直接关闭页面"); }
          }
        },
        { text: "我已知悉", fn: () => { Store.set(Store.K.acknowledged, "true"); closeModal(); } }
      ]);
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
  // 把存储的线程数同步进引擎（后台泵授权、动态增减线程都读 engine.threads），
  // 再刷新滑杆与端口阵列——两者从此读同一个数
  engine.setThreads(Store.getThreadNum());
  applyThreadUI(Store.getThreadNum());
  engine.maxUse = Store.getMaxUse();
  engine.speedLimit = Store.getSpeedLimit();

  // 每次进入页面：数据还原初始（总使用量、带宽峰值清零），设置项（节点/线程/开关/自定义地址）保留。
  // 页面被系统回收重载时同样清零：原生后台泵的字节仍会经 absorbPumpBytes 并入，不丢账。
  engine.totalBytes = 0;
  Store.setTotalUse(0);
  Store.set(Store.K.maxSpeed, "0");
  $("mUsed").textContent = window.formatBytes(0, 1);
  $("mBand").textContent = "0 Mbps";
  $("bandBar").style.setProperty("--w", "0%");
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
  loadGeo(false);
  if (!Store.get(Store.K.acknowledged, "")) showNotice();
  refreshPlayUI();
  // 启动时就预请求通知权限（Android 13+ 运行时授权）：别等用户点「开始」时才弹系统对话框打断操作
  window.SpeedNative.prepPermissions();

  // 页面是「被系统回收后重载」时（不是正常前后台切换），上一轮的一切都已失效：
  // 必须清掉原生泵授权并把前台服务停掉，否则原生泵会在无人看管的情况下一直消耗流量。
  // 顺序很关键：放在 autoStart 之前，自动运行重新开测时会由 syncBgService() 重新授权。
  window.SpeedNative.disarmPump().then(absorbPumpBytes);
  window.SpeedNative.bgDisable();

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

  // ---- 原生后台泵：切后台/息屏后 WebView 的 JS 会被系统冻结（真机实测：页面未重载但数字停住），
  //      只有前台服务的原生线程还能继续消耗流量。两条触发路径最终都汇到 maintainNativePump() 清算字节：
  //        ① 切后台：JS 交棒（handOffToNative）；② 息屏没来得及触发事件：原生按「已授权」参数自己接管。
  //
  //      可见性代际（visEpoch）：交棒里有 await（起原生泵），若用户在这几毫秒内切回前台，
  //      旧分支必须作废——否则会出现「原生泵在跑、引擎被停、UI 显示已停止、清算入口永不触发」的僵尸态。
  let visEpoch = 0;

  function absorbPumpBytes(bytes) {
    if (!(bytes > 0)) return;
    pumpTotal += bytes;
    engine.totalBytes += bytes;    // 原生侧消耗照常计入总使用量
    engine.sessionBytes += bytes;
    pumpOn = false;
    persistTotalUse(true);
    // 关键：并入的是「后台整批」的字节，绝不能被当成 1 秒内到达的速率 ——
    // 否则实时速度会瞬间虚高，并**永久污染带宽峰值**（peakSpeed 会落盘到 localStorage）
    engine.resetRateWindow();
    renderMetrics(engine);
  }

  async function handOffToNative(myEpoch) {
    if (!engine.running || !Store.getKeepBg() || !engine.url) return false;
    const ok = await window.SpeedNative.pumpStart(engine.url, engine.threads, {
      limitBps: engine.speedLimit,
      budgetBytes: engine.maxUse > 0 ? Math.max(0, engine.maxUse - engine.sessionBytes) : 0,
      alreadyBytes: engine.totalBytes
    });
    if (!ok) {
      // 服务没在跑 / 被 ROM 杀掉：别停 JS（继续跑总比停了好），但要让用户知道后台可能不保
      if (!bgHandoffWarned) {
        bgHandoffWarned = true;
        toast("后台服务未就绪：切到后台后可能无法继续消耗，请在系统设置里允许「后台运行/自启动」", 4600);
      }
      return false;
    }
    if (myEpoch !== visEpoch || !document.hidden) {
      // 起泵过程中已经回到前台：立刻收回原生泵，绝不去停引擎（引擎一停就没人清算了）
      absorbPumpBytes(await window.SpeedNative.pumpStop());
      return false;
    }
    pumpOn = true;
    handedOff = true;
    engine.stop();           // 停 JS 侧流量，避免两边同时下载同一条线（重复计数、白跑）——注意 stop() 不会触发 onStop
    return true;
  }

  // 清算原生泵（只在页面可见时做）：并入字节、刷新「息屏自动接管」授权参数
  // 节流用「进行中」标志而不是时间戳：时间戳在 await 之前赋值会让节流形同虚设
  let pumpSettling = false;
  async function maintainNativePump() {
    if (document.hidden || pumpSettling) return;
    pumpSettling = true;
    try {
      // 授权参数周期性刷新（5 秒一次）：原生侧按「授权新鲜度 + 剩余预算」决定是否息屏接管
      if (engine.running && Store.getKeepBg() && engine.url && Date.now() - lastArmAt > 5000) {
        lastArmAt = Date.now();
        window.SpeedNative.armPump(engine.url, engine.threads, {
          limitBps: engine.speedLimit,
          budgetBytes: engine.maxUse > 0 ? Math.max(0, engine.maxUse - engine.sessionBytes) : 0,
          alreadyBytes: engine.totalBytes
        });
      }
      const st = await window.SpeedNative.pumpStats();
      if (!st.bytes || document.hidden) return;   // 期间又切到后台：交给交棒逻辑处理，别把新起来的泵停掉
      absorbPumpBytes(await window.SpeedNative.pumpStop());   // 停泵并领走字节（含 renderMetrics）
    } finally {
      pumpSettling = false;
    }
  }

  // 回到前台 / 切到后台
  let hiddenAt = 0, hiddenBytes = 0, bgFreezeWarned = false, bgHandoffWarned = false;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      const myEpoch = ++visEpoch;
      hiddenAt = Date.now();
      hiddenBytes = engine.totalBytes;
      // 后台期间冻结「停滞/死亡」判定：否则解冻后过期的 1 秒定时器会把冻结时长误判成节点无响应
      engine.suspend();
      if (engine.running) bgCount++;
      const handed = await handOffToNative(myEpoch);
      if (myEpoch !== visEpoch) return;   // 期间已切回前台：一切以回前台分支的处理为准
      // 没开「保持后台运行」时系统会冻结 WebView，测速会被暂停 —— 只提醒一次，别反复打扰
      if (!handed && engine.running && !Store.getKeepBg() && !bgHinted) {
        bgHinted = true;
        toast("未开启「保持后台运行」：切到后台后测速会被系统暂停", 4200);
      }
      return;
    }
    visEpoch++;                             // 作废任何仍在途的交棒分支
    const hiddenMs = hiddenAt > 0 ? Date.now() - hiddenAt : 0;
    bgMs += hiddenMs;
    engine.resume();                        // 先恢复判定状态（引擎已停则只重置基准，不误判）
    lastArmAt = 0;
    await maintainNativePump();             // 清算原生后台消耗的字节（若有）
    // 被交棒停掉的引擎必须重新跑起来，绝不能留在「已停止」的状态（否则清算入口也永不触发）
    if (handedOff) {
      handedOff = false;
      pumpOn = false;
      if (!engine.running && engine.url) engine.start(engine.url, engine.threads);
    }
    renderMetrics(engine);
    refreshPlayUI();
    // 后台一字节都没消耗 = 系统把整个进程/JS 都冻住了，这不是前端能自救的，必须让用户去改系统设置
    if (hiddenMs > 20000 && engine.totalBytes === hiddenBytes && !bgFreezeWarned) {
      bgFreezeWarned = true;
      toast("后台期间没有消耗流量：请在系统设置中允许「后台运行/自启动」、省电策略设为无限制，并锁定后台", 5200);
    }
    syncBgService();   // 回前台重申一次前台服务，防止被系统回收后一直没恢复
  });

  // 系统返回键：优先关掉最上层浮层（弹窗 / 下拉），没有浮层时退出应用
  function closeTopLayer() {
    if ($("modalMask").classList.contains("open")) { closeModal(); return true; }
    if ($("sel").classList.contains("open")) { toggleSelect(false); return true; }
    return false;
  }
  window.SpeedNative.onBack(async () => {
    if (closeTopLayer()) return;    // 有关闭动作：拦截返回
    await shutdownBeforeExit();     // 无浮层：先停测试/后台泵/前台服务，再退出
    window.SpeedNative.exitApp();
  });

  // 防双击缩放（对齐原站）
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
})();
