import * as THREE from 'three';
import type { WallCollider } from './maze';

const PLAYER_MOVE_SPEED = 4.0;
const PLAYER_COLLIDER_RADIUS = 0.5;

let walkTime = 0;

// [Broad Phase Collision] & [Closest Point on AABB] & [Conservative Collision Testing]
export function sphereIntersectsAABB(
  sphereCenter: THREE.Vector3,
  sphereRadius: number,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3
): boolean {
  const closestX = Math.max(boxMin.x, Math.min(sphereCenter.x, boxMax.x));
  const closestY = Math.max(boxMin.y, Math.min(sphereCenter.y, boxMax.y));
  const closestZ = Math.max(boxMin.z, Math.min(sphereCenter.z, boxMax.z));

  const distanceSq = 
    (closestX - sphereCenter.x) ** 2 +
    (closestY - sphereCenter.y) ** 2 +
    (closestZ - sphereCenter.z) ** 2;

  return distanceSq < sphereRadius ** 2;
}

// [Skinned Mesh] & [Bone] & [Vertex Blending] & [Linear Blend Skinning]
// 메쉬의 정점(Vertex)들이 여러 뼈대(Bone)의 가중치(Weight)에 영향을 받아 부드럽게 변형되도록 합니다.
function createSimpleSkinnedMeshExample(): THREE.SkinnedMesh {
  // 치와와의 몸통 (작고 오동통한 원기둥)
  const geometry = new THREE.CylinderGeometry(0.18, 0.22, 0.5, 12, 2);
  
  const position = geometry.attributes.position;
  const skinIndices = [];
  const skinWeights = [];

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    // [Skin Index] & [Skin Weight]
    if (y > 0.1) {
      skinIndices.push(1, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    } else if (y < -0.1) {
      skinIndices.push(0, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    } else {
      skinIndices.push(0, 1, 0, 0);
      skinWeights.push(0.5, 0.5, 0, 0);
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  // [Skeleton]
  const lowerBone = new THREE.Bone();
  const upperBone = new THREE.Bone();
  lowerBone.position.y = -0.25;
  upperBone.position.y = 0.25;
  lowerBone.add(upperBone); // [Parent Transform] -> [Child Transform] 연결

  // 귀여운 밝은 갈색(Tan)
  const material = new THREE.MeshPhongMaterial({ color: 0xe3c69c, shininess: 10 });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const skeleton = new THREE.Skeleton([lowerBone, upperBone]);
  
  mesh.add(lowerBone);
  mesh.bind(skeleton);
  
  return mesh;
}

// [Hierarchical Modeling]
// 복잡한 캐릭터를 부모-자식 계층 구조(Joint Hierarchy)로 엮어 
// 부모 관절이 움직이면 자식 관절이 World Transform 상에서 함께 따라 움직이게 합니다.
export class Player {
  public mesh: THREE.Group; // World Transform 상의 최상위 Root
  
  public bodyJoint: THREE.Group;
  public headJoint: THREE.Group;
  public leftArmJoint: THREE.Group;
  public rightArmJoint: THREE.Group;
  public leftLegJoint: THREE.Group;
  public rightLegJoint: THREE.Group;
  public tailJoint: THREE.Group;
  public skinnedBody: THREE.SkinnedMesh;

  public isMoving: boolean = false;

  constructor(startPos: THREE.Vector3) {
    this.mesh = new THREE.Group();

    const dogMat = new THREE.MeshPhongMaterial({ color: 0xe3c69c, shininess: 10 });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 30 });
    const snoutMat = new THREE.MeshPhongMaterial({ color: 0xecd1ab, shininess: 10 });

    // Body
    this.bodyJoint = new THREE.Group();
    this.bodyJoint.position.y = 0.6; // 다리가 짧으므로 몸통 위치를 낮춤
    this.mesh.add(this.bodyJoint);

    this.skinnedBody = createSimpleSkinnedMeshExample();
    this.bodyJoint.add(this.skinnedBody);

    // Head
    this.headJoint = new THREE.Group();
    this.headJoint.position.y = 0.35; // [Local Transform] 몸통 위의 머리 관절 위치
    
    const headGroup = new THREE.Group();
    
    // 두상
    const headBase = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), dogMat);
    headGroup.add(headBase);

    // 주둥이
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), snoutMat);
    snout.position.set(0, -0.05, 0.22);
    headGroup.add(snout);

    // 코
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), darkMat);
    nose.position.set(0, 0.02, 0.32);
    headGroup.add(nose);

    // 눈 (왕방울만 한 크기)
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), darkMat);
    leftEye.position.set(-0.12, 0.1, 0.2);
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), darkMat);
    rightEye.position.set(0.12, 0.1, 0.2);
    headGroup.add(rightEye);

    // 쫑긋한 귀
    const earGeo = new THREE.ConeGeometry(0.08, 0.25, 8);
    earGeo.translate(0, 0.125, 0); // 밑단이 회전축이 되도록 이동
    const leftEar = new THREE.Mesh(earGeo, dogMat);
    leftEar.position.set(-0.15, 0.15, 0);
    leftEar.rotation.set(-0.2, 0, 0.5);
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, dogMat);
    rightEar.position.set(0.15, 0.15, 0);
    rightEar.rotation.set(-0.2, 0, -0.5);
    headGroup.add(rightEar);

    this.headJoint.add(headGroup);
    this.bodyJoint.add(this.headJoint);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.15, 4, 8);
    armGeo.translate(0, -0.1, 0); // 회전 축(Pivot)을 어깨로 이동

    this.leftArmJoint = new THREE.Group();
    this.leftArmJoint.position.set(-0.25, 0.2, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, dogMat);
    this.leftArmJoint.add(leftArmMesh);
    this.bodyJoint.add(this.leftArmJoint);

    this.rightArmJoint = new THREE.Group();
    this.rightArmJoint.position.set(0.25, 0.2, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, dogMat);
    this.rightArmJoint.add(rightArmMesh);
    this.bodyJoint.add(this.rightArmJoint);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.12, 4, 8);
    legGeo.translate(0, -0.1, 0); // 회전 축을 골반으로 이동

    this.leftLegJoint = new THREE.Group();
    this.leftLegJoint.position.set(-0.12, -0.2, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, dogMat);
    this.leftLegJoint.add(leftLegMesh);
    this.bodyJoint.add(this.leftLegJoint);

    this.rightLegJoint = new THREE.Group();
    this.rightLegJoint.position.set(0.12, -0.2, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, dogMat);
    this.rightLegJoint.add(rightLegMesh);
    this.bodyJoint.add(this.rightLegJoint);

    // Tail
    this.tailJoint = new THREE.Group();
    this.tailJoint.position.set(0, -0.15, -0.18);
    this.tailJoint.rotation.x = -0.5; // 살짝 위로 치켜든 꼬리
    const tailGeo = new THREE.CapsuleGeometry(0.03, 0.15, 4, 8);
    tailGeo.translate(0, 0.08, 0); // 꼬리 시작점을 회전축으로
    const tailMesh = new THREE.Mesh(tailGeo, dogMat);
    this.tailJoint.add(tailMesh);
    this.bodyJoint.add(this.tailJoint);

    // [Model Transform] 초기화
    this.mesh.position.copy(startPos);
  }

  getInputDirection(keys: { [key: string]: boolean }): THREE.Vector3 {
    const moveDir = new THREE.Vector3(0, 0, 0);
    if (keys['w'] || keys['ArrowUp']) moveDir.z -= 1;
    if (keys['s'] || keys['ArrowDown']) moveDir.z += 1;
    if (keys['a'] || keys['ArrowLeft']) moveDir.x -= 1;
    if (keys['d'] || keys['ArrowRight']) moveDir.x += 1;
    return moveDir;
  }

  // [Quaternion] & [SLERP]
  // 캐릭터의 전체적인 회전은 짐벌락 방지와 부드러운 보간을 위해 Quaternion 기반 SLERP를 적용합니다.
  updatePlayerRotation(moveDirection: THREE.Vector3, deltaTime: number) {
    if (moveDirection.lengthSq() === 0) return;

    const forward = new THREE.Vector3(0, 0, 1);
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
      forward,
      moveDirection.clone().normalize()
    );

    this.mesh.quaternion.slerp(targetQuaternion, 10 * deltaTime);
  }

  movePlayerWithCollision(velocity: THREE.Vector3, walls: WallCollider[]) {
    const nextPosX = this.mesh.position.clone();
    nextPosX.x += velocity.x;

    let hitX = false;
    for (const wall of walls) {
      if (sphereIntersectsAABB(nextPosX, PLAYER_COLLIDER_RADIUS, wall.min, wall.max)) {
        hitX = true; break;
      }
    }
    if (!hitX) this.mesh.position.x = nextPosX.x;

    const nextPosZ = this.mesh.position.clone();
    nextPosZ.z += velocity.z;

    let hitZ = false;
    for (const wall of walls) {
      if (sphereIntersectsAABB(nextPosZ, PLAYER_COLLIDER_RADIUS, wall.min, wall.max)) {
        hitZ = true; break;
      }
    }
    if (!hitZ) this.mesh.position.z = nextPosZ.z;
  }

  updatePlayer(deltaTime: number, keys: { [key: string]: boolean }, walls: WallCollider[]) {
    const inputDirection = this.getInputDirection(keys);

    this.isMoving = inputDirection.lengthSq() > 0;
    if (!this.isMoving) return;

    inputDirection.normalize();

    this.updatePlayerRotation(inputDirection, deltaTime);

    const velocity = inputDirection.multiplyScalar(PLAYER_MOVE_SPEED * deltaTime);
    this.movePlayerWithCollision(velocity, walls);
  }
}

