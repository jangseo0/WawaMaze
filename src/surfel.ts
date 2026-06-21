import * as THREE from 'three';
import { mazeMap, mapToWorld, isWalkableMapChar, TILE_SIZE, WALL_HEIGHT } from './maze';

// [Surfel] & [Surface Element]
// Surfel은 3D 표면을 작은 원반 형태로 근사한 그래픽스 요소입니다.
// 각 요소가 빛을 얼마나 받고(Radiance), 어떤 색상(Albedo)이며 어느 방향(Surface Normal)을 향하는지 저장합니다.
// [Direct Radiance] (직접광)와 [Indirect Radiance] (간접광)을 합산하여 최종 밝기를 계산합니다.
// [Normal 방향성]을 사용해 빛이 표면에 닿는 각도를 계산하여 람베르트 반사(Lambertian)를 시뮬레이션합니다.
export type Surfel = {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  albedo: THREE.Color;
  radius: number;

  directRadiance: THREE.Color;
  indirectRadiance: THREE.Color;
  totalRadiance: THREE.Color;

  neighbors: number[];
  debugMesh?: THREE.Mesh;
  debugNormal?: THREE.Line;
};

export const surfels: Surfel[] = [];
export let debugSurfels = false;
export let enableSurfelGI = true;

export const SURFEL_DIRECT_INTENSITY = 2.2;
export const SURFEL_BOUNCE_INTENSITY = 0.55;
export const SURFEL_GI_EMISSIVE_INTENSITY = 0.28;
export const SURFEL_GI_DEBUG_SCALE = 1.8;

export function clampColor(color: THREE.Color, maxValue = 1.0): THREE.Color {
  color.r = Math.min(color.r, maxValue);
  color.g = Math.min(color.g, maxValue);
  color.b = Math.min(color.b, maxValue);
  return color;
}

export function setDebugSurfels(val: boolean) {
  debugSurfels = val;
}

export function setEnableSurfelGI(val: boolean) {
  enableSurfelGI = val;
}

export function isWalkableTile(row: number, col: number): boolean {
  if (row < 0 || row >= mazeMap.length || col < 0 || col >= mazeMap[0].length) return false;
  return isWalkableMapChar(mazeMap[row][col]);
}

export function createFloorSurfel(x: number, z: number): Surfel {
  return {
    position: new THREE.Vector3(x, 0.1, z),
    normal: new THREE.Vector3(0, 1, 0),
    albedo: new THREE.Color(0.5, 0.5, 0.5),
    radius: TILE_SIZE / 2,
    directRadiance: new THREE.Color(0, 0, 0),
    indirectRadiance: new THREE.Color(0, 0, 0),
    totalRadiance: new THREE.Color(0, 0, 0),
    neighbors: []
  };
}

export function createWallSurfels(x: number, z: number, row: number, col: number): Surfel[] {
  const result: Surfel[] = [];
  const y = WALL_HEIGHT / 2;
  const half = TILE_SIZE / 2;

  // 인접한 칸이 이동 가능한 공간일 경우에만 해당 면에 Surfel 배치
  if (isWalkableTile(row, col + 1)) { 
    result.push({
      position: new THREE.Vector3(x + half, y, z),
      normal: new THREE.Vector3(1, 0, 0),
      albedo: new THREE.Color(0.8, 0.8, 0.8),
      radius: TILE_SIZE / 2,
      directRadiance: new THREE.Color(0, 0, 0),
      indirectRadiance: new THREE.Color(0, 0, 0),
      totalRadiance: new THREE.Color(0, 0, 0),
      neighbors: []
    });
  }
  if (isWalkableTile(row, col - 1)) {
    result.push({
      position: new THREE.Vector3(x - half, y, z),
      normal: new THREE.Vector3(-1, 0, 0),
      albedo: new THREE.Color(0.8, 0.8, 0.8),
      radius: TILE_SIZE / 2,
      directRadiance: new THREE.Color(0, 0, 0),
      indirectRadiance: new THREE.Color(0, 0, 0),
      totalRadiance: new THREE.Color(0, 0, 0),
      neighbors: []
    });
  }
  if (isWalkableTile(row + 1, col)) {
    result.push({
      position: new THREE.Vector3(x, y, z + half),
      normal: new THREE.Vector3(0, 0, 1),
      albedo: new THREE.Color(0.8, 0.8, 0.8),
      radius: TILE_SIZE / 2,
      directRadiance: new THREE.Color(0, 0, 0),
      indirectRadiance: new THREE.Color(0, 0, 0),
      totalRadiance: new THREE.Color(0, 0, 0),
      neighbors: []
    });
  }
  if (isWalkableTile(row - 1, col)) {
    result.push({
      position: new THREE.Vector3(x, y, z - half),
      normal: new THREE.Vector3(0, 0, -1),
      albedo: new THREE.Color(0.8, 0.8, 0.8),
      radius: TILE_SIZE / 2,
      directRadiance: new THREE.Color(0, 0, 0),
      indirectRadiance: new THREE.Color(0, 0, 0),
      totalRadiance: new THREE.Color(0, 0, 0),
      neighbors: []
    });
  }
  return result;
}

