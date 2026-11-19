import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * Kantenerhaltendes Entrauschen nach dem „Edge-Avoiding À-Trous Wavelet“-Verfahren
 * (Dammertz et al. 2010), wie es Echtzeit-Path-Tracer nutzen:
 *
 *  1. G-Buffer rastern: Albedo (Grundfarbe inkl. Textur) sowie Normale + Tiefe
 *  2. Licht „demodulieren“: L = Farbe / Albedo → Texturen sind nicht mehr im zu filternden Signal
 *  3. L mehrfach mit wachsender Schrittweite filtern; Gewichte stoppen an Normalen-, Tiefen-
 *     und Helligkeitssprüngen (Möbelkanten, Schattenkanten bleiben scharf)
 *  4. Mit Albedo „remodulieren“, Tonemapping und sRGB
 *
 * Ergebnis: Holzmaserung und Stoffstruktur bleiben scharf, während das Rauschen im Licht verschwindet.
 * Funktioniert mit WebGL2 überall – Fallback, wenn kein WebGPU für das KI-Entrauschen da ist.
 */

export interface GBuffer {
  albedo: THREE.WebGLRenderTarget;
  normalDepth: THREE.WebGLRenderTarget;
  dispose(): void;
}

const makeTarget = (w: number, h: number) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });

const normalDepthMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying float vZ;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying float vZ;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        gl_FragColor = vec4(n, vZ);
      }`,
  });

/** Rastert Albedo und Normale/Tiefe der (für das Foto vorbereiteten) Szene. Stellt alles wieder her. */
export function renderGBuffer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number): GBuffer {
  const albedo = makeTarget(w, h);
  const normalDepth = makeTarget(w, h);

  const prevBackground = scene.background;
  const prevEnv = scene.environment;
  const prevOverride = scene.overrideMaterial;
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTarget = renderer.getRenderTarget();
  scene.background = null;
  scene.environment = null;

  // Albedo: jedes Material durch ein unbeleuchtetes mit gleicher Farbe/Textur ersetzen
  const swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const cache = new Map<THREE.Material, THREE.Material>();
  const temp: THREE.Material[] = [];
  const toAlbedo = (m: THREE.Material): THREE.Material => {
    const hit = cache.get(m);
    if (hit) return hit;
    const src = m as THREE.MeshStandardMaterial;
    const emissive = src.emissiveIntensity > 0 && src.emissive && src.emissive.getHex() !== 0;
    const b = new THREE.MeshBasicMaterial({
      color: emissive ? new THREE.Color(1, 1, 1) : src.color ?? new THREE.Color(1, 1, 1),
      map: src.map ?? null,
      side: src.side,
      toneMapped: false,
    });
    cache.set(m, b);
    temp.push(b);
    return b;
  };
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    swapped.set(mesh, mesh.material);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toAlbedo) : toAlbedo(mesh.material);
  });

  try {
    // Himmel: Albedo 1 (Licht = Farbe), Normale 0 + Tiefe 0 = „kein Objekt“
    renderer.setRenderTarget(albedo);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(scene, camera);
  } finally {
    for (const [mesh, mat] of swapped) mesh.material = mat;
    for (const t of temp) t.dispose();
  }

  const nd = normalDepthMaterial();
  try {
    scene.overrideMaterial = nd;
    renderer.setRenderTarget(normalDepth);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
  } finally {
    scene.overrideMaterial = prevOverride;
    nd.dispose();
    scene.background = prevBackground;
    scene.environment = prevEnv;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  return {
    albedo,
    normalDepth,
    dispose() {
      albedo.dispose();
      normalDepth.dispose();
    },
  };
}

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ALBEDO_FLOOR = "0.04";

const demodulateMaterial = (color: THREE.Texture, albedo: THREE.Texture) =>
  new THREE.ShaderMaterial({
    uniforms: { tColor: { value: color }, tAlbedo: { value: albedo } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tAlbedo;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb;
        vec3 a = max(texture2D(tAlbedo, vUv).rgb, vec3(${ALBEDO_FLOOR}));
        gl_FragColor = vec4(c / a, 1.0);
      }`,
    toneMapped: false,
  });

