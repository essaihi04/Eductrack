package org.edtrack.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Notifications construites en natif à partir de messages FCM « data-only » :
 * permet ce que FCM ne sait pas faire tout seul — logo de l'ÉCOLE en icône
 * ronde (largeIcon), nom de l'école en sous-titre, image jointe en grand
 * (BigPicture) et sonnerie de cloche d'école (canal « school »).
 *
 * Hérite du service du plugin Capacitor pour conserver la gestion du jeton
 * (onNewToken) et le comportement par défaut des autres messages.
 */
public class SchoolMessagingService extends MessagingService {

    private static final String CHANNEL_ID = "school";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");

        // Pas notre format (ou message avec bloc notification classique) :
        // comportement standard du plugin Capacitor.
        if (title == null || remoteMessage.getNotification() != null) {
            super.onMessageReceived(remoteMessage);
            return;
        }

        String body = data.get("body");
        String logo = data.get("logo");
        String image = data.get("image");
        String school = data.get("schoolName");
        String url = data.get("url");
        String tag = data.get("tag");

        ensureChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null) intent.putExtra("pushUrl", url);
        PendingIntent pi = PendingIntent.getActivity(
                this, (int) (System.currentTimeMillis() & 0x7fffffff), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body == null ? "" : body)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

        // Nom de l'école : affiché dans l'en-tête de la notification.
        if (school != null && !school.isEmpty()) b.setSubText(school);

        // Logo de l'école : icône ronde à droite (à la place du logo de l'app).
        Bitmap logoBmp = fetchBitmap(logo);
        if (logoBmp != null) b.setLargeIcon(logoBmp);

        // Image jointe : affichée en grand (le logo reste en icône ronde).
        Bitmap imageBmp = (image != null && !image.equals(logo)) ? fetchBitmap(image) : null;
        if (imageBmp != null) {
            b.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(imageBmp)
                    .bigLargeIcon((Bitmap) null));
        } else if (body != null && !body.isEmpty()) {
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        int id = tag != null ? tag.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        nm.notify(id, b.build());
    }

    /** Canal « École » avec la sonnerie de cloche (res/raw/school_bell.wav). */
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "École", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Messages et alertes de l'école");
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/raw/school_bell");
        ch.setSound(sound, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        ch.enableVibration(true);
        ch.enableLights(true);
        nm.createNotificationChannel(ch);
    }

    /** Télécharge une image (onMessageReceived tourne déjà sur un thread de fond). */
    private Bitmap fetchBitmap(String u) {
        if (u == null || u.isEmpty()) return null;
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(8000);
            try (InputStream in = c.getInputStream()) {
                return BitmapFactory.decodeStream(in);
            }
        } catch (Exception e) {
            return null;
        }
    }
}
