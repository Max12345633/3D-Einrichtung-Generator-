import { initUNetFromURL, type UNet } from "oidn-web";

/**
 * KI-Entrauschen mit Intel Open Image Denoise (U-Net) über WebGPU.
 * Liefert aus wenigen hundert Samples ein sauberes Bild – die Grundlage für
 * „Fotoqualität in Sekunden“. Ohne WebGPU greift der kantenerhaltende Filter im Path-Tracer.
 */

let unetPromise: Promise<UNet> | null = null;

let aiAvailable: boolean | null = null;

/** Echte Prüfung: WebGPU vorhanden UND ein Adapter (Grafikkarte) verfügbar. Ergebnis wird gecacht. */
export async function detectAIDenoiser(): Promise<boolean> {
  if (aiAvailable !== null) return aiAvailable;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    aiAvailable = !!gpu && !!(await gpu.requestAdapter());
  } catch {
    aiAvailable = false;
  }
  return aiAvailable;
}

/** Synchroner Stand der Prüfung (false, solange detectAIDenoiser() noch nicht fertig ist). */
export function canUseAIDenoiser(): boolean {
  return aiAvailable === true;
}

function loadUNet(): Promise<UNet> {
  unetPromise ??= initUNetFromURL(`${import.meta.env.BASE_URL}oidn/rt_ldr.tza`).catch((e) => {
    unetPromise = null;
    throw e;
  });
  return unetPromise;
}

/** Gewichte (1,8 MB) und Shader schon beim Öffnen des Dialogs vorbereiten. */
export async function preloadAIDenoiser(): Promise<boolean> {
  const ok = await detectAIDenoiser();
  if (ok) loadUNet().catch(() => { aiAvailable = false; });
  return ok;
}

/** Entrauscht ein (bereits tonegemapptes) LDR-Bild. Wirft, wenn WebGPU nicht nutzbar ist. */
export async function denoiseWithAI(source: HTMLCanvasElement, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const unet = await loadUNet();
  const w = source.width;
  const h = source.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const color = ctx.getImageData(0, 0, w, h);
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const abort = unet.tileExecute<ImageData>({
      color,
      done: (out) => {
        // Für ImageData-Eingaben liefert oidn-web ImageData zurück (der Typ ist dort zu allgemein)
        ctx.putImageData(out as unknown as ImageData, 0, 0);
        resolve(tmp);
      },
      error: (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))),
    });
    signal?.addEventListener("abort", () => {
      abort();
      reject(new DOMException("Abgebrochen", "AbortError"));
    });
  });
}
