import './style.css';
import * as THREE from 'three';
import { createMazeFromMap, sceneMeshesForGI, wallMeshesForRaycast, mazeMap, validateMazePath } from './maze';
import type { Coin } from './maze';
import { Player, updatePlayerAnimation } from './player';
import { FollowCamera } from './camera';
import { updateFrustumCulling } from './culling';
import { 
  generateSurfelsFromMaze, 
  buildSurfelNeighbors, 
  createSurfelDebugObjects, 
  updateSurfelGI,
  surfels,
  enableSurfelGI,
  setEnableSurfelGI,
  debugSurfels,
  setDebugSurfels,
  updateSurfelDebugObjects
} from './surfel';

const LIGHT_RADIUS_PIXELS = 85;
const LIGHT_SOFTNESS_PIXELS = 65;

const MAP_REVEAL_DURATION = 3.0;
const MAP_REVEAL_FADE_TIME = 0.5;
const NORMAL_AMBIENT_INTENSITY = 0.16; // 약간 밝게 유지해 풀숲 색이 은은하게 보이도록 함
const REVEAL_AMBIENT_INTENSITY = 0.75;
const PLAYER_COLLIDER_RADIUS = 0.5;

const SURFEL_UPDATE_INTERVAL = 0.15;
let surfelUpdateAccumulator = 0;

let score = 0;
let mapRevealTimer = 0;
let mapRevealStrength = 0;
let isGameClear = false;

const GI_BOOST_DURATION = 3.0;
const GI_BOOST_FADE_TIME = 0.6;
let giBoostTimer = 0;
let giBoostStrength = 0;

// Debug States
let debugBoundingVolumes = false;
let debugFogOfWar = true;
let debugHelp = true;

// UI Elements
const helpElement = document.getElementById('help-ui')!;
const clearElement = document.getElementById('clear-ui')!;
const finalScoreElement = document.getElementById('final-score')!;
const restartBtn = document.getElementById('restart-btn')!;

function createHUD(): void {
  if (document.getElementById("hud-left")) return;

  const hud = document.createElement("div");
  hud.id = "hud-left";
  hud.className = "hud-panel";

  const rows = [
    "score-ui",
    "coins-ui",
    "reveal-ui",
    "map-size-ui",
    "path-valid-ui",
    "gi-toggle-ui",
    "gi-debug-ui",
    "gi-boost-ui",
    "surfel-count-ui",
    "bounding-ui",
    "lighting-ui"
  ];

  rows.forEach((id) => {
    const row = document.createElement("div");
    row.id = id;
    row.className = "hud-row";
    hud.appendChild(row);
  });

  document.body.appendChild(hud);
}
createHUD();

restartBtn.addEventListener('click', () => {
  window.location.reload();
});

const scene = new THREE.Scene();
const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 밤 숲의 차갑고 축축한 느낌을 주기 위해 옅은 청록색(0x88bbcc) 조명을 기본으로 사용합니다.
const ambientLight = new THREE.AmbientLight(0x88bbcc, NORMAL_AMBIENT_INTENSITY);
scene.add(ambientLight);

const PLAYER_LIGHT_INTENSITY = 0.45;
const PLAYER_LIGHT_DISTANCE = 2.5;
const PLAYER_LIGHT_DECAY = 2.0;

// 플레이어 주변 빛(PointLight): 치와와 자신과 바로 밑 바닥을 밝혀주는 용도
const playerPointLight = new THREE.PointLight(0xffffff, PLAYER_LIGHT_INTENSITY, PLAYER_LIGHT_DISTANCE);
playerPointLight.decay = PLAYER_LIGHT_DECAY;
scene.add(playerPointLight);

const HEAD_FLASHLIGHT_INTENSITY = 0.75;
const HEAD_FLASHLIGHT_DISTANCE = 5.0;
const HEAD_FLASHLIGHT_ANGLE = Math.PI / 7;
const HEAD_FLASHLIGHT_PENUMBRA = 0.65;
const HEAD_FLASHLIGHT_DECAY = 2.2;

