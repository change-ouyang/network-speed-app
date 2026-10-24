package com.ouyang.speedcheck;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.junit.Test;

public class MiguSourceResolverTest {
    private static final String HOST = "https://hlszymgspvod.miguvideo.com/asset/";
    private static final String API = "{\"rid\":\"SUCCESS\",\"body\":{\"content\":{\"contId\":\"968151936\",\"drm\":false},"
            + "\"urlInfo\":{\"url\":\"http://gslbmgspvod.miguvideo.com/asset/a.m3u8?puData=0123456789abcdef0123456789abcdef\",\"trySeeDuration\":\"0\"}}}";

    private static class Fixture implements MiguSourceResolver.Transport, MiguSourceResolver.Clock {
        long time = 1791771703000L;
        int calls;
        String response = API;
        String segment = "part.ts?encrypt=a%2Bb&timestamp=1";
        boolean offline;
        public long now() { return time; }
        public MiguSourceResolver.TextResponse get(String url, boolean api, boolean forceHttps) throws Exception {
            calls++;
            // 官方链路（forceHttps=false）保持 GSLB 给的 http；保底链路全 https；play API 恒为 https
            if (api || forceHttps) assertTrue(url.startsWith("https://"));
            else assertTrue(url.startsWith("http://"));
            if (offline) throw new IOException("网络不可达");
            return api ? new MiguSourceResolver.TextResponse(url, response)
                    : new MiguSourceResolver.TextResponse(HOST + "a.m3u8?ticket=x", vod(segment));
        }
    }

    private static String vod(String segment) {
        return "#EXTM3U\n#EXTINF:8,\n" + segment + "\n#EXT-X-ENDLIST\n";
    }

    @Test public void relativeSegmentsUseFinalCdnAndKeepSignature() throws Exception {
        assertEquals(HOST + "part.ts?encrypt=a%2Bb&timestamp=1", MiguSourceResolver.firstResource(
                new MiguSourceResolver.TextResponse(HOST + "a.m3u8?ticket=x", vod("part.ts?encrypt=a%2Bb&timestamp=1")), false));
    }

    @Test public void officialChainKeepsGslbSchemeAndPort() throws Exception {
        // 官方调度链：保留 GSLB 给的 http 与端口，让 302 派发生效（免流池识别的关键）
        assertEquals("http://hlszymgspvod.miguvideo.com:8080/asset/part.ts?token=a%2Bb", MiguSourceResolver.official(
                "http://hlszymgspvod.miguvideo.com:8080/asset/part.ts?token=a%2Bb", false));
    }

    @Test public void fallbackUpgradesHttpWithoutChangingRawQuery() throws Exception {
        assertEquals(HOST + "part.ts?token=a%2Bb", MiguSourceResolver.official(
                "http://hlszymgspvod.miguvideo.com:8080/asset/part.ts?token=a%2Bb", true));
    }

    @Test public void rejectsLookalikeDomainsAndUserInfo() {
        for (String url : new String[]{"https://miguvideo.com.evil.example/a.ts", "https://example.com/a.ts", "https://u@hlszymgspvod.miguvideo.com/a.ts"}) {
            assertThrows(Exception.class, () -> MiguSourceResolver.official(url, false));
        }
    }

    @Test public void rejectsHtmlEncryptedLiveAndEmptyPlaylists() {
        for (String content : new String[]{"<html>error</html>", "#EXTM3U\n", "#EXTM3U\n#EXTINF:8,\na.ts", vod("a.ts") + "#EXT-X-KEY:METHOD=AES-128,URI=\"k\""}) {
            assertThrows(IOException.class, () -> MiguSourceResolver.firstResource(new MiguSourceResolver.TextResponse(HOST + "a.m3u8", content), false));
        }
    }

    @Test public void handlesMasterPlaylist() throws Exception {
        assertEquals(HOST + "low/index.m3u8", MiguSourceResolver.firstResource(new MiguSourceResolver.TextResponse(
                HOST + "master.m3u8", "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nlow/index.m3u8\n"), false));
    }

    @Test public void signsAnonymousAddressWithoutReencoding() throws Exception {
        String url = "http://gslbmgspvod.miguvideo.com/a.m3u8?x=a%2Bb&puData=0123456789abcdef0123456789abcdef";
        assertEquals(url + "&ddCalcu=f0e1vd2ac3lb4aa5968778695a4b3c2d1e0f&sv=10004&ct=android",
                MiguSourceResolver.signMediaUrl(url, "968151936", 1791771703000L));
    }

