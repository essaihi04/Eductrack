package org.edtrack.app;

import android.content.Intent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handlePushUrl(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        handlePushUrl(getIntent());
    }

    /**
     * Tap sur une notification construite par SchoolMessagingService :
     * navigue vers l'écran ciblé (extra « pushUrl », ex. /parent/notifications).
     */
    private void handlePushUrl(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra("pushUrl");
        if (path == null || path.isEmpty()) return;
        intent.removeExtra("pushUrl");
        final String url = path.startsWith("http")
                ? path
                : "https://etrack.ma" + (path.startsWith("/") ? path : "/" + path);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
        }
    }
}
