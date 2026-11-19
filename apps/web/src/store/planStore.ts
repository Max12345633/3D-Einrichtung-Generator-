import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS, addCustomEntry, addFurniture, addOpening, addWall, emptyPlan, parsePlan,
  registerCatalogEntries, removeById, samplePlan, updateFurniture, type CatalogEntry, type Opening, type Plan, type ProductInfo, type Vec2,
} from "@raumwerk/core";

export type Tool = "select" | "wall" | "door" | "window" | "furniture" | "calibrate";
export type ViewMode = "2d" | "split" | "3d";
export type SelectionKind = "wall" | "opening" | "furniture";
export interface Selection {
  kind: SelectionKind;
  id: string;
}

const HISTORY_LIMIT = 100;

interface PlanState {
  plan: Plan;
  past: Plan[];
  future: Plan[];
  tool: Tool;
  view: ViewMode;
  selection: Selection | null;
  /** Katalog-ID, die beim nächsten Klick platziert wird */
  placing: string | null;
  wallThickness: number;
  snapping: boolean;
  onboarded: boolean;
  walkMode: boolean;
  /** Import-Dialog (nicht persistiert); initial = vorbefülltes Produkt (Lesezeichen-Import) */
  importDialog: { open: boolean; initial: ProductInfo | null };
  openImport: (initial?: ProductInfo | null) => void;
  closeImport: () => void;

  /** Änderung mit Undo-Eintrag */
  commit: (recipe: (p: Plan) => Plan) => void;
  /** Für Drag-Gesten: einmal beginGesture(), danach beliebig oft live() ohne History-Flut */
  beginGesture: () => void;
  live: (recipe: (p: Plan) => Plan) => void;
  undo: () => void;
  redo: () => void;
  load: (plan: Plan) => void;
  newPlan: () => void;
  loadSample: () => void;
  importJson: (json: string) => void;

  setTool: (tool: Tool) => void;
  setView: (view: ViewMode) => void;
  select: (sel: Selection | null) => void;
  startPlacing: (catalogId: string) => void;
  setWallThickness: (t: number) => void;
  toggleSnapping: () => void;
  setOnboarded: (v: boolean) => void;
  setWalkMode: (v: boolean) => void;

  drawWall: (a: Vec2, b: Vec2) => void;
  placeOpening: (kind: Opening["kind"], at: Vec2) => boolean;
  placeFurniture: (catalogId: string, at: Vec2, rotation?: number) => void;
  /** Importiertes Shop-Möbel ins Projekt übernehmen und direkt zum Platzieren bereitstellen */
  importEntry: (entry: CatalogEntry) => void;
  deleteSelection: () => void;
  rotateSelection: (delta: number) => void;
  duplicateSelection: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
}

