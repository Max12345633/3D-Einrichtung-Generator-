import { memo } from "react";
import type { CatalogEntry } from "@raumwerk/core";

/**
 * Prozedurale Möbel aus Grundkörpern. Lokales System: Breite = x, Tiefe = z (Vorderseite +z),
 * Boden bei y = 0. Später durch echte GLB-Modelle ersetzbar (gleiche Maße/Achsen).
 */
interface Props {
  entry: CatalogEntry;
  color: string;
  highlight?: "selected" | "colliding" | null;
}

type V3 = [number, number, number];

function Box({ pos, size, color, rough = 0.8, metal = 0, opacity }: { pos: V3; size: V3; color: string; rough?: number; metal?: number; opacity?: number }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </mesh>
  );
}

function Cyl({ pos, r, h, color, rTop, segments = 24 }: { pos: V3; r: number; h: number; color: string; rTop?: number; segments?: number }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <cylinderGeometry args={[rTop ?? r, r, h, segments]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

const WOOD = "#9c7650";
const METAL = "#2b2b2b";

function Legs({ w, d, h, inset = 0.05, r = 0.025, color = METAL }: { w: number; d: number; h: number; inset?: number; r?: number; color?: string }) {
  const xs = [-w / 2 + inset, w / 2 - inset];
  const zs = [-d / 2 + inset, d / 2 - inset];
  return <>{xs.flatMap((x) => zs.map((z) => <Cyl key={`${x}${z}`} pos={[x, h / 2, z]} r={r} h={h} color={color} segments={10} />))}</>;
}

const cushionCount = (e: CatalogEntry) => (e.shape === "sofa" ? (e.width > 2 ? 3 : 2) : 1);

function Shape({ entry, color }: { entry: CatalogEntry; color: string }) {
  const { width: w, depth: d, height: h } = entry;
  switch (entry.shape) {
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.2, w * 0.12);
      const seatH = 0.42;
      return (<>
        <Box pos={[0, 0.2, 0.05]} size={[w, 0.24, d - 0.1]} color={color} />
        <Box pos={[0, h / 2 + 0.05, -d / 2 + 0.11]} size={[w, h - 0.1, 0.22]} color={color} />
        <Box pos={[-w / 2 + arm / 2, 0.32, 0.02]} size={[arm, 0.6, d - 0.04]} color={color} />
        <Box pos={[w / 2 - arm / 2, 0.32, 0.02]} size={[arm, 0.6, d - 0.04]} color={color} />
        {Array.from({ length: cushionCount(entry) }, (_, i) => {
          const n = cushionCount(entry);
          const cw = (w - 2 * arm) / n;
          return <Box key={i} pos={[-w / 2 + arm + cw * (i + 0.5), seatH - 0.02, 0.08]} size={[cw - 0.02, 0.14, d - 0.32]} color={color} rough={0.95} />;
        })}
        <Legs w={w} d={d} h={0.08} r={0.02} />
      </>);
    }
    case "bed": {
      return (<>
        <Box pos={[0, 0.17, 0.02]} size={[w, 0.26, d - 0.04]} color={WOOD} />
        <Box pos={[0, 0.4, 0.04]} size={[w - 0.08, 0.2, d - 0.14]} color="#fbfaf7" rough={0.95} />
        <Box pos={[0, 0.52, 0.32]} size={[w - 0.06, 0.06, d * 0.62]} color={color} rough={1} />
        <Box pos={[0, h / 2 + 0.05, -d / 2 + 0.04]} size={[w, h, 0.08]} color={WOOD} />
        {(w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => <Box key={x} pos={[x, 0.58, -d / 2 + 0.3]} size={[Math.min(0.62, w / 2 - 0.1), 0.12, 0.38]} color="#ffffff" rough={1} />)}
      </>);
    }
    case "table":
    case "desk":
      return (<>
        <Box pos={[0, h - 0.02, 0]} size={[w, 0.04, d]} color={color} rough={0.5} />
        <Legs w={w} d={d} h={h - 0.04} inset={0.06} r={entry.shape === "desk" ? 0.02 : 0.03} color={entry.shape === "desk" ? METAL : WOOD} />
      </>);
    case "chair": {
      const office = entry.id === "office-chair";
      return (<>
        <Box pos={[0, 0.46, 0]} size={[w * 0.9, 0.06, d * 0.85]} color={color} />
        <Box pos={[0, 0.46 + (h - 0.46) / 2, -d / 2 + 0.04]} size={[w * 0.9, h - 0.46, 0.05]} color={color} />
        {office ? (<><Cyl pos={[0, 0.23, 0]} r={0.025} h={0.42} color={METAL} /><Cyl pos={[0, 0.03, 0]} r={0.3} rTop={0.3} h={0.04} color={METAL} /></>) : <Legs w={w * 0.85} d={d * 0.8} h={0.43} r={0.015} />}
      </>);
    }
    case "wardrobe":
      return (<>
        <Box pos={[0, h / 2, 0]} size={[w, h, d]} color={color} rough={0.6} />
        {Array.from({ length: Math.max(2, Math.round(w / 0.5)) - 1 }, (_, i) => (
          <Box key={i} pos={[-w / 2 + (w / Math.max(2, Math.round(w / 0.5))) * (i + 1), h / 2, d / 2 + 0.002]} size={[0.006, h - 0.04, 0.004]} color="#bdb6aa" />
        ))}
      </>);
    case "shelf": {
      const levels = 5;
      return (<>
        <Box pos={[-w / 2 + 0.01, h / 2, 0]} size={[0.02, h, d]} color={color} />
        <Box pos={[w / 2 - 0.01, h / 2, 0]} size={[0.02, h, d]} color={color} />
        <Box pos={[0, h / 2, -d / 2 + 0.005]} size={[w, h, 0.01]} color={color} />
        {Array.from({ length: levels + 1 }, (_, i) => <Box key={i} pos={[0, 0.01 + (i * (h - 0.02)) / levels, 0]} size={[w, 0.02, d]} color={color} />)}
        {Array.from({ length: levels }, (_, i) => (
          <Box key={`b${i}`} pos={[(i % 2 ? 0.15 : -0.15), 0.16 + (i * (h - 0.02)) / levels, 0.02]} size={[w * 0.45, 0.24, d * 0.7]} color={["#7a4b3a", "#3f5a6b", "#c9a46b", "#556b4a", "#8c8c8c"][i]!} />
        ))}
      </>);
    }
    case "sideboard":
    case "nightstand":
      return (<>
        <Box pos={[0, h / 2 + 0.05, 0]} size={[w, h - 0.1, d]} color={color} rough={0.55} />
        <Legs w={w} d={d} h={0.1} r={0.015} />
      </>);
    case "tv":
      return (<>
        <Box pos={[0, 0.22, 0]} size={[w, 0.34, d]} color={color} rough={0.6} />
        <Box pos={[0, 0.82, -0.05]} size={[Math.min(1.45, w * 0.8), 0.82, 0.04]} color="#111" rough={0.2} metal={0.3} />
      </>);
    case "rug":
      return <Box pos={[0, 0.006, 0]} size={[w, 0.012, d]} color={color} rough={1} />;
    case "plant":
      return (<>
        <Cyl pos={[0, 0.17, 0]} r={w * 0.32} rTop={w * 0.38} h={0.34} color="#c8b8a6" />
        <mesh position={[0, h * 0.62, 0]} castShadow>
          <sphereGeometry args={[w * 0.55, 16, 12]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
        <mesh position={[0.08, h * 0.85, 0.05]} castShadow>
          <sphereGeometry args={[w * 0.38, 14, 10]} />
          <meshStandardMaterial color="#5f8c57" roughness={0.9} />
        </mesh>
      </>);
    case "lamp":
      return (<>
        <Cyl pos={[0, 0.015, 0]} r={0.15} h={0.03} color={METAL} />
        <Cyl pos={[0, h / 2, 0]} r={0.012} h={h} color={METAL} segments={8} />
        <Cyl pos={[0, h - 0.12, 0]} r={0.2} rTop={0.13} h={0.26} color={color} />
        <pointLight position={[0, h - 0.2, 0]} intensity={0.6} distance={4} color="#ffd9a0" />
      </>);
    case "kitchen":
      return (<>
        <Box pos={[0, 0.06, 0.03]} size={[w, 0.12, d - 0.06]} color="#2b2b2b" />
        <Box pos={[0, 0.5, 0]} size={[w, 0.78, d]} color={color} rough={0.4} />
        <Box pos={[0, 0.905, 0.01]} size={[w + 0.01, 0.03, d + 0.02]} color="#8d8478" rough={0.35} />
        <Box pos={[-0.1, 0.915, 0.05]} size={[0.5, 0.01, 0.4]} color="#b9c0c4" metal={0.6} rough={0.3} />
        <Box pos={[0.85, 0.915, 0.05]} size={[0.6, 0.01, 0.5]} color="#1a1a1a" rough={0.2} />
        <Box pos={[0, 1.85, -d / 2 + 0.18]} size={[w, 0.7, 0.35]} color={color} rough={0.4} />
      </>);
    case "fridge":
      return <Box pos={[0, h / 2, 0]} size={[w, h, d]} color={color} rough={0.3} metal={0.4} />;
    case "bathtub":
      return (<>
        <Box pos={[0, h / 2, 0]} size={[w, h, d]} color={color} rough={0.2} />
        <Box pos={[0, h - 0.04, 0]} size={[w - 0.14, 0.09, d - 0.14]} color="#dfe8ec" rough={0.15} />
      </>);
    case "shower":
      return (<>
        <Box pos={[0, 0.03, 0]} size={[w, 0.06, d]} color="#ffffff" rough={0.3} />
        <Box pos={[0, h / 2, d / 2 - 0.005]} size={[w, h, 0.01]} color={color} opacity={0.3} rough={0.05} />
        <Cyl pos={[0, h - 0.1, -d / 2 + 0.15]} r={0.11} h={0.02} color="#c0c0c0" />
      </>);
    case "toilet":
      return (<>
        <Box pos={[0, 0.55, -d / 2 + 0.08]} size={[w, 0.4, 0.16]} color={color} rough={0.2} />
        <Cyl pos={[0, 0.3, 0.05]} r={w / 2} rTop={w / 2} h={0.2} color={color} />
      </>);
    case "sink":
      return (<>
        <Box pos={[0, 0.55, 0]} size={[w, 0.4, d]} color={WOOD} rough={0.6} />
        <Box pos={[0, 0.8, 0.02]} size={[w * 0.8, 0.1, d * 0.75]} color={color} rough={0.15} />
        <Box pos={[0, 1.4, -d / 2 + 0.02]} size={[w * 0.9, 0.7, 0.02]} color="#d7e3ea" rough={0.05} metal={0.9} />
      </>);
    default:
      return <Box pos={[0, h / 2, 0]} size={[w, h, d]} color={color} />;
  }
}

export const FurnitureMesh = memo(function FurnitureMesh({ entry, color, highlight }: Props) {
  return (
    <group>
      <Shape entry={entry} color={color} />
      {highlight && (
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[entry.width + 0.08, entry.depth + 0.08]} />
          <meshBasicMaterial color={highlight === "colliding" ? "#e5484d" : "#2f7d6d"} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
});
