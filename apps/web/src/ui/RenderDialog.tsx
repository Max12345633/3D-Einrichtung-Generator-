import { useEffect, useRef, useState } from "react";
import { Camera, Download, Footprints, Loader2, Sparkles, X } from "lucide-react";
import { INTERIOR_STYLES, STYLE_IDS, applyStyle } from "@raumwerk/core";
import { usePlanStore } from "../store/planStore";
import { triggerDownload } from "../lib/files";
import { viewportCapture, viewportScene } from "../viewer/Viewer3D";
import { MOODS, QUALITIES, isPathTracingSupported, plannedSamples, renderPhoto, type Mood, type Quality } from "../viewer/photo";
import { canUseAIDenoiser, preloadAIDenoiser } from "../viewer/denoise";

type Phase =
  | { kind: "setup" }
  | { kind: "running"; progress: number; startedAt: number; stage: "trace" | "denoise" }
  | { kind: "done"; dataUrl: string; seconds: number; samples: number; denoiser: "ki" | "filter" }
  | { kind: "error"; message: string };

/** Entwicklungs-Schnelltest ohne GPU: ?phototest=<samples>&w=<breite> rendert klein mit wenigen Samples. */
function devOverride() {
  if (!import.meta.env.DEV) return undefined;
  const params = new URLSearchParams(location.search);
  const v = params.get("phototest");
  const w = Number(params.get("w")) || 400;
  return v === null ? undefined : { width: w, height: Math.round((w * 9) / 16), samples: Number(v) || 4 };
}

/** Renders dieser Sitzung (nicht persistiert – Bilder sind groß). */
const gallery: { dataUrl: string; label: string }[] = [];

