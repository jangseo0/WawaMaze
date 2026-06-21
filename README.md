# 컴퓨터그래픽스 최종 과제 리포트: WawaMaze


## 1. 게임 기획 
- WawaMaze는 어두운 미로 속에서 치와와가 길을 잃지 않고 빛나는 코인을 찾아 탈출하는 3D 탐험 게임입니다.
- 게임 목표: 플레이어는 치와와를 조작하여 맵 곳곳에 숨겨진 코인을 찾고 최종적으로 초록색 출구에 도달하여 미로를 탈출해야 합니다.
- 핵심 메커니즘: 기본적으로 미로는 어두운 안개로 덮여 있어 시야가 제한됩니다. 코인을 획득하면 일시적으로 시야가 확 트이며 맵 전체의 구조를 파악할 수 있는 기회가 주어집니다.
- 조작과 환경: `WASD` 또는 방향키로 이동하며, 치와와의 머리에 달린 헤드램프에 의지해 미로의 벽과 바닥에 반사되는 실시간 간접광(Surfel GI)을 체감할 수 있습니다.


## 2. 개발 상세 설명

### 2.1 미로 맵 렌더링 및 충돌 처리
- Procedural Map: 2차원 배열 데이터를 파싱하여 3D 박스(벽)와 평면(바닥) 타일들을 생성합니다.
- Bounding Volume Collision: 치와와의 위치를 중심으로 한 `Bounding Sphere`와 벽/코인의 `AABB` (Axis-Aligned Bounding Box) 기반 충돌 판정을 직접 구현하여 벽을 통과하지 못하게 처리했습니다.
<img width="1219" height="695" alt="스크린샷 2026-06-21 18 24 30" src="https://github.com/user-attachments/assets/10e23d6e-203d-4c85-84df-f2c18d9b5f92" />


### 2.2 캐릭터 애니메이션 및 조작
- `GLTFLoader`를 통해 치와와 `.glb` 모델을 불러오고, `AnimationMixer`를 활용해 이동 시에만 걷기 애니메이션이 재생되도록 구현했습니다. 카메라가 부드럽게 플레이어를 따라다니는 Follow Camera 로직이 적용되어 있습니다.
<img width="1219" height="695" alt="스크린샷 2026-06-21 18 28 49" src="https://github.com/user-attachments/assets/9605d94c-0623-4101-b734-e2ee75523500" />


### 2.3 View Frustum Culling
- 보이지 않는 객체까지 렌더링하는 낭비를 막기 위해 **View Frustum Culling**을 구현했습니다. 카메라의 `View-Projection Matrix`를 구해 각 객체의 중심 좌표를 Clip Space와 NDC로 변환한 뒤, 카메라 시야 범위 밖으로 벗어난 메쉬의 `visible` 속성을 `false`로 꺼서 성능을 극대화했습니다.

```
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
  // 구의 반지름을 고려한 보수적 마진(margin) 적용
  const margin = radiusWorld * 0.15; 

  if (ndcX < -1 - margin || ndcX > 1 + margin) return false;
  if (ndcY < -1 - margin || ndcY > 1 + margin) return false;
  if (ndcZ < -1 - margin || ndcZ > 1 + margin) return false;

  return true;
}
```
<img width="1219" height="695" alt="스크린샷 2026-06-21 18 33 01" src="https://github.com/user-attachments/assets/a467ee90-2e70-42ae-9df1-feab4a071617" />


## 3. 강의 내용과 구현 내용 매핑

### 3.1 Transformation
- 치와와의 이동 방향(Vector)을 계산하고, 짐벌락 방지와 부드러운 구면 선형 보간 회전을 위해 쿼터니언의 `slerp`를 사용해 회전을 처리했습니다.
```
updatePlayerRotation(moveDirection: THREE.Vector3, deltaTime: number) {
  if (moveDirection.lengthSq() === 0) return;

  const forward = new THREE.Vector3(0, 0, 1);
  const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
    forward,
    moveDirection.clone().normalize()
  );

  // slerp를 활용해 목표 회전값으로 부드럽게 구면 보간
  this.mesh.quaternion.slerp(targetQuaternion, 10 * deltaTime);
}
```
### 3.2 Viewing & Projection:
- `THREE.PerspectiveCamera`를 사용해 원근감이 있는 3차원 투영을 구현했으며, Frustum Culling 연산 시 수식적으로 View 변환과 Projection 변환의 원리를 응용했습니다.

### 3.3 Lighting & Shading:
- `AmbientLight`로 기본 환경광을 깔고, 치와와의 머리 위치(headJoint)에 `PointLight`(헤드램프)를 부착하여 물리 기반 렌더링 재질(`MeshStandardMaterial`)과 상호작용하도록 구성했습니다.

### 3.4 Texture Mapping:
- 벽과 바닥 텍스처에 기본 색상(Albedo)뿐만 아니라 Normal Map을 적용하여, 폴리곤 수를 늘리지 않고도 빛의 각도에 따라 입체감과 거친 질감이 느껴지도록 구현했습니다.

<img width="1219" height="695" alt="스크린샷 2026-06-21 18 41 02" src="https://github.com/user-attachments/assets/d296c322-c726-49ca-9c3f-336ca3bf8dff" />

## 4. GI 적용 : SurfelGI
### 4.1 Surfel GI의 핵심 구조
- Surfel 생성 (`generateSurfelsFromMaze`): 게임 시작 시 미로의 모든 벽면과 바닥 표면을 일정 간격으로 샘플링하여, Surfel 포인트들을 생성합니다.
- 이웃 그래프 (`buildSurfelNeighbors`): 각 Surfel 반경 내에 있는 다른 Surfel들을 이웃으로 묶어, 빛이 전달될 수 있는 네트워크를 구성합니다.


