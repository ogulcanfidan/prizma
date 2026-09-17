package com.fmjapps.prizma;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Temporary diagnostic field — records whether Play Games' interactive
    // sign-in flow (account picker) actually reaches onActivityResult, and
    // with which requestCode/resultCode (see PlayGamesPlugin.java). Remove
    // this field, the override below, and related code once the sign-in
    // issue is resolved.
    public static String lastActivityResultLog = "henüz onActivityResult çağrılmadı";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Temporary diagnostic: enables connecting to the WebView console via
        // chrome://inspect (off by default in release builds). Remove this
        // line once the issue is resolved — it should not stay enabled in
        // production for security reasons.
        WebView.setWebContentsDebuggingEnabled(true);

        // Local (not npm-published) Capacitor plugins must be registered with
        // registerPlugin(...) BEFORE BridgeActivity loads its own plugins,
        // i.e. before super.onCreate() — see PlayGamesPlugin.java.
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        // Temporary diagnostic — see the note above.
        lastActivityResultLog = "requestCode=" + requestCode + " resultCode=" + resultCode
                + " data=" + (data != null ? data.toString() : "null");
        super.onActivityResult(requestCode, resultCode, data);
    }
}
