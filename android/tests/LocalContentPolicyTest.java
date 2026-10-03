package life.breeze.trexjelly;

/** No emulator or test-library dependency: exercise the exact URL allowlist on a JVM. */
public final class LocalContentPolicyTest {
    public static void main(String[] arguments) {
        String home = LocalContentPolicy.HOME_URL;
        check(LocalContentPolicy.allowsRequest(home, "GET"), "packaged document GET");
        String[] blocked = {
                null, "", "https://example.com/index.html", "http://appassets.androidplatform.net/index.html",
                "https://appassets.androidplatform.net/index.html?remote=true",
                "https://appassets.androidplatform.net/index.html#section",
                "https://appassets.androidplatform.net/index.html/anything",
                "https://appassets.androidplatform.net:443/index.html",
                "https://appassets.androidplatform.net.evil.example/index.html",
                "https://appassets.androidplatform.net@evil.example/index.html",
                "https://appassets.androidplatform.net/%69ndex.html",
                "https://appassets.androidplatform.net/../index.html",
                "https://appassets.androidplatform.net/other.html",
                "file:///android_asset/index.html", "content://provider/index.html",
                "javascript:alert(1)", "data:text/html,hello", "intent://anything"
        };
        for (String url : blocked) check(!LocalContentPolicy.allowsDocument(url), "blocked URL: " + url);
        for (String method : new String[]{null, "POST", "PUT", "HEAD", "get"}) {
            check(!LocalContentPolicy.allowsRequest(home, method), "blocked method: " + method);
        }
        System.out.println("LocalContentPolicy: 24 allowlist checks passed.");
    }

    private static void check(boolean result, String name) {
        if (!result) throw new AssertionError(name);
    }
}
