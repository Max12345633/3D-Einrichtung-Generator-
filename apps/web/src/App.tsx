import { lazy, Suspense, useState } from "react";
import { usePlanStore } from "./store/planStore";
import { Editor2D } from "./editor/Editor2D";
import { TopBar } from "./ui/TopBar";
import { LeftPanel } from "./ui/LeftPanel";
import { Inspector } from "./ui/Inspector";
import { StartScreen } from "./ui/StartScreen";
import { useShortcuts } from "./lib/useShortcuts";
import { ImportDialog } from "./ui/ImportDialog";
import { Toast } from "./ui/Toast";
import { SelectionBar } from "./ui/SelectionBar";

// three.js ist groß → erst laden, wenn die 3D-Ansicht gebraucht wird
const Viewer3D = lazy(() => import("./viewer/Viewer3D").then((m) => ({ default: m.Viewer3D })));
const RenderDialog = lazy(() => import("./ui/RenderDialog").then((m) => ({ default: m.RenderDialog })));

export function App() {
  const view = usePlanStore((s) => s.view);
  const onboarded = usePlanStore((s) => s.onboarded);
  const [renderOpen, setRenderOpen] = useState(false);
  const importDialog = usePlanStore((s) => s.importDialog);
  useShortcuts();


  return (
    <div className="app">
      <TopBar onRender={() => { if (view === "2d") usePlanStore.getState().setView("split"); setRenderOpen(true); }} />
      <div className="workspace">
        <LeftPanel />
        <main className={`stage stage-${view}`}>
          {view !== "3d" && <section className="pane pane-2d"><Editor2D /></section>}
          {view !== "2d" && (
            <section className="pane pane-3d">
              <Suspense fallback={<div className="pane-loading">3D wird geladen …</div>}><Viewer3D /></Suspense>
            </section>
          )}
          <SelectionBar />
        </main>
        <Inspector />
      </div>
      {!onboarded && <StartScreen />}
      {importDialog.open && <ImportDialog key={importDialog.initial?.url ?? "neu"} initial={importDialog.initial} onClose={() => usePlanStore.getState().closeImport()} />}
      <Toast />
      {renderOpen && <Suspense fallback={null}><RenderDialog onClose={() => setRenderOpen(false)} /></Suspense>}
    </div>
  );
}
