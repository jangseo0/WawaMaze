import * as THREE from 'three';
import { createMaterials } from './materials';
import { registerCullingObject } from './culling';

// 0: 길
// 1: 벽
// 2: 코인
// P: 플레이어 시작 위치
// E: 출구
export const mazeMap = [
  "111111111111111111111",
  "1P0001000000002000001",
  "101110101111111011101",
  "100010100020001000101",
  "111010111011101110101",
  "100010002010001000101",
  "101111101010111011101",
  "100000101010100010201",
  "101110101110101110111",
  "102010000000100000001",
  "101011111011111111101",
  "111111000010200000101",
  "100001111110111110101",
  "100200000000100010201",
  "100001101111101010111",
  "111111100020001010001",
  "101111111011111011101",
  "1000002000100000000E1",
  "111111111111111111111",
];

export const TILE_SIZE = 2;
export const WALL_HEIGHT = 3;

export type WallCollider = {
  min: THREE.Vector3;
  max: THREE.Vector3;
  mesh: THREE.Mesh;
};

export type Coin = {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
  collected: boolean;
};

export type ExitZone = {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
};

// [Map Space -> World Space Transform]
// 2D 배열의 인덱스 좌표(Map Space)를 3D 공간의 실제 좌표(World Space)로 변환합니다.
// 맵의 중앙이 World Space의 원점(0,0,0)에 오도록 offset을 계산하여 빼줍니다.
// Model Transform의 초기 위치를 잡아주는 핵심 함수입니다.
export function mapToWorld(row: number, col: number): THREE.Vector3 {
  const offsetX = (mazeMap[0].length - 1) * TILE_SIZE * 0.5;
  const offsetZ = (mazeMap.length - 1) * TILE_SIZE * 0.5;

  return new THREE.Vector3(
    col * TILE_SIZE - offsetX,
    0,
    row * TILE_SIZE - offsetZ
  );
}

export function isWalkableMapChar(char: string): boolean {
  return char === '0' || char === '2' || char === 'P' || char === 'E';
}

export function findTilePosition(mazeMap: string[], target: string): { row: number; col: number } | null {
  for (let r = 0; r < mazeMap.length; r++) {
    for (let c = 0; c < mazeMap[r].length; c++) {
      if (mazeMap[r][c] === target) return { row: r, col: c };
    }
  }
  return null;
}

// [Conservative Collision Testing & Path Validation]
// DFS/BFS를 사용해 플레이어(P)가 출구(E)까지 도달 가능한지 논리적으로 사전 검증합니다.
export function validateMazePath(mazeMap: string[]): boolean {
  const start = findTilePosition(mazeMap, 'P');
  const end = findTilePosition(mazeMap, 'E');
  
  if (!start || !end) return false;

  const visited: boolean[][] = Array.from({ length: mazeMap.length }, () => Array(mazeMap[0].length).fill(false));
  const queue = [{ row: start.row, col: start.col }];
  visited[start.row][start.col] = true;

  const dr = [-1, 1, 0, 0];
  const dc = [0, 0, -1, 1];

  while (queue.length > 0) {
    const { row, col } = queue.shift()!;
    if (row === end.row && col === end.col) return true;

    for (let i = 0; i < 4; i++) {
      const nr = row + dr[i];
      const nc = col + dc[i];

      if (nr >= 0 && nr < mazeMap.length && nc >= 0 && nc < mazeMap[0].length) {
        if (!visited[nr][nc] && isWalkableMapChar(mazeMap[nr][nc])) {
          visited[nr][nc] = true;
          queue.push({ row: nr, col: nc });
        }
      }
    }
  }

  return false;
}

export const sceneMeshesForGI: THREE.Mesh[] = [];
export const wallMeshesForRaycast: THREE.Mesh[] = [];

export function createMazeFromMap(scene: THREE.Scene): { playerStartPos: THREE.Vector3, coins: Coin[], walls: WallCollider[], exitZone: ExitZone | null } {
  let playerStartPos = new THREE.Vector3(0, 0, 0);
  const coins: Coin[] = [];
  const walls: WallCollider[] = [];
  let exitZone: ExitZone | null = null;
  
  const { wallMaterial, floorMaterial } = createMaterials();
  const wallGeometry = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
  const floorGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

  for (let z = 0; z < mazeMap.length; z++) {
    for (let x = 0; x < mazeMap[z].length; x++) {
      const cell = mazeMap[z][x];
      const worldPos = mapToWorld(z, x);
      const posX = worldPos.x;
      const posZ = worldPos.z;

      const floorMat = floorMaterial.clone(); 
      const floorTile = new THREE.Mesh(floorGeometry, floorMat);
      floorTile.rotation.x = -Math.PI / 2;
      floorTile.position.set(posX, 0, posZ);
      scene.add(floorTile);
      sceneMeshesForGI.push(floorTile);
      
      const floorRadius = Math.sqrt((TILE_SIZE/2)**2 + (TILE_SIZE/2)**2);
      // [View Frustum Culling]
      registerCullingObject(floorTile, floorTile.position.clone(), floorRadius, scene);

      if (cell === '1') {
        const wallMat = wallMaterial.clone(); 
        const wall = new THREE.Mesh(wallGeometry, wallMat);
        wall.position.set(posX, WALL_HEIGHT / 2, posZ);
        scene.add(wall);
        sceneMeshesForGI.push(wall);
        wallMeshesForRaycast.push(wall);

        const halfSize = TILE_SIZE / 2;
        // [AABB Collider]
        walls.push({
          mesh: wall,
          min: new THREE.Vector3(posX - halfSize, 0, posZ - halfSize),
          max: new THREE.Vector3(posX + halfSize, WALL_HEIGHT, posZ + halfSize)
        });

        const wallRadius = Math.sqrt((TILE_SIZE/2)**2 + (WALL_HEIGHT/2)**2 + (TILE_SIZE/2)**2);
        registerCullingObject(wall, wall.position.clone(), wallRadius, scene);

      } else if (cell === 'P') {
        playerStartPos.set(posX, 1, posZ);
      } else if (cell === '2') {
        const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
        const coinMaterial = new THREE.MeshPhongMaterial({ color: 0xffd700 });
        const coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
        
        coinMesh.rotation.x = Math.PI / 2;
        coinMesh.position.set(posX, 0.8, posZ);
        coinMesh.userData.isCoin = true;
        coinMesh.userData.collected = false;
        scene.add(coinMesh);

        // [Bounding Volume] Bounding Sphere
        coins.push({
          mesh: coinMesh,
          center: coinMesh.position.clone(),
          radius: 0.6,
          collected: false
        });

        registerCullingObject(coinMesh, coinMesh.position.clone(), 0.6, scene);
      } else if (cell === 'E') {
        const exitGeo = new THREE.BoxGeometry(1.5, 0.2, 1.5);
        const exitMat = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });
        const exitMesh = new THREE.Mesh(exitGeo, exitMat);
        exitMesh.position.set(posX, 0.1, posZ);
        scene.add(exitMesh);

        exitZone = {
          mesh: exitMesh,
          center: exitMesh.position.clone(),
          radius: 1.0
        };
        registerCullingObject(exitMesh, exitMesh.position.clone(), 1.0, scene);
      }
    }
  }

  return { playerStartPos, coins, walls, exitZone };
}
