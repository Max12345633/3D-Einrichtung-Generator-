import * as THREE from "three";
import type { FloorMaterial, MaterialRole } from "@raumwerk/core";

/**
 * Prozedurale Texturen und Materialien – ohne externe Assets, deterministisch (Seed),
 * kachelbar und vom Path-Tracer unterstützt (Map + Repeat).
 * Alle Texturen werden einmal erzeugt und geteilt.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}

function toTexture(c: HTMLCanvasElement, repeat: number, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kachelbares Wertrauschen (für Beton, Putz, Stoff). */
function noiseLayer(ctx: CanvasRenderingContext2D, size: number, cells: number, amp: number, seed: number) {
  const r = rng(seed);
  const grid = Array.from({ length: cells * cells }, () => r());
  const at = (x: number, y: number) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)]!;
  const img = ctx.getImageData(0, 0, size, size);
  const cellPx = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cellPx, gy = y / cellPx;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
      const d = (v - 0.5) * amp * 255;
      const i = (y * size + x) * 4;
      img.data[i] = clamp255(img.data[i]! + d);
      img.data[i + 1] = clamp255(img.data[i + 1]! + d);
      img.data[i + 2] = clamp255(img.data[i + 2]! + d);
    }
  }
  ctx.putImageData(img, 0, 0);
}
const clamp255 = (n: number) => Math.max(0, Math.min(255, n));

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

// ---------- Böden ----------

/** Dielenboden: Textur deckt 2 × 2 m ab, 11 Reihen à ~18 cm, versetzte Stöße, Maserung, Fugen. */
function woodPlanks(base: string, seed: number): THREE.CanvasTexture {
  const S = 1024;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  const rows = 11;
  const rowH = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 400;
    while (x < S) {
      const len = 380 + r() * 420;
      const tone = 0.86 + r() * 0.22;
      const y = row * rowH;
      const draw = (ox: number) => {
        ctx.fillStyle = shade(base, tone);
        ctx.fillRect(x + ox, y, len, rowH);
        // Maserung: feine, leicht wellige Linien entlang der Diele
        const lines = 26;
        for (let l = 0; l < lines; l++) {
          const ly = y + 3 + r() * (rowH - 6);
          ctx.strokeStyle = `rgba(${r() < 0.5 ? "60,35,15" : "255,240,220"},${0.04 + r() * 0.08})`;
          ctx.lineWidth = 0.6 + r() * 1.6;
          ctx.beginPath();
          const amp = 1 + r() * 3;
          const freq = 0.004 + r() * 0.01;
          const ph = r() * 10;
          for (let px = 0; px <= len; px += 12) ctx.lineTo(x + ox + px, ly + Math.sin(px * freq + ph) * amp);
          ctx.stroke();
        }
        if (r() < 0.25) {
          ctx.fillStyle = "rgba(70,40,20,0.25)";
          ctx.beginPath();
          ctx.ellipse(x + ox + r() * len, y + rowH / 2, 6 + r() * 6, 3 + r() * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Fugen
        ctx.fillStyle = "rgba(40,25,12,0.55)";
        ctx.fillRect(x + ox, y, len, 1.5);
        ctx.fillRect(x + ox, y, 1.5, rowH);
      };
      draw(0);
      if (x + len > S) draw(-S); // nahtlos über den Rand
      if (x < 0) draw(S);
      x += len;
    }
  }
  return toTexture(c, 0.5);
}

function concrete(seed: number): THREE.CanvasTexture {
  const S = 1024;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = "#a9a7a2";
  ctx.fillRect(0, 0, S, S);
  noiseLayer(ctx, S, 8, 0.12, seed);
  noiseLayer(ctx, S, 32, 0.08, seed + 1);
  noiseLayer(ctx, S, 128, 0.06, seed + 2);
  const r = rng(seed + 3);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? "40,40,40" : "240,240,240"},${0.05 + r() * 0.1})`;
    ctx.beginPath();
    ctx.arc(r() * S, r() * S, 0.5 + r() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 1 / 3);
}

/** Fliesen 60 × 60 cm: Textur = 1,2 m (2 × 2 Fliesen). */
function tiles(base: string, grout: string, seed: number): THREE.CanvasTexture {
  const S = 1024;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  const n = 2;
  const t = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade(base, 0.96 + r() * 0.06);
      ctx.fillRect(i * t, j * t, t, t);
    }
  }
  noiseLayer(ctx, S, 16, 0.05, seed + 1);
  ctx.fillStyle = grout;
  for (let k = 0; k <= n; k++) {
    ctx.fillRect(k * t - 3, 0, 6, S);
    ctx.fillRect(0, k * t - 3, S, 6);
  }
  return toTexture(c, 1 / 1.2);
}

const floorCache = new Map<FloorMaterial, THREE.MeshStandardMaterial>();
export function floorMaterial(kind: FloorMaterial = "oak-light"): THREE.MeshStandardMaterial {
  const cached = floorCache.get(kind);
  if (cached) return cached;
  let mat: THREE.MeshStandardMaterial;
  switch (kind) {
    case "oak-dark": mat = new THREE.MeshStandardMaterial({ map: woodPlanks("#8f6847", 2), roughness: 0.5 }); break;
    case "walnut": mat = new THREE.MeshStandardMaterial({ map: woodPlanks("#5f4130", 3), roughness: 0.42 }); break;
    case "concrete": mat = new THREE.MeshStandardMaterial({ map: concrete(4), roughness: 0.72 }); break;
    case "tiles-light": mat = new THREE.MeshStandardMaterial({ map: tiles("#e9e6e0", "#cbc5bb", 5), roughness: 0.22 }); break;
    case "tiles-dark": mat = new THREE.MeshStandardMaterial({ map: tiles("#4b4a48", "#363533", 6), roughness: 0.28 }); break;
    default: mat = new THREE.MeshStandardMaterial({ map: woodPlanks("#caa67a", 1), roughness: 0.52 });
  }
  floorCache.set(kind, mat);
  return mat;
}

// ---------- neutrale Detailtexturen (werden per Farbe eingefärbt) ----------

let fabricTex: THREE.CanvasTexture | null = null;
function fabricTexture() {
  if (fabricTex) return fabricTex;
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, S, S);
  // Gewebe: feine Kreuzschraffur + Rauschen
  for (let y = 0; y < S; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${y % 4 === 0 ? 0.05 : 0.02})`;
    ctx.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = `rgba(0,0,0,${x % 4 === 0 ? 0.04 : 0.015})`;
    ctx.fillRect(x, 0, 1, S);
  }
  noiseLayer(ctx, S, 16, 0.07, 11);
  noiseLayer(ctx, S, 64, 0.06, 12);
  fabricTex = toTexture(c, 3);
  return fabricTex;
}

