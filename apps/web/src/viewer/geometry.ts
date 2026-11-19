import * as THREE from "three";

/** Grundriss-Polygon (Meter) → horizontale Fläche auf Höhe y. UVs bleiben in Metern (für Kacheltexturen). */
export function polygonGeometry(polygon: { x: number; y: number }[], y = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2); // (x, y, 0) → (x, 0, y)
  g.translate(0, y, 0);
  return g;
}
