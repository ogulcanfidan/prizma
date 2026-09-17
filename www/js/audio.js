// AudioEngine — Web Audio API tabanlı, dosyasız müzik + efekt motoru.
//
// NEDEN SENTEZ: projede tek bir ses/müzik asset dosyası yok (hazır .mp3/.ogg
// eklemek için gerçek stüdyo materyali gerekir). Bunun yerine Web Audio API
// osilatörleriyle hafif bir "ambient lab" arpej döngüsü + kısa efekt
// "blip"leri anlık üretiliyor — ek dosya/indirme gerektirmez, Capacitor
// WebView'inde de (native ses dosyası sistemi olmadan) sorunsuz çalışır.
//
// Tarayıcı/WebView autoplay politikaları AudioContext'in kullanıcı
// dokunuşundan ÖNCE ses çalmasına izin vermez — bu yüzden context ilk
// dokunuşta (main.js → unlockAudio()) kurulur.

import { GameState } from "./gamestate.js";

let ctx = null;
let musicGain = null;
let musicFilter = null;
let musicPanner = null; // bkz. ensureContext() içindeki not
let sfxGain = null;
let musicTimer = null;
let musicPlaying = false;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (e) {
    console.warn("AudioEngine: AudioContext oluşturulamadı", e);
    return null;
  }
  musicGain = ctx.createGain();
  musicGain.gain.value = GameState.settings.musicVolume;
  musicGain.connect(ctx.destination);
  // Önceki drone+pad+twinkle tasarımı KORUNUYOR (bu yön zaten onaylanmıştı;
  // "değişmemiş" izlenimi muhtemelen www/ değişikliklerinin cihaza
  // ULAŞMAMASIYLA ilgiliydi — bkz. `npx cap sync android` adımı) — ama
  // şüpheye yer bırakmamak için AYRICA gerçek, net duyulabilir iki yeni
  // katman eklendi (bkz. musicPanner burada, playChordChime() aşağıda):
  //  1) Stereo panner: tüm müzik artık çok yavaş (bkz. panLfo, ~45sn'de bir
  //     tam gidiş-dönüş) sağa/sola kayıyor — kulaklıkla/stereo hoparlörle
  //     kolayca fark edilir bir "nefes alma" hissi.
  //  2) Her akor geçişinde (9sn'de bir) yumuşak bir "chime" (çan) notası —
  //     eskiden HİÇ yoktu, yeni ve belirgin bir işitsel olay.
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 1500;
  musicFilter.Q.value = 0.5;
  musicPanner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (musicPanner) {
    musicFilter.connect(musicPanner);
    musicPanner.connect(musicGain);
    const panLfo = ctx.createOscillator();
    panLfo.type = "sine";
    panLfo.frequency.value = 1 / 45; // ~45 saniyede bir tam sağ-sol döngüsü
    const panLfoGain = ctx.createGain();
    panLfoGain.gain.value = 0.35; // -0.35..0.35 arası, hafif/rahatsız etmeyen
    panLfo.connect(panLfoGain);
    panLfoGain.connect(musicPanner.pan);
    panLfo.start();
  } else {
    musicFilter.connect(musicGain); // StereoPanner desteklenmiyorsa eski yol
  }
  // Filtrenin kesim frekansı çok yavaş bir LFO ile hafifçe "nefes alıyor"
  // (sapma+hız daha da azaltıldı — daha sakin/az fark edilir).
  const filterLfo = ctx.createOscillator();
  filterLfo.type = "sine";
  filterLfo.frequency.value = 0.035;
  const filterLfoGain = ctx.createGain();
  filterLfoGain.gain.value = 380;
  filterLfo.connect(filterLfoGain);
  filterLfoGain.connect(musicFilter.frequency);
  filterLfo.start();
  sfxGain = ctx.createGain();
  sfxGain.gain.value = GameState.settings.sfxVolume;
  sfxGain.connect(ctx.destination);
  return ctx;
}

// İlk kullanıcı dokunuşunda çağrılmalı (main.js). AudioContext'i kurar/
// devam ettirir ve arka plan müziğini başlatır.
export function unlockAudio() {
  const c = ensureContext();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  startMusic();
}

