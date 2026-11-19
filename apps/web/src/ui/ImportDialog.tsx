import { useEffect, useRef, useState } from "react";
import { Bookmark, CheckCircle2, ExternalLink, Link2, Loader2, Pipette, ShoppingBag, X } from "lucide-react";
import {
  CATALOG, defaultDimensions, guessKind, productToCatalogEntry, shopName, type FurnitureShape, type ProductInfo,
} from "@raumwerk/core";
import { usePlanStore } from "../store/planStore";
import { bookmarkletCode, dominantColor, importProduct, ImportError } from "../lib/importApi";
import { formatPrice } from "../lib/format";

export const SHAPE_LABELS: Record<FurnitureShape, string> = {
  sofa: "Sofa", armchair: "Sessel", bed: "Bett", table: "Tisch", chair: "Stuhl", desk: "Schreibtisch", wardrobe: "Schrank",
  shelf: "Regal", sideboard: "Kommode / Sideboard", tv: "TV-Möbel", rug: "Teppich", plant: "Pflanze", lamp: "Lampe",
  kitchen: "Küchenzeile", fridge: "Kühlschrank", bathtub: "Badewanne", shower: "Dusche", toilet: "WC", sink: "Waschtisch",
  nightstand: "Nachttisch",
};

type Phase =
  | { kind: "link"; error?: string; code?: string }
  | { kind: "loading" }
  | { kind: "review"; product: ProductInfo; warnings: string[] };

interface Form {
  name: string;
  shape: FurnitureShape;
  width: string;
  depth: string;
  height: string;
  color: string;
}

const cm = (m: number | undefined) => (m === undefined ? "" : String(Math.round(m * 1000) / 10).replace(".", ","));
const parseCm = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v >= 2 && v <= 800 ? v / 100 : undefined;
};

function formFor(p: ProductInfo): Form {
  const fb = defaultDimensions(p.shape);
  return {
    name: p.name,
    shape: p.shape,
    width: cm(p.dimensions.width ?? fb.width),
    depth: cm(p.dimensions.depth ?? fb.depth),
    height: cm(p.dimensions.height ?? fb.height),
    color: p.color ?? CATALOG.find((e) => e.shape === p.shape)?.color ?? "#a0a0a0",
  };
}

