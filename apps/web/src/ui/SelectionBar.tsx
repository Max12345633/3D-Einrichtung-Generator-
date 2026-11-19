import { Copy, PanelTopDashed, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { CATALOG_BY_ID } from "@raumwerk/core";
import { usePlanStore } from "../store/planStore";

/** Schnellleiste für das ausgewählte Möbel – gleich in 2D und 3D, auch per Touch gut bedienbar. */
export function SelectionBar() {
  const selection = usePlanStore((s) => s.selection);
  const item = usePlanStore((s) => (s.selection?.kind === "furniture" ? s.plan.furniture.find((f) => f.id === s.selection!.id) : undefined));
  if (selection?.kind !== "furniture" || !item) return null;
  const entry = CATALOG_BY_ID[item.catalogId];
  const s = usePlanStore.getState();
  const deg = Math.round((item.rotation * 180) / Math.PI) % 360;
  return (
    <div className="selection-bar" role="toolbar" aria-label="Möbel bearbeiten">
      <span className="selection-name" title={entry?.name}>{entry?.name}</span>
      <button className="icon-btn" onClick={() => s.rotateSelection(-Math.PI / 2)} title="90° nach links (R mit Shift: 15°)"><RotateCcw size={17} /></button>
      <button className="chip small" onClick={() => s.rotateSelection(-Math.PI / 12)} title="15° nach links (Q)">−15°</button>
      <span className="selection-deg" aria-label="Drehung">{deg}°</span>
      <button className="chip small" onClick={() => s.rotateSelection(Math.PI / 12)} title="15° nach rechts (E)">+15°</button>
      <button className="icon-btn" onClick={() => s.rotateSelection(Math.PI / 2)} title="90° nach rechts (R)"><RotateCw size={17} /></button>
      <span className="divider" />
      <button className="icon-btn" onClick={() => { if (!s.alignSelectionToWall()) s.notify("Keine Wand in der Nähe – schieb das Möbel näher an eine Wand."); }} title="Mit dem Rücken an die nächste Wand stellen"><PanelTopDashed size={17} /></button>
      <button className="icon-btn" onClick={() => s.duplicateSelection()} title="Duplizieren (Strg+D)"><Copy size={17} /></button>
      <button className="icon-btn danger-icon" onClick={() => s.deleteSelection()} title="Entfernen (Entf)"><Trash2 size={17} /></button>
    </div>
  );
}
