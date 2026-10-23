package no.siqt.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Downloads, which the app could not do at all: "Kan ikke laste ned pdf via mobil fra docs under tasks"
 * (2026-10-20). A WebView hands every download — a link with `download`, a response marked as an
 * attachment, a PDF it cannot show — to its DownloadListener, and Capacitor sets none, so each one was
 * dropped without a word: a doc's PDF and text export, chat and task attachments.
 *
 * This sets that listener, and gives the page the same thing to call directly (download), which the
 * doc export menu uses so it can name the file. Both go through Android's DownloadManager: the file
 * lands in Downloads with the system's own progress notification, and tapping that opens it. The
 * request carries the WebView's cookies, because every file here is behind the session.
 *
 * The page checks for this plugin by name (lib/nativeDownload.ts); an app built before it says so
 * rather than doing nothing. Registered in MainActivity before super.onCreate(), like the others.
 */
@CapacitorPlugin(name = "SiqtDownloads")
public class SiqtDownloadsPlugin extends Plugin {

    @Override
    public void load() {
        WebView webView = getBridge().getWebView();
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            enqueue(url, userAgent, fileName(url, contentDisposition, mimeType), mimeType)
        );
    }

    // Plugin calls arrive on Capacitor's own background thread ("CapacitorPlugins"), and a WebView may
    // only be touched from the main thread — reading its user agent there threw and closed the app:
    // "Kunne ikke laste ned PDF fra Docs inne i task … Appen bare lukka seg" (APK 2.1, 2026-10-23). So
    // the whole download is started on the main thread, which is also where the DownloadListener's
    // calls already come in.
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("A web address is needed");
            return;
        }
        String name = call.getString("filename");
        String mimeType = call.getString("mimeType");
        getBridge().executeOnMainThread(() -> {
            try {
                String userAgent = getBridge().getWebView().getSettings().getUserAgentString();
                boolean ok = enqueue(url, userAgent, name != null && !name.isEmpty() ? clean(name) : fileName(url, null, mimeType), mimeType);
                if (ok) call.resolve();
                else call.reject("Could not start the download");
            } catch (Exception e) {
                call.reject("Could not start the download");
            }
        });
    }

    private boolean enqueue(String url, String userAgent, String name, String mimeType) {
        Context context = getContext();
        // DownloadManager fetches over the network itself; a blob: or data: address only exists inside
        // the page. Nothing in the app links to one today.
        if (!(url.startsWith("https://") || url.startsWith("http://"))) {
            toast(context, "This file can't be downloaded in the app");
            return false;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);
            request.setTitle(name);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            // The shared Downloads folder needs no permission from Android 10 on. Before that it would
            // need storage permission, so older phones keep the file in the app's own Downloads folder,
            // still opened from the notification.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            } else {
                request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, name);
            }
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            toast(context, "Downloading " + name);
            return true;
        } catch (Exception e) {
            toast(context, "Could not download " + name);
            return false;
        }
    }

    private static final Pattern FILENAME_STAR = Pattern.compile("filename\\*\\s*=\\s*(?:UTF-8|utf-8)''([^;]+)");
    private static final Pattern FILENAME = Pattern.compile("filename\\s*=\\s*\"?([^\";]+)\"?");

    // The name the server gave the file: the UTF-8 one (filename*) first, as the plain one has its
    // æøå and dashes replaced so that it fits in a header; Android's own guess last.
    private static String fileName(String url, String contentDisposition, String mimeType) {
        if (contentDisposition != null) {
            Matcher star = FILENAME_STAR.matcher(contentDisposition);
            if (star.find()) {
                try {
                    return clean(URLDecoder.decode(star.group(1).trim().replace("+", "%2B"), "UTF-8"));
                } catch (Exception ignored) {
                    // Falls through to the plain name.
                }
            }
            Matcher plain = FILENAME.matcher(contentDisposition);
            if (plain.find()) return clean(plain.group(1).trim());
        }
        return clean(URLUtil.guessFileName(url, contentDisposition, mimeType));
    }

    private static String clean(String name) {
        String safe = name.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
        return safe.isEmpty() ? "download" : safe;
    }

    private static void toast(Context context, String text) {
        Toast.makeText(context, text, Toast.LENGTH_SHORT).show();
    }
}
