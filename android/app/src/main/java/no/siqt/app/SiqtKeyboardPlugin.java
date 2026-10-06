package no.siqt.app;

import android.content.Context;
import android.os.Build;
import android.view.View;
import android.view.inputmethod.InputMethodManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsAnimationControlListenerCompat;
import androidx.core.view.WindowInsetsAnimationControllerCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puts the keyboard away at once, without its slide.
 *
 * For the calendar in the new-task card: "Kalenderen må over tastaturet". Nothing an app draws can sit
 * above the keyboard — the keyboard is its own window, always on top — so with the keyboard left up the
 * calendar was squeezed into the space above it, and with the keyboard sliding down as the calendar
 * slid up, the keyboard crossed over the calendar on its way out. Taking control of the keyboard's own
 * show/hide animation (WindowInsetsAnimationController) and finishing it immediately makes the keyboard
 * vanish in a single frame, so the calendar can rise in its place — which is what "over the keyboard"
 * looks like.
 *
 * Registered in MainActivity before super.onCreate(), like SiqtHapticsPlugin.
 */
@CapacitorPlugin(name = "SiqtKeyboard")
public class SiqtKeyboardPlugin extends Plugin {

    @PluginMethod
    public void hideInstant(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            View view = getBridge().getWebView();
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.hideSoftInputFromWindow(view.getWindowToken(), 0);
                call.resolve();
                return;
            }
            WindowInsetsCompat now = androidx.core.view.ViewCompat.getRootWindowInsets(view);
            if (now == null || !now.isVisible(WindowInsetsCompat.Type.ime())) {
                call.resolve();
                return;
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getActivity().getWindow(), view);
            controller.controlWindowInsetsAnimation(
                WindowInsetsCompat.Type.ime(),
                0,
                null,
                null,
                new WindowInsetsAnimationControlListenerCompat() {
                    @Override
                    public void onReady(@NonNull WindowInsetsAnimationControllerCompat c, int types) {
                        c.finish(false);
                    }

                    @Override
                    public void onFinished(@NonNull WindowInsetsAnimationControllerCompat c) {
                        call.resolve();
                    }

                    @Override
                    public void onCancelled(@Nullable WindowInsetsAnimationControllerCompat c) {
                        // Could not take control (another animation in the way): fall back to the ordinary
                        // hide, which at least gets the keyboard out of the calendar's way.
                        controller.hide(WindowInsetsCompat.Type.ime());
                        call.resolve();
                    }
                }
            );
        });
    }
}
