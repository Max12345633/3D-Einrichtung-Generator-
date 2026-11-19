import * as THREE from "three";
import { GradientEquirectTexture, WebGLPathTracer } from "three-gpu-pathtracer";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import {
  boundsOf, clampOpening, detectRooms, dominantWindowDirection, pointOnWall, wallDirection, type Plan,
} from "@raumwerk/core";
import { polygonGeometry } from "./geometry";
import { canUseAIDenoiser, denoiseWithAI } from "./denoise";
import { denoiseATrous, renderGBuffer, type GBuffer } from "./atrous";

/**
 * Fotorealistischer Render direkt im Browser (GPU-Path-Tracing, three-gpu-pathtracer):
 * physikalisch korrekte indirekte Beleuchtung, weiche Schatten, Reflexionen.
 *
 * Techniken wie in der Architektur-Visualisierung:
 *  - Portal-Lichter in jedem Fenster: Himmelslicht wird gezielt gesampelt → wenig Rauschen
 *  - Sonne aus der fensterreichsten Richtung, Himmel als Verlaufsumgebung
 *  - Flächenleuchten unter der Decke (abends stärker)
 *  - KI-Entrauschen (Open Image Denoise, WebGPU), sonst eigener G-Buffer-geführter
 *    À-Trous-Wavelet-Filter (atrous.ts)
 *
 * Die Live-Szene wird für die BVH-Erzeugung kurz ergänzt und sofort wiederhergestellt
 * (alles synchron → die Live-Ansicht bemerkt nichts).
 */

export type Mood = "tag" | "golden" | "abend";
export type Quality = "entwurf" | "hd" | "max";

export const MOODS: Record<Mood, { label: string }> = {
  tag: { label: "Tageslicht" },
  golden: { label: "Goldene Stunde" },
  abend: { label: "Abend" },
};

/** samples: mit KI-Entrauscher · samplesNoAI: ohne (mehr Samples nötig) */
export const QUALITIES: Record<Quality, { label: string; width: number; height: number; samples: number; samplesNoAI: number }> = {
  entwurf: { label: "Entwurf", width: 960, height: 540, samples: 48, samplesNoAI: 128 },
  hd: { label: "HD", width: 1600, height: 900, samples: 160, samplesNoAI: 400 },
  max: { label: "Maximal", width: 1920, height: 1080, samples: 512, samplesNoAI: 1000 },
};

interface MoodSetup {
  skyTop: string;
  skyBottom: string;
  envIntensity: number;
  sun: { color: string; intensity: number; elevationDeg: number };
  portal: { color: string; intensity: number };
  roomLight: { color: string; intensity: number };
  exposure: number;
}

const SETUPS: Record<Mood, MoodSetup> = {
  tag: {
    skyTop: "#9fc3ea", skyBottom: "#f3eee4", envIntensity: 1.4,
    sun: { color: "#fff3e0", intensity: 5, elevationDeg: 35 },
    portal: { color: "#dbe8f7", intensity: 5 },
    roomLight: { color: "#fff6ea", intensity: 0.5 }, exposure: 0.72,
  },
  golden: {
    skyTop: "#f2c99e", skyBottom: "#b58f6c", envIntensity: 1.1,
    sun: { color: "#ffb26b", intensity: 4.5, elevationDeg: 12 },
    portal: { color: "#ffd9b0", intensity: 3.5 },
    roomLight: { color: "#ffe2bd", intensity: 0.5 }, exposure: 0.8,
  },
  abend: {
    skyTop: "#1d2b44", skyBottom: "#0c0f16", envIntensity: 0.4,
    sun: { color: "#000000", intensity: 0, elevationDeg: 0 },
    portal: { color: "#3b5378", intensity: 0.6 },
    roomLight: { color: "#ffd2a1", intensity: 10 }, exposure: 1.0,
  },
};

export interface PhotoRequest {
  scene: THREE.Scene;
  camera: THREE.Camera;
  plan: Plan;
  mood: Mood;
  quality: Quality;
  /** Nur für Entwicklung/Tests: Auflösung und Samples überschreiben */
  override?: { width: number; height: number; samples: number };
  /** Fortschritt 0..1 (Path-Tracing), mit Zugriff auf das Live-Canvas */
  onProgress?: (progress: number, canvas: HTMLCanvasElement, stage: "trace" | "denoise") => void;
  signal?: AbortSignal;
}