const headFlashlight = new THREE.SpotLight(
  0xfff2c4,
  HEAD_FLASHLIGHT_INTENSITY,
  HEAD_FLASHLIGHT_DISTANCE,
  HEAD_FLASHLIGHT_ANGLE,
  HEAD_FLASHLIGHT_PENUMBRA,
  HEAD_FLASHLIGHT_DECAY
);

const headFlashlightTarget = new THREE.Object3D();
scene.add(headFlashlight);
scene.add(headFlashlightTarget);
headFlashlight.target = headFlashlightTarget;

const headLampMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0xffe7a8,
    emissive: 0xffcc66,
    emissiveIntensity: 0.8,
  })
);
scene.add(headLampMesh);

let debugLighting = false;
const playerLightHelper = new THREE.PointLightHelper(playerPointLight, 0.25, 0xffff00);
scene.add(playerLightHelper);
playerLightHelper.visible = debugLighting;

const headFlashlightHelper = new THREE.SpotLightHelper(headFlashlight);
scene.add(headFlashlightHelper);
headFlashlightHelper.visible = debugLighting;

const { playerStartPos, coins, walls, exitZone } = createMazeFromMap(scene);
const player = new Player(playerStartPos);
scene.add(player.mesh);

const isPathValid = validateMazePath(mazeMap);
if (!isPathValid) {
  console.error("Invalid maze: Player cannot reach the exit.");
}

generateSurfelsFromMaze();
buildSurfelNeighbors();
createSurfelDebugObjects(scene);

const overlayCanvas = document.getElementById('darkness-overlay') as HTMLCanvasElement;
const overlayCtx = overlayCanvas.getContext('2d')!;

function resizeOverlay() {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
}
resizeOverlay();

const keys: { [key: string]: boolean } = {};
window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  
  if (isGameClear) return;

  const key = e.key.toLowerCase();
  if (key === 'b') {
    debugBoundingVolumes = !debugBoundingVolumes;
    updateBoundingDebugObjects();
  }
  else if (key === 'h') debugHelp = !debugHelp;
  else if (key === 'l') debugLighting = !debugLighting;
  else if (key === 'i') {
    setEnableSurfelGI(!enableSurfelGI);
    console.log("Surfel GI:", enableSurfelGI ? "ON" : "OFF");
  }
  else if (key === 'g') {
    setDebugSurfels(!debugSurfels);
    updateSurfelDebugObjects();
  }
});
window.addEventListener('keyup', (e) => keys[e.key] = false);

window.addEventListener('resize', () => {
  followCamera.camera.aspect = window.innerWidth / window.innerHeight;
  followCamera.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeOverlay();
});


function worldToScreen(worldPos: THREE.Vector3, camera: THREE.Camera): { x: number, y: number } {
  const pos = worldPos.clone();
  pos.project(camera);
  const widthHalf = window.innerWidth / 2;
  const heightHalf = window.innerHeight / 2;
  return { x: (pos.x * widthHalf) + widthHalf, y: -(pos.y * heightHalf) + heightHalf };
}

function sphereIntersectsSphere(centerA: THREE.Vector3, radiusA: number, centerB: THREE.Vector3, radiusB: number): boolean {
  return centerA.distanceToSquared(centerB) < (radiusA + radiusB) ** 2;
}

function collectCoin(coin: Coin) {
  score += 1;
  coin.collected = true;
  coin.mesh.visible = false;
  coin.mesh.userData.collected = true;

  mapRevealTimer = MAP_REVEAL_DURATION;
  mapRevealStrength = 1.0;

  giBoostTimer = GI_BOOST_DURATION;
  giBoostStrength = 1.0;
}

