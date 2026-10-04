package no.siqt.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.List;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered BEFORE super.onCreate(): that is where the Bridge is built and the
        // plugin list is read, so registering afterwards leaves the plugin invisible to JS with no
        // error anywhere — the call simply rejects at runtime as "not implemented".
        registerPlugin(SiqtHapticsPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) fitWebViewAboveKeyboard();
    }

    // The on-screen keyboard shrinks the page instead of covering it, in step with the keyboard.
    //
    // From Android 15 every app targeting SDK 35 is drawn edge to edge, and the system no longer
    // resizes it for the keyboard (adjustResize does nothing on its own there). Capacitor leaves the
    // window insets to the WebView, and the WebView treats the keyboard as covering the page: the page
    // stays full height and only its *visible area* shrinks — which the browser engine may then PAN to
    // reveal a focused field. Every mobile sheet in the app is laid out on that visible area, so the
    // sheets looked right while the whole page behind them, and anything not following the visible area,
    // slid up by a keyboard's height: "task lista ble liksom pusha litt opp", the new-task card
    // overshooting, the card jumping above the Assignees and calendar pickers. A pan of the visible area
    // cannot be undone from script, and the viewport meta's interactive-widget, which asks for exactly
    // this behaviour, is not honoured by the WebView — both were tried first (see PLANNING.md).
    //
    // So the app does it: the WebView's bottom edge sits on the keyboard's top, and the keyboard is
    // taken out of the insets the WebView sees — it is no longer covering anything, so there is nothing
    // to pan. The navigation bar's inset is dropped too while the keyboard is up, since the page no
    // longer reaches down to it (otherwise the bottom safe-area padding leaves a gap above the keyboard).
    //
    // Frame by frame while the keyboard slides, not in one step: the system reports the keyboard's
    // FINAL height as its animation starts, and moving the edge there at once left a gap between the
    // page and a keyboard still on its way up — "noe glippe … mellom tastatur og det kortet". The
    // animation callback follows the keyboard's real position on every frame instead.
    //
    // Only the animation moves the edge when the keyboard opens or closes. The inset listener used to
    // set it too, unless an animation was already flagged as running — but the final insets can arrive
    // before the animation's onPrepare, so now and then the edge leapt to the final height and then
    // snapped back to follow the animation from the bottom: "kan faktisk hoppe litt for langt og poppe
    // tilbake, men ikke hver gang". The listener now moves the edge only when the keyboard was already
    // up and stays up (a taller emoji panel, a different keyboard), which no animation covers; and if a
    // show or hide somehow arrives without an animation, a short fallback settles it.
    //
    // Below Android 15 the window is not edge to edge, and adjustResize (AndroidManifest.xml) resizes
    // it for the keyboard the classic way, so nothing is done here.
    private boolean imeAnimating = false;
    private boolean keyboardWasUp = false;
    private final Runnable settleWithoutAnimation = new Runnable() {
        @Override
        public void run() {
            if (imeAnimating) return;
            WebView webView = getBridge().getWebView();
            WindowInsetsCompat now = ViewCompat.getRootWindowInsets(webView);
            if (now == null) return;
            boolean up = now.isVisible(WindowInsetsCompat.Type.ime());
            setKeyboardEdge(webView, up ? now.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0);
        }
    };

    private void fitWebViewAboveKeyboard() {
        WebView webView = getBridge().getWebView();

        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardUp = insets.isVisible(WindowInsetsCompat.Type.ime()) && ime.bottom > 0;
            if (!imeAnimating) {
                if (keyboardUp && keyboardWasUp) {
                    setKeyboardEdge(v, ime.bottom);
                } else if (keyboardUp != keyboardWasUp) {
                    v.removeCallbacks(settleWithoutAnimation);
                    v.postDelayed(settleWithoutAnimation, 400);
                }
            }
            keyboardWasUp = keyboardUp;

            WindowInsetsCompat.Builder seen = new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false);
            if (keyboardUp) {
                Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                seen.setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(nav.left, 0, nav.right, 0));
            }
            return ViewCompat.onApplyWindowInsets(v, seen.build());
        });

        ViewCompat.setWindowInsetsAnimationCallback(
            webView,
            new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_STOP) {
                @Override
                public void onPrepare(@NonNull WindowInsetsAnimationCompat animation) {
                    if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) == 0) return;
                    imeAnimating = true;
                    webView.removeCallbacks(settleWithoutAnimation);
                }

                @NonNull
                @Override
                public WindowInsetsCompat onProgress(@NonNull WindowInsetsCompat insets, @NonNull List<WindowInsetsAnimationCompat> running) {
                    if (imeAnimating) setKeyboardEdge(webView, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                    return insets;
                }

                @Override
                public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                    if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) == 0) return;
                    imeAnimating = false;
                    WindowInsetsCompat now = ViewCompat.getRootWindowInsets(webView);
                    if (now == null) return;
                    boolean up = now.isVisible(WindowInsetsCompat.Type.ime());
                    setKeyboardEdge(webView, up ? now.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0);
                }
            }
        );
    }

    private static void setKeyboardEdge(View v, int bottom) {
        ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
        if (lp.bottomMargin == bottom) return;
        lp.bottomMargin = bottom;
        v.setLayoutParams(lp);
    }
}
