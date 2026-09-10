package no.siqt.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered BEFORE super.onCreate(): that is where the Bridge is built and the
        // plugin list is read, so registering afterwards leaves the plugin invisible to JS with no
        // error anywhere — the call simply rejects at runtime as "not implemented".
        registerPlugin(SiqtHapticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