function updateGIBoost(deltaTime: number): void {
  if (giBoostTimer > 0) {
    giBoostTimer -= deltaTime;
    giBoostStrength = 1.0;
  } else {
    giBoostStrength = Math.max(0, giBoostStrength - deltaTime / GI_BOOST_FADE_TIME);
  }
}

function updateCoins(deltaTime: number) {
  coins.forEach((coin, index) => {
    if (!coin.collected) {
      coin.mesh.rotation.y += deltaTime * 3;
      coin.mesh.position.y = 1.8 + Math.sin(Date.now() * 0.003 + index) * 0.2;
    }
  });
}

function updateCoinCollision() {
  for (const coin of coins) {
    if (coin.collected) continue;
    if (sphereIntersectsSphere(player.mesh.position, PLAYER_COLLIDER_RADIUS, coin.center, coin.radius)) {
      collectCoin(coin);
    }
  }
}

function showGameClearUI() {
  isGameClear = true;
  clearElement.style.display = 'block';
  finalScoreElement.textContent = `Final Score: ${score}`;
}

function updateExitCollision() {
  if (exitZone && !isGameClear) {
    if (sphereIntersectsSphere(player.mesh.position, PLAYER_COLLIDER_RADIUS, exitZone.center, exitZone.radius)) {
      showGameClearUI();
    }
  }
}

function updateMapReveal(deltaTime: number) {
  if (mapRevealTimer > 0) {
    mapRevealTimer -= deltaTime;
    mapRevealStrength = 1.0;
  } else {
    mapRevealStrength = Math.max(0, mapRevealStrength - deltaTime / MAP_REVEAL_FADE_TIME);
  }
  ambientLight.intensity = THREE.MathUtils.lerp(NORMAL_AMBIENT_INTENSITY, REVEAL_AMBIENT_INTENSITY, mapRevealStrength);
}

function updateDarknessOverlay() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  
  if (!debugFogOfWar) return; 

  // Fog of War가 GI를 완전히 가리지 않도록 조정
  const NORMAL_DARKNESS_ALPHA = 0.78; 
  const REVEAL_DARKNESS_ALPHA = 0.0;
  const debugDarknessAlpha = debugSurfels ? NORMAL_DARKNESS_ALPHA * 0.75 : NORMAL_DARKNESS_ALPHA;
  const darknessAlpha = THREE.MathUtils.lerp(debugDarknessAlpha, REVEAL_DARKNESS_ALPHA, mapRevealStrength);
  
  overlayCtx.globalCompositeOperation = 'source-over';
  overlayCtx.fillStyle = `rgba(5, 15, 12, ${darknessAlpha})`;
  overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (mapRevealStrength < 0.95) {
    const playerScreenPos = worldToScreen(player.mesh.position, followCamera.camera);
    const currentRadius = THREE.MathUtils.lerp(
      LIGHT_RADIUS_PIXELS,
      Math.max(overlayCanvas.width, overlayCanvas.height),
      mapRevealStrength
    );
    const currentSoftness = THREE.MathUtils.lerp(
      LIGHT_SOFTNESS_PIXELS,
      currentRadius * 0.5,
      mapRevealStrength
    );

    const gradient = overlayCtx.createRadialGradient(
      playerScreenPos.x, playerScreenPos.y, 0,
      playerScreenPos.x, playerScreenPos.y, currentRadius
    );
    const stopOffset = Math.max(0, Math.min(1, currentSoftness / currentRadius));
    gradient.addColorStop(0.0, 'rgba(5, 15, 12, 1)');
    gradient.addColorStop(stopOffset, 'rgba(5, 15, 12, 0.6)');
    gradient.addColorStop(1.0, 'rgba(5, 15, 12, 0)');

    overlayCtx.globalCompositeOperation = 'destination-out';
    overlayCtx.fillStyle = gradient;
    overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.globalCompositeOperation = 'source-over';
  }
}

const PLAYER_LIGHT_Y_OFFSET = 0.5;