/** LocalStorage kann voll, gesperrt oder im Privatmodus nicht verfügbar sein → nie die App crashen lassen. */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* Quota: Hintergrundbild evtl. zu groß */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const pushPast = (past: Plan[], p: Plan) => [...past.slice(-HISTORY_LIMIT + 1), p];

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      plan: samplePlan(),
      past: [],
      future: [],
      tool: "select",
      view: "split",
      selection: null,
      placing: null,
      wallThickness: DEFAULT_WALL_THICKNESS,
      snapping: true,
      onboarded: false,
      walkMode: false,
      importDialog: { open: false, initial: null },
      openImport: (initial = null) => set({ importDialog: { open: true, initial } }),
      closeImport: () => set({ importDialog: { open: false, initial: null } }),

      commit: (recipe) => {
        const { plan, past } = get();
        const next = recipe(plan);
        if (next === plan) return;
        set({ plan: next, past: pushPast(past, plan), future: [] });
      },
      beginGesture: () => set(({ plan, past }) => ({ past: pushPast(past, plan), future: [] })),
      live: (recipe) => set(({ plan }) => ({ plan: recipe(plan) })),
      undo: () => {
        const { past, plan, future } = get();
        const prev = past[past.length - 1];
        if (!prev) return;
        set({ plan: prev, past: past.slice(0, -1), future: [plan, ...future], selection: null });
      },
      redo: () => {
        const { past, plan, future } = get();
        const next = future[0];
        if (!next) return;
        set({ plan: next, past: pushPast(past, plan), future: future.slice(1), selection: null });
      },
      load: (plan) => set(({ plan: cur, past }) => ({ plan, past: pushPast(past, cur), future: [], selection: null, onboarded: true })),
      newPlan: () => get().load(emptyPlan()),
      loadSample: () => get().load(samplePlan()),
      importJson: (json) => get().load(parsePlan(JSON.parse(json))),

      setTool: (tool) => set({ tool, placing: tool === "furniture" ? get().placing : null, selection: tool === "select" ? get().selection : null }),
      setView: (view) => set({ view }),
      select: (selection) => set({ selection }),
      startPlacing: (catalogId) => set({ placing: catalogId, tool: "furniture", selection: null }),
      setWallThickness: (wallThickness) => set({ wallThickness }),
      toggleSnapping: () => set(({ snapping }) => ({ snapping: !snapping })),
      setOnboarded: (onboarded) => set({ onboarded }),
      setWalkMode: (walkMode) => set({ walkMode }),

      drawWall: (a, b) => get().commit((p) => addWall(p, a, b, get().wallThickness, DEFAULT_WALL_HEIGHT).plan),
      placeOpening: (kind, at) => {
        const res = addOpening(get().plan, kind, at);
        if (!res.opening) return false;
        get().commit(() => res.plan);
        set({ selection: { kind: "opening", id: res.opening.id } });
        return true;
      },
      placeFurniture: (catalogId, at, rotation = 0) => {
        const res = addFurniture(get().plan, catalogId, at, rotation);
        if (!res.item) return;
        get().commit(() => res.plan);
        set({ selection: { kind: "furniture", id: res.item.id }, placing: null, tool: "select" });
      },
      importEntry: (entry) => {
        get().commit((p) => addCustomEntry(p, entry));
        set({ placing: entry.id, tool: "furniture", selection: null, view: get().view === "3d" ? "split" : get().view });
      },
      deleteSelection: () => {
        const sel = get().selection;
        if (!sel) return;
        get().commit((p) => removeById(p, sel.id));
        set({ selection: null });
      },
      rotateSelection: (delta) => {
        const sel = get().selection;
        if (sel?.kind !== "furniture") return;
        get().commit((p) => {
          const f = p.furniture.find((x) => x.id === sel.id);
          return f ? updateFurniture(p, f.id, { rotation: normalizeAngle(f.rotation + delta) }) : p;
        });
      },
      duplicateSelection: () => {
        const sel = get().selection;
        if (sel?.kind !== "furniture") return;
        const f = get().plan.furniture.find((x) => x.id === sel.id);
        if (!f) return;
        const res = addFurniture(get().plan, f.catalogId, { x: f.position.x + 0.3, y: f.position.y + 0.3 }, f.rotation);
        if (!res.item) return;
        const item = res.item;
        get().commit(() => (f.color ? updateFurniture(res.plan, item.id, { color: f.color }) : res.plan));
        set({ selection: { kind: "furniture", id: item.id } });
      },
      nudgeSelection: (dx, dy) => {
        const sel = get().selection;
        if (sel?.kind !== "furniture") return;
        get().commit((p) => {
          const f = p.furniture.find((x) => x.id === sel.id);
          return f ? updateFurniture(p, f.id, { position: { x: f.position.x + dx, y: f.position.y + dy } }) : p;
        });
      },
    }),
    {
      name: "raumwerk:v1",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ plan: s.plan, view: s.view, wallThickness: s.wallThickness, snapping: s.snapping, onboarded: s.onboarded }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PlanState> | undefined;
        if (!p) return current;
        let plan = current.plan;
        try { if (p.plan) plan = parsePlan(p.plan); } catch { /* defekte Daten → Beispiel behalten */ }
        return { ...current, ...p, plan };
      },
    },
  ),
);

export function normalizeAngle(a: number): number {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

export const DEFAULT_THICKNESS_OPTIONS = [
  { label: "Innenwand 12 cm", value: 0.12 },
  { label: "Tragwand 24 cm", value: 0.24 },
  { label: "Außenwand 30 cm", value: 0.3 },
];

// Importierte Möbel des aktuellen Plans im Katalog bekannt machen – vor jedem Rendern,
// da dieser Listener vor den React-Komponenten registriert wird.
registerCatalogEntries(usePlanStore.getState().plan.customCatalog);
usePlanStore.subscribe((state, prev) => {
  if (state.plan.customCatalog !== prev.plan.customCatalog) registerCatalogEntries(state.plan.customCatalog);
});
