import { useMemo } from "react";
import { Copy, RotateCw, Trash2 } from "lucide-react";
import {
  CATALOG_BY_ID, detectRooms, setWallLength, updateOpening, updateWall, updateFurniture, wallLength,
} from "@raumwerk/core";
import { normalizeAngle, usePlanStore } from "../store/planStore";
import { formatArea, formatCm } from "../lib/format";

const FLOORS = [
  { label: "Eiche hell", value: "#cdb293" }, { label: "Eiche dunkel", value: "#8a6a4b" }, { label: "Beton", value: "#b9b6b0" },
  { label: "Fliese hell", value: "#e7e4de" }, { label: "Nussbaum", value: "#6b4a33" },
];
const WALLS = [
  { label: "Weiß", value: "#f3f1ec" }, { label: "Greige", value: "#ddd5c8" }, { label: "Salbei", value: "#c9d3c0" },
  { label: "Nebelblau", value: "#cfd8de" }, { label: "Terrakotta", value: "#d7b4a0" },
];

export function Inspector() {
  const plan = usePlanStore((s) => s.plan);
  const selection = usePlanStore((s) => s.selection);
  const { commit, deleteSelection, duplicateSelection, rotateSelection } = usePlanStore.getState();
  const rooms = useMemo(() => detectRooms(plan.walls), [plan.walls]);

  if (selection?.kind === "furniture") {
    const f = plan.furniture.find((x) => x.id === selection.id);
    const entry = f && CATALOG_BY_ID[f.catalogId];
    if (f && entry) {
      return (
        <aside className="panel right-panel">
          <h4 className="panel-title">Möbel</h4>
          <h3 className="inspector-name">{entry.name}</h3>
          <p className="muted">{formatCm(entry.width)} breit · {formatCm(entry.depth)} tief · {formatCm(entry.height)} hoch</p>
          <Field label={`Drehung ${Math.round((f.rotation * 180) / Math.PI)}°`}>
            <input type="range" min={0} max={360} step={5} value={Math.round((f.rotation * 180) / Math.PI)}
              onChange={(e) => commit((p) => updateFurniture(p, f.id, { rotation: normalizeAngle((Number(e.target.value) * Math.PI) / 180) }))} />
          </Field>
          <Field label="Farbe">
            <div className="row">
              <input type="color" value={f.color ?? entry.color} onChange={(e) => commit((p) => updateFurniture(p, f.id, { color: e.target.value }))} />
              {f.color && <button className="chip small" onClick={() => commit((p) => updateFurniture(p, f.id, { color: undefined }))}>Standard</button>}
            </div>
          </Field>
          <div className="button-row">
            <button className="btn ghost" onClick={() => rotateSelection(Math.PI / 2)}><RotateCw size={15} /> 90°</button>
            <button className="btn ghost" onClick={duplicateSelection}><Copy size={15} /> Duplizieren</button>
          </div>
          <button className="btn danger full" onClick={deleteSelection}><Trash2 size={15} /> Entfernen</button>
        </aside>
      );
    }
  }

  if (selection?.kind === "wall") {
    const w = plan.walls.find((x) => x.id === selection.id);
    if (w) {
      return (
        <aside className="panel right-panel">
          <h4 className="panel-title">Wand</h4>
          <NumberField label="Länge" unit="m" value={wallLength(w)} step={0.05} min={0.1} onCommit={(v) => commit((p) => setWallLength(p, w.id, v))} />
          <NumberField label="Stärke" unit="cm" value={w.thickness * 100} step={1} min={5} max={60} onCommit={(v) => commit((p) => updateWall(p, w.id, { thickness: v / 100 }))} />
          <NumberField label="Höhe" unit="m" value={w.height} step={0.05} min={1.8} max={6} onCommit={(v) => commit((p) => updateWall(p, w.id, { height: v }))} />
          <p className="muted small">Tipp: Die runden Griffe an den Wandenden lassen sich ziehen – anschließende Wände wandern mit.</p>
          <button className="btn danger full" onClick={deleteSelection}><Trash2 size={15} /> Wand löschen</button>
        </aside>
      );
    }
  }

  if (selection?.kind === "opening") {
    const o = plan.openings.find((x) => x.id === selection.id);
    if (o) {
      return (
        <aside className="panel right-panel">
          <h4 className="panel-title">{o.kind === "door" ? "Tür" : "Fenster"}</h4>
          <NumberField label="Breite" unit="cm" value={o.width * 100} step={5} min={30} onCommit={(v) => commit((p) => updateOpening(p, o.id, { width: v / 100 }))} />
          <NumberField label="Höhe" unit="cm" value={o.height * 100} step={5} min={30} onCommit={(v) => commit((p) => updateOpening(p, o.id, { height: v / 100 }))} />
          {o.kind === "window" && (
            <NumberField label="Brüstung" unit="cm" value={o.sill * 100} step={5} min={0} onCommit={(v) => commit((p) => updateOpening(p, o.id, { sill: v / 100 }))} />
          )}
          <p className="muted small">Im 2D-Plan entlang der Wand ziehen, um zu verschieben.</p>
          <button className="btn danger full" onClick={deleteSelection}><Trash2 size={15} /> Entfernen</button>
        </aside>
      );
    }
  }

  const total = rooms.reduce((s, r) => s + r.area, 0);
  return (
    <aside className="panel right-panel">
      <h4 className="panel-title">Wohnung</h4>
      <div className="stats">
        <div><strong>{formatArea(total)}</strong><span>Wohnfläche*</span></div>
        <div><strong>{rooms.length}</strong><span>Räume</span></div>
        <div><strong>{plan.furniture.length}</strong><span>Möbel</span></div>
      </div>
      <p className="muted small">* Netto-Innenfläche aus geschlossenen Räumen, ohne Abzüge nach WoFlV.</p>

      <Field label="Boden">
        <div className="swatches">
          {FLOORS.map((c) => <button key={c.value} title={c.label} className={`swatch-btn ${plan.floorColor === c.value ? "is-active" : ""}`} style={{ background: c.value }} onClick={() => commit((p) => ({ ...p, floorColor: c.value }))} />)}
        </div>
      </Field>
      <Field label="Wände">
        <div className="swatches">
          {WALLS.map((c) => <button key={c.value} title={c.label} className={`swatch-btn ${plan.wallColor === c.value ? "is-active" : ""}`} style={{ background: c.value }} onClick={() => commit((p) => ({ ...p, wallColor: c.value }))} />)}
        </div>
      </Field>

      {plan.background && (
        <Field label="Grundriss-Bild">
          <input type="range" min={0} max={1} step={0.05} value={plan.background.opacity}
            onChange={(e) => commit((p) => (p.background ? { ...p, background: { ...p.background, opacity: Number(e.target.value) } } : p))} />
          <button className="chip small" onClick={() => commit((p) => ({ ...p, background: undefined }))}>Bild entfernen</button>
        </Field>
      )}

      <div className="shortcut-list">
        <h4 className="panel-title">Tastenkürzel</h4>
        <dl>
          <dt>V / W / T / F</dt><dd>Auswahl / Wand / Tür / Fenster</dd>
          <dt>R</dt><dd>Möbel 90° drehen (Shift: 15°)</dd>
          <dt>Strg+D</dt><dd>Duplizieren</dd>
          <dt>Pfeile</dt><dd>Möbel um 5 cm schieben</dd>
          <dt>Entf</dt><dd>Löschen</dd>
          <dt>Strg+Z</dt><dd>Rückgängig</dd>
        </dl>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

function NumberField({ label, unit, value, step, min, max, onCommit }: { label: string; unit: string; value: number; step: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  const rounded = Math.round(value * 100) / 100;
  return (
    <Field label={label}>
      <div className="input-row">
        <input
          key={rounded}
          type="number"
          defaultValue={rounded}
          step={step}
          min={min}
          max={max}
          onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== rounded) onCommit(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span>{unit}</span>
      </div>
    </Field>
  );
}
