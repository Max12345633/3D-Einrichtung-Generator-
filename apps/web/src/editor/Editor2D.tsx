import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATALOG_BY_ID, OPENING_DEFAULTS, boundsOf, detectRooms, distance, findCollisions, moveJunction, nearestWall,
  pointOnWall, projectOnSegment, snapFurnitureToWall, snapPoint, updateFurniture, updateOpening, wallAngle,
  wallLength, type FurnitureItem, type Opening, type SnapKind, type Vec2, type Wall,
} from "@raumwerk/core";
import { usePlanStore } from "../store/planStore";
import { formatArea, formatLength } from "../lib/format";
import { CalibrationDialog } from "../ui/CalibrationDialog";

interface Camera {
  cx: number;
  cy: number;
  /** Pixel pro Meter */
  zoom: number;
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; cam: Camera }
  | { kind: "furniture"; id: string; offset: Vec2 }
  | { kind: "junction"; from: Vec2 }
  | { kind: "opening"; id: string };

const RAD2DEG = 180 / Math.PI;

export function Editor2D() {
  const plan = usePlanStore((s) => s.plan);
  const tool = usePlanStore((s) => s.tool);
  const selection = usePlanStore((s) => s.selection);
  const placing = usePlanStore((s) => s.placing);
  const snapping = usePlanStore((s) => s.snapping);
  const { select, drawWall, placeOpening, placeFurniture, beginGesture, live, commit, setTool } = usePlanStore.getState();

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Camera>({ cx: 5, cy: 3, zoom: 60 });
  const [cursor, setCursor] = useState<{ point: Vec2; kind: SnapKind } | null>(null);
  const [chain, setChain] = useState<Vec2 | null>(null);
  const [calib, setCalib] = useState<Vec2[]>([]);
  const [modifiers, setModifiers] = useState({ shift: false, alt: false });
  const drag = useRef<Drag | null>(null);
  const fitted = useRef(false);

  const rooms = useMemo(() => detectRooms(plan.walls), [plan.walls]);
  const collisions = useMemo(() => findCollisions(plan.furniture), [plan.furniture]);
  const wallsById = useMemo(() => new Map(plan.walls.map((w) => [w.id, w])), [plan.walls]);

  // ---------- Größe & Kamera ----------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const pts = plan.walls.flatMap((w) => [w.a, w.b]);
    if (plan.background) {
      const bg = plan.background;
      pts.push(bg.origin, { x: bg.origin.x + bg.widthPx * bg.metersPerPixel, y: bg.origin.y + bg.heightPx * bg.metersPerPixel });
    }
    const b = boundsOf(pts);
    if (!b) return setCam({ cx: 5, cy: 4, zoom: 60 });
    const zoom = Math.min(size.w / (b.maxX - b.minX + 2), size.h / (b.maxY - b.minY + 2));
    setCam({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom: Math.max(8, Math.min(200, zoom)) });
  }, [plan.walls, plan.background, size]);

  useEffect(() => {
    if (!fitted.current && size.w > 100) { fitted.current = true; fit(); }
  }, [fit, size.w]);
  // Bei neuem Plan (Laden/Neu) neu einpassen
  useEffect(() => { fitted.current = false; }, [plan.id]);
  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener("raumwerk:fit", onFit);
    return () => window.removeEventListener("raumwerk:fit", onFit);
  }, [fit]);

  const viewBox = `${cam.cx - size.w / 2 / cam.zoom} ${cam.cy - size.h / 2 / cam.zoom} ${size.w / cam.zoom} ${size.h / cam.zoom}`;
  const px = (n: number) => n / cam.zoom; // Bildschirmpixel → Meter

  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: cam.cx + (clientX - rect.left - rect.width / 2) / cam.zoom,
      y: cam.cy + (clientY - rect.top - rect.height / 2) / cam.zoom,
    };
  }, [cam]);

  // Zoom mit Mausrad (non-passive, damit die Seite nicht scrollt)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setCam((c) => {
        const wx = c.cx + (e.clientX - rect.left - rect.width / 2) / c.zoom;
        const wy = c.cy + (e.clientY - rect.top - rect.height / 2) / c.zoom;
        const zoom = Math.max(5, Math.min(400, c.zoom * Math.exp(-e.deltaY * 0.0015)));
        return { zoom, cx: wx - (wx - c.cx) * (c.zoom / zoom), cy: wy - (wy - c.cy) * (c.zoom / zoom) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---------- Tastatur (werkzeugspezifisch) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setModifiers({ shift: e.shiftKey, alt: e.altKey });
      if (e.type === "keydown" && e.key === "Escape") { setChain(null); setCalib([]); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);
  useEffect(() => { setChain(null); setCalib([]); }, [tool]);

  const snapOn = snapping && !modifiers.shift;
  const snap = useCallback((raw: Vec2, anchor?: Vec2) => snapPoint(raw, plan.walls, {
    grid: snapOn ? 0.05 : 0, tolerance: px(12), anchor, angleStepDeg: snapOn ? 15 : 0,
  }), [plan.walls, snapOn, cam.zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeItem = useCallback((item: FurnitureItem): FurnitureItem =>
    snapOn && !modifiers.alt ? snapFurnitureToWall(item, plan.walls) : item, [snapOn, modifiers.alt, plan.walls]);

  // ---------- Zeiger ----------
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) { setChain(null); return; }
    const world = toWorld(e.clientX, e.clientY);
    svgRef.current?.setPointerCapture(e.pointerId);

    if (e.button === 1 || tool === "select") {
      if (tool === "select") select(null);
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, cam };
      return;
    }
    if (tool === "wall") {
      const s = snap(world, chain ?? undefined);
      if (!chain) { setChain(s.point); return; }
      drawWall(chain, s.point);
      // Klick auf bestehenden Knoten schließt den Linienzug (z. B. Raum geschlossen)
      if (s.kind === "endpoint") setChain(null); else setChain(s.point);
      return;
    }
    if (tool === "door" || tool === "window") {
      placeOpening(tool, world);
      return;
    }
    if (tool === "furniture" && placing) {
      const ghost = placeItem({ id: "ghost", catalogId: placing, position: snap(world).point, rotation: 0 });
      placeFurniture(placing, ghost.position, ghost.rotation);
      return;
    }
    if (tool === "calibrate") {
      const next = [...calib, world];
      setCalib(next.length > 2 ? [world] : next);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorld(e.clientX, e.clientY);
    const d = drag.current;
    if (d?.kind === "pan") {
      setCam({ ...d.cam, cx: d.cam.cx - (e.clientX - d.startX) / d.cam.zoom, cy: d.cam.cy - (e.clientY - d.startY) / d.cam.zoom });
      return;
    }
    if (d?.kind === "furniture") {
      const raw = { x: world.x - d.offset.x, y: world.y - d.offset.y };
      live((p) => {
        const f = p.furniture.find((x) => x.id === d.id);
        if (!f) return p;
        const moved = placeItem({ ...f, position: snapOn ? { x: Math.round(raw.x / 0.05) * 0.05, y: Math.round(raw.y / 0.05) * 0.05 } : raw });
        return updateFurniture(p, d.id, { position: moved.position, rotation: moved.rotation });
      });
      return;
    }
    if (d?.kind === "junction") {
      const others = plan.walls.filter((w) => distance(w.a, d.from) > 0.01 && distance(w.b, d.from) > 0.01);
      const s = snapPoint(world, others, { grid: snapOn ? 0.05 : 0, tolerance: px(12), angleStepDeg: 0 });
      live((p) => moveJunction(p, d.from, s.point));
      d.from = s.point;
      setCursor(s);
      return;
    }
    if (d?.kind === "opening") {
      live((p) => {
        const o = p.openings.find((x) => x.id === d.id);
        const w = o && p.walls.find((x) => x.id === o.wallId);
        if (!o || !w) return p;
        const t = projectOnSegment(world, w.a, w.b).t * wallLength(w);
        return updateOpening(p, o.id, { offset: snapOn ? Math.round(t / 0.05) * 0.05 : t });
      });
      return;
    }
    setCursor(tool === "wall" ? snap(world, chain ?? undefined) : tool === "furniture" ? snap(world) : { point: world, kind: "none" });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  // Element-Handler (nur im Auswahl-Werkzeug aktiv)
  const startFurnitureDrag = (e: React.PointerEvent, f: FurnitureItem) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    select({ kind: "furniture", id: f.id });
    beginGesture();
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { kind: "furniture", id: f.id, offset: { x: w.x - f.position.x, y: w.y - f.position.y } };
  };
  const selectWall = (e: React.PointerEvent, w: Wall) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    select({ kind: "wall", id: w.id });
  };
  const startJunctionDrag = (e: React.PointerEvent, p: Vec2) => {
    if (tool !== "select") return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    beginGesture();
    drag.current = { kind: "junction", from: { ...p } };
  };
  const startOpeningDrag = (e: React.PointerEvent, o: Opening) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    select({ kind: "opening", id: o.id });
    beginGesture();
    drag.current = { kind: "opening", id: o.id };
  };

  // ---------- Vorschauen ----------
  const selectedWall = selection?.kind === "wall" ? wallsById.get(selection.id) : undefined;
  const openingPreview = (tool === "door" || tool === "window") && cursor
    ? (() => {
        const hit = nearestWall(cursor.point, plan.walls, 0.6);
        if (!hit) return null;
        const width = OPENING_DEFAULTS[tool].width;
        const len = wallLength(hit.wall);
        if (len < width + 0.05) return null;
        const offset = Math.min(Math.max(hit.offset, width / 2), len - width / 2);
        return { wall: hit.wall, center: pointOnWall(hit.wall, offset), width };
      })()
    : null;
  const ghost = tool === "furniture" && placing && cursor
    ? placeItem({ id: "ghost", catalogId: placing, position: cursor.point, rotation: 0 })
    : null;

  const cursorStyle = tool === "select" ? (drag.current?.kind === "pan" ? "grabbing" : "default") : "crosshair";

  return (
    <div className="editor2d">
      <svg
        ref={svgRef}
        className="editor2d-svg"
        viewBox={viewBox}
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag.current && setCursor(null)}
        onDoubleClick={() => setChain(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grid-minor" width={0.5} height={0.5} patternUnits="userSpaceOnUse">
            <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="var(--grid-minor)" strokeWidth={px(1)} />
          </pattern>
          <pattern id="grid-major" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="url(#grid-minor)" />
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="var(--grid-major)" strokeWidth={px(1)} />
          </pattern>
        </defs>
        <rect x={-500} y={-500} width={1000} height={1000} fill="url(#grid-major)" />

        {plan.background && (
          <image
            href={plan.background.dataUrl}
            x={plan.background.origin.x}
            y={plan.background.origin.y}
            width={plan.background.widthPx * plan.background.metersPerPixel}
            height={plan.background.heightPx * plan.background.metersPerPixel}
            opacity={plan.background.opacity}
            preserveAspectRatio="none"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Räume */}
        {rooms.map((r) => (
          <polygon key={r.id} points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill="var(--room-fill)" style={{ pointerEvents: "none" }} />
        ))}

        {/* Wände */}
        {plan.walls.map((w) => (
          <line
            key={w.id}
            x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
            strokeWidth={w.thickness}
            strokeLinecap="square"
            className={`wall ${selection?.id === w.id ? "is-selected" : ""}`}
            onPointerDown={(e) => selectWall(e, w)}
          />
        ))}

        {/* Öffnungen */}
        {plan.openings.map((o) => {
          const w = wallsById.get(o.wallId);
          if (!w) return null;
          const c = pointOnWall(w, o.offset);
          const t = w.thickness;
          return (
            <g
              key={o.id}
              transform={`translate(${c.x} ${c.y}) rotate(${wallAngle(w) * RAD2DEG})`}
              className={`opening ${selection?.id === o.id ? "is-selected" : ""}`}
              onPointerDown={(e) => startOpeningDrag(e, o)}
            >
              <rect x={-o.width / 2} y={-t / 2 - 0.01} width={o.width} height={t + 0.02} className="opening-cut" />
              {o.kind === "window" ? (
                <>
                  <line x1={-o.width / 2} y1={-t / 6} x2={o.width / 2} y2={-t / 6} className="opening-line" strokeWidth={px(1.5)} />
                  <line x1={-o.width / 2} y1={t / 6} x2={o.width / 2} y2={t / 6} className="opening-line" strokeWidth={px(1.5)} />
                </>
              ) : (
                <>
                  <line x1={-o.width / 2} y1={t / 2} x2={-o.width / 2} y2={t / 2 + o.width} className="opening-line" strokeWidth={px(2)} />
                  <path
                    d={`M ${o.width / 2} ${t / 2} A ${o.width} ${o.width} 0 0 1 ${-o.width / 2} ${t / 2 + o.width}`}
                    className="door-arc" strokeWidth={px(1)}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* Möbel */}
        {plan.furniture.map((f) => {
          const entry = CATALOG_BY_ID[f.catalogId];
          if (!entry) return null;
          const selected = selection?.id === f.id;
          return (
            <g
              key={f.id}
              transform={`translate(${f.position.x} ${f.position.y}) rotate(${f.rotation * RAD2DEG})`}
              className={`furniture ${selected ? "is-selected" : ""} ${collisions.has(f.id) ? "is-colliding" : ""}`}
              onPointerDown={(e) => startFurnitureDrag(e, f)}
            >
              <FurnitureGlyph shape={entry.shape} w={entry.width} d={entry.depth} color={f.color ?? entry.color} stroke={px(1.2)} />
              {cam.zoom > 45 && entry.width * cam.zoom > 50 && (
                <text y={px(4)} fontSize={px(10.5)} textAnchor="middle" className="furniture-label" transform={isUpsideDown(f.rotation) ? "rotate(180)" : undefined}>{entry.name}</text>
              )}
            </g>
          );
        })}

        {/* Flächenangaben über den Möbeln, damit sie lesbar bleiben */}
        {rooms.map((r) => (
          <g key={`label-${r.id}`} transform={`translate(${r.centroid.x} ${r.centroid.y})`} style={{ pointerEvents: "none" }}>
            <rect x={px(-34)} y={px(-11)} width={px(68)} height={px(22)} rx={px(11)} className="room-label-bg" />
            <text y={px(4.5)} fontSize={px(12.5)} textAnchor="middle" className="room-label">{formatArea(r.area)}</text>
          </g>
        ))}

        {/* Auswahl: Wandmaß + Knoten-Griffe */}
        {selectedWall && (
          <g>
            <DimensionLabel a={selectedWall.a} b={selectedWall.b} px={px} offset={selectedWall.thickness / 2 + px(14)} />
            {[selectedWall.a, selectedWall.b].map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={px(7)} className="handle" onPointerDown={(e) => startJunctionDrag(e, p)} />
            ))}
          </g>
        )}

        {/* Wand zeichnen: Vorschau */}
        {tool === "wall" && chain && cursor && (
          <g style={{ pointerEvents: "none" }}>
            <line x1={chain.x} y1={chain.y} x2={cursor.point.x} y2={cursor.point.y} strokeWidth={usePlanStore.getState().wallThickness} strokeLinecap="square" className="wall-draft" />
            <DimensionLabel a={chain} b={cursor.point} px={px} offset={px(18)} />
          </g>
        )}
        {cursor && (tool === "wall" || tool === "furniture") && cursor.kind !== "none" && cursor.kind !== "grid" && (
          <circle cx={cursor.point.x} cy={cursor.point.y} r={px(6)} className={`snap-indicator snap-${cursor.kind}`} style={{ pointerEvents: "none" }} />
        )}

        {openingPreview && (
          <g transform={`translate(${openingPreview.center.x} ${openingPreview.center.y}) rotate(${wallAngle(openingPreview.wall) * RAD2DEG})`} style={{ pointerEvents: "none" }}>
            <rect x={-openingPreview.width / 2} y={-openingPreview.wall.thickness / 2 - 0.03} width={openingPreview.width} height={openingPreview.wall.thickness + 0.06} className="opening-preview" />
          </g>
        )}

        {ghost && (() => {
          const entry = CATALOG_BY_ID[ghost.catalogId]!;
          return (
            <g transform={`translate(${ghost.position.x} ${ghost.position.y}) rotate(${ghost.rotation * RAD2DEG})`} className="furniture is-ghost" style={{ pointerEvents: "none" }}>
              <FurnitureGlyph shape={entry.shape} w={entry.width} d={entry.depth} color={entry.color} stroke={px(1.2)} />
            </g>
          );
        })()}

        {/* Kalibrierung */}
        {tool === "calibrate" && (
          <g style={{ pointerEvents: "none" }}>
            {calib.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={px(6)} className="calib-point" />)}
            {calib.length === 1 && cursor && <line x1={calib[0]!.x} y1={calib[0]!.y} x2={cursor.point.x} y2={cursor.point.y} className="calib-line" strokeWidth={px(2)} />}
            {calib.length === 2 && <line x1={calib[0]!.x} y1={calib[0]!.y} x2={calib[1]!.x} y2={calib[1]!.y} className="calib-line" strokeWidth={px(2)} />}
          </g>
        )}
      </svg>

      <div className="editor2d-hint">{hintFor(tool, !!chain, !!placing, calib.length)}</div>
      <div className="editor2d-zoom">
        <button className="icon-btn" onClick={() => setCam((c) => ({ ...c, zoom: Math.min(400, c.zoom * 1.25) }))} aria-label="Hineinzoomen">+</button>
        <button className="icon-btn" onClick={() => setCam((c) => ({ ...c, zoom: Math.max(5, c.zoom / 1.25) }))} aria-label="Herauszoomen">−</button>
        <button className="icon-btn" onClick={fit} aria-label="Einpassen" title="Einpassen">⤢</button>
      </div>

      {tool === "calibrate" && calib.length === 2 && plan.background && (
        <CalibrationDialog
          measured={distance(calib[0]!, calib[1]!)}
          onCancel={() => setCalib([])}
          onConfirm={(real) => {
            const factor = real / distance(calib[0]!, calib[1]!);
            commit((p) => p.background ? { ...p, background: { ...p.background, metersPerPixel: p.background.metersPerPixel * factor, origin: { x: p.background.origin.x * factor, y: p.background.origin.y * factor } } } : p);
            setCalib([]);
            setTool("wall");
            fitted.current = false;
            setTimeout(fit, 0);
          }}
        />
      )}
    </div>
  );
}

/** Text soll nie kopfüber stehen. */
function isUpsideDown(rotation: number): boolean {
  const deg = ((rotation * RAD2DEG) % 360 + 360) % 360;
  return deg > 90 && deg < 270;
}

function hintFor(tool: string, drawing: boolean, placing: boolean, calibPoints: number): string {
  switch (tool) {
    case "wall": return drawing
      ? "Klicken setzt den nächsten Punkt · Doppelklick, Esc oder Klick auf einen Wandknoten beendet · Shift = frei zeichnen"
      : "Klicke, um eine Wand zu beginnen. Wände rasten an Knoten, Wänden und 15°-Winkeln ein.";
    case "door": return "Klicke auf eine Wand, um eine Tür einzusetzen.";
    case "window": return "Klicke auf eine Wand, um ein Fenster einzusetzen.";
    case "furniture": return placing ? "Klicke zum Platzieren. In Wandnähe dockt das Möbel automatisch an (Alt = frei)." : "Wähle links ein Möbel aus dem Katalog.";
    case "calibrate": return calibPoints < 2
      ? `Maßstab festlegen: Klicke Anfang und Ende einer bekannten Strecke im Grundriss (${calibPoints}/2).`
      : "Gib die echte Länge ein.";
    default: return "Ziehen = verschieben · Mausrad = zoomen · R = drehen · Entf = löschen · Strg+Z = rückgängig";
  }
}

function DimensionLabel({ a, b, px, offset }: { a: Vec2; b: Vec2; px: (n: number) => number; offset: number }) {
  const len = distance(a, b);
  if (len < 0.05) return null;
  let ang = Math.atan2(b.y - a.y, b.x - a.x) * RAD2DEG;
  if (ang > 90 || ang < -90) ang += 180; // Text nie kopfüber
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  return (
    <g transform={`translate(${mx + nx * offset} ${my + ny * offset}) rotate(${ang})`} style={{ pointerEvents: "none" }}>
      <rect x={px(-30)} y={px(-10)} width={px(60)} height={px(20)} rx={px(10)} className="dim-bg" />
      <text y={px(4.5)} fontSize={px(12)} textAnchor="middle" className="dim-text">{formatLength(len)}</text>
    </g>
  );
}

/** Draufsicht-Symbole – bewusst schlicht, wie in Architekten-Grundrissen. */
function FurnitureGlyph({ shape, w, d, color, stroke }: { shape: string; w: number; d: number; color: string; stroke: number }) {
  const base = <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(w, d) * 0.06} fill={color} className="furniture-body" strokeWidth={stroke} />;
  switch (shape) {
    case "sofa":
    case "armchair":
      return (<>{base}<rect x={-w / 2} y={-d / 2} width={w} height={d * 0.25} fill="rgba(0,0,0,0.12)" /><rect x={-w / 2} y={-d / 2} width={w * 0.1} height={d} fill="rgba(0,0,0,0.08)" /><rect x={w / 2 - w * 0.1} y={-d / 2} width={w * 0.1} height={d} fill="rgba(0,0,0,0.08)" /></>);
    case "bed":
      return (<>{base}<rect x={-w / 2 + 0.08} y={-d / 2 + 0.1} width={w / 2 - 0.12} height={0.35} rx={0.06} fill="#fff" opacity={0.9} /><rect x={0.04} y={-d / 2 + 0.1} width={w / 2 - 0.12} height={0.35} rx={0.06} fill="#fff" opacity={0.9} /><rect x={-w / 2} y={-d / 2 + 0.6} width={w} height={d - 0.6} fill="rgba(0,0,0,0.06)" /></>);
    case "plant":
      return <circle r={w / 2} fill={color} className="furniture-body" strokeWidth={stroke} />;
    case "lamp":
      return (<><circle r={w / 2} fill={color} className="furniture-body" strokeWidth={stroke} /><circle r={w / 8} fill="#f6d27a" /></>);
    case "rug":
      return <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={color} opacity={0.55} className="furniture-body rug" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />;
    case "toilet":
      return (<><rect x={-w / 2} y={-d / 2} width={w} height={d * 0.3} fill={color} className="furniture-body" strokeWidth={stroke} /><ellipse cy={d * 0.15} rx={w / 2} ry={d * 0.35} fill={color} className="furniture-body" strokeWidth={stroke} /></>);
    case "bathtub":
      return (<>{base}<rect x={-w / 2 + 0.07} y={-d / 2 + 0.07} width={w - 0.14} height={d - 0.14} rx={0.25} fill="#e6eef2" /></>);
    case "kitchen":
      return (<>{base}<rect x={-0.35} y={-d / 2 + 0.1} width={0.5} height={d - 0.2} rx={0.04} fill="#cfd6da" />{[0.75, 1.0].map((o) => <circle key={o} cx={o} cy={0} r={0.1} fill="none" stroke="#777" strokeWidth={stroke} />)}</>);
    case "table":
    case "desk":
      return base;
    default:
      return base;
  }
}