function updatePlayerLightPosition(): void {
  const lightPosition = player.mesh.position.clone().add(
    new THREE.Vector3(0, PLAYER_LIGHT_Y_OFFSET, 0)
  );

  playerPointLight.position.copy(lightPosition);
}

function updateHeadFlashlight(): void {
  // 머리의 로컬 좌표계 (0, 0, 0)은 목/머리 관절의 중심입니다.
  // 로컬 좌표로 위쪽(Y: 0.28), 앞쪽(Z: 0.12)으로 이동시켜 이마/머리띠 위치에 맞춥니다.
  const localLampOffset = new THREE.Vector3(0, 0.28, 0.12);
  const headMatrix = player.headJoint.matrixWorld;
  
  const lampWorldPos = localLampOffset.clone().applyMatrix4(headMatrix);
  headFlashlight.position.copy(lampWorldPos);

  // 빛이 향할 타겟 지점: 머리가 바라보는 방향(로컬 Z축)으로 4.0 거리 앞, 살짝 아래쪽
  const localTargetOffset = new THREE.Vector3(0, -0.3, 4.0);
  const targetWorldPos = localTargetOffset.clone().applyMatrix4(headMatrix);
  headFlashlightTarget.position.copy(targetWorldPos);
}

function updateHeadLampMesh(): void {
  headLampMesh.position.copy(headFlashlight.position);
}

function updateFlashlight(): void {
  updatePlayerLightPosition();
  updateHeadFlashlight();
  updateHeadLampMesh();
}

const boundingDebugObjects: THREE.Object3D[] = [];

function createBoundingDebugObjects() {
  const pGeo = new THREE.SphereGeometry(PLAYER_COLLIDER_RADIUS, 16, 16);
  const pMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
  const pMesh = new THREE.Mesh(pGeo, pMat);
  scene.add(pMesh);
  boundingDebugObjects.push(pMesh);

  coins.forEach(c => {
    const cGeo = new THREE.SphereGeometry(c.radius, 16, 16);
    const cMat = new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true });
    const cMesh = new THREE.Mesh(cGeo, cMat);
    scene.add(cMesh);
    cMesh.position.copy(c.center);
    boundingDebugObjects.push(cMesh);
  });

  walls.forEach(w => {
    const size = new THREE.Vector3().subVectors(w.max, w.min);
    const center = new THREE.Vector3().addVectors(w.max, w.min).multiplyScalar(0.5);
    const wGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const wMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    const wMesh = new THREE.Mesh(wGeo, wMat);
    scene.add(wMesh);
    wMesh.position.copy(center);
    boundingDebugObjects.push(wMesh);
  });

  if (exitZone) {
    const eGeo = new THREE.SphereGeometry(exitZone.radius, 16, 16);
    const eMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    const eMesh = new THREE.Mesh(eGeo, eMat);
    scene.add(eMesh);
    eMesh.position.copy(exitZone.center);
    boundingDebugObjects.push(eMesh);
  }
}
createBoundingDebugObjects();

function updateBoundingDebugObjects() {
  if (boundingDebugObjects.length > 0) {
    boundingDebugObjects[0].position.copy(player.mesh.position);
  }
  boundingDebugObjects.forEach(obj => {
    obj.visible = debugBoundingVolumes;
  });
}

function updateGameUI(): void {
  const scoreUI = document.getElementById("score-ui");
  const coinsUI = document.getElementById("coins-ui");
  const mapSizeUI = document.getElementById("map-size-ui");
  const pathValidUI = document.getElementById("path-valid-ui");
  const revealUI = document.getElementById("reveal-ui");

  if (scoreUI) scoreUI.textContent = `Score: ${score}`;
  if (coinsUI) coinsUI.textContent = `Coins: ${score} / ${coins.length}`;
  if (mapSizeUI) mapSizeUI.textContent = `Map Size: ${mazeMap.length} x ${mazeMap[0].length}`;
  if (pathValidUI) {
    pathValidUI.textContent = `Path Valid: ${isPathValid ? "YES" : "NO"}`;
    pathValidUI.style.color = isPathValid ? '#00ff00' : '#ff0000';
  }
  if (revealUI) {
    revealUI.textContent = mapRevealTimer > 0 ? `Map Light: ${mapRevealTimer.toFixed(1)}s` : '';
    revealUI.style.color = '#ffd700';
  }
}

