package no.siqt.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The one thing @capacitor/haptics cannot do: Android's own predefined haptic effects.
 *
 * Both the web's navigator.vibrate and @capacitor/haptics ultimately drive the motor with a
 * duration (and, for the plugin's impact styles, a flat amplitude). An LRA driven that way ramps up
 * over ~15ms, holds, and then RINGS OUT when the current stops — a soft attack and an audible tail.
 * VibrationEffect.createPredefined() instead plays a waveform the device vendor tuned for its own
 * motor: full amplitude immediately, and active braking at the end (the motor is driven in reverse
 * to kill the oscillation). Same length, sharp at both edges.
 *
 * That difference is exactly what was reported against ClickUp: "varer ca like lenge, men sparker
 * med ifra." It is not something a duration can approximate, which is why this class exists rather
 * than another round of tuning the numbers in lib/haptics.ts.
 */
@CapacitorPlugin(name = "SiqtHaptics")
public class SiqtHapticsPlugin extends Plugin {

    @PluginMethod
    public void click(PluginCall call) {
        String style = call.getString("style", "strong");
        // The JS side passes the duration it would otherwise have used, so the fallback below stays
        // in sync with lib/haptics.ts rather than duplicating its numbers here where they would
        // silently drift.
        int fallbackMs = call.getInt("fallbackMs", 15);

        Vibrator vibrator = resolveVibrator();
        if (vibrator == null || !vibrator.hasVibrator()) {
            // Resolve rather than reject: a device with no motor is not an error, and a rejected
            // promise here would make the JS side fall back to a vibration that also cannot happen.
            call.resolve();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int effect = "light".equals(style) ? VibrationEffect.EFFECT_TICK : VibrationEffect.EFFECT_CLICK;
            try {
                vibrator.vibrate(VibrationEffect.createPredefined(effect));
                call.resolve();
                return;
            } catch (Exception ignored) {
                // createPredefined is documented to fall back to a generic vibration when the
                // device has no tuned waveform for the effect, so reaching here means something
                // more unusual. Drop through to the duration path rather than giving no feedback.
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(fallbackMs, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibratePreO(vibrator, fallbackMs);
        }
        call.resolve();
    }

    @SuppressWarnings("deprecation")
    private void vibratePreO(Vibrator vibrator, int ms) {
        vibrator.vibrate(ms);
    }

    private Vibrator resolveVibrator() {
        Context context = getContext();
        if (context == null) return null;
        // getSystemService(VIBRATOR_SERVICE) is deprecated from Android 12 and returns the wrong
        // motor on devices that expose several.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return legacyVibrator(context);
    }

    @SuppressWarnings("deprecation")
    private Vibrator legacyVibrator(Context context) {
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
