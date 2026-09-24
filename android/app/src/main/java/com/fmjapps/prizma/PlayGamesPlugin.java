package com.fmjapps.prizma;

// PlayGamesPlugin — Google Play Games Services v2 (leaderboard) için Capacitor
// köprüsü. npm'e yayınlanmış bir paket DEĞİL, bu uygulamaya özel yerel bir
// plugin — MainActivity.java içinde registerPlugin(...) ile elle kaydediliyor
// (bkz. o dosyadaki yorum). JS tarafında window.Capacitor.Plugins.PlayGames
// olarak erişiliyor (bkz. www/js/leaderboard.js — @capacitor-community/admob
// sarmalayıcısı ads.js ile AYNI desen).
//
// ÖNEMLİ — KULLANICI TARAFINDAN YAPILMASI GEREKENLER (bu proje bunları
// OTOMATİK yapamaz, Play Console erişimi gerektirir):
//  1. Play Console'da Play Games Services'i kurup bir liderlik tablosu
//     oluşturun (bkz. strings.xml > game_services_project_id ve
//     leaderboard_id_total_points).
//  2. Play Console > Play Games Services > Kurulum ve yönetim > Yapılandırma
//     > Kimlik bilgileri altında, uygulamanın paket adı + imza sertifikası
//     (SHA-1) kayıtlı olmalı — HEM debug HEM release sertifikası için ayrı
//     kimlik bilgisi (bu adım eksik/yanlışsa giriş "başarılı" görünse de
//     skor hiç sunucuya ulaşmaz, logcat'te "UNAUTHENTICATED: Request is
//     missing required authentication credential" hatası görülür — bu proje
//     bunu yaşadı, düzeltildi).
//  3. Uygulamanın imzalı bir sürümü Play Console'a en az "dahili test"
//     olarak yüklenip kendi hesabınızı test kullanıcısı olarak eklemeden
//     giriş (sign-in) ÇALIŞMAZ (Play Games Services kısıtlaması).
//
// Yer tutucu ID'ler değiştirilmeden bu plugin'in tüm metotları SESSİZCE
// başarısız olur (reject edilir) — uygulama çökmez, main.js bunu zaten
// try/catch ile yutuyor (bkz. leaderboard.js).

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.Log;

import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;