/** Leeres Produkt für die manuelle Eingabe (Shop blockt, Server offline …). */
function manualProduct(url: string): ProductInfo {
  const kind = guessKind("");
  return { url: /^https?:\/\//.test(url) ? url : "https://example.invalid/", shop: shopName(url) || "manuell", name: "", dimensions: {}, ...kind };
}

export function ImportDialog({ initial, onClose }: { initial?: ProductInfo | null; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>(initial ? { kind: "review", product: initial, warnings: [] } : { kind: "link" });
  const [form, setForm] = useState<Form | null>(initial ? formFor(initial) : null);
  const [colorBusy, setColorBusy] = useState(false);
  const [colorFromImage, setColorFromImage] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // javascript:-URL per DOM setzen (React würde davor warnen)
    bookmarkRef.current?.setAttribute("href", bookmarkletCode(location.origin));
  }, [phase.kind]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); abort.current?.abort(); };
  }, [onClose]);

  const product = phase.kind === "review" ? phase.product : null;

  // Farbe aus dem Produktfoto, wenn der Farbname nichts hergab
  useEffect(() => {
    if (!product?.imageUrl || product.color) return;
    let alive = true;
    setColorBusy(true);
    dominantColor(product.imageUrl).then((c) => {
      if (alive && c) { setForm((f) => (f ? { ...f, color: c } : f)); setColorFromImage(true); }
    }).finally(() => alive && setColorBusy(false));
    return () => { alive = false; };
  }, [product]);

  const load = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(trimmed)) return setPhase({ kind: "link", error: "Bitte den kompletten Link zur Produktseite einfügen (beginnt mit https://).", code: "invalid" });
    abort.current = new AbortController();
    setPhase({ kind: "loading" });
    try {
      const { product: p, warnings } = await importProduct(trimmed, abort.current.signal);
      setForm(formFor(p));
      setColorFromImage(false);
      setPhase({ kind: "review", product: p, warnings });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setPhase({ kind: "link", error: e instanceof ImportError ? e.message : "Unbekannter Fehler", code: e instanceof ImportError ? e.code : "unknown" });
    }
  };

  const startManual = () => {
    const p = manualProduct(url.trim());
    setForm({ ...formFor(p), name: "" });
    setPhase({ kind: "review", product: p, warnings: ["Trage Name und Maße aus der Produktbeschreibung ein."] });
  };

  const place = () => {
    if (!form || !product) return;
    const width = parseCm(form.width), depth = parseCm(form.depth), height = parseCm(form.height);
    if (!width || !depth || !height || !form.name.trim()) return;
    const measuredSame = (key: "width" | "depth" | "height", v: number) => product.dimensions[key] !== undefined && Math.abs(product.dimensions[key]! - v) < 0.0005;
    const entry = productToCatalogEntry(product, {
      name: form.name.trim(),
      shape: form.shape,
      // Unveränderte Shop-Maße bleiben als „gemessen“ markiert
      width: measuredSame("width", width) ? undefined : width,
      depth: measuredSame("depth", depth) ? undefined : depth,
      height: measuredSame("height", height) ? undefined : height,
      color: form.color,
    });
    usePlanStore.getState().importEntry(entry);
    onClose();
  };

  const field = (key: "width" | "depth" | "height", label: string) => {
    const measured = product?.dimensions[key] !== undefined && form && parseCm(form[key]) !== undefined && Math.abs(product.dimensions[key]! - parseCm(form[key])!) < 0.0005;
    return (
      <label className="field">
        <span className="field-label">{label} {measured ? <em className="badge ok">aus Shop</em> : <em className="badge warn">bitte prüfen</em>}</span>
        <div className="input-row">
          <input inputMode="decimal" value={form?.[key] ?? ""} onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))} aria-invalid={!parseCm(form?.[key] ?? "")} />
          <span>cm</span>
        </div>
      </label>
    );
  };

  const valid = !!form && !!form.name.trim() && !!parseCm(form.width) && !!parseCm(form.depth) && !!parseCm(form.height);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-label="Möbel aus Online-Shop">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        <h2><ShoppingBag size={20} /> Möbel aus einem Online-Shop</h2>

        {(phase.kind === "link" || phase.kind === "loading") && (
          <>
            <p className="muted">Füge den Link zur Produktseite ein (IKEA, OTTO, home24, Westwing, …). Wir übernehmen Name, Maße, Farbe, Bild und Preis. So siehst du, ob genau dieses Möbel in deine Wohnung passt.</p>
            <form className="import-link" onSubmit={(e) => { e.preventDefault(); void load(); }}>
              <label className="search grow">
                <Link2 size={16} />
                <input autoFocus type="url" placeholder="https://www.shop.de/produkt/…" value={url} onChange={(e) => setUrl(e.target.value)} disabled={phase.kind === "loading"} />
              </label>
              <button className="btn primary" type="submit" disabled={phase.kind === "loading" || !url.trim()}>
                {phase.kind === "loading" ? <><Loader2 className="spin" size={15} /> Lese Seite …</> : "Übernehmen"}
              </button>
            </form>
            {phase.kind === "link" && phase.error && (
              <div className="hint-box warn-box">
                <span>{phase.error}</span>
                <button className="chip small" onClick={startManual}>Maße selbst eintragen</button>
              </div>
            )}
            <div className="bookmarklet">
              <div>
                <strong><Bookmark size={15} /> Für Shops, die blockieren: der Lesezeichen-Knopf</strong>
                <p className="muted small">Zieh den Knopf einmal in deine Lesezeichenleiste. Auf einer Produktseite draufklicken, schon öffnet sich Raumwerk mit dem Möbel. Läuft komplett in deinem Browser.</p>
              </div>
              <a ref={bookmarkRef} className="btn ghost bookmarklet-btn" onClick={(e) => { e.preventDefault(); alert("Zieh den Knopf in deine Lesezeichenleiste und klicke ihn dann auf einer Produktseite an."); }} draggable>
                ＋ Zu Raumwerk
              </a>
            </div>
            <button className="link-btn" onClick={startManual}>Ohne Link: Möbel manuell anlegen →</button>
          </>
        )}

        {phase.kind === "review" && form && product && (
          <>
            <div className="import-review">
              <div className="import-media">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                ) : (
                  <div className="import-placeholder" style={{ background: form.color }} />
                )}
                <div className="import-meta">
                  {product.shop !== "manuell" && product.url && !product.url.includes("example.invalid") && (
                    <a href={product.url} target="_blank" rel="noopener noreferrer nofollow">{product.shop} <ExternalLink size={12} /></a>
                  )}
                  {product.price !== undefined && <strong>{formatPrice(product.price, product.currency)}</strong>}
                </div>
              </div>

              <div className="import-form">
                <label className="field">
                  <span className="field-label">Name</span>
                  <input className="text-input" value={form.name} placeholder="z. B. Sofa Lund, 3-Sitzer" onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">Art (bestimmt Form im 3D-Modell)</span>
                  <select className="text-input" value={form.shape} onChange={(e) => {
                    const shape = e.target.value as FurnitureShape;
                    const fb = defaultDimensions(shape);
                    // Nicht gefundene Maße an die neue Möbelart anpassen
                    setForm({
                      ...form, shape,
                      width: product.dimensions.width ? form.width : cm(fb.width),
                      depth: product.dimensions.depth ? form.depth : cm(fb.depth),
                      height: product.dimensions.height ? form.height : cm(fb.height),
                    });
                  }}>
                    {(Object.keys(SHAPE_LABELS) as FurnitureShape[]).map((s) => <option key={s} value={s}>{SHAPE_LABELS[s]}</option>)}
                  </select>
                </label>
                <div className="dims-row">
                  {field("width", "Breite")}
                  {field("depth", "Tiefe")}
                  {field("height", "Höhe")}
                </div>
                <label className="field">
                  <span className="field-label">
                    Farbe {colorBusy ? <em className="badge">wird erkannt …</em> : colorFromImage ? <em className="badge ok"><Pipette size={11} /> aus Produktfoto</em> : product.colorName ? <em className="badge ok">{product.colorName}</em> : null}
                  </span>
                  <div className="row">
                    <input type="color" value={form.color} onChange={(e) => { setForm({ ...form, color: e.target.value }); setColorFromImage(false); }} />
                  </div>
                </label>
              </div>
            </div>

            {phase.warnings.map((w) => <p key={w} className="warn-text">{w}</p>)}
            {!phase.warnings.length && product.dimensions.width && product.dimensions.depth && product.dimensions.height && (
              <p className="ok-text"><CheckCircle2 size={14} /> Alle Maße aus der Shopseite übernommen.</p>
            )}

            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setPhase({ kind: "link" })}>Anderer Link</button>
              <button className="btn primary" onClick={place} disabled={!valid}>In Wohnung platzieren</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
