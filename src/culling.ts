import * as THREE from 'three';

type CullingObject = {
  mesh: THREE.Object3D;
  center: THREE.Vector3;
  radius: number;
  culled: boolean;
  debugSphere?: THREE.Mesh;
};

const cullingObjects: CullingObject[] = [];
let debugCulling = false;

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'c') {
    debugCulling = !debugCulling;
  }
});

function createCullingDebugSphere(radius: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
  return new THREE.Mesh(geo, mat);
}

export function registerCullingObject(
  mesh: THREE.Object3D,
  center: THREE.Vector3,
  radius: number,
  scene: THREE.Scene
) {
  const debugSphere = createCullingDebugSphere(radius);
  debugSphere.position.copy(center);
  debugSphere.visible = false;
  scene.add(debugSphere);

  cullingObjects.push({
    mesh,
    center,
    radius,
    culled: false,
    debugSphere
  });
}

// [View-Projection Matrix] & [Clip Space] & [NDC] & [Perspective Divide]
function isSphereInFrustumNDC(
  centerWorld: THREE.Vector3,
  radiusWorld: number,
  camera: THREE.Camera
): boolean {
  // 1. 카메라의 View 행렬과 Projection 행렬을 곱하여 View-Projection Matrix를 생성
  const viewProjectionMatrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );

  // 2. Bounding Sphere의 중심점을 World Space에서 Clip Space로 변환
  const centerClip = new THREE.Vector4(
    centerWorld.x,
    centerWorld.y,
    centerWorld.z,
    1.0
  ).applyMatrix4(viewProjectionMatrix);

  // w값이 0 이하면 카메라 뒤쪽이므로 Culling 대상
  if (centerClip.w <= 0) return false;

  // 3. Perspective Divide를 통해 클립 좌표를 NDC(Normalized Device Coordinates)로 변환
  const ndcX = centerClip.x / centerClip.w;
  const ndcY = centerClip.y / centerClip.w;
  const ndcZ = centerClip.z / centerClip.w;

  // 4. NDC 범위를 검사 (시야 절두체 내부에 있는지 확인)
  // 구의 반지름을 고려한 마진(margin) 적용 (Conservative margin)
  const margin = radiusWorld * 0.15; 

  if (ndcX < -1 - margin || ndcX > 1 + margin) return false;
  if (ndcY < -1 - margin || ndcY > 1 + margin) return false;
  if (ndcZ < -1 - margin || ndcZ > 1 + margin) return false;

  return true;
}

// [View Frustum Culling] 업데이트 함수
export function updateFrustumCulling(camera: THREE.Camera) {
  for (const obj of cullingObjects) {
    // 코인은 획득 시 완전히 숨겨지므로 Culling 대상에서 스킵
    if (obj.mesh.userData?.isCoin && obj.mesh.userData?.collected) {
      obj.mesh.visible = false;
      if (obj.debugSphere) obj.debugSphere.visible = false;
      continue;
    }

    const visible = isSphereInFrustumNDC(obj.center, obj.radius, camera);

    obj.culled = !visible;
    obj.mesh.visible = visible;

    if (obj.debugSphere) {
      obj.debugSphere.visible = debugCulling;
      // @ts-ignore
      obj.debugSphere.material.color.set(visible ? 0x00ff00 : 0xff0000);
    }
  }
}
