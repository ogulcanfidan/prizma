// GameState — Sudoku-modeli ilerlemeyi tutar: "level N" yok, bunun yerine
// zorluk başına çözülen bulmaca sayısı, en iyi süre ve mevcut/en iyi seri
// (streak) tutulur. localStorage'a kaydedilir (Godot sürümünde user://
// prizma_stats.json idi — web/Capacitor'de doğal karşılığı localStorage).
// Godot autoload/GameState.gd dosyasının birebir JS karşılığı.
//
// v2 (genişletildi — aynı SAVE_KEY korunuyor, eski kayıtlar yeni alanlar
// için varsayılanlarla sorunsuz yükleniyor):
//  - settings: müzik/efekt sesi seviyesi + günlük bildirim açık/kapalı.
//  - playHours: 24 saatlik "en çok ne zaman oynadı" histogramı — bildirim
//    saatini hesaplamak için (bkz. notifications.js).
//  - allowance: günlük bulmaca hakkı ekonomisi — hakkın gün içinde kademeli
//    değil SÜREKLİ (anlık, adım adım değil) dolması hedeflenir: 24 saat /
//    30 hak = 48 dakikada bir +1 hak. Reklam izleyince +15, 39.99 TL'lik
//    uygulama içi alımla `unlimited=true` olup hak hiç tükenmez.

const SAVE_KEY = "prizma_stats_v1";

export const DIFFICULTIES = ["kolay", "orta", "zor", "usta"];

// --- Puan + Ünvan sistemi ----------------------------------------------------
// "Ne kadar iyisin?" ekranındaki üst özet artık ham "toplam çözülen bulmaca
// sayısı" yerine PUAN gösteriyor (zorluk arttıkça puan da orantısız artıyor,
// böylece zor/usta çözmek gerçek anlamda daha çok "değer" taşıyor) ve "en iyi
// seri" yerine bu toplam puana göre belirlenen bir ÜNVAN gösteriyor (bkz.
// main.js → refreshStats). Puan sınırları (0-500 / 500-1500 / 1500-3000 /
// 3000-5000 / 5000+) tasarım kararıyla belirlendi; ünvan adları oyunun
// Işın/Prizma temasına uygun, zorluk etiketleriyle (Kolay/Orta/Zor/Usta)
// çakışmayan, artan prestijde bir sıralama olacak şekilde seçildi.
export const DIFFICULTY_POINTS = { kolay: 1, orta: 5, zor: 9, usta: 17 };

// Zorluğa göre değişken hak tüketimi: kolay ve orta bulmacalar için 1, zor
// için 2, usta için 3 kredi harcanır. Eskiden TÜM zorluklar sabit 1 hak
// tüketiyordu (main.js -> tryStartEndlessPuzzle -> consumeAllowance(1));
// artık zorluğa göre değişken. `consumeAllowance` zaten değişken `n`
// parametresi kabul ediyordu (bkz. aşağıda) — sadece main.js'teki çağrı
// sitesi bu haritayla güncellendi.
export const DIFFICULTY_ALLOWANCE_COST = { kolay: 1, orta: 1, zor: 2, usta: 3 };

export function allowanceCost(diff) {
  return DIFFICULTY_ALLOWANCE_COST[diff] || 1;
}

const RANK_TIERS = [
  { min: 0, max: 500, key: "newPlayer" },
  { min: 500, max: 1500, key: "amateur" },
  { min: 1500, max: 3000, key: "expert" },
  { min: 3000, max: 5000, key: "prismMaster" },
  { min: 5000, max: Infinity, key: "legend" },
];

// Sadece rütbe ANAHTARINI döner (görünen metin i18n.js → t('rank.'+key) ile
// dile göre üretilir — bkz. main.js → refreshStats).
export function rankKeyForPoints(points) {
  for (const tier of RANK_TIERS) {
    if (points >= tier.min && points < tier.max) return tier.key;
  }
  return RANK_TIERS[RANK_TIERS.length - 1].key;
}

export const ALLOWANCE_CAP = 30;
// "24 saati 30'a böl, uygula" — 24*60/30 = 48 dakikada bir +1 hak.
export const ALLOWANCE_REFILL_MS = (24 * 60 * 60 * 1000) / ALLOWANCE_CAP;
export const REWARDED_AD_BONUS = 15;

