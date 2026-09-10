package no.siqt.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

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

    /**
     * Which effect to play is chosen by the CALLER, not derived here from a strength name.
     *
     * That is deliberate and worth preserving: the JS half ships with every web deploy while this
     * half only changes when someone installs a new APK. Keeping the mapping in lib/haptics.ts means
     * the feel can be retuned — which has already taken several rounds of real-device feedback — by
     * redeploying the site, instead of rebuilding, redistributing and reinstalling an app. This
     * class only needs rebuilding to gain a *new kind* of effect.
     */
    private static int effectIdFor(String effect) {
        switch (effect == null ? "" : effect) {
            case "tick":
                return VibrationEffect.EFFECT_TICK;
            case "heavyClick":
                return VibrationEffect.EFFECT_HEAVY_CLICK;
            case "doubleClick":
                return VibrationEffect.EFFECT_DOUBLE_CLICK;
            default:
                return VibrationEffect.EFFECT_CLICK;
        }
    }

    @PluginMethod
    public void click(PluginCall call) {
        String effect = call.getString("effect", "click");
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

        // Composition first when the caller asked for one. EFFECT_HEAVY_CLICK is the strongest
        // single predefined effect there is, so "a bit more than that" has nowhere left to go among
        // them — the only way past is to build the pulse out of primitives, which can be scaled and
        // chained. Reported on device: the heavy click landed close to ClickUp's but "bittelitt
        // svakere/kortere".
        JSArray primitives = call.getArray("primitives", null);
        if (primitives != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            VibrationEffect composed = buildComposition(vibrator, primitives);
            if (composed != null) {
                vibrator.vibrate(composed);
                call.resolve();
                return;
            }
            // Fall through to the predefined effect when this device has no such primitives —
            // support is per-device, not merely per-API-level, so this is a normal outcome on
            // cheaper hardware rather than an error worth reporting.
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                vibrator.vibrate(VibrationEffect.createPredefined(effectIdFor(effect)));
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

    /**
     * Builds a composed effect from the recipe the JS side sent, or returns null if this device
     * cannot play it — in which case the caller falls back to a predefined effect.
     *
     * Each entry is {id, scale, delay}. `scale` is amplitude, 0..1. `delay` is measured from the
     * moment the PREVIOUS primitive finishes, so 0 means back-to-back: two primitives at delay 0
     * fuse into one longer pulse rather than reading as two taps, which is what makes a kick that
     * is slightly longer without becoming a double-click.
     */
    private VibrationEffect buildComposition(Vibrator vibrator, JSArray primitives) {
        try {
            int count = primitives.length();
            if (count == 0) return null;

            int[] ids = new int[count];
            float[] scales = new float[count];
            int[] delays = new int[count];

            for (int i = 0; i < count; i++) {
                JSONObject entry = primitives.getJSONObject(i);
                Integer id = primitiveIdFor(entry.optString("id", "click"));
                if (id == null) return null;
                ids[i] = id;
                scales[i] = (float) entry.optDouble("scale", 1.0);
                delays[i] = entry.optInt("delay", 0);
            }

            // Primitive support is a per-device property, not a per-API-level one: a phone can be on
            // Android 15 and still have none of these. Checking up front means we fall back cleanly
            // instead of composing something the motor will silently drop.
            if (!vibrator.areAllPrimitivesSupported(ids)) return null;

            VibrationEffect.Composition composition = VibrationEffect.startComposition();
            for (int i = 0; i < count; i++) {
                composition = composition.addPrimitive(ids[i], scales[i], delays[i]);
            }
            return composition.compose();
        } catch (Exception e) {
            return null;
        }
    }

    private Integer primitiveIdFor(String id) {
        switch (id == null ? "" : id) {
            case "click":
                return VibrationEffect.Composition.PRIMITIVE_CLICK;
            case "tick":
                return VibrationEffect.Composition.PRIMITIVE_TICK;
            case "lowTick":
                return VibrationEffect.Composition.PRIMITIVE_LOW_TICK;
            case "thud":
                return VibrationEffect.Composition.PRIMITIVE_THUD;
            case "spin":
                return VibrationEffect.Composition.PRIMITIVE_SPIN;
            case "quickRise":
                return VibrationEffect.Composition.PRIMITIVE_QUICK_RISE;
            case "slowRise":
                return VibrationEffect.Composition.PRIMITIVE_SLOW_RISE;
            case "quickFall":
                return VibrationEffect.Composition.PRIMITIVE_QUICK_FALL;
            default:
                // Unknown name — refuse the whole composition rather than quietly substituting
                // something else, so a typo in the JS table shows up as the predefined fallback
                // instead of as a mystery feel nobody asked for.
                return null;
        }
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
