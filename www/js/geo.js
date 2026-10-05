// IP 归属查询：原站走 EdgeOne 边缘 /geo，App 端改为通用直连接口（CapacitorHttp 无跨域限制）
// 多源依次回退（国内源优先），结果缓存 10 分钟；全部失败由 UI 自动重试
(function () {
  "use strict";

  const CACHE_MS = 10 * 60 * 1000;
  const TIMEOUT = 6000;

  async function fetchJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // 启智云（百度云加速）：国内可达，含运营商字段
  async function fromQifu() {
    const d = await fetchJSON("https://qifu-api.baidubce.com/ip/local/geo/v1/district");
    if (!d || !d.ip) throw new Error("bad qifu");
    const c = (d.data && (d.data.dist || d.data.city)) || "";
    return { ip: d.ip, text: c + ", " + ((d.data && d.data.isp) || "") };
  }
  // ip-api.com（免费版 http，45 次/分钟）
  async function fromIpApi() {
    const d = await fetchJSON("http://ip-api.com/json/?lang=zh-CN&fields=query,country,city,isp");
    if (!d || !d.query) throw new Error("bad ip-api");
    return { ip: d.query, text: (d.city || d.country || "") + ", " + (d.isp || "") };
  }
  // ip.sb：全球可达，含 ISP
  async function fromIpSb() {
    const d = await fetchJSON("https://api.ip.sb/geoip");
    if (!d || !d.ip) throw new Error("bad ip.sb");
    return { ip: d.ip, text: (d.city || d.country || "") + ", " + (d.isp || d.organization || "") };
  }
  // ipwho.is：对数据中心 IP 较宽容，含 ISP
  async function fromIpwhoIs() {
    const d = await fetchJSON("https://ipwho.is/");
    if (!d || !d.ip || d.success === false) throw new Error("bad ipwho.is");
    return { ip: d.ip, text: (d.city || d.country || "") + ", " + ((d.connection && d.connection.isp) || "") };
  }
  // freeipapi：无 ISP，兜底只出 IP 与城市
  async function fromFreeIpApi() {
    const d = await fetchJSON("https://freeipapi.com/api/json");
    if (!d || !d.ipAddress) throw new Error("bad freeipapi");
    return { ip: d.ipAddress, text: (d.cityName || d.regionName || "") + ", -" };
  }
  // Cloudflare trace：最后兜底，只有 IP
  async function fromCfTrace() {
    const r = await fetch("https://1.1.1.1/cdn-cgi/trace", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const txt = await r.text();
    const m = /^ip=(.+)$/m.exec(txt);
    if (!m) throw new Error("bad cf trace");
    return { ip: m[1].trim(), text: "-" };
  }

  const PROVIDERS = [fromQifu, fromIpApi, fromIpSb, fromIpwhoIs, fromFreeIpApi, fromIpapiCo, fromCfTrace];

  window.Geo = {
    async query(force) {
      const cached = Store.getGeo();
      if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached;
      let lastErr = null;
      for (const p of PROVIDERS) {
        try {
          const info = await p();
          const rec = { ...info, ts: Date.now() };
          Store.setJSON(Store.K.geoCache, rec);
          return rec;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("geo failed");
    }
  };
})();
