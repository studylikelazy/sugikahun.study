/**
 * Exchange Floor style: original low-detail market lounge, isometric and calm.
 * Babylon owns only atmospheric geometry; economy and player actions remain in React.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";

export type GameHandle = { scene: Scene; dispose: () => void };

const color = (hex: string) => Color3.FromHexString(hex);

function material(scene: Scene, name: string, hex: string, emissive = 0) {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color(hex);
  result.specularColor = Color3.Black();
  result.emissiveColor = color(hex).scale(emissive);
  result.alpha = 0.94;
  return result;
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.012, 0.035, 0.07, 1);
  scene.ambientColor = color("#13294f");

  const camera = new ArcRotateCamera("market-camera", -Math.PI / 2.35, 1.07, 18, new Vector3(0, 0.5, 0), scene);
  camera.lowerRadiusLimit = 18;
  camera.upperRadiusLimit = 18;
  camera.lowerBetaLimit = 1.07;
  camera.upperBetaLimit = 1.07;
  camera.fov = 0.78;
  camera.attachControl(canvas, false);

  new HemisphericLight("exchange-ambience", new Vector3(0, 1, 0), scene).intensity = 1.1;
  const key = new PointLight("market-key", new Vector3(-3, 5, -2), scene);
  key.diffuse = color("#3c91ff");
  key.intensity = 28;
  key.range = 18;
  const warm = new PointLight("archive-key", new Vector3(5, 2.5, 1), scene);
  warm.diffuse = color("#ffb454");
  warm.intensity = 16;
  warm.range = 9;
  const glow = new GlowLayer("soft-signal-glow", scene, { blurKernelSize: 48 });
  glow.intensity = 0.45;

  const floor = MeshBuilder.CreateGround("floor", { width: 18, height: 14 }, scene);
  floor.material = material(scene, "floor", "#07172d", 0.14);

  const gridMaterial = material(scene, "grid-lines", "#1766b8", 0.7);
  for (let x = -8; x <= 8; x += 2) {
    const line = MeshBuilder.CreateBox(`grid-x-${x}`, { width: 0.035, height: 0.025, depth: 13 }, scene);
    line.position = new Vector3(x, 0.025, 0);
    line.material = gridMaterial;
  }
  for (let z = -6; z <= 6; z += 2) {
    const line = MeshBuilder.CreateBox(`grid-z-${z}`, { width: 17, height: 0.025, depth: 0.035 }, scene);
    line.position = new Vector3(0, 0.025, z);
    line.material = gridMaterial;
  }

  const boardFrame = material(scene, "board-frame", "#0c386f", 0.38);
  const boardScreen = material(scene, "board-screen", "#073d7a", 0.78);
  const archiveGold = material(scene, "archive-gold", "#a65c16", 0.72);
  const portalBlue = material(scene, "portal-blue", "#0b89c9", 0.86);
  const neutral = material(scene, "neutral", "#173053", 0.25);

  const board = MeshBuilder.CreateBox("market-board", { width: 7.2, height: 3.2, depth: 0.28 }, scene);
  board.position = new Vector3(0, 2.15, 4.9);
  board.material = boardFrame;
  const screen = MeshBuilder.CreateBox("market-board-screen", { width: 6.72, height: 2.7, depth: 0.08 }, scene);
  screen.position = new Vector3(0, 2.15, 4.7);
  screen.material = boardScreen;
  ["ORCA", "ATL", "VCTR"].forEach((_, index) => {
    const bar = MeshBuilder.CreateBox(`ticker-${index}`, { width: 1.25 + index * 0.35, height: 0.09, depth: 0.08 }, scene);
    bar.position = new Vector3(-2.5, 2.85 - index * 0.72, 4.63);
    bar.material = index === 1 ? archiveGold : portalBlue;
  });

  const terminal = MeshBuilder.CreateBox("trade-terminal", { width: 2.25, height: 1.65, depth: 1.1 }, scene);
  terminal.position = new Vector3(-4.5, 0.85, 1.2);
  terminal.material = neutral;
  const terminalScreen = MeshBuilder.CreateBox("trade-terminal-screen", { width: 1.8, height: 0.95, depth: 0.06 }, scene);
  terminalScreen.position = new Vector3(-4.5, 1.12, 0.62);
  terminalScreen.material = portalBlue;

  const archiveKiosk = MeshBuilder.CreateCylinder("archive-kiosk", { height: 2.4, diameterTop: 1.25, diameterBottom: 1.75, tessellation: 6 }, scene);
  archiveKiosk.position = new Vector3(4.35, 1.2, 0.9);
  archiveKiosk.material = archiveGold;
  const capsule = MeshBuilder.CreateSphere("archive-capsule", { diameter: 0.82, segments: 12 }, scene);
  capsule.position = new Vector3(4.35, 2.58, 0.9);
  capsule.material = archiveGold;

  const portal = MeshBuilder.CreateTorus("shared-room-portal", { diameter: 2.5, thickness: 0.16, tessellation: 24 }, scene);
  portal.position = new Vector3(-4.1, 1.65, -3.7);
  portal.rotation.x = Math.PI / 2;
  portal.material = portalBlue;
  [0, 1, 2].forEach((index) => {
    const player = MeshBuilder.CreateBox(`social-marker-${index}`, { size: 0.45 }, scene);
    player.position = new Vector3(-4.7 + index * 0.58, 0.32, -3.7 + (index % 2) * 0.48);
    player.material = index === 1 ? archiveGold : portalBlue;
  });

  const player = MeshBuilder.CreateBox("pulse-player", { width: 0.65, height: 1.15, depth: 0.45 }, scene);
  player.position = new Vector3(0, 0.6, -1.25);
  player.material = material(scene, "pulse-player-material", "#1f5fa9", 0.34);
  const head = MeshBuilder.CreateSphere("pulse-player-head", { diameter: 0.52, segments: 10 }, scene);
  head.position = new Vector3(0, 1.45, -1.25);
  head.material = material(scene, "pulse-player-head-material", "#91c6ff", 0.22);

  const demo = new URLSearchParams(window.location.search).has("demo");
  const observer = scene.onBeforeRenderObservable.add(() => {
    const seconds = performance.now() * 0.001;
    camera.alpha = -Math.PI / 2.35 + Math.sin(seconds * (demo ? 0.24 : 0.09)) * 0.12;
    capsule.rotation.y = seconds * 0.55;
    portal.rotation.z = seconds * 0.4;
    player.position.y = 0.6 + Math.sin(seconds * 1.8) * 0.035;
  });

  return {
    scene,
    dispose: () => scene.onBeforeRenderObservable.remove(observer),
  };
}
