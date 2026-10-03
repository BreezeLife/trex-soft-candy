package life.breeze.trexjelly;

/** The packaged page is the only allowed network-shaped URL. */
final class LocalContentPolicy {
    static final String HOME_URL = "https://appassets.androidplatform.net/index.html";

    private LocalContentPolicy() {}

    static boolean allowsDocument(String url) {
        return HOME_URL.equals(url);
    }

    static boolean allowsRequest(String url, String method) {
        return "GET".equals(method) && allowsDocument(url);
    }
}
