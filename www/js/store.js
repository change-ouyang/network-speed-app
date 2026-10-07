// localStorage 适配层：键位与原站对齐，便于行为一致
(function () {
  "use strict";
  const K = {
    threadNum: "threadNum",
    keepBg: "keepBg",        // 保持后台运行
    autoStart: "autoStart",  // 自动运行
    maxUse: "maxUse",        // 用量上限（字节，0/空 = 无上限）
    maxSpeed: "maxSpeed",    // 历史峰值（B/s）
    totalUse: "totalUse",    // 累计总使用量（字节，跨启动保留，可点击清零）
    speedLimit: "speedLimit",// 平均速度限速（B/s，0 = 不限）
    customNodes: "customNodes", // [{label, value}]
    lastNode: "lastNode",    // 上次选择的节点 {label, value}
    acknowledged: "acknowledged", // 公告已知晓
    geoCache: "geoCache"     // IP 信息缓存 {ip, text, ts}
  };

  function get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : v;
    } catch (e) { return def; }
  }
  function set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }
  function getJSON(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  function setJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  window.Store = {
    K,
    get, set, getJSON, setJSON,
    getThreadNum() { const n = parseInt(get(K.threadNum, "8"), 10); return isNaN(n) ? 8 : Math.max(1, Math.min(32, n)); },
    getKeepBg() { return get(K.keepBg, "false") === "true"; },
    getAutoStart() { return get(K.autoStart, "false") === "true"; },
    getMaxUse() { return parseInt(get(K.maxUse, "0"), 10) || 0; },
    getMaxSpeed() { return parseInt(get(K.maxSpeed, "0"), 10) || 0; },
    getTotalUse() { return parseInt(get(K.totalUse, "0"), 10) || 0; },
    // 累计用量可能超过 2GiB，不能用位运算取整
    setTotalUse(v) { set(K.totalUse, String(Math.max(0, Math.round(v || 0)))); },
    getSpeedLimit() { return parseInt(get(K.speedLimit, "0"), 10) || 0; },
    getCustomNodes() { return getJSON(K.customNodes, []); },
    getLastNode() { return getJSON(K.lastNode, null); },
    getGeo() { return getJSON(K.geoCache, null); }
  };
})();
