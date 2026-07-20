package com.buildwclaude.photos;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Size;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    private static final int REQ_MEDIA = 1;
    private static final String APP_URL = "https://appassets.androidx.dev/assets/www/index.html";

    private WebView web;
    private WebViewAssetLoader assetLoader;

    private String[] perms() {
        if (Build.VERSION.SDK_INT >= 33) {
            return new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO};
        }
        return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
    }

    private boolean hasPerm() {
        // Android 14+ "partial access": user picked specific photos — that
        // grants READ_MEDIA_VISUAL_USER_SELECTED and MediaStore returns them
        if (Build.VERSION.SDK_INT >= 34 && checkSelfPermission(
                "android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        for (String p : perms()) {
            if (checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED) return true;
        }
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/thumb/", new ThumbHandler())
                .addPathHandler("/media/", new MediaHandler())
                .build();

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebView view, @NonNull WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onReceivedError(@NonNull WebView view, @NonNull WebResourceRequest request,
                                        @NonNull androidx.webkit.WebResourceErrorCompat error) {
                if (request.isForMainFrame()) {
                    String detail = "";
                    try {
                        if (androidx.webkit.WebViewFeature.isFeatureSupported(
                                androidx.webkit.WebViewFeature.WEB_RESOURCE_ERROR_GET_DESCRIPTION)) {
                            detail = String.valueOf(error.getDescription());
                        }
                    } catch (Exception ignored) { }
                    showError("Load error", request.getUrl().toString(), detail);
                }
            }

            @Override
            public void onReceivedHttpError(@NonNull WebView view, @NonNull WebResourceRequest request,
                                            @NonNull WebResourceResponse errorResponse) {
                if (request.isForMainFrame()) {
                    showError("HTTP " + errorResponse.getStatusCode(), request.getUrl().toString(), "");
                }
            }
        });

        web.addJavascriptInterface(new Bridge(), "NativeGallery");

        // load immediately so the screen is never an empty black void;
        // the permission dialog (if needed) appears on top of the app
        load();
        if (!hasPerm()) {
            requestPermissions(perms(), REQ_MEDIA);
        }
    }

    private void load() {
        web.loadUrl(APP_URL);
    }

    private void showError(String title, String url, String detail) {
        String html = "<html><body style=\"background:#000;color:#ff6b6b;font-family:monospace;padding:40px 18px\">"
                + "<h3 style=\"color:#fff\">" + title + "</h3>"
                + "<p style=\"word-break:break-all\">" + url + "</p>"
                + "<p>" + detail + "</p>"
                + "<p style=\"color:#888\">Screenshot this and send it to Claude.</p></body></html>";
        runOnUiThread(() -> web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null));
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] p, @NonNull int[] res) {
        // reload once access is granted so real photos replace the demo set
        if (hasPerm()) web.reload();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.handleBack&&window.handleBack()?1:0", v -> {
            if (!"1".equals(v)) finish();
        });
    }

    /* ------------ JS bridge ------------ */

    private class Bridge {

        @JavascriptInterface
        public String getState() {
            return hasPerm() ? "granted" : "denied";
        }

        @JavascriptInterface
        public void requestPermission() {
            runOnUiThread(() -> requestPermissions(perms(), REQ_MEDIA));
        }

        @JavascriptInterface
        public String getMedia() {
            JSONArray arr = new JSONArray();
            if (!hasPerm()) return arr.toString();
            Uri uri = MediaStore.Files.getContentUri("external");
            String[] proj = {
                    MediaStore.Files.FileColumns._ID,
                    MediaStore.Files.FileColumns.MEDIA_TYPE,
                    MediaStore.MediaColumns.DATE_TAKEN,
                    MediaStore.MediaColumns.DATE_ADDED,
                    MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
                    MediaStore.MediaColumns.DURATION,
                    MediaStore.MediaColumns.WIDTH,
                    MediaStore.MediaColumns.HEIGHT,
            };
            String sel = MediaStore.Files.FileColumns.MEDIA_TYPE + " IN ("
                    + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE + ","
                    + MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO + ")";
            try (Cursor c = getContentResolver().query(uri, proj, sel, null,
                    MediaStore.MediaColumns.DATE_ADDED + " ASC")) {
                if (c == null) return arr.toString();
                while (c.moveToNext()) {
                    try {
                        boolean video = c.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
                        long taken = c.getLong(2);
                        long added = c.getLong(3) * 1000L;
                        JSONObject o = new JSONObject();
                        o.put("id", c.getLong(0));
                        o.put("type", video ? "video" : "photo");
                        o.put("date", taken > 0 ? taken : added);
                        o.put("album", c.isNull(4) ? "Other" : c.getString(4));
                        o.put("duration", c.getLong(5));
                        o.put("w", c.getInt(6));
                        o.put("h", c.getInt(7));
                        arr.put(o);
                    } catch (Exception ignored) { }
                }
            } catch (Exception ignored) { }
            return arr.toString();
        }

        @JavascriptInterface
        public void haptic(String type) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                switch (type == null ? "tick" : type) {
                    case "heavy":
                        v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK));
                        break;
                    case "click":
                        v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK));
                        break;
                    case "double":
                        v.vibrate(VibrationEffect.createWaveform(new long[]{0, 12, 60, 14}, -1));
                        break;
                    case "warn":
                        v.vibrate(VibrationEffect.createWaveform(new long[]{0, 24, 50, 24}, -1));
                        break;
                    default:
                        v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
                }
            } catch (Exception ignored) { }
        }
    }

    /* ------------ media streaming ------------ */

    private static long parseId(String path) {
        // path looks like "img/123" or "vid/123"
        StringBuilder digits = new StringBuilder();
        for (int i = 4; i < path.length(); i++) {
            char ch = path.charAt(i);
            if (ch < '0' || ch > '9') break;
            digits.append(ch);
        }
        return Long.parseLong(digits.toString());
    }

    private static Uri mediaUri(String path) {
        long id = parseId(path);
        return path.startsWith("vid/")
                ? ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                : ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
    }

    private static Map<String, String> cacheHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "max-age=31536000, immutable");
        return h;
    }

    /** /thumb/img/{id} and /thumb/vid/{id} — 360px JPEG thumbnails */
    private class ThumbHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(@NonNull String path) {
            try {
                Bitmap b = getContentResolver().loadThumbnail(mediaUri(path), new Size(360, 360), null);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.JPEG, 82, out);
                WebResourceResponse r = new WebResourceResponse(
                        "image/jpeg", null, new ByteArrayInputStream(out.toByteArray()));
                r.setResponseHeaders(cacheHeaders());
                return r;
            } catch (Exception e) {
                return new WebResourceResponse("text/plain", null, new ByteArrayInputStream(new byte[0]));
            }
        }
    }

    /** /media/img/{id} and /media/vid/{id} — full-size originals */
    private class MediaHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(@NonNull String path) {
            try {
                Uri uri = mediaUri(path);
                String mime = getContentResolver().getType(uri);
                InputStream in = getContentResolver().openInputStream(uri);
                WebResourceResponse r = new WebResourceResponse(
                        mime != null ? mime : "application/octet-stream", null, in);
                r.setResponseHeaders(cacheHeaders());
                return r;
            } catch (Exception e) {
                return new WebResourceResponse("text/plain", null, new ByteArrayInputStream(new byte[0]));
            }
        }
    }
}
