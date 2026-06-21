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
        // Make the coin glow brightly
        const coinMaterial = new THREE.MeshPhongMaterial({ 
          color: 0xffd700,
          emissive: 0xffaa00,
          emissiveIntensity: 1.5
        });
        const coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
        
        // Raise the coin higher so walls don't block it as much
        coinMesh.rotation.x = Math.PI / 2;
        coinMesh.position.set(posX, 1.8, posZ);
        coinMesh.userData.isCoin = true;
        coinMesh.userData.collected = false;

        // Attach a PointLight to the coin so it casts light on surrounding walls
        const coinLight = new THREE.PointLight(0xffd700, 4.0, 9.0);
        coinLight.position.set(0, 0, 0); // Relative to coin mesh
        coinMesh.add(coinLight);

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

  createOuterGround(scene);

  return { playerStartPos, coins, walls, exitZone };
}

function createProceduralStoneAlbedoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2f3230';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = Math.random() * 12 + 2;
    
    const type = Math.random();
    if (type < 0.4) {
      ctx.fillStyle = '#1d201f';
    } else if (type < 0.8) {
      ctx.fillStyle = '#454946';
    } else {
      ctx.fillStyle = '#2f3f32'; // 이끼 색상
    }
    
    ctx.globalAlpha = Math.random() * 0.4 + 0.1;
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  return texture;
}

function createProceduralStoneNormalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = Math.random() * 6 + 1;
    
    const r = Math.floor(Math.random() * 60 + 98);
    const g = Math.floor(Math.random() * 60 + 98);
    
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.globalAlpha = Math.random() * 0.5 + 0.2;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  return texture;
}

function createOuterStoneMaterial(): THREE.MeshStandardMaterial {
  const albedoMap = createProceduralStoneAlbedoTexture();
  const normalMap = createProceduralStoneNormalTexture();
  
  return new THREE.MeshStandardMaterial({
    map: albedoMap,
    normalMap: normalMap,
    roughness: 0.9,
    metalness: 0.0,
  });
}

function createOuterGround(scene: THREE.Scene): void {
  const OUTER_GROUND_PADDING_TILES = 6;
  const OUTER_GROUND_Y = -0.03;

  const mazeWidth = mazeMap[0].length * TILE_SIZE;
  const mazeDepth = mazeMap.length * TILE_SIZE;

  const outerGroundWidth = mazeWidth + OUTER_GROUND_PADDING_TILES * TILE_SIZE * 2;
  const outerGroundDepth = mazeDepth + OUTER_GROUND_PADDING_TILES * TILE_SIZE * 2;

  const outerGroundGeometry = new THREE.PlaneGeometry(outerGroundWidth, outerGroundDepth);
  outerGroundGeometry.rotateX(-Math.PI / 2);

  const outerStoneMaterial = createOuterStoneMaterial();

  // [미로 내부와 외부 공간 구분]
  // 미로 내부는 기존 floor tile(풀길)을 쓰고, 바깥쪽은 이 outerGround(어두운 돌바닥)가 채웁니다.
  // outerGround는 World Space에 넓게 깔리는 커다란 background plane입니다.
  // 
  // [텍스처 생성 원리]
  // Albedo Map은 표면의 기본 색과 이끼를 표현하고, Normal Map은 추가 폴리곤 없이 빛의 반사 방향만 
  // 왜곡시켜 돌바닥의 거친 요철이나 틈새를 표현(Bump)합니다.
  // 
  // [Culling 최적화 제외]
  // 배경이므로 시야에 걸칠 때마다 생성/삭제 비용을 아끼기 위해 frustumCulled = false 처리하며,
  // Surfel GI나 충돌 판정 객체 리스트에도 포함시키지 않습니다.
  const outerGround = new THREE.Mesh(outerGroundGeometry, outerStoneMaterial);
  outerGround.position.set(0, OUTER_GROUND_Y, 0);
  outerGround.receiveShadow = true;
  outerGround.frustumCulled = false;
  scene.add(outerGround);
}
