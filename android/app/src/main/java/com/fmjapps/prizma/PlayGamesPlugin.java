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
//     leaderboard_id_total_points üzerindeki yorumlar — ikisini de gerçek
//     değerlerle değiştirin).
//  2. Uygulamanın imzalı bir sürümü Play Console'a en az "dahili test"
//     olarak yüklenip kendi hesabınızı test kullanıcısı olarak eklemeden
//     giriş (sign-in) ÇALIŞMAZ (Play Games Services kısıtlaması) — bu adım
//     kullanıcı tarafından yapılmalı.
//
// Yer tutucu ID'ler değiştirilmeden bu plugin'in tüm metotları SESSİZCE
// başarısız olur (reject edilir) — uygulama çökmez, main.js bunu zaten
// try/catch ile yutuyor (bkz. leaderboard.js).

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

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
                        if (!ok) {
                            // GEÇİCİ TANI KODU — asıl hata Play Console/GCP
                            // tarafında görünmüyor, bu yüzden JS'e (ve oradan
                            // ekrana) taşınıyor. Sorun çözülünce bu blok ve
                            // "debug" alanı kaldırılmalı.
                            ret.put("debug",
                                describeException(signInTask.getException())
                                + " | canceled=" + signInTask.isCanceled()
                                + " | playServices=" + describePlayServices(activity)
                                + " | onActivityResult=" + MainActivity.lastActivityResultLog);
                        }
                        call.resolve(ret);
                    });
            });
    }

    // GEÇİCİ TANI KODU — bkz. yukarıdaki yorum.
    private String describeException(Exception e) {
        if (e == null) return "exception yok (task başarısız ama exception null)";
        StringBuilder sb = new StringBuilder();
        sb.append(e.getClass().getName()).append(": ").append(e.getMessage());
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            sb.append(" [statusCode=").append(code)
              .append(" ").append(CommonStatusCodes.getStatusCodeString(code)).append("]");
        }
        return sb.toString();
    }

    // GEÇİCİ TANI KODU — cihazdaki Google Play Services'in genel durumu
    // (güncel mi, devre dışı mı, vb.) — sign-in akışının hiç doğru
    // başlayamamış olma ihtimalini elemek/doğrulamak için.
    private String describePlayServices(Activity activity) {
        GoogleApiAvailability gaa = GoogleApiAvailability.getInstance();
        int code = gaa.isGooglePlayServicesAvailable(activity);
        String desc = code == ConnectionResult.SUCCESS ? "OK" : gaa.getErrorString(code);
        return code + " (" + desc + ")";
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
        Long score = call.getData().optLong("score", -1);
        if (score == null || score < 0) {
            call.reject("Geçersiz skor.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity yok.");
            return;
        }
        // KALICI DÜZELTME — submitScoreImmediate() (senkron/anlık sonuç
        // bekleyen çağrı) 5 farklı derlemede de ApiException 26502
        // CLIENT_RECONNECT_REQUIRED ile başarısız oldu; iki kademeli
        // retry+gecikme denemesi de sorunu çözmedi. Bu hata Google'ın
        // Play Games Services SDK'sında resmi olarak dokümante edilmemiş,
        // topluluk genelinde bilinen bir sorun (bkz. playgameservices/
        // android-basic-samples GitHub issue #300 — resmi çözüm yok) — ve
        // birden fazla geliştirici AYNI sorunu submitScoreImmediate() yerine
        // submitScore() (fire-and-forget, SDK'nın kendi iç kuyruğunu/retry
        // mekanizmasını kullanan "gönder ve unut" metodu) kullanarak
        // çözdüğünü bildirdi ("100% reliable"). Bu yüzden artık DOĞRUDAN
        // submitScore() kullanılıyor. Bunun bedeli: sonucu senkron olarak
        // doğrulayamıyoruz (SDK bunu desteklemiyor, Google da skor gönderimi
        // için bunu ÖNERİYOR) — ama bu tam olarak Play Games'in "en yüksek
        // skoru otomatik tutar" garantisiyle birlikte tasarlandığı kullanım
        // şekli.
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
        PlayGames.getLeaderboardsClient(activity)
            .getLeaderboardIntent(leaderboardId)
            .addOnSuccessListener(intent -> {
                saveCall(call);
                startActivityForResult(call, intent, "leaderboardUiResult");
            })
            .addOnFailureListener(e -> call.reject("Liderlik tablosu açılamadı (muhtemelen giriş yapılmamış).", e));
    }

    @ActivityCallback
    private void leaderboardUiResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve();
    }
}
