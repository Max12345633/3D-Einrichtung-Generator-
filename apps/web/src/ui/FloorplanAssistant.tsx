import { useState } from "react";
import { CheckCircle2, Loader2, Ruler, Wand2, X } from "lucide-react";
import { usePlanStore } from "../store/planStore";
import { detectFromBackground } from "../lib/floorplan";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string; estimated: boolean } | { kind: "error"; text: string };

/** Führt durch: Wände aus dem Bild erkennen → Maßstab festlegen → nachbessern. */
export function FloorplanAssistant({ onDetected }: { onDetected: () => void }) {
  const open = usePlanStore((s) => s.assistantOpen);
  const calibrated = usePlanStore((s) => !!s.plan.background?.calibrated);
  const hasWalls = usePlanStore((s) => s.plan.walls.length > 0);
  const tool = usePlanStore((s) => s.tool);
  const [state, setState] = useState<State>({ kind: "idle" });
  if (!open) return null;

  const detect = async () => {
    // Vorhandene Wände werden ersetzt – mit Strg+Z rückgängig machbar
    const { plan, commit } = usePlanStore.getState();
    setState({ kind: "busy" });
    try {
      const r = await detectFromBackground(plan);
      if (r.walls === 0) {
        setState({ kind: "error", text: "Keine Wände gefunden. Funktioniert am besten mit dunkel gefüllten Wänden. Du kannst die Wände auch selbst nachzeichnen (W)." });
        return;
      }
      commit(() => r.plan);
      usePlanStore.getState().setTool("select");
      setState({
        kind: "done",
        estimated: r.estimatedScale,
        text: `${r.walls} Wände, ${r.doors} ${r.doors === 1 ? "Tür" : "Türen"}, ${r.windows} Fenster erkannt.`,
      });
      onDetected();
    } catch (e) {
      console.error(e);
      setState({ kind: "error", text: "Das Bild konnte nicht ausgewertet werden." });
    }
  };

  return (
    <div className="assistant" role="region" aria-label="Grundriss übernehmen">
      <div className="assistant-head">
        <strong>Grundriss übernehmen</strong>
        <button className="icon-btn" onClick={() => usePlanStore.getState().setAssistantOpen(false)} aria-label="Schließen"><X size={15} /></button>
      </div>
      <ol>
        <li className={state.kind === "done" ? "is-done" : ""}>
          <button className="btn primary small-btn" onClick={detect} disabled={state.kind === "busy"}>
            {state.kind === "busy" ? <Loader2 className="spin" size={14} /> : <Wand2 size={14} />}
            {hasWalls && state.kind !== "busy" ? "Wände neu erkennen" : "Wände automatisch erkennen"}
          </button>
          {state.kind === "done" && <span className="ok-text"><CheckCircle2 size={13} /> {state.text}</span>}
          {state.kind === "error" && <span className="warn-text">{state.text}</span>}
        </li>
        <li className={calibrated ? "is-done" : ""}>
          <button className={`btn ghost small-btn ${tool === "calibrate" ? "is-active" : ""}`} onClick={() => usePlanStore.getState().setTool("calibrate")}>
            <Ruler size={14} /> Maßstab festlegen
          </button>
          <span className="muted small">
            {calibrated
              ? "Maßstab festgelegt."
              : state.kind === "done" && state.estimated
                ? "Maßstab ist geschätzt. Klicke für exakte m² zwei Punkte mit bekanntem Abstand an."
                : "Zwei Punkte mit bekanntem Abstand anklicken, z. B. eine bemaßte Wand."}
          </span>
        </li>
        <li>
          <span className="muted small">Nachbessern: Wand anklicken und Enden ziehen, Entf löscht, W zeichnet neu, T/F setzt Tür/Fenster. Strg+Z macht die Erkennung rückgängig.</span>
        </li>
      </ol>
    </div>
  );
}
