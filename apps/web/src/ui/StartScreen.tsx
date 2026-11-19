import { Home, PenLine } from "lucide-react";
import { usePlanStore } from "../store/planStore";
import { BackgroundUpload } from "./LeftPanel";

export function StartScreen() {
  const { newPlan, loadSample, setOnboarded, setTool, setView } = usePlanStore.getState();
  return (
    <div className="start-overlay" role="dialog" aria-modal="true" aria-label="Projekt starten">
      <div className="start-panel">
        <p className="eyebrow">Raumwerk</p>
        <h1>Sieh deine Wohnung, bevor du einziehst.</h1>
        <p className="lead">Grundriss rein, 3D-Wohnung raus. Richte sie ein und erzeuge fotorealistische Bilder, alles im Browser.</p>
        <div className="start-cards">
          <BackgroundUpload big onDone={() => setOnboarded(true)} />
          <button className="start-card" onClick={() => { newPlan(); setTool("wall"); setView("split"); }}>
            <PenLine size={28} />
            <strong>Selbst zeichnen</strong>
            <span>Wände per Klick zeichnen. Alles rastet sauber ein, Räume und Flächen erscheinen automatisch.</span>
          </button>
          <button className="start-card" onClick={() => { loadSample(); setView("split"); }}>
            <Home size={28} />
            <strong>Beispielwohnung</strong>
            <span>Eine fertig eingerichtete 2-Zimmer-Wohnung zum Ausprobieren.</span>
          </button>
        </div>
        <button className="link-btn" onClick={() => setOnboarded(true)}>Weiter am aktuellen Projekt →</button>
      </div>
    </div>
  );
}
