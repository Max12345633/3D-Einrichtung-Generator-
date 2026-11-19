import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Sparkles, X } from "lucide-react";
import { RENDER_STYLES, type RenderStyle } from "@raumwerk/core";
import { usePlanStore } from "../store/planStore";
import { submitRender, waitForRender, type RenderJob } from "../lib/api";
import { downscaleDataUrl, triggerDownload } from "../lib/files";
import { viewportCapture } from "../viewer/Viewer3D";

type Phase = { kind: "setup" } | { kind: "running"; job?: RenderJob } | { kind: "done"; imageUrl: string } | { kind: "error"; message: string };

export function RenderDialog({ onClose }: { onClose: () => void }) {
  const plan = usePlanStore((s) => s.plan);
  const [style, setStyle] = useState<RenderStyle>("skandinavisch");
  const [userPrompt, setUserPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [preview, setPreview] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setPreview(viewportCapture.current?.() ?? null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); abort.current?.abort(); };
  }, [onClose]);

  const start = async () => {
    const shot = viewportCapture.current?.();
    if (!shot) return setPhase({ kind: "error", message: "Bitte zuerst die 3D-Ansicht öffnen (Ansicht „3D“ oder „Geteilt“)." });
    abort.current = new AbortController();
    setPhase({ kind: "running" });
    try {
      const imageDataUrl = await downscaleDataUrl(shot);
      const { job } = await submitRender({ plan, style, userPrompt: userPrompt || undefined, imageDataUrl, aspectRatio: "16:9" });
      const final = await waitForRender(job.id, (j) => setPhase({ kind: "running", job: j }), abort.current.signal);
      if (final.status === "completed" && final.imageUrl) setPhase({ kind: "done", imageUrl: final.imageUrl });
      else setPhase({ kind: "error", message: final.error ?? "Das Bild konnte nicht erzeugt werden." });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Unbekannter Fehler" });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal render-modal" role="dialog" aria-modal="true" aria-label="Fotorealistisches Bild erzeugen">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        <h2><Sparkles size={20} /> Fotorealistisches Bild</h2>
        <p className="muted">Die aktuelle 3D-Ansicht dient als Vorlage, die KI erhält Raum, Fenster und Möbelstellung. Tipp: Vorher in der 3D-Ansicht den Blickwinkel wählen.</p>

        <div className="render-grid">
          <div className="render-preview">
            {phase.kind === "done" ? <img src={phase.imageUrl} alt="Erzeugtes Raumbild" /> : preview ? <img src={preview} alt="Vorlage aus der 3D-Ansicht" /> : <div className="placeholder">Keine 3D-Ansicht</div>}
            {phase.kind === "running" && (
              <div className="render-progress">
                <Loader2 className="spin" size={28} />
                <span>{phase.job?.status === "processing" ? "Bild wird erzeugt …" : "In der Warteschlange …"}</span>
              </div>
            )}
          </div>

          <div className="render-options">
            <span className="field-label">Stil</span>
            <div className="style-grid">
              {(Object.keys(RENDER_STYLES) as RenderStyle[]).map((s) => (
                <button key={s} className={`chip ${style === s ? "is-active" : ""}`} onClick={() => setStyle(s)} disabled={phase.kind === "running"}>
                  {RENDER_STYLES[s].label}
                </button>
              ))}
            </div>
            <label className="field">
              <span className="field-label">Wünsche (optional)</span>
              <textarea rows={3} maxLength={400} placeholder="z. B. Abendstimmung, Wand in Salbeigrün, viele Pflanzen" value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} disabled={phase.kind === "running"} />
            </label>

            {phase.kind === "error" && <p className="error-text">{phase.message}</p>}

            <div className="dialog-actions">
              {phase.kind === "done" && (
                <button className="btn ghost" onClick={() => triggerDownload(phase.imageUrl, `${plan.name}-${style}.jpg`)}><Download size={15} /> Speichern</button>
              )}
              <button className="btn primary" onClick={start} disabled={phase.kind === "running"}>
                <Sparkles size={15} /> {phase.kind === "done" ? "Neu erzeugen" : "Bild erzeugen"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