export function RenderDialog({ onClose }: { onClose: () => void }) {
  const plan = usePlanStore((s) => s.plan);
  const walkMode = usePlanStore((s) => s.walkMode);
  const [mood, setMood] = useState<Mood>("tag");
  const [quality, setQuality] = useState<Quality>("hd");
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [preview, setPreview] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(gallery[0]?.dataUrl ?? null);
  const [, force] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const liveBox = useRef<HTMLDivElement>(null);
  const [supported] = useState(isPathTracingSupported);
  const running = phase.kind === "running";

  // Vorschau nach jeder Änderung neu aufnehmen (2 Frames warten, bis die 3D-Ansicht aktualisiert ist)
  useEffect(() => {
    if (running) return;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setPreview(viewportCapture.current?.() ?? null)); });
    return () => cancelAnimationFrame(id);
  }, [plan, running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !running) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, running]);
  const [, setAiReady] = useState(false);
  useEffect(() => {
    preloadAIDenoiser().then(setAiReady);
    return () => abort.current?.abort();
  }, []);

  const start = async () => {
    const view = viewportScene.current;
    if (!view) return setPhase({ kind: "error", message: "Bitte zuerst die 3D-Ansicht öffnen (Ansicht „3D“ oder „Geteilt“)." });
    abort.current = new AbortController();
    const startedAt = performance.now();
    setPhase({ kind: "running", progress: 0, startedAt, stage: "trace" });
    try {
      const result = await renderPhoto({
        scene: view.scene as never,
        camera: view.camera,
        plan,
        mood,
        quality,
        // Entwicklungs-Schnelltest (z. B. in CI ohne GPU): ?phototest
        override: devOverride(),
        signal: abort.current.signal,
        onProgress: (progress, canvas, stage) => {
          // Live-Canvas zeigen – man sieht das Bild „entstehen“ und dann sauber werden
          if (liveBox.current && canvas.parentElement !== liveBox.current) {
            liveBox.current.replaceChildren(canvas);
          }
          setPhase({ kind: "running", progress, startedAt, stage });
        },
      });
      gallery.unshift({ dataUrl: result.dataUrl, label: `${MOODS[mood].label} · ${QUALITIES[quality].label}` });
      gallery.splice(8);
      setShown(result.dataUrl);
      setPhase({ kind: "done", dataUrl: result.dataUrl, seconds: result.seconds, samples: result.samples, denoiser: result.denoiser });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setPhase({ kind: "setup" });
      console.error(e);
      setPhase({ kind: "error", message: "Das Bild konnte nicht berechnet werden. Versuche die Qualität „Entwurf“ oder einen aktuellen Browser (Chrome, Edge, Safari 17+)." });
    } finally {
      force((n) => n + 1);
    }
  };

  const elapsed = running ? Math.round((performance.now() - phase.startedAt) / 1000) : 0;
  const eta = running && phase.progress > 0.04 ? Math.max(0, Math.round(elapsed / phase.progress - elapsed)) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="modal render-modal" role="dialog" aria-modal="true" aria-label="Fotorealistisches Bild erzeugen">
        <button className="icon-btn modal-close" onClick={onClose} disabled={running} aria-label="Schließen"><X size={18} /></button>
        <h2><Sparkles size={20} /> Fotorealistisches Bild</h2>
        <p className="muted">Berechnet mit physikalisch korrektem Licht (Path-Tracing) direkt auf deinem Gerät. Das Bild zeigt exakt deine Wohnung: echte Maße, deine Möbel, dein Blickwinkel.</p>

        <div className="render-grid">
          <div className="render-preview">
            <div ref={liveBox} style={{ display: running ? "block" : "none", width: "100%", height: "100%" }} />
            {!running && (shown ? <img src={shown} alt="Fotorealistisches Raumbild" /> : preview ? <img src={preview} alt="Aktueller Blickwinkel" /> : <div className="placeholder">Keine 3D-Ansicht</div>)}
            {!running && !shown && preview && <span className="compare-badge">Blickwinkel</span>}
            {running && (
              <div className="progress">
                <Loader2 className="spin" size={15} />
                <div className="progress-bar"><span style={{ width: `${Math.round(phase.progress * 100)}%` }} /></div>
                <span>{phase.stage === "denoise" ? "KI entrauscht …" : `${Math.round(phase.progress * 100)} %${eta !== null ? ` · noch ~${eta} s` : ""}`}</span>
              </div>
            )}
          </div>

          <div className="render-options">
            {!walkMode && (
              <div className="hint-box">
                <Camera size={16} />
                <span>Am echtesten wirken Bilder aus Augenhöhe.</span>
                <button className="chip small" onClick={() => { usePlanStore.getState().setWalkMode(true); onClose(); }} disabled={running}>
                  <Footprints size={13} /> Rundgang
                </button>
              </div>
            )}

            <div className="option-group">
              <span className="field-label">Einrichtungsstil <small className="muted small">(ändert das Projekt · Strg+Z)</small></span>
              <div className="style-grid">
                {STYLE_IDS.map((id) => (
                  <button key={id} className="chip small" disabled={running} onClick={() => { usePlanStore.getState().commit((p) => applyStyle(p, id)); setShown(null); }}>
                    <span className="style-dots">{INTERIOR_STYLES[id].fabric.slice(0, 2).concat(INTERIOR_STYLES[id].wood).map((c) => <i key={c} style={{ background: c }} />)}</span>
                    {INTERIOR_STYLES[id].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="option-group">
              <span className="field-label">Licht</span>
              <div className="style-grid">
                {(Object.keys(MOODS) as Mood[]).map((m) => (
                  <button key={m} className={`chip ${mood === m ? "is-active" : ""}`} onClick={() => setMood(m)} disabled={running}>{MOODS[m].label}</button>
                ))}
              </div>
            </div>

            <div className="option-group">
              <span className="field-label">Qualität</span>
              <div className="style-grid">
                {(Object.keys(QUALITIES) as Quality[]).map((q) => (
                  <button key={q} className={`chip ${quality === q ? "is-active" : ""}`} onClick={() => setQuality(q)} disabled={running} title={`${QUALITIES[q].width} × ${QUALITIES[q].height} px`}>
                    {QUALITIES[q].label}
                  </button>
                ))}
              </div>
            </div>

            {!supported && <p className="error-text">Dein Browser unterstützt kein WebGL2 mit Float-Texturen. Bitte Chrome, Edge oder Safari 17+ nutzen.</p>}
            {phase.kind === "error" && <p className="error-text">{phase.message}</p>}
            {phase.kind === "done" && (
              <p className="muted small">
                Fertig in {Math.round(phase.seconds)} s · {phase.samples} Samples · {phase.denoiser === "ki" ? "KI-entrauscht" : "gefiltert"}
              </p>
            )}
            {phase.kind !== "done" && !running && (
              <p className="muted small">
                {QUALITIES[quality].width} × {QUALITIES[quality].height} px · {plannedSamples(quality)} Samples · {canUseAIDenoiser() ? "KI-Entrauschen (WebGPU)" : "Filter-Entrauschen"}
              </p>
            )}

            <div className="dialog-actions">
              {running ? (
                <button className="btn ghost" onClick={() => abort.current?.abort()}>Abbrechen</button>
              ) : (
                <>
                  {shown && (
                    <button className="btn ghost" onClick={() => triggerDownload(shown, `${plan.name || "wohnung"}.jpg`)}><Download size={15} /> Speichern</button>
                  )}
                  <button className="btn primary" onClick={start} disabled={!supported}>
                    <Sparkles size={15} /> {gallery.length ? "Neues Bild" : "Bild berechnen"}
                  </button>
                </>
              )}
            </div>

            {gallery.length > 0 && (
              <div className="option-group">
                <span className="field-label">Deine Bilder</span>
                <div className="gallery">
                  {gallery.map((g) => (
                    <button key={g.dataUrl.slice(-40)} className={shown === g.dataUrl ? "is-active" : ""} onClick={() => setShown(g.dataUrl)} title={g.label} disabled={running}>
                      <img src={g.dataUrl} alt={g.label} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
