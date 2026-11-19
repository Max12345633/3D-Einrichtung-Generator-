import { parseProductHtml, type ProductInfo } from "@raumwerk/core";

export interface ImportResult {
  product: ProductInfo;
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** Produktseite über den eigenen Server analysieren (Browser dürfen fremde Seiten nicht lesen). */
export async function importProduct(url: string, signal?: AbortSignal): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch("/api/import/product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ImportError("Der Import-Dienst ist nicht erreichbar. Läuft der Server (npm run dev)?", "offline");
  }
  const data = (await res.json().catch(() => ({}))) as Partial<ImportResult> & { error?: string; code?: string };
  if (!res.ok || !data.product) {
    if (res.status === 404 || res.status === 504) throw new ImportError("Der Import-Dienst ist nicht erreichbar. Läuft der Server (npm run dev)?", "offline");
    throw new ImportError(data.error ?? `Fehler ${res.status}`, data.code ?? "unknown");
  }
  return { product: data.product, warnings: data.warnings ?? [] };
}

export const imageProxyUrl = (url: string) => `/api/import/image?url=${encodeURIComponent(url)}`;

/**
 * Hauptfarbe eines Produktfotos: weißer/grauer Studiohintergrund und Transparenz werden ignoriert,
 * vom Rest wird der Median genommen (robust gegen Schatten und Glanzlichter).
 */
export async function dominantColor(imageUrl: string): Promise<string | undefined> {
  const img = new Image();
  img.decoding = "async";
  img.src = imageProxyUrl(imageUrl);
  try {
    await img.decode();
  } catch {
    return undefined;
  }
  const S = 48;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 200) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const light = (max + min) / 510;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (light > 0.9 && sat < 0.08) continue; // Studiohintergrund
    // Bildränder sind meist Hintergrund → nur die mittleren 70 %
    const px = (i / 4) % S, py = Math.floor(i / 4 / S);
    if (px < S * 0.15 || px > S * 0.85 || py < S * 0.15 || py > S * 0.85) continue;
    rs.push(r); gs.push(g); bs.push(b);
  }
  if (rs.length < 20) return undefined;
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
  return `#${[med(rs), med(gs), med(bs)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------- Lesezeichen-Import ----------

/**
 * Lesezeichen-Skript („Bookmarklet“): läuft auf der Produktseite im Browser des Nutzers
 * (umgeht damit Bot-Sperren der Shops), sammelt Produktdaten, Meta-Tags und maßrelevante Textzeilen
 * und öffnet Raumwerk mit diesen Daten im URL-Fragment (#import=…). Es wird nichts an Dritte gesendet.
 */
export function bookmarkletCode(appOrigin: string): string {
  const src = `
(()=>{
  const app=${JSON.stringify(appOrigin)};
  if(location.origin===app){alert('Bitte auf einer Produktseite im Shop anklicken.');return;}
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const q=s=>Array.from(document.querySelectorAll(s));
  let ld=q('script[type="application/ld+json"]').map(e=>e.textContent||'').filter(t=>t.length<80000).map(t=>'<script type="application/ld+json">'+t.replace(/<\\/script/gi,'<\\\\/script')+'<\\/script>').join('');
  if(ld.length>150000)ld=ld.slice(0,0);
  const meta=q('meta[property],meta[name],meta[itemprop]').map(m=>'<meta property="'+esc(m.getAttribute('property')||m.getAttribute('name')||m.getAttribute('itemprop'))+'" content="'+esc(m.getAttribute('content')||'')+'">').join('');
  const re=/(breite|tiefe|h(ö|oe)he|ma(ß|ss)e|abmessung|liegefl|gesamtma|width|depth|height|dimension|\\d\\s*(cm|mm)\\b|[BHTWD]\\s*[\\/x]\\s*[BHTWD])/i;
  const lines=(document.body.innerText||'').split(/\\n+/).map(l=>l.trim()).filter(l=>l&&l.length<300&&re.test(l));
  const text=lines.join('\\n').slice(0,20000);
  const html='<html><head><title>'+esc(document.title)+'</title>'+meta+ld+'</head><body><pre>'+esc(text)+'</pre></body></html>';
  window.open(app+'/#import='+encodeURIComponent(JSON.stringify({u:location.href,h:html})),'_blank');
})();`;
  return `javascript:${encodeURIComponent(src.replace(/\n\s*/g, ""))}`;
}

/** Liest einen Lesezeichen-Import aus dem URL-Fragment und entfernt ihn danach aus der Adresse. */
export function consumeHashImport(): ProductInfo | null {
  if (!location.hash.startsWith("#import=")) return null;
  const raw = location.hash.slice("#import=".length);
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const { u, h } = JSON.parse(decodeURIComponent(raw)) as { u: string; h: string };
    if (typeof u !== "string" || typeof h !== "string" || !/^https?:\/\//.test(u)) return null;
    return parseProductHtml(h, u);
  } catch {
    return null;
  }
}