### 4.2 실시간 빛의 반사 (Bounce) 연산
매 렌더링 프레임(`updateSurfelGI`)마다 아래 연산들이 일어납니다.
- Direct Radiance: 치와와의 헤드램프에서 각 Surfel까지의 거리를 계산하여 빛을 얼마나 직접 받는지 계산합니다.
- Indirect Radiance: 빛을 직접 받은 Surfel들이 미리 묶어둔 이웃 Surfel들에게 빛을 전달하여, 빛이 벽에 부딪혀 바닥으로 번지는 간접광을 시뮬레이션합니다.
- 버텍스 컬러 반영: 계산된 빛의 총합(Radiance)을 톤매핑한 뒤, 벽과 바닥 메쉬의 `Vertex Colors`에 실시간으로 업데이트합니다.

```
// 1. 직접광 계산 (Shadow Ray를 통한 차폐 판정, 람베르트 반사 및 거리 감쇠 적용)
function computeDirectRadianceForSurfels(lightPosition: THREE.Vector3, lightColor: THREE.Color, walls: THREE.Mesh[]) {
  for (const surfel of surfels) {
    const toLight = lightPosition.clone().sub(surfel.position);
    const distance = toLight.length();
    if (distance > SURFEL_DIRECT_LIGHT_RADIUS) {
      surfel.directRadiance.setRGB(0, 0, 0);
      continue;
    }
    // Shadow Ray 연산: 광원과 Surfel 사이에 장애물이 있는지 체크하여 차폐(Shadowing) 판정
    if (isOccludedByWall(lightPosition, surfel.position, walls)) {
      surfel.directRadiance.setRGB(0, 0, 0);
      continue;
    }
    const lightDir = toLight.normalize();
    // N dot L (Lambertian Reflection) 계산
    const nDotL = Math.max(0, surfel.normal.dot(lightDir));
    // 거리 감쇠 (Distance Attenuation)
    const distanceFalloff = 1.0 / (1.0 + distance * distance * 0.15);
    const intensity = SURFEL_DIRECT_INTENSITY * nDotL * distanceFalloff;
    surfel.directRadiance.copy(lightColor).multiplyScalar(intensity);
  }
}
// 2. 간접광 전파 (1-Bounce Light Propagation)
function propagateIndirectRadiance() {
  for (const surfel of surfels) {
    surfel.indirectRadiance.setRGB(0, 0, 0);
  }
  for (let i = 0; i < surfels.length; i++) {
    const from = surfels[i];
    // 직접광이 비춰지지 않는 서펠은 패스
    if (from.directRadiance.r === 0 && from.directRadiance.g === 0 && from.directRadiance.b === 0) continue;
    // Albedo(반사율)와 Bounce 계수를 곱해 반사광의 강도/색상을 결정
    const bounced = from.directRadiance.clone().multiply(from.albedo).multiplyScalar(SURFEL_BOUNCE_INTENSITY);
    for (const neighborIndex of from.neighbors) {
      const to = surfels[neighborIndex];
      const direction = to.position.clone().sub(from.position);
      const distance = direction.length();
      direction.normalize();
      // 인접 서펠(to)의 법선이 빛이 튕겨 나오는 방향을 향하는지 판별 (N dot L)
      const normalFactor = Math.max(0, to.normal.dot(direction.clone().negate()));
      const falloff = 1.0 / (1.0 + distance * distance * 0.25);
      const contribution = bounced.clone().multiplyScalar(normalFactor * falloff);
      to.indirectRadiance.add(contribution);
    }
  }
}
// 3. 임의 지점의 GI 샘플링 (가까운 Surfel들의 빛의 가중 평균)
function sampleSurfelGIAtPosition(position: THREE.Vector3): THREE.Color {
  const result = new THREE.Color(0, 0, 0);
  let totalWeight = 0;
  for (const surfel of surfels) {
    const distance = position.distanceTo(surfel.position);
    if (distance > SURFEL_GI_SAMPLE_RADIUS) continue;
    // 거리가 가까울수록 기여도가 커지도록 거리의 역제곱 형태로 가중치 산출
    const weight = 1.0 / (0.35 + distance * distance);
    const giColor = getDisplayGIColor(surfel);
    result.add(giColor.multiplyScalar(weight));
    totalWeight += weight;
  }
  if (totalWeight > 0) {
    result.multiplyScalar(1 / totalWeight);
  }
  result.copy(softToneMapColor(result));
  return clampColor(result, SURFEL_GI_MAX_COLOR);
}
```

### 4.3 결과 비교
Surfel GI가 적용됨에 따라 치와와가 벽에 다가갈 때 벽에 부딪힌 빛이 바닥으로 퍼지는 그래픽 효과가 연출됩니다.

[SurfelGI OFF]
<img width="1219" height="695" alt="스크린샷 2026-06-21 20 15 50" src="https://github.com/user-attachments/assets/92b237ed-0f34-4663-901e-cbce51b07eac" />

[SurfelGI ON]
<img width="1219" height="695" alt="스크린샷 2026-06-21 20 16 29" src="https://github.com/user-attachments/assets/91a55200-9680-4574-a32d-9a53e1ad69e5" />


[Surfel Points]
<img width="1219" height="695" alt="스크린샷 2026-06-21 20 17 04" src="https://github.com/user-attachments/assets/1d391977-d6d5-4937-b7bd-366b1a741358" />


