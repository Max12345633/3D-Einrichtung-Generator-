import { useMemo, useRef, useState } from "react";
import { DoorOpen, ImagePlus, MousePointer2, PenLine, Ruler, Search, AppWindow, Magnet, ShoppingBag, Wand2 } from "lucide-react";
import { CATALOG, CATEGORY_LABELS, type FurnitureCategory } from "@raumwerk/core";
import { DEFAULT_THICKNESS_OPTIONS, usePlanStore, type Tool } from "../store/planStore";
import { imageToBackground } from "../lib/files";
import { formatCm, formatPrice } from "../lib/format";
import { entryImage } from "../lib/importApi";

const TOOLS: { id: Tool; label: string; key: string; icon: JSX.Element }[] = [
  { id: "select", label: "Auswählen", key: "V", icon: <MousePointer2 size={18} /> },
  { id: "wall", label: "Wand", key: "W", icon: <PenLine size={18} /> },
  { id: "door", label: "Tür", key: "T", icon: <DoorOpen size={18} /> },
  { id: "window", label: "Fenster", key: "F", icon: <AppWindow size={18} /> },
];

export function LeftPanel() {
  const tool = usePlanStore((s) => s.tool);
  const placing = usePlanStore((s) => s.placing);
  const wallThickness = usePlanStore((s) => s.wallThickness);
  const snapping = usePlanStore((s) => s.snapping);
  const hasBackground = usePlanStore((s) => !!s.plan.background);
  const custom = usePlanStore((s) => s.plan.customCatalog);
  const { setTool, startPlacing, setWallThickness, toggleSnapping, openImport } = usePlanStore.getState();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FurnitureCategory | "alle">("alle");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((e) => (category === "alle" || e.category === category) && (!q || e.name.toLowerCase().includes(q)));
  }, [query, category]);

  return (
    <aside className="panel left-panel">
      <section>
        <h4 className="panel-title">Werkzeuge</h4>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool ${tool === t.id ? "is-active" : ""}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>
        {tool === "wall" && (
          <div className="sub-options">
            {DEFAULT_THICKNESS_OPTIONS.map((o) => (
              <button key={o.value} className={`chip ${wallThickness === o.value ? "is-active" : ""}`} onClick={() => setWallThickness(o.value)}>{o.label}</button>
            ))}
          </div>
        )}
        <div className="row-between">
          <button className={`chip ${snapping ? "is-active" : ""}`} onClick={toggleSnapping} title="Einrasten an Raster, Wänden & Winkeln">
            <Magnet size={14} /> Einrasten {snapping ? "an" : "aus"}
          </button>
          {hasBackground && (
            <button className={`chip ${tool === "calibrate" ? "is-active" : ""}`} onClick={() => setTool("calibrate")}>
              <Ruler size={14} /> Maßstab
            </button>
          )}
          {hasBackground && (
            <button className="chip" onClick={() => usePlanStore.getState().setAssistantOpen(true)}>
              <Wand2 size={14} /> Wände erkennen
            </button>
          )}
        </div>
        <BackgroundUpload />
      </section>

      <section className="catalog">
        <h4 className="panel-title">Möbel</h4>
        <button className="btn import-btn full" onClick={() => openImport()}>
          <ShoppingBag size={16} /> Aus Online-Shop einfügen
        </button>
        {custom && custom.length > 0 && (
          <div className="catalog-list">
            <span className="field-label">Meine Shop-Möbel</span>
            {custom.map((e) => (
              <button key={e.id} className={`catalog-item ${placing === e.id ? "is-active" : ""}`} onClick={() => startPlacing(e.id)} title={e.source?.url} {...dragProps(e.id)}>
                {entryImage(e)
                  ? <img className="swatch" src={entryImage(e)} alt="" referrerPolicy="no-referrer" style={{ background: e.color }} />
                  : <span className="swatch" style={{ background: e.color }} />}
                <span className="catalog-text">
                  <strong>{e.name}</strong>
                  <small>{formatCm(e.width)} × {formatCm(e.depth)}{e.source?.price !== undefined ? ` · ${formatPrice(e.source.price, e.source.currency)}` : ""}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        <label className="search">
          <Search size={15} />
          <input placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="category-chips">
          {(["alle", ...Object.keys(CATEGORY_LABELS)] as (FurnitureCategory | "alle")[]).map((c) => (
            <button key={c} className={`chip small ${category === c ? "is-active" : ""}`} onClick={() => setCategory(c)}>
              {c === "alle" ? "Alle" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="catalog-list">
          {items.map((e) => (
            <button key={e.id} className={`catalog-item ${placing === e.id ? "is-active" : ""}`} onClick={() => startPlacing(e.id)} {...dragProps(e.id)}>
              <span className="swatch" style={{ background: e.color }} />
              <span className="catalog-text">
                <strong>{e.name}</strong>
                <small>{formatCm(e.width)} × {formatCm(e.depth)}</small>
              </span>
            </button>
          ))}
          {items.length === 0 && <p className="muted small">Nichts gefunden.</p>}
        </div>
      </section>
    </aside>
  );
}

/** Katalogeintrag auf den Plan (2D) oder in die 3D-Ansicht ziehen */
function dragProps(id: string) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", id); // Firefox braucht Daten
      e.dataTransfer.effectAllowed = "copy";
      usePlanStore.getState().setDragCatalogId(id);
    },
    onDragEnd: () => usePlanStore.getState().setDragCatalogId(null),
  };
}

export function BackgroundUpload({ big = false, onDone }: { big?: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { commit, setTool, setView, newPlan } = usePlanStore.getState();
  return (
    <>
      <button className={big ? "start-card" : "btn ghost full"} onClick={() => ref.current?.click()} disabled={busy}>
        <ImagePlus size={big ? 28 : 16} />
        {big ? (<><strong>Grundriss hochladen</strong><span>Foto, Scan oder Screenshot (JPG/PNG). Wände, Türen und Fenster werden automatisch erkannt.</span></>) : <span>{busy ? "Lade …" : "Grundriss-Bild hinterlegen"}</span>}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const background = await imageToBackground(file);
            // Vom Startbildschirm aus beginnt ein Upload immer ein neues Projekt
            if (big) newPlan();
            commit((p) => ({ ...p, background }));
            setView("2d");
            setTool("select");
            usePlanStore.getState().setAssistantOpen(true);
            window.dispatchEvent(new Event("raumwerk:fit"));
            onDone?.();
          } catch {
            usePlanStore.getState().notify("Das Bild konnte nicht gelesen werden. Bitte JPG, PNG oder WebP verwenden.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
