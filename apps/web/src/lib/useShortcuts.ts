import { useEffect } from "react";
import { usePlanStore } from "../store/planStore";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = usePlanStore.getState();
      if (s.walkMode) return; // WASD gehört dem Rundgang
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); return e.shiftKey ? s.redo() : s.undo(); }
      if (mod && k === "y") { e.preventDefault(); return s.redo(); }
      if (mod && k === "d") { e.preventDefault(); return s.duplicateSelection(); }
      if (mod) return;
      if (k === "delete" || k === "backspace") { e.preventDefault(); return s.deleteSelection(); }
      if (k === "escape") return s.selection ? s.select(null) : s.setTool("select");
      // Beim Platzieren dreht R/Q/E das Möbel, das gleich abgesetzt wird
      if (s.placing && (k === "r" || k === "q" || k === "e")) {
        return s.rotatePlacing(k === "r" ? Math.PI / 2 : k === "e" ? Math.PI / 12 : -Math.PI / 12);
      }
      if (k === "r") return s.rotateSelection(e.shiftKey ? Math.PI / 12 : Math.PI / 2);
      if (k === "e") return s.rotateSelection(Math.PI / 12);
      if (k === "q") return s.rotateSelection(-Math.PI / 12);
      if (k === "v") return s.setTool("select");
      if (k === "w") return s.setTool("wall");
      if (k === "t") return s.setTool("door");
      if (k === "f") return s.setTool("window");
      const step = e.shiftKey ? 0.25 : 0.05;
      const nudges: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (nudges[k] && s.selection?.kind === "furniture") { e.preventDefault(); s.nudgeSelection(...nudges[k]!); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
