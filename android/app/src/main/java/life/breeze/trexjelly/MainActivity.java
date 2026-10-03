package life.breeze.trexjelly;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Offline, single-document host. All game and rendering logic stays in index.html. */
public final class MainActivity extends Activity {
    private FrameLayout content;
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private AlertDialog engineError;
    private boolean backPending;
    private OnBackInvokedCallback backCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        content = new FrameLayout(this);
        content.setBackgroundColor(getColor(R.color.jelly_sky));
        setContentView(content);
        configureWindowInsets();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        createWebView();
    }

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    private void createWebView() {
        try {
            WebView.setWebContentsDebuggingEnabled(false);
            webView = new WebView(this);
            webView.resumeTimers();
            webView.setBackgroundColor(Color.TRANSPARENT);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setVerticalScrollBarEnabled(false);
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true); // The page stores its language preference.
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            settings.setBlockNetworkLoads(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setGeolocationEnabled(false);
            settings.setMediaPlaybackRequiresUserGesture(true);
            settings.setSafeBrowsingEnabled(true);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(false);
            settings.setSupportZoom(false); // The HTML handles two-pointer camera zoom.
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            CookieManager.getInstance().setAcceptCookie(false);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
            ServiceWorkerController workers = ServiceWorkerController.getInstance();
            workers.getServiceWorkerWebSettings().setAllowFileAccess(false);
            workers.getServiceWorkerWebSettings().setAllowContentAccess(false);
            workers.getServiceWorkerWebSettings().setBlockNetworkLoads(true);
            workers.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return blockedResponse();
                }
            });
            webView.setWebViewClient(new LocalPageClient());
            webView.setWebChromeClient(new PlayChromeClient());
            webView.setDownloadListener((url, agent, disposition, type, length) -> {
                // The self-contained toy has no downloads or external navigation.
            });
            content.addView(webView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            webView.loadUrl(LocalContentPolicy.HOME_URL);
        } catch (RuntimeException error) {
            releaseWebView();
            showEngineError();
        }
    }

    private final class LocalPageClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !request.isForMainFrame()
                    || !LocalContentPolicy.allowsRequest(request.getUrl().toString(), request.getMethod());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !LocalContentPolicy.allowsDocument(url);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()
                    || !LocalContentPolicy.allowsRequest(request.getUrl().toString(), request.getMethod())) {
                return blockedResponse();
            }
            try {
                return new WebResourceResponse("text/html", "UTF-8", 200, "OK",
                        documentHeaders(), getAssets().open("index.html"));
            } catch (IOException error) {
                return textResponse(500, "Missing packaged page",
                        "The packaged index.html is missing. Rebuild T-Rex Jelly from its project.");
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view == webView) {
                hideCustomView();
                releaseWebView();
                showEngineError();
            } else {
                view.destroy();
            }
            return true;
        }
    }

    private static Map<String, String> documentHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; "
                + "style-src 'unsafe-inline'; img-src data:; connect-src 'none'; "
                + "object-src 'none'; frame-src 'none'; frame-ancestors 'none'; "
                + "worker-src 'none'; base-uri 'none'; form-action 'none'");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Referrer-Policy", "no-referrer");
        headers.put("Cache-Control", "no-store");
        return headers;
    }

    private static WebResourceResponse blockedResponse() {
        return textResponse(403, "Blocked", "This app only opens its packaged jelly page.");
    }

    private static WebResourceResponse textResponse(int code, String reason, String text) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason,
                documentHeaders(), new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
    }

    private final class PlayChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin,
                GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null || view.getParent() != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            if (webView != null) webView.setVisibility(View.GONE);
            content.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            setSystemBarsHidden(true);
        }

        @Override
        public void onHideCustomView() {
            hideCustomView();
        }
    }

    private void hideCustomView() {
        if (customView == null) return;
        View previous = customView;
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customView = null;
        customViewCallback = null;
        content.removeView(previous);
        if (webView != null) webView.setVisibility(View.VISIBLE);
        setSystemBarsHidden(false);
        if (callback != null) callback.onCustomViewHidden();
    }

    @SuppressWarnings("deprecation")
    private void configureWindowInsets() {
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout());
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28) {
                    DisplayCutout cutout = insets.getDisplayCutout();
                    if (cutout != null) {
                        left = Math.max(left, cutout.getSafeInsetLeft());
                        top = Math.max(top, cutout.getSafeInsetTop());
                        right = Math.max(right, cutout.getSafeInsetRight());
                        bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                    }
                }
            }
            view.setPadding(left, top, right, bottom);
            // The root reserves the space once; do not inset the WebView twice.
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        content.requestApplyInsets();
    }

    @SuppressWarnings("deprecation")
    private void setSystemBarsHidden(boolean hidden) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (hidden) controller.hide(WindowInsets.Type.systemBars());
                else controller.show(WindowInsets.Type.systemBars());
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            if (hidden) flags |= View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        content.requestApplyInsets();
    }

    private void handleBack() {
        if (customView != null) {
            hideCustomView();
            return;
        }
        if (webView == null) {
            finish();
            return;
        }
        if (backPending) {
            // A stalled page must not trap Android's Back action while its callback is pending.
            finish();
            return;
        }
        backPending = true;
        // Fixed DOM commands call the existing page controls; no JavaScript bridge or game fork.
        webView.evaluateJavascript("(function(){"
                + "var panel=document.getElementById('tuningPanel');"
                + "if(panel&&!panel.hidden){document.getElementById('tuningClose').click();return true;}"
                + "if(document.documentElement.classList.contains('immersive')){"
                + "document.getElementById('fullscreen').click();return true;}return false;})()", result -> {
            backPending = false;
            if (!isFinishing() && !isDestroyed() && !"true".equals(result)) finish();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        clearPageInteraction();
        content.requestApplyInsets(); // Keep the existing WebView and soft-body state on rotation.
    }

    private void clearPageInteraction() {
        if (webView != null) {
            // Reuse the page's own cancellation handler, including pointer capture cleanup.
            webView.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (!focused) clearPageInteraction();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            clearPageInteraction();
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    private void releaseWebView() {
        if (webView == null) return;
        WebView previous = webView;
        webView = null;
        backPending = false;
        content.removeView(previous);
        previous.resumeTimers(); // Timers are process-wide; never leave a replacement paused.
        previous.stopLoading();
        previous.setWebChromeClient(null);
        previous.setWebViewClient(new WebViewClient());
        previous.destroy();
    }

    private void showEngineError() {
        if (isFinishing() || isDestroyed() || engineError != null) return;
        engineError = new AlertDialog.Builder(this)
                .setTitle(R.string.engine_error_title)
                .setMessage(R.string.engine_error_message)
                .setPositiveButton(R.string.action_retry, (dialog, which) -> {
                    engineError = null;
                    createWebView();
                })
                .setNegativeButton(R.string.action_close, (dialog, which) -> finish())
                .setCancelable(false)
                .create();
        engineError.setOnDismissListener(dialog -> {
            if (engineError == dialog) engineError = null;
        });
        engineError.show();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        if (engineError != null) engineError.dismiss();
        hideCustomView();
        releaseWebView();
        super.onDestroy();
    }
}
