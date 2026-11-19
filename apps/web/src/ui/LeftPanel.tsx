import { useMemo, useRef, useState } from "react";
import { DoorOpen, ImagePlus, MousePointer2, PenLine, Ruler, Search, AppWindow, Magnet } from "lucide-react";
import { CATALOG, CATEGORY_LABELS, type FurnitureCategory } from "@raumwerk/core";
import { DEFAULT_THICKNESS_OPTIONS, usePlanStore, type Tool } from "../store/planStore";
import { imageToBackground } from "../lib/files";
import { formatCm } from "../lib/format";

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
  const { setTool, startPlacing, setWallThickness, toggleSnapping } = usePlanStore.getState();
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
        </div>
        <BackgroundUpload />
      </section>

      <section className="catalog">
        <h4 className="panel-title">Möbel</h4>
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
            <button key={e.id} className={`catalog-item ${placing === e.id ? "is-active" : ""}`} onClick={() => startPlacing(e.id)}>
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

export function BackgroundUpload({ big = false, onDone }: { big?: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { commit, setTool, setView, newPlan } = usePlanStore.getState();
  return (
    <>
      <button className={big ? "start-card" : "btn ghost full"} onClick={() => ref.current?.click()} disabled={busy}>
        <ImagePlus size={big ? 28 : 16} />
        {big ? (<><strong>Grundriss hochladen</strong><span>Foto, Scan oder Screenshot (JPG/PNG). Du zeichnest die Wände in Sekunden nach.</span></>) : <span>{busy ? "Lade …" : "Grundriss-Bild hinterlegen"}</span>}
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
            setTool("calibrate");
            window.dispatchEvent(new Event("raumwerk:fit"));
            onDone?.();
          } catch {
            alert("Das Bild konnte nicht gelesen werden.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
