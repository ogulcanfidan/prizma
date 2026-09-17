// notifications.js — TEK SEFERLİK yerel bildirim planlar (Capacitor
// LocalNotifications): oyuncunun günlük bulmaca hakkı TAMAMEN dolduğu ANDA
// (bkz. gamestate.js → msUntilFullAllowance()).
//
// v2: eskiden GameState.playHours histogramına göre en çok oynanan saatte
// GÜNLÜK TEKRARLAYAN bir bildirim planlanıyordu; artık hakkın (30/30'a) tam
// dolacağı hesaplanan ana TEK SEFERLİK bir bildirim planlanıyor. Hak
// tüketildikçe/reklamla arttıkça "tam dolma anı" değiştiği için, bu fonksiyon
// her hak değişikliğinden sonra yeniden çağrılıp planı GÜNCELLİYOR (bkz.
// main.js → tryStartEndlessPuzzle/allowanceWatchAdBtn/onUnlimitedGranted).
//
// Web önizlemede / plugin yokken (window.Capacitor.Plugins.LocalNotifications
// tanımsız) sessizce devre dışı kalır — hiçbir yerde çökmez.
//
// KURULUM NOTU: @capacitor/local-notifications paketi package.json'a
// eklendi — `npm install` + `npx cap sync android` gerekir. Android 13+
// bildirim izni çalışma zamanında istenir (requestPermissions).

import { GameState } from "./gamestate.js";
import { t } from "./i18n.js";

const NOTIFICATION_ID = 1001;
const TITLE = "Prizma"; // marka adı — dilden bağımsız sabit kalır

function getLocalNotifications() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins.LocalNotifications ? plugins.LocalNotifications : null;
}

// Hak durumu her değiştiğinde (tüketim, reklam bonusu, sınırsız alım) ya da
// ayarlar değiştiğinde çağrılır: önce eski planı iptal eder, sonra (bildirim
// açıksa + hak zaten tam dolu/sınırsız DEĞİLSE) hakkın tam dolacağı ana göre
// tek seferlik yeniden planlar.
export async function refreshDailyNotification() {
  const LN = getLocalNotifications();
  if (!LN) return;

  try {
    await LN.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  } catch (e) {
    /* iptal edilecek bir bildirim yoktu olabilir — önemli değil */
  }

  if (!GameState.settings.notificationsEnabled) return;

  const ms = GameState.msUntilFullAllowance();
  if (ms <= 0) return; // hak zaten tavanda ya da sınırsız — bildirime gerek yok

  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") {
      const req = await LN.requestPermissions();
      if (req.display !== "granted") return;
    }
    await LN.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: TITLE,
          body: t("notif.body"),
          schedule: { at: new Date(Date.now() + ms), allowWhileIdle: true },
        },
      ],
    });
  } catch (e) {
    console.warn("notifications.js: bildirim planlanamadı", e);
  }
}

export async function cancelDailyNotification() {
  const LN = getLocalNotifications();
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  } catch (e) {
    /* yoksay */
  }
}
