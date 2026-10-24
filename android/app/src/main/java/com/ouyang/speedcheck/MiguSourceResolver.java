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

    public static boolean matches(String url) { return SOURCE_URL.equals(url) || MiguMusicResolver.matches(url); }

    public static String resolve(String source) throws Exception {
        if (MiguMusicResolver.matches(source)) return MiguMusicResolver.sharedMediaUrl();
        return matches(source) ? SHARED.mediaUrl() : source;
    }

    public static void rejected(String source, String mediaUrl) {
        if (MiguMusicResolver.matches(source)) {
            MiguMusicResolver.sharedRejected(mediaUrl);
        } else if (matches(source)) {
            SHARED.invalidate(mediaUrl);
        }
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

/**
 * 咪咕音乐动态节点：H5 播放策略接口（listen-url/h5/v2.4，免签名）按次签发短时效音频直链，
 * 实测约 5 分钟后失效。下载循环里 404 经 {@link MiguSourceResolver#rejected} 作废缓存、
 * 下一轮自动重签，与视频节点同一套生命周期。响应体为私有混淆格式：AB CD 01 盐值 + 密钥
 * 逐字节回滚（密钥取自咪咕 H5 前端），无账号、无设备指纹参与。
 */
final class MiguMusicResolver {
    static final String SOURCE_URL = "https://music.migu.cn/v3/web/song/600908000003562466";
    private static final String CONTENT_ID = "600908000003562466";
    private static final String COPYRIGHT_ID = "60054704037";
    private static final String LISTEN_API = "https://c.musicapp.migu.cn/strategy/listen-url/h5/v2.4";
    private static final String CIPHER_KEY = "Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP";
    private static final String REFERER = "https://y.migu.cn/";
    private static final long CACHE_MS = 3 * 60 * 1000L;
    private static final long RETRY_MS = 5000L;
    private static final MiguMusicResolver SHARED = new MiguMusicResolver(
            new HttpsTransport(), System::currentTimeMillis);

    interface Clock { long now(); }
    interface Transport { byte[] get(String url) throws Exception; }

    /** 内容策略类失败（接口拒签/返回非官方音频）：重试也不会变，直接停节点并给出原因。 */
    private static final class ContentException extends IOException {
        ContentException(String message) { super(message); }
    }

    private final Transport transport;
    private final Clock clock;
    private String cachedUrl;
    private long expiresAt;
    private long retryAt;
    private String lastError;

    MiguMusicResolver(Transport transport, Clock clock) {
        this.transport = transport;
        this.clock = clock;
    }

    static boolean matches(String url) { return SOURCE_URL.equals(url); }

    static String sharedMediaUrl() throws Exception { return SHARED.mediaUrl(); }

    static void sharedRejected(String mediaUrl) { SHARED.invalidate(mediaUrl); }

    synchronized void invalidate(String mediaUrl) {
        if (mediaUrl != null && mediaUrl.equals(cachedUrl)) {
            cachedUrl = null;
            expiresAt = 0;
            lastError = "咪咕音乐地址已失效，正在重新获取";
        }
    }

    synchronized String mediaUrl() throws Exception {
        checkInterrupted();
        long now = clock.now();
        if (cachedUrl != null && now < expiresAt) return cachedUrl;
        if (now < retryAt) throw new IOException(lastError);
        try {
            String media = resolveChain();
            cachedUrl = media;
            expiresAt = clock.now() + CACHE_MS;
            retryAt = clock.now() + RETRY_MS;
            lastError = null;
            return cachedUrl;
        } catch (ContentException e) {
            cachedUrl = null;
            lastError = e.getMessage();
            retryAt = clock.now() + RETRY_MS;
            throw new IOException(lastError, e);
        } catch (Exception e) {
            checkInterrupted();
            cachedUrl = null;
            lastError = (e instanceof IOException && e.getMessage() != null)
                    ? e.getMessage() : "咪咕音乐解析失败，请稍后重试";
            retryAt = clock.now() + RETRY_MS;
            throw new IOException(lastError, e);
        }
    }

    private String resolveChain() throws Exception {
        org.json.JSONObject root = new org.json.JSONObject(decrypt(transport.get(playRequest())));
        if (!"000000".equals(root.optString("code"))) {
            throw new ContentException("咪咕音乐接口：" + root.optString("info", "返回异常"));
        }
        org.json.JSONObject data = root.optJSONObject("data");
        String url = data == null ? "" : data.optString("url", "");
        if (url.isEmpty()) throw new ContentException("咪咕未提供该歌曲的免费播放地址");
        return validateMediaUrl(url);
    }

    static String playRequest() {
        return LISTEN_API + "?contentId=" + CONTENT_ID + "&copyrightId=" + COPYRIGHT_ID
                + "&resourceType=2&netType=01&toneFlag=PQ&scene=&lowerQualityContentId=" + CONTENT_ID;
    }

    /** 混淆响应 → 明文 JSON：头三字节魔数 AB CD 01，第四字节盐值，正文按密钥逐字节回滚（模 256）。 */
    static String decrypt(byte[] data) throws IOException {
        if (data.length < 5 || (data[0] & 255) != 0xAB || (data[1] & 255) != 0xCD || data[2] != 1) {
            throw new ContentException("咪咕音乐响应格式已变化");
        }
        int salt = data[3] & 255;
        byte[] key = CIPHER_KEY.getBytes(StandardCharsets.UTF_8);
        byte[] out = new byte[data.length - 4];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) ((data[4 + i] & 255) + salt - (key[i % key.length] & 255));
        }
        return new String(out, StandardCharsets.UTF_8);
    }

    /** 只放行咪咕官方 https 音频直链（freetyst.nf.migu.cn 等 *.migu.cn）。 */
    static String validateMediaUrl(String raw) throws Exception {
        URL url = new URL(raw);
        String host = url.getHost().toLowerCase(Locale.ROOT);
        String path = url.getPath().toLowerCase(Locale.ROOT);
        if (!url.getProtocol().equals("https") || url.getUserInfo() != null
                || !(host.equals("migu.cn") || host.endsWith(".migu.cn"))
                || !(path.endsWith(".mp3") || path.endsWith(".flac")
                    || path.endsWith(".m4a") || path.endsWith(".aac"))) {
            throw new ContentException("咪咕音乐返回了非官方音频地址");
        }
        return raw;
    }

    private static void checkInterrupted() throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new IOException("咪咕解析已取消");
    }

    private static final class HttpsTransport implements Transport {
        @Override
        public byte[] get(String raw) throws Exception {
            String target = validateApiUrl(raw);
            long deadline = System.nanoTime() + 15_000_000_000L;
            for (int hop = 0; hop < 3; hop++) {
                checkInterrupted();
                if (System.nanoTime() >= deadline) throw new IOException("咪咕音乐解析超时");
                HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
                try {
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("Accept-Encoding", "identity");
                    // H5 页面上下文（birth/channel/Referer）：接口按 H5 免费试听策略签发整曲直链
                    conn.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36");
                    conn.setRequestProperty("Referer", REFERER);
                    conn.setRequestProperty("birth", "h5page");
                    conn.setRequestProperty("channel", "014X031");
                    int status = conn.getResponseCode();
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        String location = conn.getHeaderField("Location");
                        if (location == null) throw new IOException("咪咕音乐调度缺少目标地址");
                        target = validateApiUrl(new URL(new URL(target), location).toString());
                        continue;
                    }
                    if (status != 200) throw new IOException("咪咕音乐接口请求失败（HTTP " + status + "）");
                    try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[4096];
                        int n;
                        while ((n = in.read(buffer)) != -1) {
                            checkInterrupted();
                            if (System.nanoTime() >= deadline) throw new IOException("咪咕音乐解析超时");
                            if (out.size() + n > 256 * 1024) throw new IOException("咪咕音乐响应大小异常");
                            out.write(buffer, 0, n);
                        }
                        return out.toByteArray();
                    }
                } finally { conn.disconnect(); }
            }
            throw new IOException("咪咕音乐调度跳转次数过多");
        }
    }

    private static String validateApiUrl(String raw) throws Exception {
        URL url = new URL(raw);
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if (!url.getProtocol().equals("https") || url.getUserInfo() != null
                || !(host.equals("migu.cn") || host.endsWith(".migu.cn"))) {
            throw new ContentException("咪咕音乐返回了非官方接口地址");
        }
        return raw;
    }
}
