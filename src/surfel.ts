import * as THREE from 'three';
import { mazeMap, mapToWorld, isWalkableMapChar, TILE_SIZE, WALL_HEIGHT } from './maze';

// [Surfel] & [Surface Element]
// Surfel은 3D 표면을 작은 원반 형태로 근사한 요소입니다.
// 각 요소가 빛을 얼마나 받고(Radiance), 어떤 색상(Albedo)이며 어느 방향(Surface Normal)을 향하는지 저장합니다.
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

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'g') {
    debugSurfels = !debugSurfels;
    updateSurfelDebugObjects();
  }
});

export function setDebugSurfels(val: boolean) {
  debugSurfels = val;
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

    const points = [];
    points.push(new THREE.Vector3(0, 0, 0));
    points.push(surfel.normal.clone().multiplyScalar(0.8));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(lineGeo, lineMat);
    line.position.copy(surfel.position);
    line.visible = false;
    scene.add(line);
    surfel.debugNormal = line;
  }
}

export function updateSurfelDebugObjects() {
  for (const surfel of surfels) {
    if (surfel.debugMesh) {
      surfel.debugMesh.visible = debugSurfels;
      if (debugSurfels) {
        // [Radiance 시각화]
        // 빛을 많이 받으면 밝게, 적게 받으면 어둡게 표현됩니다.
        (surfel.debugMesh.material as THREE.MeshBasicMaterial).color.copy(surfel.totalRadiance);
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
const SURFEL_DIRECT_INTENSITY = 1.5;

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

const SURFEL_BOUNCE_INTENSITY = 0.35;
const SURFEL_INDIRECT_DECAY = 0.85;

// [Indirect Lighting] & [Light Bounce] & [Diffuse Interreflection] & [Albedo 반사] & [Energy Decay]
// 직접광을 받은 Surfel이 다시 광원이 되어 주변 Neighbor Surfel들에게 간접광을 전달합니다.
export function propagateIndirectRadiance() {
  for (const surfel of surfels) {
    surfel.indirectRadiance.setRGB(0, 0, 0);
  }

  for (let i = 0; i < surfels.length; i++) {
    const from = surfels[i];
    if (from.directRadiance.r === 0 && from.directRadiance.g === 0 && from.directRadiance.b === 0) continue;

    // Albedo(표면 색상)를 곱해 튕겨나가는 빛의 색이 표면 색의 영향을 받도록 합니다.
    const bounced = from.directRadiance.clone().multiply(from.albedo);
    bounced.multiplyScalar(SURFEL_BOUNCE_INTENSITY * SURFEL_INDIRECT_DECAY);

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
export function sampleSurfelGIAtPosition(position: THREE.Vector3): THREE.Color {
  const result = new THREE.Color(0, 0, 0);
  let totalWeight = 0;

  for (const surfel of surfels) {
    const dist = position.distanceTo(surfel.position);
    if (dist < 4.0) {
      const weight = 1.0 / (1.0 + dist * dist);
      result.add(surfel.totalRadiance.clone().multiplyScalar(weight));
      totalWeight += weight;
    }
  }

  if (totalWeight > 0) {
    result.multiplyScalar(1.0 / totalWeight);
  }
  return result;
}

const SURFEL_GI_EMISSIVE_INTENSITY = 0.12;

export function applySurfelGIToScene(meshes: THREE.Mesh[]) {
  for (const mesh of meshes) {
    const giColor = sampleSurfelGIAtPosition(mesh.position);
    // GI 색상이 너무 강할 경우를 대비해 스케일을 살짝 낮춤
    giColor.multiplyScalar(0.45);
    
    // mesh별로 독립적인 Material을 복제(clone)해서 지니고 있으므로 각기 다른 빛을 머금을 수 있습니다.
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && mat.emissive) {
      mat.emissive.copy(giColor);
      // 간접광에 의한 밝기를 줄여 풀숲이 스스로 너무 강하게 발광하는 것을 방지
      mat.emissiveIntensity = SURFEL_GI_EMISSIVE_INTENSITY; 
    }
  }
}

export function updateSurfelGI(lightPosition: THREE.Vector3, lightColor: THREE.Color, walls: THREE.Mesh[], giMeshes: THREE.Mesh[]) {
  computeDirectRadianceForSurfels(lightPosition, lightColor, walls);
  propagateIndirectRadiance();
  updateTotalRadiance();
  applySurfelGIToScene(giMeshes);
  updateSurfelDebugObjects();
}
