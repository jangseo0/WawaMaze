import * as THREE from 'three';

// [Albedo Map] & [Diffuse Texture]
// 표면의 기본적인 색상(반사율)을 정의합니다. 조명 계산 시 난반사(Diffuse)의 기준 색상이 됩니다.
// 외부 이미지(JPG/PNG)를 로드하는 대신 Canvas API를 활용해 절차적(Procedural)으로 텍스처를 생성합니다.
export function createProceduralAlbedoTexture(type: "wall" | "floor"): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (type === 'wall') {
    // 짙은 생울타리 (Dark Hedge Wall / Dense Bush)
    ctx.fillStyle = '#1a2e1a'; // 아주 어둡고 짙은 녹색 베이스
    ctx.fillRect(0, 0, 256, 256);
    
    // 수많은 잎사귀 패턴 겹쳐 그리기 (울퉁불퉁한 덤불 형태)
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const radius = Math.random() * 10 + 5;
      
      // 어두운 초록, 청록, 올리브 혼합으로 자연스러운 명도 차이 생성
      const r = Math.floor(10 + Math.random() * 30);
      const g = Math.floor(40 + Math.random() * 60); 
      const b = Math.floor(20 + Math.random() * 30);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // 잎사귀의 음영/볼륨감을 위한 미세한 테두리
      ctx.strokeStyle = `rgba(5, 15, 5, 0.6)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    // 어둡고 축축한 숲길 / 눌린 풀 (Dark Damp Forest Path)
    ctx.fillStyle = '#263321'; // 흙과 풀이 섞인 어두운 올리브/갈색 톤
    ctx.fillRect(0, 0, 256, 256);
    
    // 짓밟힌 잔디와 흙이 섞인 평평한 바닥 느낌
    ctx.lineWidth = 2;
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      
      const isDark = Math.random() > 0.5;
      ctx.strokeStyle = isDark ? '#1d2618' : '#324a27'; // 어두운 흙색 or 탁한 잔디색
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      // 길 바닥이므로 잎사귀가 높게 자라지 않고 바닥에 납작하게 깔린 느낌(가로/대각선 위주 짧은 선)
      ctx.lineTo(x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 5);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  // [Color Space] 감마 보정
  // sRGB 색 공간임을 명시하여, 조명 계산 후 어두운 영역의 색감이 완전히 죽지 않고 본연의 톤을 유지하게 합니다.
  if ('SRGBColorSpace' in THREE) {
    texture.colorSpace = (THREE as any).SRGBColorSpace;
  } else {
    (texture as any).encoding = 3001; 
  }
  
  return texture;
}

// [Normal Map] & [Tangent Space Normal]
// 표면 디테일을 폴리곤 증가 없이 표현하는 방식입니다. 텍스처 픽셀(Texel)마다 방향(Normal) 벡터를 지정해 
// 빛이 반사되는 각도를 조작, 표면이 울퉁불퉁한 것처럼 착각하게 만듭니다.
export function createProceduralNormalTexture(type: "wall" | "floor"): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#8080FF'; // 평평한 Normal (0, 0, 1) -> RGB(128, 128, 255)
  ctx.fillRect(0, 0, 256, 256);

  const imgData = ctx.getImageData(0, 0, 256, 256);
  // 벽(잎사귀 덩어리)은 빛을 난반사하도록 매우 거칠게, 바닥(눌린 풀)은 상대적으로 덜 거칠게 노이즈 적용
  const noiseStrength = type === 'wall' ? 80.0 : 40.0; 
  
  for (let i = 0; i < imgData.data.length; i += 4) {
     const noiseX = Math.random() * noiseStrength - (noiseStrength / 2);
     const noiseY = Math.random() * noiseStrength - (noiseStrength / 2);
     imgData.data[i] = 128 + noiseX;     // R (Tangent X)
     imgData.data[i+1] = 128 + noiseY;   // G (Tangent Y)
     imgData.data[i+2] = 255;            // B (Tangent Z)
     imgData.data[i+3] = 255;            // Alpha
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// [Roughness]
// 표면의 거칠기를 의미합니다. 값이 높을수록 스페큘러(Specular) 반사가 넓고 흐려집니다.
export function createMaterials() {
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: createProceduralAlbedoTexture('wall'),
    normalMap: createProceduralNormalTexture('wall'),
    roughness: 0.85, // 축축한 숲이지만 잎이 많아 빛이 넓게 흩어짐
    metalness: 0.0,
  });

  const floorMaterial = new THREE.MeshStandardMaterial({
    map: createProceduralAlbedoTexture('floor'),
    normalMap: createProceduralNormalTexture('floor'),
    roughness: 0.9, // 진흙과 풀이 섞인 매우 거친 바닥
    metalness: 0.0,
  });

  return { wallMaterial, floorMaterial };
}