export interface PhotoResult {
  dataUrl: string;
  width: number;
  height: number;
  seconds: number;
  samples: number;
  denoiser: "ki" | "filter";
}


const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let supportCache: boolean | null = null;

/** Einmalig geprüft und gecacht – jede Prüfung kostet sonst einen WebGL-Kontext (Browser-Limit!). */
export function isPathTracingSupported(): boolean {
  if (supportCache !== null) return supportCache;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    supportCache = !!gl && !!gl.getExtension("EXT_color_buffer_float");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    supportCache = false;
  }
  return supportCache;
}

export function plannedSamples(quality: Quality): number {
  const q = QUALITIES[quality];
  return canUseAIDenoiser() ? q.samples : q.samplesNoAI;
}

export async function renderPhoto(req: PhotoRequest): Promise<PhotoResult> {
  const started = performance.now();
  const preset = QUALITIES[req.quality];
  const useAI = canUseAIDenoiser();
  const size = req.override ?? { width: preset.width, height: preset.height, samples: useAI ? preset.samples : preset.samplesNoAI };
  const setup = SETUPS[req.mood];

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size.width, size.height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = setup.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = cloneCamera(req.camera, size.width / size.height);
  const ceilingHeight = req.plan.walls.length ? Math.min(...req.plan.walls.map((w) => w.height)) : 2.5;
  if (camera.position.y >= ceilingHeight - 0.05) frameDollhouse(camera, req.plan);
  const sky = new GradientEquirectTexture(256);
  sky.topColor.set(setup.skyTop);
  sky.bottomColor.set(setup.skyBottom);
  sky.exponent = 1.6;
  sky.update();

  const pathTracer = new WebGLPathTracer(renderer);
  pathTracer.renderDelay = 0;
  pathTracer.fadeDuration = 0;
  pathTracer.minSamples = 1;
  pathTracer.rasterizeScene = false;
  pathTracer.bounces = 7;
  pathTracer.filterGlossyFactor = 0.5;
  pathTracer.tiles.set(2, 2);

  const restore = prepareScene(req.scene, req.plan, camera, setup, sky);
  let gbuf: GBuffer | null = null;
  try {
    pathTracer.setScene(req.scene, camera);
    // G-Buffer für den Kantenfilter aus exakt derselben (vorbereiteten) Szene
    gbuf = renderGBuffer(renderer, req.scene, camera, size.width, size.height);
  } finally {
    restore();
  }

  try {
    let frame = 0;
    while (pathTracer.samples < size.samples) {
      if (req.signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
      if (renderer.getContext().isContextLost()) throw new Error("WebGL-Kontext verloren");
      pathTracer.renderSample();
      if (frame++ % 3 === 0) req.onProgress?.(Math.min(1, pathTracer.samples / size.samples), canvas, "trace");
      await nextFrame();
    }

    let output: HTMLCanvasElement = canvas;
    let denoiser: PhotoResult["denoiser"] = "filter";
    if (useAI) {
      req.onProgress?.(1, canvas, "denoise");
      try {
        output = await denoiseWithAI(canvas, req.signal);
        denoiser = "ki";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        console.warn("KI-Entrauschen nicht verfügbar, nutze Filter", e);
      }
    }
    if (denoiser === "filter" && gbuf) {
      denoiseATrous(renderer, pathTracer.target.texture, gbuf, size.width, size.height, size.samples);
    }
    req.onProgress?.(1, output, "denoise");

    return {
      dataUrl: finishPhoto(output),
      width: size.width,
      height: size.height,
      seconds: (performance.now() - started) / 1000,
      samples: Math.round(pathTracer.samples),
      denoiser,
    };
  } finally {
    gbuf?.dispose();
    disposePathTracer(pathTracer);
    sky.dispose();
    renderer.dispose();
    renderer.forceContextLoss(); // Kontext sofort freigeben (Browser erlauben nur ~16 gleichzeitig)
  }
}

/** WebGLPathTracer.dispose() in v0.0.23 greift auf ein nicht existierendes Feld zu → selbst aufräumen. */
function disposePathTracer(pt: WebGLPathTracer) {
  const internal = pt as unknown as { _quad?: FullScreenQuad; _pathTracer?: { dispose(): void }; _lowResPathTracer?: { dispose(): void } };
  try {
    internal._quad?.material.dispose();
    internal._quad?.dispose();
    internal._pathTracer?.dispose();
    internal._lowResPathTracer?.dispose();
  } catch (e) {
    console.warn("Path-Tracer-Aufräumen fehlgeschlagen", e);
  }
}

function cloneCamera(source: THREE.Camera, aspect: number): THREE.PerspectiveCamera {
  const src = source as THREE.PerspectiveCamera;
  // Gleicher vertikaler Bildwinkel wie die Live-Ansicht; ein breiteres Format zeigt seitlich mehr
  const cam = new THREE.PerspectiveCamera(src.fov ?? 50, aspect, 0.05, 200);
  cam.position.copy(src.position);
  cam.quaternion.copy(src.quaternion);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

/**
 * Puppenhaus-Ansicht (Kamera über der Decke): Kamera entlang der Blickrichtung so verschieben,
 * dass die ganze Wohnung das Bildformat ausfüllt – unabhängig vom Seitenverhältnis der Live-Ansicht.
 */
function frameDollhouse(camera: THREE.PerspectiveCamera, plan: Plan) {
  const b = boundsOf(plan.walls.flatMap((w) => [w.a, w.b]));
  if (!b) return;
  const h = Math.max(...plan.walls.map((w) => w.height));
  const corners: THREE.Vector3[] = [];
  for (const x of [b.minX - 0.2, b.maxX + 0.2]) for (const z of [b.minY - 0.2, b.maxY + 0.2]) for (const y of [0, h]) corners.push(new THREE.Vector3(x, y, z));
  // Zielpunkt: Schnitt der Blickrichtung mit der Ebene y = 0.5
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  if (dir.y > -0.05) return;
  const t = (0.5 - camera.position.y) / dir.y;
  const target = camera.position.clone().addScaledVector(dir, t);
  const offset = camera.position.clone().sub(target);
  const fits = (f: number) => {
    camera.position.copy(target).addScaledVector(offset, f);
    camera.updateMatrixWorld();
    if (camera.position.y < h + 0.3) return false; // muss über der Decke bleiben
    return corners.every((c) => {
      const p = c.clone().project(camera);
      return Math.abs(p.x) <= 0.92 && Math.abs(p.y) <= 0.9 && p.z < 1;
    });
  };
  let best = 1;
  for (let f = 0.25; f <= 2.5; f += 0.02) {
    if (fits(f)) { best = f; break; }
  }
  camera.position.copy(target).addScaledVector(offset, best);
  camera.updateMatrixWorld();
}

/** Ergänzt die Szene für das Foto. Gibt eine Funktion zurück, die alles rückgängig macht. */
function prepareScene(scene: THREE.Scene, plan: Plan, camera: THREE.Camera, setup: MoodSetup, sky: THREE.Texture): () => void {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.userData.noPhoto && o.visible) { o.visible = false; hidden.push(o); }
  });

  const prev = {
    environment: scene.environment,
    background: scene.background,
    environmentIntensity: scene.environmentIntensity,
    backgroundIntensity: scene.backgroundIntensity,
  };
  scene.environment = sky;
  scene.background = sky;
  scene.environmentIntensity = setup.envIntensity;
  scene.backgroundIntensity = setup.envIntensity;

  const group = new THREE.Group();
  group.name = "photo-additions";
  const rooms = detectRooms(plan.walls);
  const ceilingHeight = plan.walls.length ? Math.min(...plan.walls.map((w) => w.height)) : 2.5;
  // Kamera unter der Decke → Innenaufnahme mit Decke; darüber → „Puppenhaus“-Ansicht ohne Decke
  const inside = camera.position.y < ceilingHeight - 0.05;
  const disposables: { dispose(): void }[] = [];

  if (inside) {
    const ceilingMat = new THREE.MeshStandardMaterial({ color: "#fbfaf7", roughness: 0.95, side: THREE.DoubleSide });
    disposables.push(ceilingMat);
    for (const r of rooms) {
      const g = polygonGeometry(r.polygon, ceilingHeight);
      disposables.push(g);
      group.add(new THREE.Mesh(g, ceilingMat));
    }
  }

  const pts = plan.walls.flatMap((w) => [w.a, w.b]);
  const bb = boundsOf(pts) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const cx = (bb.minX + bb.maxX) / 2;
  const cz = (bb.minY + bb.maxY) / 2;

  // Portal-Lichter: in jedem Fenster eine Flächenleuchte in Himmelsfarbe, nach innen gerichtet
  if (setup.portal.intensity > 0) {
    for (const raw of plan.openings) {
      if (raw.kind !== "window") continue;
      const wall = plan.walls.find((w) => w.id === raw.wallId);
      if (!wall) continue;
      const o = clampOpening(raw, wall);
      const p = pointOnWall(wall, o.offset);
      const d = wallDirection(wall);
      let inward = { x: d.y, y: -d.x };
      if ((cx - p.x) * inward.x + (cz - p.y) * inward.y < 0) inward = { x: -inward.x, y: -inward.y };
      const off = wall.thickness / 2 + 0.01;
      const light = new THREE.RectAreaLight(setup.portal.color, setup.portal.intensity, o.width * 0.96, o.height * 0.96);
      light.position.set(p.x + inward.x * off, o.sill + o.height / 2, p.y + inward.y * off);
      light.lookAt(p.x + inward.x * 5, o.sill + o.height / 2 - 0.6, p.y + inward.y * 5);
      group.add(light);
    }
  }

  // Flächenleuchten unter der Decke: weiches Raumlicht (abends Hauptlicht)
  for (const r of rooms) {
    if (setup.roomLight.intensity <= 0) continue;
    const b = boundsOf(r.polygon)!;
    const w = THREE.MathUtils.clamp((b.maxX - b.minX) * 0.3, 0.4, 1.4);
    const d = THREE.MathUtils.clamp((b.maxY - b.minY) * 0.3, 0.4, 1.4);
    const light = new THREE.RectAreaLight(setup.roomLight.color, setup.roomLight.intensity, w, d);
    light.position.set(r.centroid.x, ceilingHeight - 0.02, r.centroid.y);
    light.lookAt(r.centroid.x, 0, r.centroid.y);
    group.add(light);
  }

  // Sonne aus der fensterreichsten Richtung, leicht seitlich für schönere Lichtkanten
  if (setup.sun.intensity > 0) {
    const dir = dominantWindowDirection(plan);
    const side = { x: -dir.y, y: dir.x };
    const el = THREE.MathUtils.degToRad(setup.sun.elevationDeg);
    const horiz = { x: dir.x + side.x * 0.35, y: dir.y + side.y * 0.35 };
    const hl = Math.hypot(horiz.x, horiz.y) || 1;
    const dist = 30;
    const sun = new THREE.DirectionalLight(setup.sun.color, setup.sun.intensity);
    sun.position.set(cx + (horiz.x / hl) * Math.cos(el) * dist, Math.sin(el) * dist, cz + (horiz.y / hl) * Math.cos(el) * dist);
    sun.target.position.set(cx, 0, cz);
    group.add(sun, sun.target);
  }

  scene.add(group);
  scene.updateMatrixWorld(true);

  return () => {
    scene.remove(group);
    for (const d of disposables) d.dispose();
    for (const o of hidden) o.visible = true;
    scene.environment = prev.environment;
    scene.background = prev.background;
    scene.environmentIntensity = prev.environmentIntensity;
    scene.backgroundIntensity = prev.backgroundIntensity;
  };
}

/** Fotografischer Feinschliff: leichte Vignette und Kontrast, Export als JPEG. */
function finishPhoto(source: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d")!;
  ctx.filter = "contrast(1.1) saturate(1.08)";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  const g = ctx.createRadialGradient(out.width / 2, out.height / 2, out.height * 0.45, out.width / 2, out.height / 2, out.width * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.92);
}
