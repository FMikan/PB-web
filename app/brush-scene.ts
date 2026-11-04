// The paint brush and the line it leaves (app/brush-trace.tsx), in three.js on one
// transparent canvas. The camera is set so one world unit is one CSS px on the plane the
// tip touches, so the page can work in canvas px.
//
// The line is a single mesh, every bristle a ribbon; the shader slides it up the canvas
// as the page scrolls (uD), shows it only as far as the brush has got, cut along the
// head's edge, and colours it pink to violet and back down its length. Drawn on the GPU,
// in the same frame as the brush, so the two never drift apart.
//
// The brush is public/brush.glb (scripts/brush-model.py), its origin the bristles' tip;
// the page turns it about there, so the tip stays on the line whatever the brush does. A
// light from the upper left casts its shadow onto the page (an invisible plane that only
// shows shadow), over the paint, so the handle reads as rising off the page toward you.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { edges, PINK, VIOLET, type Trail } from "./brush-path";

const FOV = 30; // degrees: enough perspective that the handle, tilted toward you, reads as 3D
const HEAD = 0.092; // the model's bristles, wide (its units)
const BRISTLES = 0.114; // how far up the bristles reach from the tip, before the ferrule
const FERRULE = 0.174; // where the metal ferrule ends and the handle starts
const LENGTH = 1.008; // tip to the end of the handle

export type Pose = {
  x: number; // the tip on the canvas, px
  y: number;
  head: number; // the head's width on screen, px
  lean: number; // radians, in the screen's plane: 0 = handle straight down, > 0 = down-right
  pitch: number; // radians: how far the handle tilts out toward you
  twist: number; // radians, about the brush's own length
  yaw: number; // radians, about the screen's vertical: the handle swinging toward or away
  lift: number; // px toward you, off the page
  bend: number; // the bristles bowing sideways, in the model's units
  splay: number; // the bristles spreading, 0 to about 0.2
  paint: number[]; // the colour on the bristles' tips, 0-1 per channel
};

// How far the line is drawn (px along it) and the cut: the head's edge through the tip,
// as its normal toward the brush's body (canvas px, y down).
export type Cut = { d: number; nx: number; ny: number };

const lineVertex = /* glsl */ `
  attribute float across; // signed distance from the bristle's centre, px
  attribute float hw; // the bristle's half-width there, px
  attribute float along; // d of this sample, px
  attribute float opacity;
  uniform float uD;
  uniform float uTipY;
  uniform vec2 uCenter; // the canvas's middle, px
  varying vec2 vCanvas;
  varying float vAcross;
  varying float vHw;
  varying float vAlong;
  varying float vOpacity;
  void main() {
    // The page carries the line up past the tip, which holds at uTipY.
    vCanvas = vec2(position.x, uTipY + position.y - uD);
    vAcross = across;
    vHw = hw;
    vAlong = along;
    vOpacity = opacity;
    // Just behind the plane the tip touches, so the brush (opaque, drawn first) hides it.
    gl_Position = projectionMatrix * viewMatrix * vec4(vCanvas.x - uCenter.x, uCenter.y - vCanvas.y, -0.5, 1.0);
  }
`;

const lineFragment = /* glsl */ `
  uniform float uD;
  uniform float uHead;
  uniform vec2 uTip;
  uniform vec2 uEdge;
  uniform float uPeriod;
  uniform vec3 uPink;
  uniform vec3 uViolet;
  varying vec2 vCanvas;
  varying float vAcross;
  varying float vHw;
  varying float vAlong;
  varying float vOpacity;
  void main() {
    // Antialiased over a px at the bristle's sides.
    float cover = clamp(vHw - abs(vAcross) + 0.5, 0.0, 1.0);
    // Drawn so far: all of it well behind the tip, nothing well ahead; near the tip, up
    // to the head's edge (soft over a px).
    float shown = vAlong < uD - 2.0 * uHead ? 1.0
      : vAlong > uD + uHead ? 0.0
      : clamp(1.0 - dot(vCanvas - uTip, uEdge), 0.0, 1.0);
    float t = mod(vAlong / uPeriod, 2.0);
    vec3 color = mix(uPink, uViolet, t > 1.0 ? 2.0 - t : t);
    float a = cover * shown * vOpacity;
    gl_FragColor = vec4(color * a, a); // premultiplied; the colours are already sRGB
  }
`;

