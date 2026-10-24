package com.ouyang.speedcheck;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * 咪咕免费视频动态节点：只取匿名可看的短视频，媒体始终由手机直连官方 CDN。
 * 协议流程参考 https://github.com/akiralereal/iptv/tree/main/extractors/migu 。
 * 不保存账号、签名地址或客户端 IP；缓存仅存在当前进程内。
 */
public final class MiguSourceResolver {
    public static final String SOURCE_URL = "https://www.miguvideo.com/p/vertical/968151936";
    private static final String CONTENT_ID = "968151936";
    private static final long CACHE_MS = 10 * 60 * 1000L;
    private static final long RETRY_MS = 5000L;
    private static final MiguSourceResolver SHARED = new MiguSourceResolver(
            new HttpsTransport(), System::currentTimeMillis);

    interface Clock { long now(); }
    interface Transport { TextResponse get(String url, boolean api, boolean forceHttps) throws Exception; }

    static final class TextResponse {
        final String url;
        final String text;
        TextResponse(String url, String text) { this.url = url; this.text = text; }
    }

    private final Transport transport;
    private final Clock clock;
    private String cachedUrl;
    private long expiresAt;
    private long retryAt;
    private String lastError;

    MiguSourceResolver(Transport transport, Clock clock) {
        this.transport = transport;
        this.clock = clock;
    }

    public static boolean matches(String url) { return SOURCE_URL.equals(url); }

    public static String resolve(String source) throws Exception {
        return matches(source) ? SHARED.mediaUrl() : source;
    }

    public static void rejected(String source, String mediaUrl) {
        if (matches(source)) SHARED.invalidate(mediaUrl);
    }

    // 只作废实际被拒绝的那一代地址；旧线程迟到的 403 不能清掉新地址。
    synchronized void invalidate(String mediaUrl) {
        if (mediaUrl != null && mediaUrl.equals(cachedUrl)) {
            cachedUrl = null;
            expiresAt = 0;
            lastError = "咪咕视频地址已失效，正在重新获取";
        }
    }

    // 前台桥与后台所有线程共用缓存，同时到达时只向官网解析一次。
    // 两级策略：先按官方链路原样走（http 也照发，让 GSLB 302 把我们派到运营商免流池）；
    // 传输类失败（网络禁明文 8080、超时等）再回退到全 https 链路保底。
    // 内容策略类错误（DRM/节目不匹配等）换 https 也不会变，不浪费回退请求。
    synchronized String mediaUrl() throws Exception {
        checkInterrupted();
        long now = clock.now();
        if (cachedUrl != null && now < expiresAt) return cachedUrl;
        if (now < retryAt) throw new IOException(lastError);
        try {
            return resolveChain(now, false);
        } catch (ContentException e) {
            cachedUrl = null;
            lastError = e.getMessage();
            retryAt = clock.now() + RETRY_MS;
            throw new IOException(lastError, e);
        } catch (Exception first) {
            checkInterrupted();
            try {
                return resolveChain(now, true);
            } catch (Exception second) {
                cachedUrl = null;
                lastError = second instanceof IOException ? second.getMessage() : "咪咕播放数据格式已变化，请稍后重试";
                retryAt = clock.now() + RETRY_MS;
                throw new IOException(lastError, second);
            }
        }
    }

    /** 内容策略类失败：换传输方式（http/https）结果相同，不值得重试另一条链。 */
    private static final class ContentException extends IOException {
        ContentException(String message) { super(message); }
    }

    private String resolveChain(long now, boolean forceHttps) throws Exception {
        TextResponse api = transport.get(playUrlRequest(now), true, forceHttps);
        JSONObject response = new JSONObject(api.text);
        JSONObject body = object(response, "body");
        JSONObject info = object(body, "urlInfo");
        JSONObject content = object(body, "content");
        if (!"SUCCESS".equals(response.optString("rid")) || info == null || content == null) {
            throw new ContentException("咪咕暂未提供该免费视频，请稍后重试");
        }
        if (Boolean.TRUE.equals(content.opt("drm")) || Boolean.TRUE.equals(content.opt("isDrmContent"))
                || positive(info.optString("trySeeDuration"))) {
            throw new ContentException("咪咕返回了受限内容，已停止解析");
        }
        String contentId = content.optString("contId");
        if (!CONTENT_ID.equals(contentId)) throw new ContentException("咪咕返回的节目不匹配");
        String signed = signMediaUrl(info.getString("url"), contentId, now);
        TextResponse playlist = transport.get(official(signed, forceHttps), false, forceHttps);
        // 最多两层主清单；分片相对路径必须以重定向后的最终 URL 为基准。
        for (int level = 0; level < 3; level++) {
            String resource = firstResource(playlist, forceHttps);
            if (new URL(resource).getPath().endsWith(".ts")) {
                checkInterrupted();
                cachedUrl = resource;
                expiresAt = clock.now() + CACHE_MS;
                retryAt = clock.now() + RETRY_MS;
                lastError = null;
                return cachedUrl;
            }
            playlist = transport.get(resource, false, forceHttps);
        }
        throw new IOException("咪咕视频清单层级异常");
    }

    private static JSONObject object(JSONObject value, String name) {
        Object child = value == null ? null : value.opt(name);
        return child instanceof JSONObject ? (JSONObject) child : null;
    }

    private static boolean positive(String value) {
        try { return Double.parseDouble(value) > 0; } catch (Exception ignored) { return false; }
    }

