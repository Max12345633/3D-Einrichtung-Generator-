import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import {
  CATALOG_BY_ID, boundsOf, clampOpening, classifyRoom, detectRooms, findCollisions, pointInPolygon, pointOnWall, projectOnSegment, snapFurnitureToWall,
  updateFurniture, wallAngle, wallBoxes, type FloorMaterial, type Opening, type Plan, type Wall,
} from "@raumwerk/core";
import { usePlanStore } from "../store/planStore";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FurnitureMesh } from "./FurnitureMesh";
import { floorMaterial, material } from "./materials";
import { polygonGeometry } from "./geometry";

/** Wird vom Foto-Dialog genutzt: Screenshot bzw. Zugriff auf Szene und Kamera für den Path-Tracer. */
export const viewportCapture: { current: (() => string | null) | null } = { current: null };
export const viewportScene: { current: { scene: THREE.Scene; camera: THREE.Camera } | null } = { current: null };

export function Viewer3D() {
  const plan = usePlanStore((s) => s.plan);
  const walkMode = usePlanStore((s) => s.walkMode);
  const setWalkMode = usePlanStore((s) => s.setWalkMode);
  const [cutaway, setCutaway] = useState(false);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const placingHint = usePlanStore((s) => s.tool === "furniture" && !!s.placing);

  // Katalog-Möbel in die 3D-Ansicht ziehen: Bodenpunkt per Strahl aus der Kamera bestimmen
  const floorPointAt = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const cam = viewportScene.current?.camera;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!cam || !rect) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.z } : null;
  };

  return (
    <div
      className="viewer3d"
      ref={wrapRef}
      onDragOver={(e) => { if (usePlanStore.getState().dragCatalogId) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => {
        const s = usePlanStore.getState();
        const id = s.dragCatalogId;
        const at = floorPointAt(e.clientX, e.clientY);
        if (!id || !at) return;
        e.preventDefault();
        s.setDragCatalogId(null);
        const item = s.snapping ? snapFurnitureToWall({ id: "drop", catalogId: id, position: at, rotation: 0 }, s.plan.walls) : { position: at, rotation: 0 };
        s.setTool("select");
        s.placeFurniture(id, item.position, item.rotation);
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 50, near: 0.05, far: 200, position: [12, 12, 14] }}
      >
        <color attach="background" args={["#f1f2ef"]} />
        <Suspense fallback={null}>
          <Scene plan={plan} cutaway={cutaway && !walkMode} ceiling={walkMode} onDragChange={setDragging} />
        </Suspense>
        <CaptureBridge />
        {walkMode ? <WalkControls plan={plan} /> : <OrbitRig plan={plan} enabled={!dragging} />}
      </Canvas>

      <div className="viewer3d-toolbar">
        <button className={`chip ${!walkMode ? "is-active" : ""}`} onClick={() => setWalkMode(false)}>Übersicht</button>
        <button className={`chip ${walkMode ? "is-active" : ""}`} onClick={() => setWalkMode(true)}>Rundgang</button>
        {!walkMode && (
          <button className={`chip ${cutaway ? "is-active" : ""}`} onClick={() => setCutaway((c) => !c)} title="Wände absenken für bessere Übersicht">
            Wände niedrig
          </button>
        )}
      </div>
      {walkMode && <div className="viewer3d-hint">Klicke in die Ansicht · W A S D bzw. Pfeiltasten laufen · Maus umsehen · Esc beendet</div>}
      {!walkMode && placingHint && <div className="viewer3d-hint">Auf den Boden klicken zum Platzieren · R dreht 90°, Q/E 15° · Shift+Klick setzt mehrere</div>}
    </div>
  );
}

function CaptureBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    viewportCapture.current = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    };
    viewportScene.current = { scene, camera };
    return () => { viewportCapture.current = null; viewportScene.current = null; };
  }, [gl, scene, camera]);
  return null;
}