export async function createBrush(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45; // low, so the key light shapes the handle's roundness
  // Key from the upper left and in front: shades the round handle and casts the shadow.
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.radius = 6; // soft-edged, like a shadow from a big window
  scene.add(key, key.target);
  // Rims in the line's two colours, from behind, so the white catches the page's palette.
  const pink = new THREE.DirectionalLight(0xffb2c6, 2.2);
  pink.position.set(1.2, 0.3, -0.6);
  const violet = new THREE.DirectionalLight(0x988bd0, 1.8);
  violet.position.set(-1.2, -0.4, -0.5);
  scene.add(pink, violet);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);

  // The page: catches the brush's shadow and nothing else, a hair behind the line; drawn
  // after it, and the line writes no depth, so the shadow falls over the paint.
  const page = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }));
  page.position.z = -1;
  page.receiveShadow = true;
  page.renderOrder = 1;
  scene.add(page);

  // The line: built per screen size (setLine). Transparent, so it's drawn after the
  // (opaque) brush, behind it by depth; then the shadow over it.
  const lineUniforms = {
    uD: { value: 0 },
    uTipY: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uHead: { value: 0 },
    uTip: { value: new THREE.Vector2() },
    uEdge: { value: new THREE.Vector2(0, 1) },
    uPeriod: { value: 1 },
    uPink: { value: new THREE.Vector3().fromArray(PINK.map((c) => c / 255)) },
    uViolet: { value: new THREE.Vector3().fromArray(VIOLET.map((c) => c / 255)) },
  };
  const lineMaterial = new THREE.ShaderMaterial({
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    uniforms: lineUniforms,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.DoubleSide, // built y down, shown y up: its triangles face away
  });
  const line = new THREE.Mesh(new THREE.BufferGeometry(), lineMaterial);
  line.frustumCulled = false; // the shader moves it
  line.renderOrder = 0;
  scene.add(line);

  // The model, with gltfpack's quantization (scale and offset on the node) baked into
  // plain float positions, so the shader below works in the model's own units.
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/brush.glb");
  let source: THREE.Mesh | undefined;
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) source = o as THREE.Mesh;
  });
  if (!source) throw new Error("brush.glb has no mesh");
  source.updateWorldMatrix(true, false);
  const raw = source.geometry.getAttribute("position");
  const positions = new Float32Array(raw.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < raw.count; i++) {
    v.fromBufferAttribute(raw, i).applyMatrix4(source.matrixWorld);
    v.toArray(positions, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", source.geometry.getAttribute("normal"));
  geometry.setIndex(source.geometry.getIndex());

  // White, matte; the ferrule metal, the bristles a little rougher, their tips wet with
  // the line's colour. The bristles bow and spread with the motion (uBend, uSplay), held
  // at the tip and at the ferrule.
  const uniforms = {
    uBend: { value: 0 },
    uSplay: { value: 0 },
    uPaint: { value: new THREE.Color() },
  };
  const bristles = (src: string) =>
    src
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uBend;
        uniform float uSplay;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hair = clamp(1.0 + position.y / ${BRISTLES.toFixed(3)}, 0.0, 1.0);
        transformed.x = transformed.x * (1.0 + uSplay * hair) + uBend * sin(PI * hair);`,
      );
  const material = new THREE.MeshStandardMaterial({ color: 0xf4f1f6, roughness: 0.4, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = bristles(shader.vertexShader)
      .replace("uniform float uSplay;", "uniform float uSplay;\nvarying float vAlong;")
      .replace("float hair =", "vAlong = position.y;\n        float hair =");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uPaint;
        varying float vAlong;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uPaint, 0.85 * smoothstep(-0.055, -0.01, vAlong));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        bool metal = vAlong < -${BRISTLES.toFixed(3)} && vAlong > -${FERRULE.toFixed(3)};
        roughnessFactor = metal ? 0.28 : (vAlong >= -${BRISTLES.toFixed(3)} ? 0.75 : roughnessFactor);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = vAlong < -${BRISTLES.toFixed(3)} && vAlong > -${FERRULE.toFixed(3)} ? 0.9 : metalnessFactor;`,
      );
  };
  const brush = new THREE.Mesh(geometry, material);
  brush.frustumCulled = false; // the shader moves the bristles past the stored bounds
  brush.castShadow = true;
  brush.renderOrder = 2;
  // Its shadow bends the same bristles.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = bristles(shader.vertexShader);
  };
  brush.customDepthMaterial = depth;

  // Turned about the tip: the swing toward or away, then the lean in the screen's plane,
  // the tilt toward you, and the twist about its own length.
  const anchor = new THREE.Group();
  const yawG = new THREE.Group();
  const leanG = new THREE.Group();
  const pitchG = new THREE.Group();
  const twistG = new THREE.Group();
  twistG.add(brush);
  pitchG.add(twistG);
  leanG.add(pitchG);
  yawG.add(leanG);
  anchor.add(yawG);
  scene.add(anchor);

  let width = 1;
  let height = 1;
  const tip = new THREE.Vector3();

  return {
    resize(w: number, h: number) {
      width = w;
      height = h;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // One unit = one px at z = 0.
      camera.position.set(0, 0, h / 2 / Math.tan((FOV / 2) * (Math.PI / 180)));
      camera.updateProjectionMatrix();
      page.scale.set(w, h, 1);
      lineUniforms.uCenter.value.set(w / 2, h / 2);
    },
    // The line for this screen: every bristle a ribbon of quads, a px wider each side
    // than the bristle for the antialiasing. tipY: where the tip holds on the canvas;
    // period: the colours' (app/brush-path.ts colorPeriod).
    setLine(t: Trail, tipY: number, period: number) {
      const n = t.bristles.reduce((sum, b) => sum + b.x.length, 0);
      const pos = new Float32Array(n * 2 * 3);
      const across = new Float32Array(n * 2);
      const hw = new Float32Array(n * 2);
      const along = new Float32Array(n * 2);
      const opacity = new Float32Array(n * 2);
      const index: number[] = [];
      let at = 0;
      for (const b of t.bristles) {
        edges(b, 1, (k, lx, ly, rx, ry) => {
          const w = b.w[k] + 1;
          pos.set([lx, ly, 0, rx, ry, 0], at * 3);
          across.set([-w, w], at);
          hw.set([b.w[k], b.w[k]], at);
          along.set([b.d[k], b.d[k]], at);
          opacity.set([b.opacity, b.opacity], at);
          if (k > 0) index.push(at - 2, at - 1, at, at - 1, at + 1, at);
          at += 2;
        });
      }
      line.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("across", new THREE.BufferAttribute(across, 1));
      g.setAttribute("hw", new THREE.BufferAttribute(hw, 1));
      g.setAttribute("along", new THREE.BufferAttribute(along, 1));
      g.setAttribute("opacity", new THREE.BufferAttribute(opacity, 1));
      g.setIndex(index);
      line.geometry = g;
      lineUniforms.uTipY.value = tipY;
      lineUniforms.uHead.value = t.head;
      lineUniforms.uPeriod.value = period;
    },
    render(p: Pose, cut: Cut) {
      lineUniforms.uD.value = cut.d;
      lineUniforms.uTip.value.set(p.x, p.y);
      lineUniforms.uEdge.value.set(cut.nx, cut.ny);

      anchor.position.set(p.x - width / 2, height / 2 - p.y, p.lift);
      anchor.scale.setScalar(p.head / HEAD);
      yawG.rotation.y = p.yaw;
      leanG.rotation.z = p.lean;
      pitchG.rotation.x = -p.pitch;
      twistG.rotation.y = p.twist;
      uniforms.uBend.value = p.bend;
      uniforms.uSplay.value = p.splay;
      uniforms.uPaint.value.setRGB(p.paint[0], p.paint[1], p.paint[2], THREE.SRGBColorSpace);

      // The key light follows the brush, its shadow box just around it.
      const size = (p.head / HEAD) * LENGTH;
      tip.copy(anchor.position);
      key.target.position.copy(tip);
      key.position.copy(tip).add(new THREE.Vector3(-0.55, 0.65, 1).multiplyScalar(size * 1.5));
      const cam = key.shadow.camera;
      cam.left = cam.bottom = -size * 1.1;
      cam.right = cam.top = size * 1.1;
      cam.near = 1;
      cam.far = size * 4;
      cam.updateProjectionMatrix();

      renderer.render(scene, camera);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      depth.dispose();
      line.geometry.dispose();
      lineMaterial.dispose();
      page.geometry.dispose();
      (page.material as THREE.Material).dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the context now, not when it's collected
    },
  };
}

export type Brush = Awaited<ReturnType<typeof createBrush>>;
