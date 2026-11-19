import type { OpeningKind } from "./types";

/**
 * Wanderkennung aus Grundriss-Bildern (Exposé, Scan, Screenshot) – ohne KI-Dienst, rein im Browser.
 *
 * Annahme wie bei den allermeisten Wohnungsgrundrissen: Wände sind dunkel gefüllt (schwarz/grau/schraffiert)
 * und verlaufen waagerecht/senkrecht. Ablauf:
 *  1. Graustufen → Schwellwert (Otsu) → dunkle Pixel
 *  2. „Closing“ füllt Schraffuren, „Opening“ entfernt alles Dünne (Text, Maßlinien, Möbel-Symbole)
 *  3. Waagerechte/senkrechte Läufe ab Mindestlänge → zusammenhängende Flächen → Wandsegmente
 *  4. Kollineare Segmente mit Lücke zusammenfügen → Lücke = Tür (innen) bzw. Fenster (Außenwand)
 *  5. Enden an senkrechte Wände andocken (Ecken, T-Stöße)
 * Ergebnis in Bildpixeln; die Umrechnung in Meter macht der Aufrufer (Hintergrund-Maßstab).
 */

export interface DetectedWall {
  /** Mittellinie in Pixeln */
  a: { x: number; y: number };
  b: { x: number; y: number };
  thickness: number;
}

export interface DetectedOpening {
  kind: OpeningKind;
  /** Mitte der Lücke in Pixeln */
  center: { x: number; y: number };
  width: number;
  horizontal: boolean;
}

export interface DetectionResult {
  walls: DetectedWall[];
  openings: DetectedOpening[];
  /** geschätzte Stärke dünner (Innen-)Wände in Pixeln */
  wallThickness: number;
  threshold: number;
}

export interface DetectOptions {
  /** Meter pro Pixel, falls schon kalibriert – macht die Türerkennung genauer */
  metersPerPixel?: number;
  /** Stärke der Filterung (1 = normal). Kleiner = mehr Details/Störungen, größer = nur dicke Wände */
  strictness?: number;
}

// ---------- Bildoperationen auf Bitmasken (1 = dunkel) ----------

type Mask = Uint8Array;

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    // Transparenz wie weißer Hintergrund behandeln
    const l = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    g[i] = Math.round(l * a + 255 * (1 - a));
  }
  return g;
}

export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  // Helle Flächen (Raumfarben, Papiergrau) nie als Wand werten
  return Math.min(threshold, 150);
}

/**
 * Schwellwert für Wände: Wände sind die dunkelste großflächige Farbe im Plan. Liegt deren Spitze
 * deutlich unter dem Otsu-Wert, werden mitteltonige Flächen (farbige Möbel, Bodenbeläge) ausgeschlossen.
 */
export function wallThreshold(gray: Uint8Array): number {
  const otsu = otsuThreshold(gray);
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const minMass = gray.length * 0.004;
  // stärkste dunkle Spitze (Wände sind großflächig – dunkler Text oder Linien nicht)
  let peak = -1, best = 0;
  for (let v = 0; v <= otsu; v++) {
    let m = 0;
    for (let d = -3; d <= 3; d++) m += hist[v + d] ?? 0;
    if (m >= minMass && m > best) { best = m; peak = v; }
  }
  return peak < 0 ? otsu : Math.min(otsu, peak + 40);
}

/** Separables Min-/Max-Filter mit Quadrat k×k (schnell über gleitende Zähler). */
function morph(src: Mask, w: number, h: number, k: number, erode: boolean): Mask {
  if (k <= 1) return src.slice();
  const r1 = Math.floor((k - 1) / 2), r2 = k - 1 - r1;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pass = (get: (i: number) => number, set: (i: number, v: number) => void, len: number) => {
    // Zähler der gesetzten Pixel im Fenster [i-r1, i+r2]; außerhalb = 0 (Erosion) bzw. 0 (Dilatation)
    let count = 0;
    for (let i = 0; i < Math.min(r2, len); i++) count += get(i);
    for (let i = 0; i < len; i++) {
      const add = i + r2;
      if (add < len) count += get(add);
      const rem = i - r1 - 1;
      if (rem >= 0) count -= get(rem);
      const lo = Math.max(0, i - r1), hi = Math.min(len - 1, i + r2);
      const size = hi - lo + 1;
      set(i, erode ? (count === size && size === k ? 1 : 0) : count > 0 ? 1 : 0);
    }
  };
  for (let y = 0; y < h; y++) pass((x) => src[y * w + x]!, (x, v) => { tmp[y * w + x] = v; }, w);
  for (let x = 0; x < w; x++) pass((y) => tmp[y * w + x]!, (y, v) => { out[y * w + x] = v; }, h);
  return out;
}

const dilate = (m: Mask, w: number, h: number, k: number) => morph(m, w, h, k, false);
const erode = (m: Mask, w: number, h: number, k: number) => morph(m, w, h, k, true);

/**
 * Wandstärken aus der Verteilung der Lauflängen quer zu Wänden:
 * thin = dünnste deutliche Spitze (Innenwände), thick = stärkste Spitze (meist Außenwände).
 */