function planCenter(plan: Plan) {
  const b = boundsOf(plan.walls.flatMap((w) => [w.a, w.b]));
  if (!b) return { cx: 0, cz: 0, span: 10 };
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minY + b.maxY) / 2, span: Math.max(b.maxX - b.minX, b.maxY - b.minY, 4) };
}

function OrbitRig({ plan, enabled }: { plan: Plan; enabled: boolean }) {
  const { camera, size } = useThree();
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  // Neu einpassen bei neuem Projekt und sobald die ersten Wände existieren
  const hasWalls = plan.walls.length > 0;
  const { cx, cz, span } = useMemo(() => planCenter(plan), [plan.id, hasWalls]); // eslint-disable-line react-hooks/exhaustive-deps
  const aspect = size.width / Math.max(1, size.height);
  const fitKey = `${plan.id}:${hasWalls}:${aspect > 1 ? "wide" : "tall"}`;

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(persp.fov ?? 50);
    // Abstand so, dass der Grundriss auch in schmalen Ansichten (geteilte Ansicht) ganz sichtbar ist
    const dist = ((span * 0.62) / Math.tan(vFov / 2)) / Math.min(1, aspect);
    const dir = new THREE.Vector3(0.32, 1.0, 0.72).normalize();
    camera.position.set(cx + dir.x * dist, dir.y * dist, cz + dir.z * dist);
    camera.up.set(0, 1, 0);
    controls.current?.target.set(cx, 0.4, cz);
    controls.current?.update();
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minDistance={1.5}
      maxDistance={80}
    />
  );
}

/** Startpunkt für den Rundgang: im größten Raum, möglichst weit weg von Möbeln und Wänden. */
function walkStart(plan: Plan): { pos: { x: number; y: number }; look: { x: number; y: number } } {
  const rooms = detectRooms(plan.walls).sort((a, b) => b.area - a.area);
  const room = rooms[0];
  if (!room) {
    const c = planCenter(plan);
    return { pos: { x: c.cx, y: c.cz }, look: { x: c.cx + 1, y: c.cz } };
  }
  let best = room.centroid;
  let bestScore = -Infinity;
  const b = boundsOf(room.polygon)!;
  for (let x = b.minX + 0.4; x <= b.maxX - 0.4; x += 0.25) {
    for (let y = b.minY + 0.4; y <= b.maxY - 0.4; y += 0.25) {
      const p = { x, y };
      if (!pointInPolygon(p, room.polygon)) continue;
      let clear = Infinity;
      for (const f of plan.furniture) {
        const e = CATALOG_BY_ID[f.catalogId];
        if (!e || e.shape === "rug") continue;
        clear = Math.min(clear, Math.hypot(p.x - f.position.x, p.y - f.position.y) - Math.max(e.width, e.depth) / 2);
      }
      for (const w of plan.walls) clear = Math.min(clear, projectOnSegment(p, w.a, w.b).dist);
      // Ränder bevorzugen (Blick in den Raum), aber genug Abstand halten
      const score = Math.min(clear, 1.2) + 0.15 * Math.hypot(p.x - room.centroid.x, p.y - room.centroid.y);
      if (clear > 0.45 && score > bestScore) { bestScore = score; best = p; }
    }
  }
  return { pos: best, look: room.centroid };
}

function WalkControls({ plan }: { plan: Plan }) {
  const { camera } = useThree();
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const { pos, look } = walkStart(plan);
    camera.position.set(pos.x, 1.65, pos.y);
    camera.lookAt(look.x === pos.x && look.y === pos.y ? look.x + 1 : look.x, 1.45, look.y);
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  const dir = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const r = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    if (!f && !r) return;
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    side.crossVectors(dir, camera.up).normalize();
    const speed = (k.has("shift") ? 3 : 1.6) * Math.min(dt, 0.05);
    camera.position.addScaledVector(dir, f * speed).addScaledVector(side, r * speed);
    camera.position.y = 1.65;
  });
  // Esc entsperrt nur die Maus; der Modus bleibt aktiv, bis "Übersicht" gewählt wird
  return <PointerLockControls selector=".viewer3d canvas" onLock={() => keys.current.clear()} />;
}