function updateDebugUI(): void {
  const boundingUI = document.getElementById("bounding-ui");
  const lightingUI = document.getElementById("lighting-ui");
  const giToggleUI = document.getElementById("gi-toggle-ui");
  const giDebugUI = document.getElementById("gi-debug-ui");
  const giBoostUI = document.getElementById("gi-boost-ui");
  const surfelCountUI = document.getElementById("surfel-count-ui");

  if (boundingUI) {
    boundingUI.textContent = `Bounding Debug: ${debugBoundingVolumes ? "ON" : "OFF"}`;
  }
  if (lightingUI) {
    lightingUI.textContent = `Lighting Debug: ${debugLighting ? "ON" : "OFF"}`;
  }
  if (giToggleUI) {
    giToggleUI.textContent = `Surfel GI: ${enableSurfelGI ? "ON - subtle bounce" : "OFF"}`;
  }
  if (giDebugUI) {
    giDebugUI.textContent = `Surfel Debug: ${debugSurfels ? "ON" : "OFF"}`;
  }
  if (giBoostUI) {
    giBoostUI.textContent = `Head Flashlight: ON`;
  }
  if (surfelCountUI) {
    surfelCountUI.textContent = `Surfels: ${surfels.length}`;
  }

  helpElement.style.display = debugHelp ? 'block' : 'none';
}

const clock = new THREE.Clock();

function animate() {
  const deltaTime = clock.getDelta();

  if (!isGameClear) {
    player.updatePlayer(deltaTime, keys, walls);
    updatePlayerAnimation(player, deltaTime, false); 
    updateCoins(deltaTime);
    updateCoinCollision();
    updateExitCollision();
    updateMapReveal(deltaTime);
    updateGIBoost(deltaTime);
  } else {
    updatePlayerAnimation(player, deltaTime, true); 
    // 클리어 시 화면이 서서히 완전히 밝아지도록 처리
    mapRevealStrength = Math.min(1.0, mapRevealStrength + deltaTime / 0.5);
    ambientLight.intensity = THREE.MathUtils.lerp(NORMAL_AMBIENT_INTENSITY, REVEAL_AMBIENT_INTENSITY, mapRevealStrength);
  }

  followCamera.updateCamera(player, deltaTime);
  updateFlashlight();

  surfelUpdateAccumulator += deltaTime;
  if (surfelUpdateAccumulator >= SURFEL_UPDATE_INTERVAL) {
    // 간접광(GI)이 숲의 벽(녹색)에 반사되어 퍼지는 느낌을 살리기 위해, 
    // Surfel에 주입되는 반사광 색상을 은은한 연녹색(0xaaffaa)으로 둡니다.
    updateSurfelGI(playerPointLight.position, new THREE.Color(0xaaffaa), wallMeshesForRaycast, sceneMeshesForGI);
    surfelUpdateAccumulator = 0;
  }

  updateFrustumCulling(followCamera.camera);
  updateBoundingDebugObjects();

  if (playerLightHelper) {
    playerLightHelper.visible = debugLighting;
    playerLightHelper.update?.();
  }
  if (headFlashlightHelper) {
    headFlashlightHelper.visible = debugLighting;
    headFlashlightHelper.update?.();
  }
  
  updateDarknessOverlay(); 
  updateGameUI();
  updateDebugUI();

  renderer.render(scene, followCamera.camera);
  requestAnimationFrame(animate);
}

updateBoundingDebugObjects();
updateGameUI();
updateDebugUI();
animate();
