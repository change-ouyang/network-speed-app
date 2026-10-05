// IP 归属查询：原站走 EdgeOne 边缘 /geo，App 端改为通用直连接口（CapacitorHttp 无跨域限制）
// 优先国内可达源，失败依次回退；结果缓存 10 分钟
(function () {
  "use strict";

  const CACHE_MS = 10 * 60 * 1000;

  async function fetchJSON(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 5000);
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
    return { ip: d.ip, text: (d.data && d.data.dist ? d.data.dist : (d.data && d.data.city) || "") + ", " + ((d.data && d.data.isp) || "") };
  }
  // ip-api.com（免费版 http）
  async function fromIpApi() {
    const d = await fetchJSON("http://ip-api.com/json/?lang=zh-CN&fields=query,country,city,isp");
    if (!d || !d.query) throw new Error("bad ip-api");
    return { ip: d.query, text: (d.city || d.country || "") + ", " + (d.isp || "") };
  }
  // ipapi.co（https）
  async function fromIpapiCo() {
    const d = await fetchJSON("https://ipapi.co/json/");
    if (!d || !d.ip) throw new Error("bad ipapi.co");
    return { ip: d.ip, text: (d.city || "") + ", " + (d.org || "") };
  }

  const PROVIDERS = [fromQifu, fromIpApi, fromIpapiCo];

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
