package no.siqt.app;

import android.content.Context;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;

import androidx.appcompat.widget.AppCompatImageView;

/**
 * An ImageView that starts its own animation once it is genuinely on screen.
 *
 * WHY THIS EXISTS AT ALL: @capacitor/splash-screen calls start() on the splash drawable at
 * SplashScreen.java:311 but only calls setImageDrawable() at :336 — so when start() runs the
 * drawable has no Callback on any View, an AnimationDrawable schedules its frames through exactly
 * that Callback, and the call silently does nothing. Its own `instanceof Animatable` check can
 * therefore never succeed. Going through the plugin's custom-layout path hands us the view instead.
 *
 * WHY IT TRIES FOUR TIMES: onAttachedToWindow alone was not enough. Reported from a device after the
 * first attempt — "den forrige S'en var helt statisk, den snurra ikke" — and it is a well-known
 * Android trap: an AnimationDrawable started before its window is actually visible quietly refuses,
 * with nothing logged and no exception. Attachment, a posted runnable, window-visibility and
 * window-focus are all moments the view can first become genuinely visible, and which one arrives
 * first depends on how the host puts the view on screen — here a plugin-owned dialog rather than an
 * ordinary activity. start() on an already-running drawable is a no-op, so trying at all four costs
 * nothing and removes the guesswork.
 */
public class SpinningSplashView extends AppCompatImageView {

    public SpinningSplashView(Context context) {
        super(context);
    }

    public SpinningSplashView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public SpinningSplashView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    private void startIfPossible() {
        Drawable drawable = getDrawable();
        if (drawable instanceof Animatable && !((Animatable) drawable).isRunning()) {
            ((Animatable) drawable).start();
        }
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startIfPossible();
        // After the current layout/draw pass, which is the first moment the drawable is reliably
        // able to schedule anything.
        post(this::startIfPossible);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility);
        if (visibility == VISIBLE) startIfPossible();
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        if (hasWindowFocus) startIfPossible();
    }

    @Override
    protected void onDetachedFromWindow() {
        Drawable drawable = getDrawable();
        if (drawable instanceof Animatable && ((Animatable) drawable).isRunning()) {
            ((Animatable) drawable).stop();
        }
        super.onDetachedFromWindow();
    }
}