export function generateSurfelsFromMaze() {
  surfels.length = 0;
  for (let z = 0; z < mazeMap.length; z++) {
    for (let x = 0; x < mazeMap[z].length; x++) {
      const cell = mazeMap[z][x];
      // World Transform 변환 사용
      const worldPos = mapToWorld(z, x);
      const posX = worldPos.x;
      const posZ = worldPos.z;

      if (cell === '1') {
        surfels.push(...createWallSurfels(posX, posZ, z, x));
      } else {
        surfels.push(createFloorSurfel(posX, posZ));
      }
    }
  }
}

// [Neighbor Search] & [Local Light Transport] & [Distance Falloff]
export function buildSurfelNeighbors() {
  const SURFEL_NEIGHBOR_RADIUS = 4.5;
  const SURFEL_MAX_NEIGHBORS = 8;

  for (let i = 0; i < surfels.length; i++) {
    const s1 = surfels[i];
    const distances: { index: number, dist: number }[] = [];

    for (let j = 0; j < surfels.length; j++) {
      if (i === j) continue;
      const dist = s1.position.distanceTo(surfels[j].position);
      if (dist <= SURFEL_NEIGHBOR_RADIUS) {
        distances.push({ index: j, dist });
      }
    }

    distances.sort((a, b) => a.dist - b.dist);
    s1.neighbors = distances.slice(0, SURFEL_MAX_NEIGHBORS).map(d => d.index);
  }
}

export function createSurfelDebugObjects(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(0.8, 0.8);
  for (const surfel of surfels) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(surfel.position);
    mesh.position.add(surfel.normal.clone().multiplyScalar(0.02));
    mesh.lookAt(mesh.position.clone().add(surfel.normal));
    mesh.visible = false;
    scene.add(mesh);
    surfel.debugMesh = mesh;

    const points = [
      new THREE.Vector3(0, 0, 0),
      surfel.normal.clone().multiplyScalar(0.35)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ 
      color: 0x88ff88,
      transparent: true,
      opacity: 0.8
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.position.copy(surfel.position);
    line.visible = false;
    scene.add(line);
    surfel.debugNormal = line;
  }
}

function getSurfelDebugColor(surfel: Surfel): THREE.Color {
  const directPower = surfel.directRadiance.r + surfel.directRadiance.g + surfel.directRadiance.b;
  const indirectPower = surfel.indirectRadiance.r + surfel.indirectRadiance.g + surfel.indirectRadiance.b;

  if (directPower > 0.3) {
    return new THREE.Color(0xfff176); // direct light: yellow
  }
  if (indirectPower > 0.08) {
    return new THREE.Color(0x80ff9f); // indirect bounce: green
  }
  return new THREE.Color(0x1b3a2a); // dark foliage tone
}

export function updateSurfelDebugObjects() {
  for (const surfel of surfels) {
    if (surfel.debugMesh) {
      surfel.debugMesh.visible = debugSurfels;
      if (debugSurfels) {
        // [Debug Visualization] GI ON/OFF 비교 및 시각화용
        (surfel.debugMesh.material as THREE.MeshBasicMaterial).color.copy(getSurfelDebugColor(surfel));
        
        const power = Math.min(1.0, surfel.totalRadiance.r + surfel.totalRadiance.g + surfel.totalRadiance.b);
        const scale = THREE.MathUtils.lerp(0.04, 0.16, power * SURFEL_GI_DEBUG_SCALE);
        surfel.debugMesh.scale.setScalar(scale);
      }
    }
    if (surfel.debugNormal) {
      surfel.debugNormal.visible = debugSurfels;
    }
  }
}

// [Ray Casting] & [Visibility Test] & [Shadow Ray] & [Occlusion]
// 직접광(Direct Lighting)이 벽에 가려 차폐(Occlusion)되는지 확인하는 섀도우 레이 연산입니다.
export function isOccludedByWall(from: THREE.Vector3, to: THREE.Vector3, walls: THREE.Mesh[]): boolean {
  const EPSILON = 0.05;
  const direction = to.clone().sub(from);
  const distance = direction.length();
  direction.normalize();

  // 자기 자신의 표면과 즉각적으로 충돌(Self-Shadowing)하는 것을 막기 위해 Epsilon만큼 Offset을 줍니다.
  const rayOrigin = from.clone().add(direction.clone().multiplyScalar(EPSILON));
  const raycaster = new THREE.Raycaster(rayOrigin, direction, 0, distance - EPSILON * 2);
  
  const intersects = raycaster.intersectObjects(walls, false);
  return intersects.length > 0;
}

const SURFEL_DIRECT_LIGHT_RADIUS = 8.0;

