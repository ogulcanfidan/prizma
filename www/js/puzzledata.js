// PuzzleData — bir bulmacanın tüm sabit tanımı: ızgara boyutu, kaynaklar, hedefler,
// portallar, "Prizma Bloğu" ayırıcılar ve (varsa) sabit/değiştirilemez aynalar.
// Oyuncunun yerleştirdiği aynalar burada TUTULMAZ; onlar Board tarafında ayrı bir
// "mirrorPlacements" haritasında tutulur (bkz. board.js), çünkü PuzzleData sabittir.
// Godot scripts/PuzzleData.gd dosyasının birebir JS karşılığı.

import { Cell, posKey } from "./celltypes.js";

export class PuzzleData {
  constructor() {
    this.gridSize = { x: 0, y: 0 };
    this.cells = new Map();       // "x,y" -> Cell (sadece EMPTY-dışı girişler)
    this.sources = [];            // [{pos, dir, color}]
    this.targets = [];            // [{pos, color}]
    this.portals = new Map();     // "x,y" -> {x,y} (iki yönlü)
    this.splitters = new Map();   // "x,y" -> bool (true: doğru kol sağa döner)
    this.fixedMirrors = new Map();// "x,y" -> MirrorType

    this.title = "";
    this.tutorialText = "";
    this.maxMirrorsHint = -1;
  }

  getCell(pos) {
    if (pos.x < 0 || pos.y < 0 || pos.x >= this.gridSize.x || pos.y >= this.gridSize.y) {
      return Cell.WALL;
    }
    const v = this.cells.get(posKey(pos));
    return v === undefined ? Cell.EMPTY : v;
  }

  isInBounds(pos) {
    return pos.x >= 0 && pos.y >= 0 && pos.x < this.gridSize.x && pos.y < this.gridSize.y;
  }

  addSource(pos, dir, color) {
    this.cells.set(posKey(pos), Cell.SOURCE);
    this.sources.push({ pos, dir, color });
  }

  addTarget(pos, color) {
    this.cells.set(posKey(pos), Cell.TARGET);
    this.targets.push({ pos, color });
  }

  addWall(pos) {
    this.cells.set(posKey(pos), Cell.WALL);
  }

  removeCell(pos) {
    this.cells.delete(posKey(pos));
  }

  addPortalPair(a, b) {
    this.cells.set(posKey(a), Cell.PORTAL);
    this.cells.set(posKey(b), Cell.PORTAL);
    this.portals.set(posKey(a), b);
    this.portals.set(posKey(b), a);
  }

  // Üretici, bir portal denemesinin bulmacayı çözülemez hale getirdiğini ya da
  // istenen zorluk aralığının dışına çıkardığını tespit ederse geri almak için.
  removePortalPair(a, b) {
    this.cells.delete(posKey(a));
    this.cells.delete(posKey(b));
    this.portals.delete(posKey(a));
    this.portals.delete(posKey(b));
  }

  addSplitter(pos, branchRight) {
    this.cells.set(posKey(pos), Cell.SPLITTER);
    this.splitters.set(posKey(pos), branchRight);
  }

  // Üretici, bir splitter denemesinin bulmacayı çözülemez hale getirdiğini ya
  // da istenen zorluk aralığının dışına çıkardığını tespit ederse geri almak
  // için (bkz. generator.js → attemptSplitterJoint — removePortalPair'in
  // splitter karşılığı).
  removeSplitter(pos) {
    this.cells.delete(posKey(pos));
    this.splitters.delete(posKey(pos));
  }

  addFixedMirror(pos, mirrorType) {
    this.fixedMirrors.set(posKey(pos), mirrorType);
  }

  emptyCells() {
    const out = [];
    for (let x = 0; x < this.gridSize.x; x++) {
      for (let y = 0; y < this.gridSize.y; y++) {
        const p = { x, y };
        if (this.getCell(p) === Cell.EMPTY && !this.fixedMirrors.has(posKey(p))) {
          out.push(p);
        }
      }
    }
    return out;
  }
}
