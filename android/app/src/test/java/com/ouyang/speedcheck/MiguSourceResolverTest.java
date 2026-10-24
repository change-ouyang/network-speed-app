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
}