export function setMusicVolume(v) {
  GameState.updateSettings({ musicVolume: v });
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export function setSfxVolume(v) {
  GameState.updateSettings({ sfxVolume: v });
  if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export function getMusicVolume() {
  return GameState.settings.musicVolume;
}

export function getSfxVolume() {
  return GameState.settings.sfxVolume;
}

// --- Arka plan müziği: ÜÇÜNCÜ KEZ YENİDEN TASARLANDI (daha huzur veren,
// sakin bir müzik hedefiyle) -------------------------------------------------
// Önceki iki sürüm (Am-F-C-G ve G-D-Em-C akor dizileri) İKİSİ de aynı
// RİTMİK İSKELETİ paylaşıyordu: her ~1.5 saniyede bir METRONOMİK/düzenli
// aralıklarla çalan bir arpej notası — sadece akorlar/doku değişmişti,
// "sürekli tık tık çalan" hissi kalmıştı, bu yüzden "huzur veren" olarak
// okunmadı. Bu sürüm KÖKTEN farklı: düzenli aralıklı arpej YOK. Bunun
// yerine klasik ambient teknikleri: (1) hiç değişmeyen, çok alçak sesli bir
// "drone" (sabit kök nota) — müziğin zemini, (2) ÇOK YAVAŞ akor pad
// geçişleri (her 9 saniyede bir), (3) DÜZENSİZ/rastgele aralıklarla (2.5-6sn
// arası) tek tek beliren, uzun sönüşlü yumuşak "parıltı" notaları — rüzgar
// çanı gibi, mekanik değil organik. Toplam etki: sakin, sabırlı, yavaş
// nefes alan bir fon — bir "iskelet"i tekrarlamak yerine gerçekten farklı
// bir müzikal yaklaşım.
const DRONE_FREQ = 98.0; // G2 — hiç değişmeyen sabit kök nota
// Müziği daha melodik hale getirme amacıyla yeniden tasarlandı. Eskiden her
// akorun "twinkle" katmanı RASTGELE bir nota + RASTGELE bir bekleme
// süresiyle çalıyordu — kulak bunu bir doku/tını olarak duyuyordu ama
// gerçek bir EZGİ olarak takip edemiyordu (rastgele sıra = hatırlanabilir
// bir cümle yok). `melody` dizisi artık akor başına SABİT SIRALI 4 nota —
// G majör diyatonik (pad akorlarıyla aynı tonalite), akorlar boyunca tek
// bir baştan sona takip edilebilir ezgi hattı oluşturuyor:
//   G  (I):   sol4-si4-re5-si4   (392 - 493.88 - 587.33 - 493.88)
//   D  (V):   fa#4-la4-re5-la4   (369.99 - 440 - 587.33 - 440)
//   Em (vi):  sol4-si4-re5-sol4  (392 - 493.88 - 587.33 - 392)
//   C  (IV):  sol4-do5-mi5-do5   (392 - 523.25 - 659.25 - 523.25)
// Çalma zamanlaması (bkz. scheduleMelodyForChord) TAM metronomik değil —
// önceki "sürekli tık tık çalan" hissini tekrarlamamak için notalar arası
// süreye küçük rastgele bir sapma eklendi — ama artık notaların SIRASI
// rastgele DEĞİL. Nota tınısı (yumuşak sine, uzun üstel sönüş) eski
// twinkle'la BİREBİR aynı bırakıldı — genel doku korunurken değişen sadece
// "hangi nota ne zaman"ın artık rastgele değil müzikal bir cümle kurması.
const MUSIC_PROGRESSION = [
  { pad: [196.0, 246.94, 293.66], melody: [392.0, 493.88, 587.33, 493.88] }, // G
  { pad: [293.66, 369.99, 440.0], melody: [369.99, 440.0, 587.33, 440.0] }, // D
  { pad: [164.81, 196.0, 246.94], melody: [392.0, 493.88, 587.33, 392.0] }, // Em
  { pad: [261.63, 329.63, 392.0], melody: [392.0, 523.25, 659.25, 523.25] }, // C
];
const CHORD_MS = 9000; // her akorda kalış süresi — eskiden 1.5sn'de bir NOTA değişiyordu, şimdi 9sn'de bir AKOR

let chordIndex = 0;
let pad = null; // { oscs:[], gains:[] } — aktif akorun sürekli çalan zemin sesi
let drone = null; // { osc, g } — hiç durmayan sabit kök nota
let chordTimer = null;
let melodyTimers = []; // her akorda o akorun 4 notası için setTimeout id'leri (bkz. scheduleMelodyForChord)

function stopPad(fadeMs = 2000) {
  if (!pad || !ctx) return;
  const t = ctx.currentTime;
  const fadeSec = fadeMs / 1000;
  for (let i = 0; i < pad.oscs.length; i++) {
    try {
      pad.gains[i].gain.cancelScheduledValues(t);
      pad.gains[i].gain.setValueAtTime(pad.gains[i].gain.value, t);
      pad.gains[i].gain.linearRampToValueAtTime(0, t + fadeSec);
      pad.oscs[i].stop(t + fadeSec + 0.05);
    } catch (e) {
      /* zaten durmuş bir osc — yoksay */
    }
  }
  pad = null;
}

function startPadForChord(chordFreqs) {
  if (!ctx || !musicFilter) return;
  stopPad(2500);
  const oscs = [];
  const gains = [];
  const t = ctx.currentTime;
  for (const freq of chordFreqs) {
    // Ana osilatör (temel zemin sesi, bir oktav aşağıda — daha derin/sakin).
    // Atak süresi 1.8sn->3sn'ye uzatıldı — daha da yumuşak/fark edilmez bir
    // "içeri süzülme", tepe ses seviyesi de hafifçe düşürüldü.
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq / 2;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(musicFilter);
    g.gain.linearRampToValueAtTime(0.042, t + 3);
    osc.start(t);
    oscs.push(osc);
    gains.push(g);

    // Hafif detune'lu ("shimmer"/chorus hissi) ikinci katman.
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.value = freq / 2;
    osc2.detune.value = 6;
    g2.gain.value = 0;
    osc2.connect(g2);
    g2.connect(musicFilter);
    g2.gain.linearRampToValueAtTime(0.018, t + 3);
    osc2.start(t);
    oscs.push(osc2);
    gains.push(g2);
  }
  pad = { oscs, gains };
}

function startDrone() {
  if (!ctx || !musicFilter || drone) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = DRONE_FREQ;
  g.gain.value = 0;
  osc.connect(g);
  g.connect(musicFilter);
  g.gain.linearRampToValueAtTime(0.032, ctx.currentTime + 3.5);
  osc.start();
  drone = { osc, g };
}

function stopDrone() {
  if (!drone || !ctx) return;
  const t = ctx.currentTime;
  try {
    drone.g.gain.cancelScheduledValues(t);
    drone.g.gain.setValueAtTime(drone.g.gain.value, t);
    drone.g.gain.linearRampToValueAtTime(0, t + 1.5);
    drone.osc.stop(t + 1.6);
  } catch (e) {
    /* zaten durmuş — yoksay */
  }
  drone = null;
}

// Her akor geçişinde (bkz. scheduleChord) bir kez çalan, yumuşak/uzun
// sönüşlü bir "chime" (çan) notası — akorun kök notasının bir oktav üstü +
// saf beşlisi (iki kısa sine partial), twinkle'dan (rastgele aralık, tek
// nota) ve pad'den (sürekli, akor) AYRI/belirgin bir katman.
function playChordChime(chordFreqs) {
  if (!ctx || !musicFilter) return;
  const root = chordFreqs[0] * 2; // kök nota, bir oktav üstü
  const fifth = chordFreqs[0] * 3; // saf beşli (bir oktav + beşli üstü)
  const t0 = ctx.currentTime;
  for (const [freq, delay, peak] of [
    [root, 0, 0.05],
    [fifth, 0.12, 0.032],
  ]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(musicFilter);
    const t = t0 + delay;
    g.gain.linearRampToValueAtTime(peak, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 4.5);
    osc.start(t);
    osc.stop(t + 4.6);
  }
}

function scheduleChord() {
  if (!musicPlaying || !ctx) return;
  const chord = MUSIC_PROGRESSION[chordIndex];
  startPadForChord(chord.pad);
  playChordChime(chord.pad);
  scheduleMelodyForChord(chord.melody);
  chordIndex = (chordIndex + 1) % MUSIC_PROGRESSION.length;
  chordTimer = setTimeout(scheduleChord, CHORD_MS);
}

// bkz. MUSIC_PROGRESSION üstündeki not. Akorun 4 notalık SABİT SIRALI
// motifini, akorun CHORD_MS'lik (9sn) penceresine yayarak çalar — notalar
// arası süre eşit dilimlere bölünür ama her birine küçük (±%9) rastgele bir
// sapma eklenir (mekanik/metronomik hissetmesin diye), SIRA asla karışmaz.
// Nota sesi (yumuşak sine + uzun üstel sönüş) eski twinkle katmanıyla
// birebir aynı — sadece zamanlama artık rastgele değil.
function scheduleMelodyForChord(melodyNotes) {
  if (!ctx || !musicFilter) return;
  const slotMs = CHORD_MS / melodyNotes.length;
  melodyNotes.forEach((freq, i) => {
    const jitterMs = (Math.random() - 0.5) * slotMs * 0.18;
    const delayMs = Math.max(0, i * slotMs + slotMs * 0.15 + jitterMs);
    const timerId = setTimeout(() => {
      if (!musicPlaying || !ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(musicFilter);
      const t0 = ctx.currentTime;
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + slotMs / 1000 + 1.6);
      osc.start(t0);
      osc.stop(t0 + slotMs / 1000 + 1.7);
    }, delayMs);
    melodyTimers.push(timerId);
  });
}

export function startMusic() {
  const c = ensureContext();
  if (!c || musicPlaying) return;
  if (c.state === "suspended") c.resume();
  musicPlaying = true;
  startDrone();
  scheduleChord();
}

// Uygulama arka plana alındığında müziğin çalmaya devam etmesi sorununu
// gidermek için main.js → wireAppLifecycle() uygulama arka plana girdiğinde
// bunu çağırıyor. Zamanlayıcılar VE devam eden pad/drone sesleri (eskiden
// sadece zamanlayıcı durduruluyordu, seslerin uzun sönüşü arka planda bir
// süre daha duyulabiliyordu) birlikte kapatılır.
export function stopMusic() {
  musicPlaying = false;
  if (chordTimer) clearTimeout(chordTimer);
  chordTimer = null;
  melodyTimers.forEach((id) => clearTimeout(id));
  melodyTimers = [];
  stopPad(1200);
  stopDrone();
}

// --- Kısa efektler -----------------------------------------------------------
function blip({ freq = 440, dur = 0.12, type = "sine", gainPeak = 0.3, sweepTo = null }) {
  const c = ensureContext();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (sweepTo) {
    try {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), c.currentTime + dur);
    } catch (e) {
      /* geçersiz sweep değeri — sessizce yoksay */
    }
  }
  g.gain.value = 0;
  osc.connect(g);
  g.connect(sfxGain);
  const t0 = c.currentTime;
  g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// name: "place" | "remove" | "fire" | "solve" | "fail" | "click"
export function playSfx(name) {
  switch (name) {
    case "place":
      blip({ freq: 520, dur: 0.08, type: "triangle", gainPeak: 0.22 });
      break;
    case "remove":
      blip({ freq: 300, dur: 0.07, type: "triangle", gainPeak: 0.18 });
      break;
    case "fire":
      blip({ freq: 180, dur: 0.35, type: "sawtooth", gainPeak: 0.26, sweepTo: 900 });
      break;
    case "solve":
      blip({ freq: 523.25, dur: 0.15, type: "sine", gainPeak: 0.28 });
      setTimeout(() => blip({ freq: 659.25, dur: 0.15, type: "sine", gainPeak: 0.28 }), 90);
      setTimeout(() => blip({ freq: 783.99, dur: 0.32, type: "sine", gainPeak: 0.3 }), 180);
      break;
    case "fail":
      blip({ freq: 220, dur: 0.3, type: "square", gainPeak: 0.22, sweepTo: 110 });
      break;
    case "click":
      blip({ freq: 700, dur: 0.05, type: "triangle", gainPeak: 0.16 });
      break;
    default:
      break;
  }
}
