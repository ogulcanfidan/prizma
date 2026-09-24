// haptics.js — dokunsal geri bildirim (titreşim).
//
// Ayrı bir Capacitor eklentisi GEREKMEZ: Android WebView navigator.vibrate()
// destekliyor (manifeste eklenen android.permission.VIBRATE izni yeterli, bu
// izin kurulumda kullanıcıya sorulmaz). Desteklemeyen ortamlarda (web
// önizleme, iOS Safari) sessizce hiçbir şey yapmaz.
//
// Ayarlardan kapatılabilir (GameState.settings.vibrationEnabled).

import { GameState } from "./gamestate.js";

// Süreler bilinçli olarak KISA: bulmaca oyununda titreşim "fark edilir ama
// rahatsız etmez" olmalı.
const PATTERNS = {
  place: 12, // ayna koyma/döndürme
  remove: 8, // ayna kaldırma
  solve: [0, 30, 60, 60], // çözüldü — iki kısa darbe
  fail: [0, 18, 40, 18], // yanlış yerleşim
};

export function vibrate(kind) {
  if (!GameState.settings.vibrationEnabled) return;
  const pattern = PATTERNS[kind];
  if (pattern === undefined) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    /* desteklenmiyor / engellendi — yok say */
  }
}