/** Weiche Studio-Umgebung für Reflexionen (ohne externe HDR-Datei). */
function RealtimeEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.32;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

function Scene({ plan, cutaway, ceiling, onDragChange }: { plan: Plan; cutaway: boolean; ceiling: boolean; onDragChange: (d: boolean) => void }) {
  const selection = usePlanStore((s) => s.selection);
  const snapping = usePlanStore((s) => s.snapping);
  const tool = usePlanStore((s) => s.tool);
  const placing = usePlanStore((s) => s.placing);
  const placingRotation = usePlanStore((s) => s.placingRotation);
  const { select, beginGesture, live } = usePlanStore.getState();
  const [ghost, setGhost] = useState<{ x: number; y: number; rotation: number } | null>(null);
  useEffect(() => { if (!placing) setGhost(null); }, [placing]);
  const rooms = useMemo(() => detectRooms(plan.walls), [plan.walls]);
  const roomKinds = useMemo(() => new Map(rooms.map((r) => [r.id, classifyRoom(r, plan)])), [rooms, plan.furniture]); // eslint-disable-line react-hooks/exhaustive-deps
  const collisions = useMemo(() => findCollisions(plan.furniture), [plan.furniture]);
  const dragId = useRef<string | null>(null);
  const center = useMemo(() => planCenter(plan), [plan]);

  const walls = useMemo(() => (cutaway ? plan.walls.map((w) => ({ ...w, height: Math.min(w.height, 1.0) })) : plan.walls), [plan.walls, cutaway]);

  useEffect(() => {
    const up = () => { if (dragId.current) { dragId.current = null; onDragChange(false); } };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [onDragChange]);

  /** Platzieren-Vorschau: Möbel folgt dem Zeiger, dockt an Wände an */
  const ghostAt = (point: THREE.Vector3, alt: boolean) => {
    if (!placing) return null;
    const item = { id: "ghost", catalogId: placing, position: { x: point.x, y: point.z }, rotation: placingRotation };
    const snapped = snapping && !alt ? snapFurnitureToWall(item, plan.walls) : item;
    return { x: snapped.position.x, y: snapped.position.y, rotation: snapped.rotation };
  };
  const onFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (!placing || tool !== "furniture") return;
    e.stopPropagation();
    const g = ghostAt(e.point, e.altKey);
    if (g) usePlanStore.getState().placeFurniture(placing, { x: g.x, y: g.y }, g.rotation, e.shiftKey);
  };

  const onFloorMove = (e: ThreeEvent<PointerEvent>) => {
    if (placing && tool === "furniture" && !dragId.current) {
      setGhost(ghostAt(e.point, e.nativeEvent.altKey));
      return;
    }
    const id = dragId.current;
    if (!id) return;
    e.stopPropagation();
    const pos = { x: e.point.x, y: e.point.z };
    live((p) => {
      const f = p.furniture.find((x) => x.id === id);
      if (!f) return p;
      const moved = snapping && !e.altKey ? snapFurnitureToWall({ ...f, position: pos }, p.walls) : { ...f, position: pos };
      return updateFurniture(p, id, { position: moved.position, rotation: moved.rotation });
    });
  };

  return (
    <>
      <RealtimeEnvironment />
      <hemisphereLight args={["#ffffff", "#d9cdbd", 0.55]} />
      <ambientLight intensity={0.12} />
      <directionalLight
        userData={{ noPhoto: true }}
        position={[center.cx + 6, 14, center.cz + 4]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-center.span}
        shadow-camera-right={center.span}
        shadow-camera-top={center.span}
        shadow-camera-bottom={-center.span}
        shadow-bias={-0.0005}
      >
        <object3D attach="target" position={[center.cx, 0, center.cz]} />
      </directionalLight>

      {/* Boden: Räume als eigene Flächen, darunter eine neutrale Grundplatte */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.cx, -0.01, center.cz]} receiveShadow onPointerMove={onFloorMove} onClick={onFloorClick} onPointerDown={(e) => { if (tool === "select" && !dragId.current && e.button === 0) select(null); }}>
        <planeGeometry args={[center.span * 4, center.span * 4]} />
        <meshStandardMaterial color="#dcdcd6" roughness={1} />
      </mesh>
      {rooms.map((r) => (
        <RoomFloor key={r.id} polygon={r.polygon} material={floorMaterial(roomKinds.get(r.id) === "bath" ? bathFloor(plan.floorMaterial) : plan.floorMaterial)} onPointerMove={onFloorMove} onClick={onFloorClick} />
      ))}
      {ghost && placing && CATALOG_BY_ID[placing] && (() => {
        const e = CATALOG_BY_ID[placing]!;
        return (
          <group position={[ghost.x, 0, ghost.y]} rotation={[0, -ghost.rotation, 0]} userData={{ noPhoto: true }} raycast={() => null}>
            <mesh position={[0, e.height / 2, 0]} raycast={() => null}>
              <boxGeometry args={[e.width, e.height, e.depth]} />
              <meshStandardMaterial color="#2f7d6d" transparent opacity={0.35} depthWrite={false} />
            </mesh>
            {/* Pfeil zur Vorderseite, damit die Ausrichtung klar ist */}
            <mesh position={[0, 0.02, e.depth / 2 + 0.12]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} raycast={() => null}>
              <circleGeometry args={[0.09, 3]} />
              <meshBasicMaterial color="#2f7d6d" />
            </mesh>
          </group>
        );
      })()}
      {ceiling && rooms.map((r) => <Ceiling key={`c${r.id}`} polygon={r.polygon} height={Math.min(...plan.walls.map((w) => w.height))} />)}
      <group userData={{ noPhoto: true }}>
        <ContactShadows position={[center.cx, 0.002, center.cz]} scale={center.span * 1.6} opacity={0.3} blur={2.5} far={3} />
      </group>

      {walls.map((w) => (
        <WallMesh
          key={w.id}
          wall={w}
          openings={plan.openings}
          color={plan.wallColor}
          selected={selection?.id === w.id}
          onSelect={() => tool === "select" && select({ kind: "wall", id: w.id })}
        />
      ))}
      {plan.openings.map((o) => {
        const w = walls.find((x) => x.id === o.wallId);
        return w ? <OpeningMesh key={o.id} opening={clampOpening(o, w)} wall={w} /> : null;
      })}

      {plan.furniture.map((f) => {
        const entry = CATALOG_BY_ID[f.catalogId];
        if (!entry) return null;
        const highlight = collisions.has(f.id) ? "colliding" : selection?.id === f.id ? "selected" : null;
        return (
          <group
            key={f.id}
            position={[f.position.x, 0, f.position.y]}
            rotation={[0, -f.rotation, 0]}
            onPointerDown={(e) => {
              if (tool !== "select" || e.button !== 0) return;
              e.stopPropagation();
              select({ kind: "furniture", id: f.id });
              beginGesture();
              dragId.current = f.id;
              onDragChange(true);
            }}
            onPointerMove={onFloorMove}
          >
            <FurnitureMesh entry={entry} color={f.color ?? entry.color} highlight={highlight} />
          </group>
        );
      })}
    </>
  );
}