    @Test public void sharesResolutionAcrossWorkersAndRefreshesAfterExpiry() throws Exception {
        Fixture f = new Fixture();
        MiguSourceResolver resolver = new MiguSourceResolver(f, f);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Callable<String>> work = new ArrayList<>();
            for (int i = 0; i < 32; i++) work.add(resolver::mediaUrl);
            for (Future<String> result : pool.invokeAll(work)) assertEquals(HOST + f.segment, result.get());
            assertEquals(2, f.calls);
            f.time += 10 * 60 * 1000L + 1;
            resolver.mediaUrl();
            assertEquals(4, f.calls);
        } finally { pool.shutdownNow(); }
    }

    @Test public void refreshesRejectedAddressAndIgnoresLateOldRejection() throws Exception {
        Fixture f = new Fixture();
        MiguSourceResolver resolver = new MiguSourceResolver(f, f);
        String old = resolver.mediaUrl();
        f.time += 5001;
        resolver.invalidate(old);
        f.segment = "new.ts?encrypt=new";
        String fresh = resolver.mediaUrl();
        assertNotEquals(old, fresh);
        resolver.invalidate(old);
        assertEquals(fresh, resolver.mediaUrl());
        assertEquals(4, f.calls);
    }

    @Test public void throttlesFailuresAndRecovers() throws Exception {
        Fixture f = new Fixture();
        f.offline = true;
        MiguSourceResolver resolver = new MiguSourceResolver(f, f);
        for (int i = 0; i < 32; i++) assertThrows(IOException.class, resolver::mediaUrl);
        // 传输类失败：官方 http 链 + https 保底链各尝试一次后进入退避
        assertEquals(2, f.calls);
        f.offline = false;
        f.time += 5001;
        assertEquals(HOST + f.segment, resolver.mediaUrl());
        assertEquals(4, f.calls);
    }

    @Test public void fallsBackToHttpsWhenOfficialChainTransportFails() throws Exception {
        // 官方 http 链路传输失败（如网络禁明文 8080）→ 自动走 https 保底链并成功
        Fixture f = new Fixture() {
            @Override public MiguSourceResolver.TextResponse get(String url, boolean api, boolean forceHttps) throws Exception {
                if (!api && !forceHttps) throw new IOException("明文被策略拦截");
                return super.get(url, api, forceHttps);
            }
        };
        MiguSourceResolver resolver = new MiguSourceResolver(f, f);
        assertEquals(HOST + f.segment, resolver.mediaUrl());
        assertEquals(3, f.calls);
    }

    @Test public void rejectsRestrictedOrDifferentContent() {
        for (String response : new String[]{API.replace("false", "true"), API.replace("\"0\"", "\"60\""), API.replace("968151936", "111111111"), "{\"rid\":\"TIPS_NEED_MEMBER\"}"}) {
            Fixture f = new Fixture();
            f.response = response;
            assertThrows(IOException.class, new MiguSourceResolver(f, f)::mediaUrl);
            // 内容策略类错误：换传输方式结果相同，不浪费 https 回退请求
            assertEquals(1, f.calls);
        }
    }

    @Test public void interruptedWorkerDoesNotStartAnyRequest() {
        Fixture f = new Fixture();
        Thread.currentThread().interrupt();
        try { assertThrows(IOException.class, new MiguSourceResolver(f, f)::mediaUrl); }
        finally { Thread.interrupted(); }
        assertEquals(0, f.calls);
    }

    @Test public void otherNodesRemainUnchanged() throws Exception {
        String url = "https://example.com/file.mp4";
        assertEquals(url, MiguSourceResolver.resolve(url));
    }

    // ---------- 咪咕音乐动态节点 ----------

    /** 逆运算构造混淆响应：AB CD 01 盐值 + (明文 - 盐值 + 密钥) 逐字节模 256。 */
    private static byte[] obfuscate(String json) {
        byte[] plain = json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] key = "Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        out.write(0xAB); out.write(0xCD); out.write(1); out.write(0x7C);
        for (int i = 0; i < plain.length; i++) out.write((plain[i] - 0x7C + key[i % key.length]) & 255);
        return out.toByteArray();
    }

    private static final String MUSIC_URL =
            "https://freetyst.nf.migu.cn/public/product9th/product45/60054704037163944.mp3?Tim=1&Key=2";
    private static final String MUSIC_JSON =
            "{\"code\":\"000000\",\"info\":\"成功\",\"data\":{\"url\":\"" + MUSIC_URL + "\"}}";

    private static class MusicFixture implements MiguMusicResolver.Transport, MiguMusicResolver.Clock {
        long time = 1791771703000L;
        int calls;
        String json;          // 显式指定响应；null = 正常签发
        boolean varyUrl;      // 每次签发不同地址（真实接口每次 URL 均不同）
        boolean offline;
        public long now() { return time; }
        public byte[] get(String url) throws Exception {
            calls++;
            assertTrue(url.startsWith("https://c.musicapp.migu.cn/strategy/listen-url/h5/v2.4?"));
            assertTrue(url.contains("contentId=600908000003562466"));
            assertTrue(url.contains("copyrightId=60054704037"));
            if (offline) throw new IOException("网络不可达");
            if (json != null) return obfuscate(json);
            String media = MUSIC_URL + (varyUrl ? "&v=" + calls : "");
            return obfuscate("{\"code\":\"000000\",\"info\":\"成功\",\"data\":{\"url\":\"" + media + "\"}}");
        }
    }

    @Test public void musicDecryptRoundTripsObfuscatedPayload() throws Exception {
        assertEquals(MUSIC_JSON, MiguMusicResolver.decrypt(obfuscate(MUSIC_JSON)));
        assertThrows(IOException.class, () -> MiguMusicResolver.decrypt(new byte[]{0x1A, 0x2B, 0x3C, 0x00, 0x41}));
    }

    @Test public void musicResolvesSignedUrlWithShortCache() throws Exception {
        MusicFixture f = new MusicFixture();
        MiguMusicResolver resolver = new MiguMusicResolver(f, f);
        assertEquals(MUSIC_URL, resolver.mediaUrl());
        assertEquals(MUSIC_URL, resolver.mediaUrl());   // 3 分钟缓存内不重复签发
        assertEquals(1, f.calls);
        f.time += 3 * 60 * 1000L + 1;
        assertEquals(MUSIC_URL, resolver.mediaUrl());
        assertEquals(2, f.calls);
    }

    @Test public void musicRejectedUrlRefreshesAndLateRejectionIsIgnored() throws Exception {
        MusicFixture f = new MusicFixture();
        f.varyUrl = true;
        MiguMusicResolver resolver = new MiguMusicResolver(f, f);
        String old = resolver.mediaUrl();
        f.time += 5001;
        resolver.invalidate(old);
        String fresh = resolver.mediaUrl();   // 重新签发（每次都是新地址）
        assertNotEquals(old, fresh);
        resolver.invalidate(old);             // 迟到的旧拒绝不清新地址
        assertEquals(fresh, resolver.mediaUrl());
        assertEquals(2, f.calls);
    }

    @Test public void musicRejectsNonOfficialOrNonAudioUrls() {
        for (String url : new String[]{
                "https://evil.example/song.mp3",
                "http://freetyst.nf.migu.cn/x/song.mp3",
                "https://freetyst.nf.migu.cn/x/seg.ts",
                "https://u@freetyst.nf.migu.cn/x/song.mp3"}) {
            assertThrows(Exception.class, () -> MiguMusicResolver.validateMediaUrl(url));
        }
    }

    @Test public void musicContentErrorsThrottleWithoutRetry() throws Exception {
        MusicFixture f = new MusicFixture();
        f.json = "{\"code\":\"299996\",\"info\":\"路由请求不支持\",\"data\":null}";
        MiguMusicResolver resolver = new MiguMusicResolver(f, f);
        assertThrows(IOException.class, resolver::mediaUrl);
        assertThrows(IOException.class, resolver::mediaUrl);   // 退避窗口内不再请求
        assertEquals(1, f.calls);
        f.time += 5001;
        f.json = MUSIC_JSON;
        assertEquals(MUSIC_URL, resolver.mediaUrl());
        assertEquals(2, f.calls);
    }

    @Test public void musicEmptyUrlIsContentErrorNotTransport() throws Exception {
        MusicFixture f = new MusicFixture();
        f.json = "{\"code\":\"000000\",\"info\":\"成功\",\"data\":{\"url\":\"\"}}";
        MiguMusicResolver resolver = new MiguMusicResolver(f, f);
        assertThrows(IOException.class, resolver::mediaUrl);
        assertEquals(1, f.calls);   // 内容策略类错误不重试传输
    }

    @Test public void musicSourceIsRecognizedByDispatch() {
        assertTrue(MiguSourceResolver.matches(MiguMusicResolver.SOURCE_URL));
        assertFalse(MiguSourceResolver.matches("https://music.migu.cn/v3/web/song/000000000000000000"));
    }
}
