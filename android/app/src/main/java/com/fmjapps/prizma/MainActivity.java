package com.fmjapps.prizma;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (not npm-published) Capacitor plugins must be registered with
        // registerPlugin(...) BEFORE BridgeActivity loads its own plugins,
        // i.e. before super.onCreate() — see PlayGamesPlugin.java.
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
