package no.siqt.app;

import android.content.Context;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;

import androidx.appcompat.widget.AppCompatImageView;

/**
 * An ImageView that starts its own animation once it is actually on screen.
 *
 * This exists to work around an ordering bug in @capacitor/splash-screen. Its buildViews() calls
 * start() on the splash drawable at SplashScreen.java:311, but only calls setImageDrawable() at
 * :336 — so at the moment start() runs, the drawable has no Callback attached to any View. An
 * AnimationDrawable advances by scheduling itself through that Callback, so with none set the call
 * silently does nothing and the splash shows frame 0 forever. Nothing is logged; the only symptom
 * is a still picture where an animation was expected, which is exactly what was reported.
 *
 * onAttachedToWindow is the correct moment: the drawable's callback is set and the view is in a
 * window, so scheduleSelf actually runs. Stopping again on detach keeps the animation from
 * scheduling frames against a view that is on its way out.
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

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        Drawable drawable = getDrawable();
        if (drawable instanceof Animatable && !((Animatable) drawable).isRunning()) {
            ((Animatable) drawable).start();
        }
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
