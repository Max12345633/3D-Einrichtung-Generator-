import { memo } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { CatalogEntry } from "@raumwerk/core";
import { material, type SurfaceRole } from "./materials";

/**
 * Prozedurale Möbel aus Grundkörpern mit echten Materialien (Stoff, Holz, Lack, Metall, Keramik).
 * Lokales System: Breite = x, Tiefe = z (Vorderseite +z), Boden bei y = 0.
 * Später durch GLB-Modelle ersetzbar (gleiche Maße und Achsen).
 */
interface Props {
  entry: CatalogEntry;
  color: string;
  highlight?: "selected" | "colliding" | null;
}

type V3 = [number, number, number];

const LEG = "#2b2b2b";
const FRAME_WOOD = "#9c7650";
const LINEN = "#f7f5f0";

function Box({ pos, size, m, rot }: { pos: V3; size: V3; m: THREE.Material; rot?: V3 }) {
  return (
    <mesh position={pos} rotation={rot} material={m} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Weiche Kanten für Polster, Matratzen, Kissen. */
function Soft({ pos, size, m, radius = 0.05 }: { pos: V3; size: V3; m: THREE.Material; radius?: number }) {
  const r = Math.min(radius, size[0] / 2.01, size[1] / 2.01, size[2] / 2.01);
  return (
    <RoundedBox args={size} radius={r} smoothness={3} position={pos} material={m} castShadow receiveShadow />
  );
}

function Cyl({ pos, r, h, m, rTop, segments = 28, open = false }: { pos: V3; r: number; h: number; m: THREE.Material; rTop?: number; segments?: number; open?: boolean }) {
  return (
    <mesh position={pos} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[rTop ?? r, r, h, segments, 1, open]} />
    </mesh>
  );
}

function Legs({ w, d, h, inset = 0.05, r = 0.022, m }: { w: number; d: number; h: number; inset?: number; r?: number; m: THREE.Material }) {
  const xs = [-w / 2 + inset, w / 2 - inset];
  const zs = [-d / 2 + inset, d / 2 - inset];
  return <>{xs.flatMap((x) => zs.map((z) => <Cyl key={`${x}${z}`} pos={[x, h / 2, z]} r={r} h={h} m={m} segments={12} />))}</>;
}

const mat = (role: SurfaceRole, color: string) => material(role, color);
const cushionCount = (e: CatalogEntry) => (e.shape === "sofa" ? (e.width > 2 ? 3 : 2) : 1);

function Shape({ entry, color }: { entry: CatalogEntry; color: string }) {
  const { width: w, depth: d, height: h } = entry;
  const main = mat(entry.material, color);
  const legs = mat("metal", LEG);
  switch (entry.shape) {
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.2, w * 0.13);
      const n = cushionCount(entry);
      const cw = (w - 2 * arm) / n;
      return (<>
        <Soft pos={[0, 0.25, 0.03]} size={[w, 0.3, d - 0.06]} m={main} radius={0.04} />
        <Soft pos={[0, h / 2 + 0.06, -d / 2 + 0.11]} size={[w, h - 0.12, 0.22]} m={main} radius={0.06} />
        <Soft pos={[-w / 2 + arm / 2, 0.36, 0.02]} size={[arm, 0.62, d - 0.04]} m={main} radius={0.06} />
        <Soft pos={[w / 2 - arm / 2, 0.36, 0.02]} size={[arm, 0.62, d - 0.04]} m={main} radius={0.06} />
        {Array.from({ length: n }, (_, i) => (
          <Soft key={i} pos={[-w / 2 + arm + cw * (i + 0.5), 0.47, 0.07]} size={[cw - 0.015, 0.16, d - 0.3]} m={main} radius={0.06} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <Soft key={`b${i}`} pos={[-w / 2 + arm + cw * (i + 0.5), 0.72, -d / 2 + 0.3]} size={[cw - 0.04, 0.4, 0.16]} m={main} radius={0.07} />
        ))}
        <Legs w={w} d={d} h={0.1} r={0.018} m={legs} />
      </>);
    }
    case "bed": {
      const frame = mat("wood", FRAME_WOOD);
      const linen = mat("fabric", LINEN);
      return (<>
        <Box pos={[0, 0.17, 0.02]} size={[w, 0.24, d - 0.04]} m={frame} />
        <Soft pos={[0, 0.39, 0.04]} size={[w - 0.08, 0.2, d - 0.14]} m={linen} radius={0.05} />
        <Soft pos={[0, 0.5, 0.3]} size={[w - 0.04, 0.07, d * 0.64]} m={main} radius={0.03} />
        <Soft pos={[0, h / 2 + 0.08, -d / 2 + 0.06]} size={[w + 0.04, h - 0.1, 0.1]} m={main} radius={0.04} />
        {(w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => (
          <Soft key={x} pos={[x, 0.57, -d / 2 + 0.33]} size={[Math.min(0.62, w / 2 - 0.12), 0.14, 0.4]} m={linen} radius={0.06} />
        ))}
      </>);
    }
    case "table":
    case "desk": {
      const legM = entry.shape === "desk" ? legs : mat("wood", color);
      return (<>
        <Box pos={[0, h - 0.02, 0]} size={[w, 0.04, d]} m={main} />
        <Legs w={w} d={d} h={h - 0.04} inset={0.07} r={entry.shape === "desk" ? 0.018 : 0.028} m={legM} />
      </>);
    }
    case "chair": {
      if (entry.id === "office-chair") {
        return (<>
          <Soft pos={[0, 0.48, 0]} size={[w * 0.85, 0.08, d * 0.8]} m={main} radius={0.03} />
          <Soft pos={[0, 0.82, -d / 2 + 0.08]} size={[w * 0.8, 0.55, 0.06]} m={main} radius={0.03} />
          <Cyl pos={[0, 0.24, 0]} r={0.025} h={0.44} m={legs} />
          <Cyl pos={[0, 0.03, 0]} r={0.3} h={0.04} m={legs} />
        </>);
      }
      return (<>
        <Box pos={[0, 0.45, 0]} size={[w * 0.9, 0.035, d * 0.85]} m={main} />
        <Box pos={[0, 0.66, -d / 2 + 0.05]} size={[w * 0.9, 0.38, 0.03]} m={main} />
        <Legs w={w * 0.85} d={d * 0.8} h={0.43} r={0.014} m={main} />
      </>);
    }
    case "wardrobe": {
      const doors = Math.max(2, Math.round(w / 0.5));
      return (<>
        <Box pos={[0, h / 2, 0]} size={[w, h, d]} m={main} />
        {Array.from({ length: doors - 1 }, (_, i) => (
          <Box key={i} pos={[-w / 2 + (w / doors) * (i + 1), h / 2, d / 2 + 0.002]} size={[0.004, h - 0.04, 0.004]} m={mat("lacquer", "#a8a297")} />
        ))}
        {Array.from({ length: doors }, (_, i) => (
          <Box key={`g${i}`} pos={[-w / 2 + (w / doors) * (i + 0.5) + (i % 2 ? -0.18 : 0.18), h * 0.5, d / 2 + 0.012]} size={[0.012, 0.3, 0.02]} m={legs} />
        ))}
      </>);
    }
    case "shelf": {
      const levels = 5;
      const books = ["#7a4b3a", "#3f5a6b", "#c9a46b", "#556b4a", "#8c8c8c", "#b5543c", "#e2d6c0"];
      return (<>
        <Box pos={[-w / 2 + 0.01, h / 2, 0]} size={[0.02, h, d]} m={main} />
        <Box pos={[w / 2 - 0.01, h / 2, 0]} size={[0.02, h, d]} m={main} />
        <Box pos={[0, h / 2, -d / 2 + 0.005]} size={[w, h, 0.01]} m={main} />
        {Array.from({ length: levels + 1 }, (_, i) => <Box key={i} pos={[0, 0.01 + (i * (h - 0.02)) / levels, 0]} size={[w, 0.02, d]} m={main} />)}
        {Array.from({ length: levels }, (_, lvl) => {
          // Bücherreihen mit unterschiedlichen Höhen/Breiten
          const y0 = 0.02 + (lvl * (h - 0.02)) / levels;
          const items: JSX.Element[] = [];
          let x = -w / 2 + 0.04;
          let k = lvl * 7;
          while (x < (lvl % 2 ? w * 0.1 : w / 2 - 0.06)) {
            const bw = 0.025 + ((k * 37) % 7) * 0.006;
            const bh = 0.18 + ((k * 13) % 5) * 0.02;
            items.push(<Box key={k} pos={[x + bw / 2, y0 + bh / 2, 0.01]} size={[bw, bh, d * 0.7]} m={mat("lacquer", books[k % books.length]!)} />);
            x += bw + 0.002;
            k++;
          }
          return <group key={`b${lvl}`}>{items}</group>;
        })}
      </>);
    }
    case "sideboard":
    case "nightstand":
      return (<>
        <Box pos={[0, h / 2 + 0.05, 0]} size={[w, h - 0.1, d]} m={main} />
        <Box pos={[0, h / 2 + 0.05, d / 2 + 0.001]} size={[w - 0.02, 0.003, 0.002]} m={mat("lacquer", "#3a3a3a")} />
        <Legs w={w} d={d} h={0.1} r={0.014} m={legs} />
      </>);
    case "tv":
      return (<>
        <Box pos={[0, 0.24, 0]} size={[w, 0.36, d]} m={main} />
        <Legs w={w} d={d} h={0.06} r={0.014} m={legs} />
        <Box pos={[0, 0.88, -0.08]} size={[Math.min(1.45, w * 0.8), 0.83, 0.03]} m={mat("screen", "#0d0d0f")} />
        <Box pos={[0, 0.45, -0.08]} size={[0.25, 0.02, 0.18]} m={legs} />
      </>);
    case "rug":
      return <Soft pos={[0, 0.008, 0]} size={[w, 0.016, d]} m={main} radius={0.007} />;
    case "plant": {
      const leaf = mat("plant", color);
      const leaf2 = mat("plant", "#6f9a5f");
      const blobs: [number, number, number, number][] = [[0, 0.62, 0, 0.5], [0.12, 0.8, 0.05, 0.36], [-0.1, 0.78, -0.08, 0.38], [0.02, 0.95, -0.02, 0.3], [-0.08, 0.55, 0.12, 0.34]];
      return (<>
        <Cyl pos={[0, 0.17, 0]} r={w * 0.3} rTop={w * 0.36} h={0.34} m={mat("ceramic", "#d8cfc4")} />
        <Cyl pos={[0, 0.5, 0]} r={0.012} h={0.4} m={mat("wood", "#6d5a3e")} />
        {blobs.map(([x, y, z, s], i) => (
          <mesh key={i} position={[x * w * 2, y * h, z * w * 2]} material={i % 2 ? leaf2 : leaf} castShadow>
            <icosahedronGeometry args={[w * s, 1]} />
          </mesh>
        ))}
      </>);
    }
    case "lamp":
      return (<>
        <Cyl pos={[0, 0.012, 0]} r={0.15} h={0.024} m={legs} />
        <Cyl pos={[0, h / 2, 0]} r={0.011} h={h - 0.1} m={legs} segments={10} />
        {/* offener Schirm, damit das Licht nach oben/unten austritt */}
        <Cyl pos={[0, h - 0.13, 0]} r={0.21} rTop={0.14} h={0.26} m={main} open />
        <mesh position={[0, h - 0.17, 0]} material={mat("light", "#fff1d6")}>
          <sphereGeometry args={[0.045, 16, 12]} />
        </mesh>
        <pointLight position={[0, h - 0.17, 0]} intensity={0.8} distance={5} decay={2} color="#ffd9a0" />
      </>);
    case "kitchen": {
      const counter = mat("lacquer", "#8d8478");
      return (<>
        <Box pos={[0, 0.06, 0.03]} size={[w, 0.12, d - 0.06]} m={mat("lacquer", "#2b2b2b")} />
        <Box pos={[0, 0.5, 0]} size={[w, 0.76, d]} m={main} />
        {Array.from({ length: Math.round(w / 0.6) - 1 }, (_, i) => (
          <Box key={i} pos={[-w / 2 + 0.6 * (i + 1), 0.5, d / 2 + 0.001]} size={[0.003, 0.74, 0.002]} m={mat("lacquer", "#b9b3a8")} />
        ))}
        <Box pos={[0, 0.9, 0.01]} size={[w + 0.01, 0.04, d + 0.02]} m={counter} />
        <Box pos={[-0.1, 0.915, 0.04]} size={[0.5, 0.012, 0.4]} m={mat("metal", "#c4c8cb")} />
        <Cyl pos={[-0.1, 1.05, -0.22]} r={0.012} h={0.28} m={mat("metal", "#c4c8cb")} />
        <Box pos={[0.85, 0.922, 0.04]} size={[0.6, 0.006, 0.5]} m={mat("screen", "#111111")} />
        <Box pos={[0, 1.88, -d / 2 + 0.18]} size={[w, 0.72, 0.35]} m={main} />
      </>);
    }
    case "fridge":
      return (<>
        <Box pos={[0, h / 2, 0]} size={[w, h, d]} m={main} />
        <Box pos={[0, h * 0.62, d / 2 + 0.002]} size={[w - 0.01, 0.004, 0.003]} m={legs} />
        <Box pos={[w / 2 - 0.06, h * 0.75, d / 2 + 0.02]} size={[0.02, 0.4, 0.03]} m={legs} />
      </>);
    case "bathtub":
      return (<>
        <Soft pos={[0, h / 2, 0]} size={[w, h, d]} m={main} radius={0.04} />
        <Soft pos={[0, h - 0.06, 0]} size={[w - 0.14, 0.14, d - 0.14]} m={mat("ceramic", "#e4eaee")} radius={0.06} />
        <Cyl pos={[-w / 2 + 0.12, h + 0.08, -d / 2 + 0.05]} r={0.015} h={0.16} m={mat("metal", "#c4c8cb")} />
      </>);
    case "shower":
      return (<>
        <Box pos={[0, 0.03, 0]} size={[w, 0.06, d]} m={mat("ceramic", "#ffffff")} />
        <Box pos={[0, h / 2, d / 2 - 0.005]} size={[w, h, 0.01]} m={mat("glass", "#e6f2f5")} />
        <Cyl pos={[0, h - 0.1, -d / 2 + 0.16]} r={0.11} h={0.015} m={mat("metal", "#c4c8cb")} />
        <Cyl pos={[0, h - 0.55, -d / 2 + 0.03]} r={0.012} h={0.9} m={mat("metal", "#c4c8cb")} />
      </>);
    case "toilet":
      return (<>
        <Soft pos={[0, 0.58, -d / 2 + 0.08]} size={[w, 0.38, 0.16]} m={main} radius={0.03} />
        <mesh position={[0, 0.32, 0.06]} material={main} scale={[1, 1, 1.35]} castShadow>
          <cylinderGeometry args={[w / 2, w / 2.6, 0.24, 28]} />
        </mesh>
        <mesh position={[0, 0.445, 0.06]} material={mat("ceramic", "#f2f2f2")} scale={[1, 1, 1.35]}>
          <cylinderGeometry args={[w / 2, w / 2, 0.02, 28]} />
        </mesh>
      </>);
    case "sink":
      return (<>
        <Box pos={[0, 0.55, 0]} size={[w, 0.4, d]} m={mat("wood", FRAME_WOOD)} />
        <Soft pos={[0, 0.8, 0.02]} size={[w * 0.82, 0.1, d * 0.78]} m={main} radius={0.03} />
        <Cyl pos={[0, 0.9, -d / 2 + 0.08]} r={0.012} h={0.14} m={mat("metal", "#c4c8cb")} />
        <Box pos={[0, 1.45, -d / 2 + 0.012]} size={[w * 0.9, 0.75, 0.012]} m={mat("mirror", "#dfe6ea")} />
      </>);
    default:
      return <Box pos={[0, h / 2, 0]} size={[w, h, d]} m={main} />;
  }
}

const highlightMats = {
  colliding: new THREE.MeshBasicMaterial({ color: "#e5484d", transparent: true, opacity: 0.35, depthWrite: false }),
  selected: new THREE.MeshBasicMaterial({ color: "#2f7d6d", transparent: true, opacity: 0.35, depthWrite: false }),
};

export const FurnitureMesh = memo(function FurnitureMesh({ entry, color, highlight }: Props) {
  return (
    <group>
      <Shape entry={entry} color={color} />
      {highlight && (
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={highlightMats[highlight]} userData={{ noPhoto: true }}>
          <planeGeometry args={[entry.width + 0.08, entry.depth + 0.08]} />
        </mesh>
      )}
    </group>
  );
});
