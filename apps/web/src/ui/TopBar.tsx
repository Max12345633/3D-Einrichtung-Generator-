import { useRef } from "react";
import { Box, Columns2, Download, FilePlus2, FolderOpen, Redo2, Sparkles, Square, Undo2 } from "lucide-react";
import { usePlanStore, type ViewMode } from "../store/planStore";
import { downloadText } from "../lib/files";

const VIEWS: { id: ViewMode; label: string; icon: JSX.Element }[] = [
  { id: "2d", label: "2D", icon: <Square size={15} /> },
  { id: "split", label: "Geteilt", icon: <Columns2 size={15} /> },
  { id: "3d", label: "3D", icon: <Box size={15} /> },
];

export function TopBar({ onRender }: { onRender: () => void }) {
  const plan = usePlanStore((s) => s.plan);
  const view = usePlanStore((s) => s.view);
  const canUndo = usePlanStore((s) => s.past.length > 0);
  const canRedo = usePlanStore((s) => s.future.length > 0);
  const { setView, undo, redo, commit, importJson, setOnboarded } = usePlanStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={28} height={28} />
        <span className="brand-name">Raumwerk</span>
      </div>

      <input
        className="plan-name"
        value={plan.name}
        aria-label="Name des Projekts"
        onChange={(e) => commit((p) => ({ ...p, name: e.target.value.slice(0, 120) }))}
      />

      <div className="segmented" role="tablist" aria-label="Ansicht">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "is-active" : ""} onClick={() => setView(v.id)}>
            {v.icon}<span>{v.label}</span>
          </button>
        ))}
      </div>

      <div className="topbar-actions">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Rückgängig (Strg+Z)"><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Wiederholen (Strg+Shift+Z)"><Redo2 size={17} /></button>
        <span className="divider" />
        <button className="icon-btn" onClick={() => setOnboarded(false)} title="Neues Projekt"><FilePlus2 size={17} /></button>
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Projekt öffnen (.json)"><FolderOpen size={17} /></button>
        <button className="icon-btn" onClick={() => downloadText(`${plan.name || "wohnung"}.raumwerk.json`, JSON.stringify(plan))} title="Projekt speichern (.json)"><Download size={17} /></button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try { importJson(await file.text()); } catch { alert("Die Datei ist kein gültiges Raumwerk-Projekt."); }
          }}
        />
        <button className="btn primary render-btn" onClick={onRender}>
          <Sparkles size={16} /> <span>Foto-Render</span>
        </button>
      </div>
    </header>
  );
}
