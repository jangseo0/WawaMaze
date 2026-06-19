import * as THREE from 'three';
import { Player } from './player';

export const CameraView = {
  Quarter: 0,
  FirstPerson: 1,
  ThirdPerson: 2
} as const;

export type CameraView = typeof CameraView[keyof typeof CameraView];

export class FollowCamera {
  public camera: THREE.PerspectiveCamera;
  private offset: THREE.Vector3;
  public currentView: CameraView = CameraView.Quarter;

  constructor(aspect: number) {
    // [Projection Transform]
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.offset = new THREE.Vector3(0, 12, 10); 
  }

  toggleView() {
    this.currentView = ((this.currentView + 1) % 3) as CameraView;
  }

  // [Camera Follow & View Transform]
  updateCamera(player: Player, deltaTime: number) {
    let idealPosition = new THREE.Vector3();
    let lookTarget = new THREE.Vector3();

    if (this.currentView === CameraView.Quarter) {
      // 1. Quarter View: 플레이어를 중심으로 약간 비스듬히 내려다보는 고정 오프셋
      this.offset.set(0, 12, 10);
      idealPosition.copy(player.mesh.position).add(this.offset);
      lookTarget.copy(player.mesh.position);
    } else if (this.currentView === CameraView.FirstPerson) {
      // 2. 1인칭 View: 플레이어의 얼굴 위치에서 정면을 바라봄
      this.offset.set(0, 1.5, 0.5); // 플레이어의 눈 위치 로컬 오프셋
      const rotatedOffset = this.offset.clone().applyQuaternion(player.mesh.quaternion);
      const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(player.mesh.quaternion);
      
      idealPosition.copy(player.mesh.position).add(rotatedOffset);
      lookTarget.copy(idealPosition).add(forwardDir); // 정면 응시
    } else if (this.currentView === CameraView.ThirdPerson) {
      // 3. 3인칭 숄더 뷰: 플레이어 등 뒤에서 바라봄
      this.offset.set(0, 4, -6); // 등 뒤 로컬 오프셋
      const rotatedOffset = this.offset.clone().applyQuaternion(player.mesh.quaternion);
      
      idealPosition.copy(player.mesh.position).add(rotatedOffset);
      lookTarget.copy(player.mesh.position).add(new THREE.Vector3(0, 1.5, 0)); // 플레이어의 상체 응시
    }

    // 선형 보간(LERP)으로 부드러운 카메라 이동
    this.camera.position.lerp(idealPosition, 10 * deltaTime);
    // View Matrix 갱신
    this.camera.lookAt(lookTarget);
  }
}