/** Im Bad Fliesen – außer der Hauptboden ist schon gefliest. */
export function bathFloor(main: FloorMaterial | undefined): FloorMaterial {
  return main === "tiles-light" ? "tiles-dark" : "tiles-light";
}

function Ceiling({ polygon, height }: { polygon: { x: number; y: number }[]; height: number }) {
  const geometry = useMemo(() => polygonGeometry(polygon, height), [polygon, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} userData={{ noPhoto: true }}>
      <meshStandardMaterial color="#fbfaf7" roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function RoomFloor({ polygon, material: mat, onPointerMove, onClick }: { polygon: { x: number; y: number }[]; material: THREE.Material; onPointerMove: (e: ThreeEvent<PointerEvent>) => void; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => polygonGeometry(polygon, 0.001), [polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Normale zeigt nach dem Drehen nach unten → Material beidseitig; im Path-Tracer ebenso
  useEffect(() => { mat.side = THREE.DoubleSide; }, [mat]);
  return <mesh geometry={geometry} material={mat} receiveShadow onPointerMove={onPointerMove} onClick={onClick} />;
}

function WallMesh({ wall, openings, color, selected, onSelect }: { wall: Wall; openings: Opening[]; color: string; selected: boolean; onSelect: () => void }) {
  const boxes = useMemo(() => wallBoxes(wall, openings, true), [wall, openings]);
  const wallMat = material("wall", selected ? "#cfe5dd" : color);
  const skirting = material("baseboard", "#f7f6f2");
  return (
    <group onPointerDown={(e) => { if (e.button === 0) { e.stopPropagation(); onSelect(); } }}>
      {boxes.map((b, i) => {
        const bottom = b.center[1] - b.size[1] / 2;
        return (
          <group key={i}>
            <mesh position={b.center} rotation={[0, b.rotationY, 0]} material={wallMat} castShadow receiveShadow>
              <boxGeometry args={b.size} />
            </mesh>
            {/* Sockelleiste beidseitig an allen Stücken, die auf dem Boden stehen (nicht in Türöffnungen) */}
            {bottom < 0.001 && b.size[1] > 0.3 && (
              <mesh position={[b.center[0], 0.035, b.center[2]]} rotation={[0, b.rotationY, 0]} material={skirting} receiveShadow>
                <boxGeometry args={[b.size[0], 0.07, b.size[2] + 0.024]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function OpeningMesh({ opening, wall }: { opening: Opening; wall: Wall }) {
  const c = pointOnWall(wall, opening.offset);
  const rot = -wallAngle(wall);
  if (opening.kind === "window") {
    return (
      <group position={[c.x, opening.sill, c.y]} rotation={[0, rot, 0]}>
        {/* Glas nur in Echtzeit – im Foto-Render würde es das Sonnenlicht unnötig verrauschen */}
        <mesh position={[0, opening.height / 2, 0]} material={material("glass", "#dbeef5")} userData={{ noPhoto: true }}>
          <boxGeometry args={[opening.width, opening.height, 0.02]} />
        </mesh>
        {/* Rahmen */}
        {[[0, 0.02, opening.width, 0.04], [0, opening.height - 0.02, opening.width, 0.04], [-opening.width / 2 + 0.02, opening.height / 2, 0.04, opening.height], [opening.width / 2 - 0.02, opening.height / 2, 0.04, opening.height], [0, opening.height / 2, 0.04, opening.height]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x!, y!, 0]} material={material("lacquer", "#f7f7f5")} castShadow>
            <boxGeometry args={[w!, h!, 0.07]} />
          </mesh>
        ))}
        <mesh position={[0, -0.02, 0]} material={material("lacquer", "#ebe8e1")} castShadow receiveShadow>
          <boxGeometry args={[opening.width + 0.04, 0.03, wall.thickness + 0.06]} />
        </mesh>
      </group>
    );
  }
  // Tür: Zarge + leicht geöffnetes Türblatt
  const t = wall.thickness;
  return (
    <group position={[c.x, 0, c.y]} rotation={[0, rot, 0]}>
      {[[-opening.width / 2, opening.height / 2, 0.04, opening.height], [opening.width / 2, opening.height / 2, 0.04, opening.height], [0, opening.height, opening.width + 0.08, 0.04]].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x!, y!, 0]} material={material("lacquer", "#f4f3ef")} castShadow>
          <boxGeometry args={[w!, h!, t + 0.02]} />
        </mesh>
      ))}
      <group position={[-opening.width / 2 + 0.02, 0, t / 2]} rotation={[0, -1.1, 0]}>
        <mesh position={[(opening.width - 0.04) / 2, (opening.height - 0.01) / 2, 0.02]} material={material("lacquer", "#faf9f6")} castShadow>
          <boxGeometry args={[opening.width - 0.04, opening.height - 0.01, 0.04]} />
        </mesh>
      </group>
    </group>
  );
}