// [Forward Kinematics]
// 캐릭터 전체 방향 회전은 Quaternion이지만, 관절 애니메이션은 
// 부모 계층에서 내려온 축을 기준으로 Local Joint Rotation(Euler)을 계산하여 걷기 애니메이션을 제어합니다.
export function updatePlayerAnimation(player: Player, deltaTime: number, isDancing: boolean = false) {
  if (isDancing) {
    walkTime += deltaTime * 15.0; // 빠른 비트
    
    // 제자리에서 빙글빙글 돌기
    player.mesh.rotation.y += deltaTime * 5.0; 
    
    // 콩콩 뛰기
    player.mesh.position.y = 1.0 + Math.abs(Math.sin(walkTime * 0.5)) * 0.5;

    // 팔 흔들기 (만세!)
    player.leftArmJoint.rotation.x = Math.sin(walkTime) * 1.5;
    player.leftArmJoint.rotation.z = 1.0;
    player.rightArmJoint.rotation.x = -Math.sin(walkTime) * 1.5;
    player.rightArmJoint.rotation.z = -1.0;

    // 다리는 가만히 둠
    player.leftLegJoint.rotation.x = 0;
    player.rightLegJoint.rotation.x = 0;
    
    // 머리 까딱까딱
    player.headJoint.rotation.z = Math.sin(walkTime) * 0.3;
    player.headJoint.rotation.x = Math.sin(walkTime * 2.0) * 0.2;
    
    // 꼬리 격렬하게
    player.tailJoint.rotation.y = Math.sin(walkTime * 2.0) * 0.8;
  } else if (player.isMoving) {
    player.mesh.position.y = 1.0; // 땅에 붙임

    walkTime += deltaTime * 12.0; // 다리가 짧아서 쫑쫑쫑 빨리 걷도록 속도 증가
    const swing = Math.sin(walkTime) * 0.6;
    
    // 교차 걷기 애니메이션 (팔과 다리가 반대로 움직임)
    player.leftArmJoint.rotation.x = -swing;
    player.leftArmJoint.rotation.z = 0;
    player.rightArmJoint.rotation.x = swing;
    player.rightArmJoint.rotation.z = 0;
    player.leftLegJoint.rotation.x = swing;
    player.rightLegJoint.rotation.x = -swing;
    
    // Skinned Mesh 허리 흔들기 애니메이션 (상체 Bone 회전)
    const upperBone = player.skinnedBody.skeleton.bones[1];
    upperBone.rotation.z = Math.sin(walkTime * 0.5) * 0.1;
    
    // 머리 까딱까딱 (귀여움 강조)
    player.headJoint.rotation.z = Math.sin(walkTime * 0.5) * 0.05;
    player.headJoint.rotation.x = 0;
    
    // 꼬리 살랑살랑
    player.tailJoint.rotation.y = Math.sin(walkTime * 1.5) * 0.4;
    player.tailJoint.rotation.z = Math.cos(walkTime * 1.5) * 0.2;
  } else {
    player.mesh.position.y = 1.0; // 땅에 붙임

    // 멈추면 기본 자세로 부드럽게 복귀 (LERP)
    player.leftArmJoint.rotation.x = THREE.MathUtils.lerp(player.leftArmJoint.rotation.x, 0, deltaTime * 10);
    player.leftArmJoint.rotation.z = THREE.MathUtils.lerp(player.leftArmJoint.rotation.z, 0, deltaTime * 10);
    player.rightArmJoint.rotation.x = THREE.MathUtils.lerp(player.rightArmJoint.rotation.x, 0, deltaTime * 10);
    player.rightArmJoint.rotation.z = THREE.MathUtils.lerp(player.rightArmJoint.rotation.z, 0, deltaTime * 10);
    player.leftLegJoint.rotation.x = THREE.MathUtils.lerp(player.leftLegJoint.rotation.x, 0, deltaTime * 10);
    player.rightLegJoint.rotation.x = THREE.MathUtils.lerp(player.rightLegJoint.rotation.x, 0, deltaTime * 10);

    const upperBone = player.skinnedBody.skeleton.bones[1];
    upperBone.rotation.z = THREE.MathUtils.lerp(upperBone.rotation.z, 0, deltaTime * 10);
    
    player.headJoint.rotation.z = THREE.MathUtils.lerp(player.headJoint.rotation.z, 0, deltaTime * 10);
    player.headJoint.rotation.x = THREE.MathUtils.lerp(player.headJoint.rotation.x, 0, deltaTime * 10);
    
    // 꼬리는 멈춰있어도 조금씩 살랑거림
    player.tailJoint.rotation.y = Math.sin(Date.now() * 0.005) * 0.1;
    player.tailJoint.rotation.z = 0;
  }
}