@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private String leaderboardId;

    @Override
    public void load() {
        // PlayGamesSdk.initialize tüm uygulama için TEK sefer çağrılmalı;
        // birden fazla çağrıda no-op olduğu belgelense de en garantili yer
        // burası (plugin yalnızca bir kez load edilir).
        PlayGamesSdk.initialize(getContext());
        leaderboardId = getContext().getString(R.string.leaderboard_id_total_points);
    }

    private boolean idsConfigured() {
        return leaderboardId != null && !leaderboardId.startsWith("REPLACE_WITH_");
    }

    // Sessiz giriş dener (kullanıcıya hesap seçim ekranı sadece gerekirse
    // gösterilir — Play Games v2'nin standart davranışı). JS tarafı bunu
    // uygulama açılışında bir kere çağırıyor (bkz. leaderboard.js > init()).
    @PluginMethod
    public void signIn(PluginCall call) {
        if (!idsConfigured()) {
            call.reject("Play Games yapılandırılmadı (strings.xml içindeki yer tutucu ID'ler değiştirilmedi).");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        GamesSignInClient signInClient = PlayGames.getGamesSignInClient(activity);
        signInClient
            .isAuthenticated()
            .addOnCompleteListener(task -> {
                boolean authenticated = task.isSuccessful() && task.getResult().isAuthenticated();
                if (authenticated) {
                    JSObject ret = new JSObject();
                    ret.put("signedIn", true);
                    call.resolve(ret);
                    return;
                }
                signInClient
                    .signIn()
                    .addOnCompleteListener(signInTask -> {
                        boolean ok = signInTask.isSuccessful() && signInTask.getResult().isAuthenticated();
                        JSObject ret = new JSObject();
                        ret.put("signedIn", ok);
                        // TANI — giriş başarısızsa sebebi SADECE Logcat'e yazılır
                        // (kullanıcıya ASLA gösterilmez, bkz. main.js'teki eski
                        // DEBUG sızıntısı notu). "Sıralama/Başarılar açılmıyor"
                        // şikayetinde gerçek sebebi görebilmek için gerekli.
                        if (!ok) {
                            String reason = describeSignInFailure(signInTask.getException(), signInTask.isCanceled());
                            Log.w(TAG, "signIn basarisiz: " + reason);
                            ret.put("reason", reason);
                        }
                        call.resolve(ret);
                    });
            });
    }

    // GameState.totalPoints() değerini liderlik tablosuna gönderir. Puan her
    // zaman sadece ARTAN yönde gönderiliyor olsa da (bkz. leaderboard.js),
    // Play Games zaten bir oyuncunun en yüksek skorunu tutar — daha düşük bir
    // gönderim asla mevcut skoru düşürmez, bu yüzden burada ekstra bir
    // "sadece en yüksekse gönder" kontrolüne gerek yok.
    @PluginMethod
    public void submitScore(PluginCall call) {
        if (!idsConfigured()) {
            call.reject("Play Games yapılandırılmadı (strings.xml içindeki yer tutucu ID'ler değiştirilmedi).");
            return;
        }
        long score = call.getData().optLong("score", -1);
        if (score < 0) {
            call.reject("Geçersiz skor.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        // KALICI DÜZELTME — submitScoreImmediate() (senkron/anlık sonuç
        // bekleyen çağrı) tekrarlayan derlemelerde ApiException 26502
        // CLIENT_RECONNECT_REQUIRED ile başarısız oluyordu; bu, Google'ın
        // Play Games Services SDK'sında resmi olarak dokümante edilmemiş,
        // topluluk genelinde bilinen bir sorun. Bunun yerine Google'ın kendi
        // önerdiği submitScore() (fire-and-forget, SDK'nın kendi iç
        // kuyruğunu/retry mekanizmasını kullanan "gönder ve unut" metodu)
        // kullanılıyor. Bunun bedeli: sonucu senkron olarak doğrulayamıyoruz
        // (SDK bunu desteklemiyor) — ama Play Games'in "en yüksek skoru
        // otomatik tutar" garantisiyle birlikte tasarlandığı kullanım şekli
        // bu.
        PlayGames.getLeaderboardsClient(activity).submitScore(leaderboardId, score);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // Native liderlik tablosu ekranını (Google'ın hazır UI'ı) açar.
    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        if (!idsConfigured()) {
            call.reject("Play Games yapılandırılmadı (strings.xml içindeki yer tutucu ID'ler değiştirilmedi).");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        openGamesUi(call, activity, true, false);
    }

    // Liderlik tablosu / başarı ekranını açar. İLK deneme başarısız olursa
    // (Play Games istemcisi "yeniden bağlan" durumuna düşmüş olabilir — bu
    // projede daha önce submitScoreImmediate'te ApiException 26502
    // CLIENT_RECONNECT_REQUIRED olarak görüldü; bulut kayıt/Snapshots
    // çağrıları da istemciyi bu duruma sokabiliyor) BİR KEZ yeniden kimlik
    // doğrulanıp tekrar denenir. İkinci deneme de başarısız olursa sebep
    // (durum kodu dahil) Logcat'e yazılır ve JS'e iletilir.
    private void openGamesUi(PluginCall call, Activity activity, boolean leaderboard, boolean isRetry) {
        Task<Intent> intentTask = leaderboard
            ? PlayGames.getLeaderboardsClient(activity).getLeaderboardIntent(leaderboardId)
            : PlayGames.getAchievementsClient(activity).getAchievementsIntent();
        String what = leaderboard ? "liderlik tablosu" : "basarilar";

        intentTask
            .addOnSuccessListener(intent -> {
                try {
                    startActivityForResult(call, intent, "leaderboardUiResult");
                } catch (Exception e) {
                    Log.w(TAG, what + " ekrani baslatilamadi", e);
                    call.reject(what + " ekranı başlatılamadı: " + e.getMessage(), e);
                }
            })
            .addOnFailureListener(e -> {
                Log.w(TAG, what + " intent basarisiz (retry=" + isRetry + "): " + describeApiFailure(e), e);
                if (isRetry) {
                    call.reject(what + " açılamadı: " + describeApiFailure(e), e);
                    return;
                }
                // Yeniden kimlik doğrula, sonra TEK sefer daha dene.
                PlayGames.getGamesSignInClient(activity)
                    .signIn()
                    .addOnCompleteListener(task -> openGamesUi(call, activity, leaderboard, true));
            });
    }

    @ActivityCallback
    private void leaderboardUiResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve();
    }

    private static final String TAG = "PrizmaPlayGames";

    // Play Games API hatasının okunabilir açıklaması (durum kodu dahil).
    private String describeApiFailure(Exception e) {
        if (e == null) return "bilinmeyen hata";
        StringBuilder sb = new StringBuilder(e.getClass().getSimpleName()).append(": ").append(e.getMessage());
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            sb.append(" [statusCode=").append(code).append(" ").append(CommonStatusCodes.getStatusCodeString(code)).append("]");
        }
        return sb.toString();
    }

    // Giriş hatasının okunabilir açıklaması (yalnızca Logcat için).
    private String describeSignInFailure(Exception e, boolean canceled) {
        if (canceled) return "kullanici iptal etti (canceled)";
        if (e == null) return "exception yok — kullanici hesap secmedi ya da Play Games profili yok";
        StringBuilder sb = new StringBuilder(e.getClass().getSimpleName()).append(": ").append(e.getMessage());
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            sb.append(" [statusCode=").append(code).append(" ").append(CommonStatusCodes.getStatusCodeString(code)).append("]");
        }
        return sb.toString();
    }

    // --- Başarılar (achievements) -----------------------------------------
    // Başarı kimlikleri JS tarafında tutulur (bkz. www/js/achievements.js) —
    // burada sadece "verilen kimliği aç" ve "başarı ekranını göster" var.
    // unlock() fire-and-forget: submitScore'daki AYNI gerekçeyle (bkz.
    // yukarıdaki KALICI DÜZELTME notu) sonucu senkron beklemiyoruz; SDK
    // gerekirse kendi kuyruğuyla tekrar dener, zaten açılmış bir başarıyı
    // yeniden açmak da zararsızdır.
    @PluginMethod
    public void unlockAchievement(PluginCall call) {
        String achievementId = call.getString("achievementId");
        if (achievementId == null || achievementId.isEmpty()) {
            call.reject("achievementId gerekli.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        PlayGames.getAchievementsClient(activity).unlock(achievementId);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // Google'ın hazır başarı ekranını açar.
    @PluginMethod
    public void showAchievements(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        openGamesUi(call, activity, false, false);
    }

    // --- Bulut kayıt (Play Games "Kaydedilmiş oyunlar" / Snapshots) --------
    // Oyun ilerlemesi normalde SADECE cihazda (localStorage) duruyordu; uygulama
    // silinince ya da telefon değişince kayboluyordu. Burada Play Games'in
    // Snapshots API'si ile tek bir kayıt dosyası (SNAPSHOT_NAME) okunup
    // yazılıyor. İçerik JS tarafında üretilen JSON metni — native taraf
    // içeriği YORUMLAMAZ, sadece taşır (bkz. www/js/cloudsave.js).
    //
    // Çakışma çözümü: open(..., RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED) ile
    // SDK en son değiştirilen sürümü seçer; iki cihaz aynı anda oynadıysa
    // JS tarafı ayrıca "daha çok ilerleme" kuralıyla birleştirir.
    private static final String SNAPSHOT_NAME = "prizma_progress";

    @PluginMethod
    public void saveToCloud(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("data gerekli.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
        client
            .open(SNAPSHOT_NAME, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnFailureListener(e -> call.reject("Bulut kaydı açılamadı.", e))
            .addOnSuccessListener(result -> {
                Snapshot snapshot = result.getData();
                if (snapshot == null) {
                    call.reject("Bulut kaydı okunamadı (çakışma çözülemedi).");
                    return;
                }
                snapshot.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
                SnapshotMetadataChange metadata = new SnapshotMetadataChange.Builder()
                    .setDescription("Prizma ilerlemesi")
                    .build();
                client
                    .commitAndClose(snapshot, metadata)
                    .addOnFailureListener(e -> call.reject("Bulut kaydı yazılamadı.", e))
                    .addOnSuccessListener(meta -> {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    });
            });
    }

    @PluginMethod
    public void loadFromCloud(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        PlayGames.getSnapshotsClient(activity)
            .open(SNAPSHOT_NAME, false, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnFailureListener(e -> {
                // Henüz hiç kayıt yoksa da buraya düşer — hata DEĞİL, boş sonuç.
                JSObject ret = new JSObject();
                ret.put("found", false);
                call.resolve(ret);
            })
            .addOnSuccessListener(result -> {
                Snapshot snapshot = result.getData();
                JSObject ret = new JSObject();
                if (snapshot == null) {
                    ret.put("found", false);
                    call.resolve(ret);
                    return;
                }
                try {
                    byte[] bytes = snapshot.getSnapshotContents().readFully();
                    String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
                    ret.put("found", text.length() > 0);
                    ret.put("data", text);
                } catch (IOException e) {
                    ret.put("found", false);
                }
                call.resolve(ret);
            });
    }
}