// [Direct Radiance] & [Lambert Diffuse] & [N dot L] & [Distance Attenuation]
export function computeDirectRadianceForSurfels(lightPosition: THREE.Vector3, lightColor: THREE.Color, walls: THREE.Mesh[]) {
  for (const surfel of surfels) {
    const toLight = lightPosition.clone().sub(surfel.position);
    const distance = toLight.length();

    if (distance > SURFEL_DIRECT_LIGHT_RADIUS) {
      surfel.directRadiance.setRGB(0, 0, 0);
      continue;
    }

    if (isOccludedByWall(lightPosition, surfel.position, walls)) {
      surfel.directRadiance.setRGB(0, 0, 0);
      continue;
    }

    const lightDir = toLight.normalize();
    // 빛이 표면과 이루는 각도(N dot L) 연산으로 Lambertian 반사를 구현
    const nDotL = Math.max(0, surfel.normal.dot(lightDir));
    // 거리 감쇠 (Distance Attenuation / Inverse Square Law 근사)
    const distanceFalloff = 1.0 / (1.0 + distance * distance * 0.15);

    const intensity = SURFEL_DIRECT_INTENSITY * nDotL * distanceFalloff;
    surfel.directRadiance.copy(lightColor).multiplyScalar(intensity);
  }
}

// [Indirect Lighting] & [Light Bounce] & [Diffuse Interreflection] & [Albedo 기반 반사]
// 직접광을 받은 Surfel이 다시 광원이 되어 주변 Neighbor Surfel들에게 간접광을 전달합니다.
export function propagateIndirectRadiance() {
  for (const surfel of surfels) {
    surfel.indirectRadiance.setRGB(0, 0, 0);
  }

  for (let i = 0; i < surfels.length; i++) {
    const from = surfels[i];
    if (from.directRadiance.r === 0 && from.directRadiance.g === 0 && from.directRadiance.b === 0) continue;

    // Albedo(표면 색상)를 곱해 튕겨나가는 빛의 색이 표면 색의 영향을 받도록 합니다.
    const bounced = from.directRadiance.clone().multiply(from.albedo).multiplyScalar(SURFEL_BOUNCE_INTENSITY);

    for (const neighborIndex of from.neighbors) {
      const to = surfels[neighborIndex];

      const direction = to.position.clone().sub(from.position);
      const distance = direction.length();
      direction.normalize();

      // Neighbor의 Normal이 빛을 받을 수 있는 각도인지 (N dot L) 확인
      const normalFactor = Math.max(0, to.normal.dot(direction.clone().negate()));
      const falloff = 1.0 / (1.0 + distance * distance * 0.25);

      const contribution = bounced.clone().multiplyScalar(normalFactor * falloff);
      to.indirectRadiance.add(contribution);
    }
  }
}

export function updateTotalRadiance() {
  for (const surfel of surfels) {
    surfel.totalRadiance.copy(surfel.directRadiance);
    surfel.totalRadiance.add(surfel.indirectRadiance);

    surfel.totalRadiance.r = Math.min(surfel.totalRadiance.r, 1.0);
    surfel.totalRadiance.g = Math.min(surfel.totalRadiance.g, 1.0);
    surfel.totalRadiance.b = Math.min(surfel.totalRadiance.b, 1.0);
  }
}

// [Global Illumination] 샘플링
// Distance Falloff (거리 감쇠)를 고려하여 주변 Surfel 여러 개를 가중 평균(Weighted Average)으로 섞습니다.
export function sampleSurfelGIAtPosition(position: THREE.Vector3): THREE.Color {
  const result = new THREE.Color(0, 0, 0);
  let totalWeight = 0;
  const SAMPLE_RADIUS = 4.0;

  for (const surfel of surfels) {
    const distance = position.distanceTo(surfel.position);
    if (distance > SAMPLE_RADIUS) continue;

    const weight = 1.0 / (0.2 + distance * distance);
    const contribution = surfel.totalRadiance.clone().multiplyScalar(weight);

    result.add(contribution);
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    result.multiplyScalar(1.0 / totalWeight);
  }
  return clampColor(result, 1.0);
}

// [Emissive를 이용한 간접광 시각화]
// GI Color를 Material의 emissive에 복사하여 표면이 은은하게 빛나는 반사광 효과를 냅니다.
export function applySurfelGIToScene(meshes: THREE.Mesh[], giBoostStrength: number) {
  for (const mesh of meshes) {
    const material = mesh.material as THREE.MeshStandardMaterial;

    if (!enableSurfelGI) {
      material.emissive.setRGB(0, 0, 0);
      material.emissiveIntensity = 0;
      continue;
    }

    const giColor = sampleSurfelGIAtPosition(mesh.position);
    material.emissive.copy(giColor);
    
    const boostedEmissiveIntensity = THREE.MathUtils.lerp(
      SURFEL_GI_EMISSIVE_INTENSITY,
      SURFEL_GI_EMISSIVE_INTENSITY * 2.0,
      giBoostStrength
    );
    material.emissiveIntensity = boostedEmissiveIntensity;
  }
}

export function updateSurfelGI(lightPosition: THREE.Vector3, lightColor: THREE.Color, walls: THREE.Mesh[], giMeshes: THREE.Mesh[], giBoostStrength: number) {
  computeDirectRadianceForSurfels(lightPosition, lightColor, walls);
  propagateIndirectRadiance();
  updateTotalRadiance();
  applySurfelGIToScene(giMeshes, giBoostStrength);
  updateSurfelDebugObjects();
}