export function estimateWallThickness(mask: Mask, w: number, h: number): { thin: number; thick: number } {
  const hist = new Array<number>(121).fill(0);
  const count = (get: (i: number) => number, len: number) => {
    let run = 0;
    for (let i = 0; i <= len; i++) {
      if (i < len && get(i)) run++;
      else {
        if (run >= 3 && run <= 120) hist[run]! += run; // länger gewichtet: Wände sind lang, Text kurz
        run = 0;
      }
    }
  };
  for (let y = 0; y < h; y++) count((x) => mask[y * w + x]!, w);
  for (let x = 0; x < w; x++) count((y) => mask[y * w + x]!, h);
  // Glätten und die dünnste Spitze mit nennenswertem Gewicht nehmen
  const smooth = hist.map((_, i) => (hist[i - 1] ?? 0) * 0.5 + hist[i]! + (hist[i + 1] ?? 0) * 0.5);
  const max = Math.max(...smooth.slice(3));
  if (max <= 0) return { thin: 8, thick: 8 };
  let thick = 8;
  let best = 0;
  for (let i = 4; i < 120; i++) if (smooth[i]! > best) { best = smooth[i]!; thick = i; }
  // Innenwände sind kürzer als die Außenhülle → kleinere, aber klar erkennbare Spitze (≥ 4 %)
  for (let i = 5; i < thick; i++) {
    if (smooth[i]! >= max * 0.04 && smooth[i]! >= smooth[i - 1]! && smooth[i]! >= smooth[i + 1]!) return { thin: i, thick };
  }
  return { thin: thick, thick };
}

interface Box { x0: number; y0: number; x1: number; y1: number; area: number }

function components(mask: Mask, w: number, h: number): Box[] {
  const seen = new Uint8Array(w * h);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    boxes.push({ x0, y0, x1, y1, area });
  }
  return boxes;
}

/** Läufe ≥ minLen in einer Richtung behalten (waagerecht: Zeilen, senkrecht: Spalten). */
function longRuns(mask: Mask, w: number, h: number, minLen: number, horizontal: boolean): Mask {
  const out = new Uint8Array(w * h);
  const outer = horizontal ? h : w, inner = horizontal ? w : h;
  for (let o = 0; o < outer; o++) {
    let start = -1;
    for (let i = 0; i <= inner; i++) {
      const idx = horizontal ? o * w + i : i * w + o;
      const on = i < inner && mask[idx];
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start >= minLen) for (let j = start; j < i; j++) out[horizontal ? o * w + j : j * w + o] = 1;
        start = -1;
      }
    }
  }
  return out;
}

// ---------- Segmente ----------

interface Seg {
  /** schließt an mindestens eine andere Wand an */
  connected?: boolean;
  horizontal: boolean;
  /** Lage quer (y bei waagerecht, x bei senkrecht) */
  pos: number;
  from: number;
  to: number;
  thickness: number;
}