function defaultStats() {
  const d = {};
  for (const diff of DIFFICULTIES) {
    // totalTimeMs — "Ne kadar iyisin?" istatistik ekranında ortalama süre
    // hesaplamakta kullanılır (bkz. recordSolve/averageTimeMs).
    d[diff] = { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
  }
  return d;
}

function defaultSettings() {
  // language: "auto" (varsayılan — cihaz diline göre otomatik algıla, bkz.
  // i18n.js → detectLanguage) ya da desteklenen bir dil kodu (kullanıcı
  // Ayarlar'dan elle seçtiyse, bkz. i18n.js → setLanguage).
  return { musicVolume: 0.6, sfxVolume: 0.8, notificationsEnabled: true, language: "auto" };
}

class GameStateStore {
  constructor() {
    this.stats = defaultStats();
    this.onboardingCompleted = false;
    this.settings = defaultSettings();
    this.playHours = new Array(24).fill(0);
    this.allowance = ALLOWANCE_CAP;
    this.allowanceLastUpdateMs = Date.now();
    this.unlimited = false;
    this._load();
    this._refillAllowance();
  }

  recordSolve(difficulty, timeMs) {
    if (!this.stats[difficulty]) {
      this.stats[difficulty] = { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
    }
    const s = this.stats[difficulty];
    s.solved += 1;
    s.totalTimeMs = (s.totalTimeMs || 0) + timeMs;
    if (s.bestTimeMs < 0 || timeMs < s.bestTimeMs) s.bestTimeMs = timeMs;
    s.currentStreak += 1;
    if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
    this._save();
  }

  recordFailOrSkip(difficulty) {
    if (!this.stats[difficulty]) {
      this.stats[difficulty] = { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
    }
    this.stats[difficulty].currentStreak = 0;
    this._save();
  }

  // Ortalama çözüm süresi (ms) — hiç çözülmediyse YA DA süre verisi hiç
  // birikmediyse (totalTimeMs alanının eklenmesinden ÖNCEKİ eski kayıtlardan
  // gelen "solved" sayıları — bu çözümlerin gerçek süresi hiç kaydedilmemişti)
  // -1 döner. Bu, bazı zorluklarda ortalama sürenin hiç hesaplanmadığı
  // sorununun kök sebebiydi — eski solved>0 kayıtlarında totalTimeMs=0
  // olduğu için ortalama yanlışlıkla "00:00" gösteriliyordu; şimdi bu
  // durumda dürüstçe "—" gösteriliyor (bkz. main.js → formatStatTime), yeni
  // çözümler biriktikçe gerçek ortalama görünmeye başlar.
  averageTimeMs(difficulty) {
    const s = this.stats[difficulty];
    if (!s || !s.solved || !s.totalTimeMs) return -1;
    return Math.round(s.totalTimeMs / s.solved);
  }

  // Tüm zorluklardaki çözümlerden toplam puan (bkz. DIFFICULTY_POINTS).
  totalPoints() {
    let total = 0;
    for (const diff of DIFFICULTIES) {
      const s = this.stats[diff];
      if (s) total += (s.solved || 0) * (DIFFICULTY_POINTS[diff] || 0);
    }
    return total;
  }

  markOnboardingCompleted() {
    this.onboardingCompleted = true;
    this._save();
  }

  // --- Oynama saatleri ---------------------------------------------------
  // NOT: `notifications.js` artık bildirim saatini BUNDAN hesaplamıyor (bkz.
  // `msUntilFullAllowance()` ve dosya başındaki not) — "belirli saatte
  // değil, hak dolunca" mantığına geçildi. Histogram yine de tutuluyor
  // (ileride başka bir amaçla kullanılabilir, kaldırmak veri kaybı dışında
  // bir fayda sağlamıyor).

  // Her oyun ekranına girişte (onboarding hariç, bkz. main.js) çağrılır.
  recordPlaySession() {
    const hour = new Date().getHours();
    this.playHours[hour] = (this.playHours[hour] || 0) + 1;
    this._save();
  }

  // En çok oynanan saat (0-23) ya da hiç veri yoksa null.
  mostPlayedHour() {
    let best = -1;
    let bestCount = 0;
    for (let h = 0; h < 24; h++) {
      if ((this.playHours[h] || 0) > bestCount) {
        bestCount = this.playHours[h];
        best = h;
      }
    }
    return bestCount > 0 ? best : null;
  }

  // --- Ayarlar ---------------------------------------------------------------

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this._save();
  }

  // --- Günlük bulmaca hakkı ekonomisi -----------------------------------------

  // Son kayıtlı zamandan bu yana geçen süreyi sürekli (kesirli) hak olarak
  // hesaba katar — "kademeli değil, gün içinde sürekli dolsun" isteği.
  _refillAllowance() {
    if (this.unlimited) return;
    const now = Date.now();
    const elapsed = now - this.allowanceLastUpdateMs;
    if (elapsed <= 0) return;
    const gained = elapsed / ALLOWANCE_REFILL_MS;
    if (this.allowance < ALLOWANCE_CAP) {
      this.allowance = Math.min(ALLOWANCE_CAP, this.allowance + gained);
    }
    this.allowanceLastUpdateMs = now;
  }

  // Tam sayı olarak gösterilecek kalan hak (UI için) — sınırsızsa Infinity.
  get remainingAllowance() {
    this._refillAllowance();
    return this.unlimited ? Infinity : Math.floor(this.allowance);
  }

  // n artık zorluğa göre değişken maliyet olabilir (bkz.
  // allowanceCost/DIFFICULTY_ALLOWANCE_COST) — varsayılan 1, eski
  // çağrı yerleriyle (n verilmeden) geriye dönük uyumlu.
  canPlay(n = 1) {
    return this.unlimited || this.remainingAllowance >= n;
  }

  // Yeni bir bulmaca başlatmadan önce çağrılır. Yetmezse false döner (main.js
  // reklam izleme / sınırsız alım teklifini gösterir).
  consumeAllowance(n = 1) {
    if (this.unlimited) return true;
    this._refillAllowance();
    if (this.allowance < n) return false;
    this.allowance -= n;
    this._save();
    return true;
  }

  // Ödüllü reklam izleyince çağrılır. Bonus eklenirken de ALLOWANCE_CAP'e
  // sıkıca sınırlanıyor (eskiden sadece doğal dolumda sınırlanıyordu, reklam
  // bonusu tavanı aşabiliyordu — örn. 20 hak varken reklam izleyip 35'e
  // çıkabiliyordu).
  addAllowance(n) {
    this._refillAllowance();
    this.allowance = Math.min(ALLOWANCE_CAP, this.allowance + n);
    this._save();
  }

  // 39.99 TL uygulama içi alım tamamlanınca çağrılır.
  grantUnlimited() {
    this.unlimited = true;
    this._save();
  }

  // Bir sonraki +1 hakka kalan süre (ms) — 0 ise zaten tavanda/sınırsız.
  msUntilNextAllowance() {
    if (this.unlimited) return 0;
    this._refillAllowance();
    if (this.allowance >= ALLOWANCE_CAP) return 0;
    const frac = this.allowance - Math.floor(this.allowance);
    return Math.max(0, Math.round((1 - frac) * ALLOWANCE_REFILL_MS));
  }

  // TAMAMEN dolmasına (ALLOWANCE_CAP) kalan süre (ms) — 0 ise zaten tavanda/
  // sınırsız. `notifications.js` artık günün sabit bir saatinde DEĞİL, hak
  // tam dolduğu ANDA bir kereliğine bildirim planlamak için bunu kullanıyor.
  msUntilFullAllowance() {
    if (this.unlimited) return 0;
    this._refillAllowance();
    if (this.allowance >= ALLOWANCE_CAP) return 0;
    const remainingPoints = ALLOWANCE_CAP - this.allowance;
    return Math.max(0, Math.round(remainingPoints * ALLOWANCE_REFILL_MS));
  }

  _load() {
    this.stats = defaultStats();
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (!text) return;
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) return;
      if (parsed.stats) {
        for (const diff of DIFFICULTIES) {
          // Eski kayıtlarda totalTimeMs yok — varsayılanla birleştirip
          // eksik alanı 0'la dolduruyoruz (crash/NaN önlemi).
          if (parsed.stats[diff]) this.stats[diff] = { ...this.stats[diff], ...parsed.stats[diff] };
        }
      }
      if (typeof parsed.onboardingCompleted === "boolean") {
        this.onboardingCompleted = parsed.onboardingCompleted;
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        this.settings = { ...defaultSettings(), ...parsed.settings };
      }
      if (Array.isArray(parsed.playHours) && parsed.playHours.length === 24) {
        this.playHours = parsed.playHours.map((n) => (typeof n === "number" && n >= 0 ? n : 0));
      }
      if (typeof parsed.allowance === "number" && !Number.isNaN(parsed.allowance)) {
        this.allowance = parsed.allowance;
      }
      if (typeof parsed.allowanceLastUpdateMs === "number" && parsed.allowanceLastUpdateMs > 0) {
        this.allowanceLastUpdateMs = parsed.allowanceLastUpdateMs;
      }
      if (typeof parsed.unlimited === "boolean") {
        this.unlimited = parsed.unlimited;
      }
    } catch (e) {
      console.error("GameState: kayıt okunamadı", e);
    }
  }

  _save() {
    try {
      const payload = {
        stats: this.stats,
        onboardingCompleted: this.onboardingCompleted,
        settings: this.settings,
        playHours: this.playHours,
        allowance: this.allowance,
        allowanceLastUpdateMs: this.allowanceLastUpdateMs,
        unlimited: this.unlimited,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("GameState: kayıt yazılamadı", e);
    }
  }
}

export const GameState = new GameStateStore();
