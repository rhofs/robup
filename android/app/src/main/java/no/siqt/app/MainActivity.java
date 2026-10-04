package no.siqt.app;

import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

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

    // The on-screen keyboard shrinks the page instead of covering it.
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
    // So the app does it: while the keyboard is up, the WebView's bottom edge is moved to the
    // keyboard's top, and the keyboard is taken out of the insets the WebView sees — it is no longer
    // covering anything. With the page and its visible area the same size there is nothing to pan. The
    // navigation bar's inset is dropped too while the keyboard is up, since the page no longer reaches
    // down to it (otherwise the bottom safe-area padding would leave a gap above the keyboard).
    //
    // Below Android 15 the window is not edge to edge, and adjustResize (AndroidManifest.xml) resizes
    // it for the keyboard the classic way, so nothing is done here.
    private void fitWebViewAboveKeyboard() {
        WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardUp = insets.isVisible(WindowInsetsCompat.Type.ime()) && ime.bottom > 0;

            ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            int bottom = keyboardUp ? ime.bottom : 0;
            if (lp.bottomMargin != bottom) {
                lp.bottomMargin = bottom;
                v.setLayoutParams(lp);
            }

            WindowInsetsCompat.Builder seen = new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false);
            if (keyboardUp) {
                Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                seen.setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(nav.left, 0, nav.right, 0));
            }
            return ViewCompat.onApplyWindowInsets(v, seen.build());
        });
    }
}
