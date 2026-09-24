// errorlog.js — yakalanmamış hataların basit, cihaz üstü kaydı.
//
// Neden: uygulamada Crashlytics gibi bir çökme/hata raporlama servisi YOK
// (kurulumu bir Firebase projesi + google-services.json gerektiriyor, bkz.
// README/notlar). O gelene kadar en azından hatanın İZİ kaybolmasın: her
// yakalanmamış hata Logcat'e yazılır (console.error → Capacitor köprüsü,
// capacitor.config.json > loggingBehavior:"production" sayesinde release
// derlemede de görünür) ve son N tanesi localStorage'da tutulur.
//
// Buradaki kayıtlar oyuncuya GÖSTERİLMEZ ve hiçbir yere GÖNDERİLMEZ — sadece
// cihazda durur; bir şikayet geldiğinde Logcat'ten ya da bu anahtardan
// okunabilir. Kişisel veri toplanmaz.

const STORE_KEY = "prizma_errors_v1";
const MAX_ENTRIES = 20;

function push(entry) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push(entry);
    while (list.length > MAX_ENTRIES) list.shift();
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch (e) {
    /* localStorage dolu/erişilemez — kayıt tutulamıyorsa sessizce vazgeç */
  }
}

export function initErrorLog() {
  window.addEventListener("error", (e) => {
    const entry = {
      t: new Date().toISOString(),
      kind: "error",
      msg: String((e.error && e.error.message) || e.message || "bilinmeyen hata"),
      where: `${e.filename || "?"}:${e.lineno || 0}`,
      stack: String((e.error && e.error.stack) || "").slice(0, 600),
    };
    console.error("prizma: yakalanmamış hata", entry);
    push(entry);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const entry = {
      t: new Date().toISOString(),
      kind: "promise",
      msg: String((reason && reason.message) || reason || "bilinmeyen promise hatası"),
      where: "-",
      stack: String((reason && reason.stack) || "").slice(0, 600),
    };
    console.error("prizma: yakalanmamış promise hatası", entry);
    push(entry);
  });
}

// Tanı için: son hataları döner (geliştirici konsolundan
// window.__prizmaDebug.getErrors() ile okunabilir, bkz. main.js).
export function getErrors() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