export function detectWalls(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, opts: DetectOptions = {}): DetectionResult {
  const gray = toGray(rgba, w, h);
  const threshold = wallThreshold(gray);
  let mask: Mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = gray[i]! <= threshold ? 1 : 0;

  const est0 = estimateWallThickness(mask, w, h);
  // Schraffuren/Doppellinien schließen (klein halten, damit Text nicht zu Flächen verschmilzt)
  const c = Math.max(2, Math.round(est0.thin * 0.35));
  mask = erode(dilate(mask, w, h, c), w, h, c);
  const est = estimateWallThickness(mask, w, h);
  const t = est.thin;
  const k = Math.max(3, Math.round(t * 0.6 * (opts.strictness ?? 1)));
  // Opening: alles dünner als k verschwindet (Text, Maßlinien, Möbel-Umrisse, Türbögen)
  const walls = dilate(erode(mask, w, h, k), w, h, k);

  // Länger als der Querschnitt der dicksten Wand – sonst würden Wandquerschnitte zu Mini-Wänden
  const minLen = Math.max(est.thick * 1.5, t * 2.5, k * 4);
  const segs: Seg[] = [];
  for (const horizontal of [true, false]) {
    const runs = longRuns(walls, w, h, minLen, horizontal);
    for (const b of components(runs, w, h)) {
      const len = horizontal ? b.x1 - b.x0 + 1 : b.y1 - b.y0 + 1;
      const thick = b.area / len;
      // zu dünn = Rest von Linien; zu gedrungen = Klötzchen (Stühle, Hocker, Säulen-Symbole)
      if (thick < k * 0.8 || len < minLen || len < thick * 2.5) continue;
      segs.push({
        horizontal,
        pos: horizontal ? (b.y0 + b.y1 + 1) / 2 : (b.x0 + b.x1 + 1) / 2,
        from: horizontal ? b.x0 : b.y0,
        to: horizontal ? b.x1 + 1 : b.y1 + 1,
        thickness: thick,
      });
    }
  }

  // Gesamtumriss (für Fenster-/Türunterscheidung)
  const all = segs.flatMap((s) => (s.horizontal ? [{ x: s.from, y: s.pos }, { x: s.to, y: s.pos }] : [{ x: s.pos, y: s.from }, { x: s.pos, y: s.to }]));
  const bb = all.length
    ? { minX: Math.min(...all.map((p) => p.x)), maxX: Math.max(...all.map((p) => p.x)), minY: Math.min(...all.map((p) => p.y)), maxY: Math.max(...all.map((p) => p.y)) }
    : { minX: 0, maxX: w, minY: 0, maxY: h };

  // Kollineare Stücke mit Lücke zusammenfügen → Öffnungen
  const maxGap = opts.metersPerPixel ? 2.6 / opts.metersPerPixel : t * 22;
  const minGap = opts.metersPerPixel ? 0.45 / opts.metersPerPixel : t * 2.5;
  const merged: Seg[] = [];
  const openings: DetectedOpening[] = [];
  for (const horizontal of [true, false]) {
    const list = segs.filter((s) => s.horizontal === horizontal).sort((p, q) => p.pos - q.pos || p.from - q.from);
    const used = new Array<boolean>(list.length).fill(false);
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      // alle Stücke auf derselben Linie sammeln
      const line = [list[i]!];
      for (let j = i + 1; j < list.length; j++) {
        if (used[j]) continue;
        const s = list[j]!;
        if (Math.abs(s.pos - list[i]!.pos) <= Math.max(list[i]!.thickness, s.thickness) * 0.5) { line.push(s); used[j] = true; }
      }
      line.sort((p, q) => p.from - q.from);
      let cur = { ...line[0]! };
      for (const s of line.slice(1)) {
        const gap = s.from - cur.to;
        const similar = Math.abs(s.thickness - cur.thickness) <= Math.max(s.thickness, cur.thickness) * 0.6;
        if (gap <= maxGap && similar) {
          if (gap >= minGap) {
            const mid = (cur.to + s.from) / 2;
            const exterior = horizontal
              ? Math.abs(cur.pos - bb.minY) < cur.thickness * 2 || Math.abs(cur.pos - bb.maxY) < cur.thickness * 2
              : Math.abs(cur.pos - bb.minX) < cur.thickness * 2 || Math.abs(cur.pos - bb.maxX) < cur.thickness * 2;
            openings.push({
              kind: exterior ? "window" : "door",
              center: horizontal ? { x: mid, y: cur.pos } : { x: cur.pos, y: mid },
              width: gap,
              horizontal,
            });
          }
          const total = cur.to - cur.from + (s.to - s.from);
          cur = { ...cur, to: Math.max(cur.to, s.to), thickness: (cur.thickness * (cur.to - cur.from) + s.thickness * (s.to - s.from)) / total, pos: (cur.pos + s.pos) / 2 };
        } else {
          merged.push(cur);
          cur = { ...s };
        }
      }
      merged.push(cur);
    }
  }

  // Enden an senkrechte Wände andocken: Ecken und T-Stöße treffen sich exakt auf den Mittellinien
  const tol = t * 1.2;
  for (const s of merged) {
    for (const end of ["from", "to"] as const) {
      let best: { pos: number; d: number; o: Seg } | null = null;
      for (const o of merged) {
        if (o.horizontal === s.horizontal) continue;
        // o muss quer über unserer Linie liegen
        if (s.pos < o.from - tol || s.pos > o.to + tol) continue;
        const d = Math.abs(o.pos - s[end]);
        if (d <= o.thickness / 2 + s.thickness + tol && (!best || d < best.d)) best = { pos: o.pos, d, o };
      }
      if (best) { s[end] = best.pos; s.connected = true; best.o.connected = true; }
    }
  }
  // Auch die Querlinie an Enden anpassen: senkrechte Wand, die knapp vor einer waagerechten endet
  for (const s of merged) {
    for (const end of ["from", "to"] as const) {
      for (const o of merged) {
        if (o.horizontal === s.horizontal) continue;
        if (Math.abs(o.pos - s[end]) > 0.5) continue;
        if (Math.abs(o.from - s.pos) <= o.thickness + tol) o.from = s.pos;
        if (Math.abs(o.to - s.pos) <= o.thickness + tol) o.to = s.pos;
      }
    }
  }

  // Freistehende kurze Stücke sind fast immer dunkle Möbel (TV-Board, Kücheninsel-Symbol)
  const isolatedMax = opts.metersPerPixel ? 3 / opts.metersPerPixel : t * 25;
  const result: DetectedWall[] = merged
    .filter((s) => s.to - s.from > s.thickness * 0.8)
    .filter((s) => s.connected || s.to - s.from >= isolatedMax)
    .map((s) => ({
      a: s.horizontal ? { x: s.from, y: s.pos } : { x: s.pos, y: s.from },
      b: s.horizontal ? { x: s.to, y: s.pos } : { x: s.pos, y: s.to },
      thickness: s.thickness,
    }));

  return { walls: result, openings, wallThickness: t, threshold };
}