let grainTex: THREE.CanvasTexture | null = null;
function grainTexture() {
  if (grainTex) return grainTex;
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = "#efefef";
  ctx.fillRect(0, 0, S, S);
  const r = rng(21);
  for (let l = 0; l < 140; l++) {
    const y = r() * S;
    ctx.strokeStyle = `rgba(70,40,20,${0.04 + r() * 0.1})`;
    ctx.lineWidth = 0.5 + r() * 2;
    ctx.beginPath();
    const amp = 2 + r() * 6;
    const ph = r() * 10;
    for (let x = 0; x <= S; x += 8) ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 2 * 2 + ph) * amp);
    ctx.stroke();
  }
  grainTex = toTexture(c, 1);
  return grainTex;
}

let plasterTex: THREE.CanvasTexture | null = null;
function plasterTexture() {
  if (plasterTex) return plasterTex;
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = "#fbfbfb";
  ctx.fillRect(0, 0, S, S);
  noiseLayer(ctx, S, 32, 0.012, 31);
  noiseLayer(ctx, S, 128, 0.018, 32);
  plasterTex = toTexture(c, 3);
  return plasterTex;
}

// ---------- Materialien nach Rolle ----------

export type SurfaceRole = MaterialRole | "wall" | "baseboard" | "glass" | "mirror" | "screen" | "light";

const matCache = new Map<string, THREE.Material>();

export function material(role: SurfaceRole, color: string): THREE.Material {
  const key = `${role}:${color}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  switch (role) {
    case "fabric":
      m = new THREE.MeshPhysicalMaterial({ color, map: fabricTexture(), roughness: 0.92, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.4) });
      break;
    case "textile":
      m = new THREE.MeshStandardMaterial({ color, map: fabricTexture(), roughness: 1 });
      break;
    case "wood":
      m = new THREE.MeshStandardMaterial({ color, map: grainTexture(), roughness: 0.55 });
      break;
    case "lacquer":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.38 });
      break;
    case "metal":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.85 });
      break;
    case "ceramic":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.05 });
      break;
    case "plant":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
      break;
    case "wall":
      m = new THREE.MeshStandardMaterial({ color, map: plasterTexture(), roughness: 0.95 });
      break;
    case "baseboard":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      break;
    case "glass":
      m = new THREE.MeshPhysicalMaterial({ color, transmission: 0.95, roughness: 0.02, transparent: true, opacity: 0.25, ior: 1.5 });
      break;
    case "mirror":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.02, metalness: 1 });
      break;
    case "screen":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.2 });
      break;
    case "light":
      m = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 1.2, roughness: 0.6 });
      break;
  }
  matCache.set(key, m);
  return m;
}