const atrousMaterial = (normalDepth: THREE.Texture, w: number, h: number) =>
  new THREE.ShaderMaterial({
    uniforms: {
      tLight: { value: null },
      tNormalDepth: { value: normalDepth },
      texel: { value: new THREE.Vector2(1 / w, 1 / h) },
      stepWidth: { value: 1 },
      sigmaL: { value: 1 },
    },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tLight;
      uniform sampler2D tNormalDepth;
      uniform vec2 texel;
      uniform float stepWidth;
      uniform float sigmaL;
      varying vec2 vUv;

      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      void main() {
        vec4 nd = texture2D(tNormalDepth, vUv);
        vec3 c = texture2D(tLight, vUv).rgb;
        if (nd.w <= 0.0) { gl_FragColor = vec4(c, 1.0); return; }
        float lc = lum(c);
        float kernel[3];
        kernel[0] = 0.375; kernel[1] = 0.25; kernel[2] = 0.0625;

        vec3 sum = vec3(0.0);
        float wsum = 0.0;
        for (int y = -2; y <= 2; y++) {
          for (int x = -2; x <= 2; x++) {
            vec2 uv = vUv + vec2(float(x), float(y)) * texel * stepWidth;
            vec4 ndq = texture2D(tNormalDepth, uv);
            if (ndq.w <= 0.0) continue;
            vec3 cq = texture2D(tLight, uv).rgb;
            float k = kernel[abs(x)] * kernel[abs(y)];
            float wn = pow(max(0.0, dot(nd.xyz, ndq.xyz)), 48.0);
            float wz = exp(-abs(nd.w - ndq.w) / (0.015 * nd.w * stepWidth + 0.002));
            float lq = lum(cq);
            float wl = exp(-abs(lc - lq) / (sigmaL * (0.5 * (lc + lq)) + 0.02));
            float wgt = k * wn * wz * wl;
            sum += cq * wgt;
            wsum += wgt;
          }
        }
        gl_FragColor = vec4(wsum > 0.0 ? sum / wsum : c, 1.0);
      }`,
    toneMapped: false,
  });

const remodulateMaterial = (light: THREE.Texture, albedo: THREE.Texture) =>
  new THREE.ShaderMaterial({
    uniforms: { tLight: { value: light }, tAlbedo: { value: albedo } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tLight;
      uniform sampler2D tAlbedo;
      varying vec2 vUv;
      void main() {
        vec3 l = texture2D(tLight, vUv).rgb;
        vec3 a = max(texture2D(tAlbedo, vUv).rgb, vec3(${ALBEDO_FLOOR}));
        gl_FragColor = vec4(l * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

/**
 * Filtert das Path-Tracing-Ergebnis und schreibt das fertige (tonegemappte) Bild auf den Canvas.
 * @param samples bestimmt die Stärke: wenige Samples → mehr Iterationen/Toleranz
 */
export function denoiseATrous(renderer: THREE.WebGLRenderer, color: THREE.Texture, gbuf: GBuffer, w: number, h: number, samples: number): void {
  const ping = makeTarget(w, h);
  const pong = makeTarget(w, h);
  const quad = new FullScreenQuad();
  const demod = demodulateMaterial(color, gbuf.albedo.texture);
  const atrous = atrousMaterial(gbuf.normalDepth.texture, w, h);
  const remod = remodulateMaterial(ping.texture, gbuf.albedo.texture);
  try {
    quad.material = demod;
    renderer.setRenderTarget(ping);
    quad.render(renderer);

    const iterations = samples < 100 ? 5 : samples < 400 ? 4 : 3;
    let src = ping;
    let dst = pong;
    let sigma = samples < 100 ? 1.6 : samples < 400 ? 1.0 : 0.6;
    for (let i = 0; i < iterations; i++) {
      atrous.uniforms.tLight!.value = src.texture;
      atrous.uniforms.stepWidth!.value = 1 << i;
      atrous.uniforms.sigmaL!.value = sigma;
      quad.material = atrous;
      renderer.setRenderTarget(dst);
      quad.render(renderer);
      [src, dst] = [dst, src];
      sigma *= 0.6;
    }

    remod.uniforms.tLight!.value = src.texture;
    quad.material = remod;
    renderer.setRenderTarget(null);
    quad.render(renderer);
  } finally {
    demod.dispose();
    atrous.dispose();
    remod.dispose();
    quad.dispose();
    ping.dispose();
    pong.dispose();
  }
}