    static String playUrlRequest(long now) throws Exception {
        String salt = String.format(Locale.ROOT, "%06d25", new SecureRandom().nextInt(1000000));
        String first = md5(Long.toString(now) + CONTENT_ID + "26000346");
        String sign = md5(first + "2cac4f2c6c3346a5b34e085725ef7e33migu" + salt.substring(0, 4));
        return "https://play.miguvideo.com/playurl/v1/play/playurl?sign=" + sign
                + "&rateType=3&contId=" + CONTENT_ID + "&timestamp=" + now + "&salt=" + salt
                + "&flvEnable=true&super4k=true";
    }

    private static String md5(String text) throws Exception {
        byte[] digest = MessageDigest.getInstance("MD5").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(32);
        for (byte b : digest) result.append(String.format(Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }

    static String signMediaUrl(String url, String contentId, long now) throws Exception {
        String query = new URL(url).getQuery();
        String puData = null;
        if (query != null) for (String part : query.split("&")) {
            if (part.startsWith("puData=")) puData = part.substring(7);
        }
        if (puData == null || !puData.matches("[a-fA-F0-9]{32}") || !contentId.matches("[0-9]{9,}")) {
            throw new ContentException("咪咕播放参数已变化");
        }
        SimpleDateFormat date = new SimpleDateFormat("yyyyMMdd", Locale.ROOT);
        date.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        String keys = "cdabyzwxkl";
        StringBuilder value = new StringBuilder(36);
        for (int i = 0; i < 16; i++) {
            value.append(puData.charAt(31 - i)).append(puData.charAt(i));
            if (i == 1) value.append('v');
            if (i == 2) value.append(keys.charAt(date.format(new Date(now)).charAt(2) - '0'));
            if (i == 3) value.append(keys.charAt(contentId.charAt(6) - '0'));
            if (i == 4) value.append('a');
        }
        // 原样保留上游查询串，不能二次编码已有签名。
        return url + "&ddCalcu=" + value + "&sv=10004&ct=android";
    }

    /**
     * 只放行咪咕官方域，防重定向外逃。默认保持 GSLB 给的原始协议与端口——
     * 官方调度链是 http（常见 :8080），强制升级 https 会绕过 302 派发、
     * 落到公共 CDN 池（不计运营商定向流量）；forceHttps=true 时才升级（保底链路）。
     */
    static String official(String raw, boolean forceHttps) throws Exception {
        URL url = new URL(raw);
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if (!(host.equals("miguvideo.com") || host.endsWith(".miguvideo.com"))
                || !(url.getProtocol().equals("http") || url.getProtocol().equals("https"))
                || url.getUserInfo() != null) throw new ContentException("咪咕返回了非官方资源地址");
        if (forceHttps && url.getProtocol().equals("http")) {
            return "https://" + host + url.getFile();
        }
        return raw;
    }

    static String firstResource(TextResponse playlist, boolean forceHttps) throws Exception {
        String text = playlist.text.trim();
        if (!text.startsWith("#EXTM3U")) throw new IOException("咪咕未返回有效的视频清单");
        for (String line : text.split("\\r?\\n")) {
            if (line.startsWith("#EXT-X-KEY:") && !line.contains("METHOD=NONE")) {
                throw new IOException("咪咕返回了加密视频，已停止解析");
            }
        }
        boolean master = text.contains("#EXT-X-STREAM-INF:");
        if (!master && (!text.contains("#EXTINF:") || !text.contains("#EXT-X-ENDLIST"))) {
            throw new IOException("咪咕未返回点播视频分片");
        }
        for (String line : text.split("\\r?\\n")) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String resource = official(new URL(new URL(playlist.url), line).toString(), forceHttps);
            String path = new URL(resource).getPath();
            if ((master && path.endsWith(".m3u8")) || (!master && path.endsWith(".ts"))) return resource;
            throw new IOException("咪咕视频分片格式暂不支持");
        }
        throw new IOException("咪咕视频清单为空");
    }

    private static void checkInterrupted() throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new IOException("咪咕解析已取消");
    }

    private static final class HttpsTransport implements Transport {
        @Override
        public TextResponse get(String raw, boolean api, boolean forceHttps) throws Exception {
            String target = official(raw, forceHttps);
            long deadline = System.nanoTime() + 15_000_000_000L;
            for (int hop = 0; hop < 5; hop++) {
                checkInterrupted();
                if (System.nanoTime() >= deadline) throw new IOException("咪咕解析超时");
                HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
                try {
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("Accept-Encoding", "identity");
                    if (api) {
                        conn.setRequestProperty("AppVersion", "2600034600");
                        conn.setRequestProperty("TerminalId", "android");
                        conn.setRequestProperty("X-UP-CLIENT-CHANNEL-ID", "2600034600-99000-201600010010028");
                        conn.setRequestProperty("appCode", "miguvideo_default_android");
                    }
                    int status = conn.getResponseCode();
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        String location = conn.getHeaderField("Location");
                        if (location == null) throw new IOException("咪咕调度缺少目标地址");
                        target = official(new URL(new URL(target), location).toString(), forceHttps);
                        continue;
                    }
                    if (status != 200) throw new IOException("咪咕解析请求失败（HTTP " + status + "）");
                    try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[4096];
                        int n;
                        while ((n = in.read(buffer)) != -1) {
                            checkInterrupted();
                            if (System.nanoTime() >= deadline) throw new IOException("咪咕解析超时");
                            if (out.size() + n > 256 * 1024) throw new IOException("咪咕清单大小异常");
                            out.write(buffer, 0, n);
                        }
                        return new TextResponse(target, new String(out.toByteArray(), StandardCharsets.UTF_8));
                    }
                } finally { conn.disconnect(); }
            }
            throw new IOException("咪咕调度跳转次数过多");
        }
    }
}
