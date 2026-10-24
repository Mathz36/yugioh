import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createHybridRenderer,
  disposeSceneResources,
  RendererBackendType,
} from './webgpuCore';
import {
  createCardBackTexture,
  createCardFaceTexture,
  getCardFramePalette,
} from './cardTextureGenerator';

export interface Card3DShowcaseProps {
  card?: {
    id?: string;
    name?: string;
    namePt?: string;
    type?: string;
    level?: number;
    attack?: number;
    defense?: number;
    imageUrl?: string;
  };
  isBack?: boolean;
  languagePt?: boolean;
  className?: string;
}

export const Card3DShowcase: React.FC<Card3DShowcaseProps> = ({
  card,
  isBack = false,
  languagePt = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [backend, setBackend] = useState<RendererBackendType>('WebGL2');

  const cardMeshRef = useRef<THREE.Mesh | null>(null);
  const auraRingRef = useRef<THREE.Mesh | null>(null);
  const auraLightRef = useRef<THREE.PointLight | null>(null);
  const targetTiltRef = useRef<{ rx: number; ry: number }>({ rx: 0, ry: 0 });

  const effectiveCard = card || { name: 'Card', type: 'Normal' };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isMounted = true;
    let isRendererReady = false;
    let animationFrameId: number | null = null;
    let activeRenderer: any = null;

    const width = container.clientWidth || 200;
    const height = container.clientHeight || 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 0, 4.85);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    keyLight.position.set(2.5, 3.5, 4.5);
    scene.add(keyLight);

    const auraLight = new THREE.PointLight(0xfbbf24, 2.5, 10);
    auraLight.position.set(-2, -1.5, 3);
    scene.add(auraLight);
    auraLightRef.current = auraLight;

    // 3D Card Mesh (Standing upright in XY plane for showcase inspection — Unlit natural colors, zero glare)
    const cardGeom = new THREE.BoxGeometry(2.15, 3.12, 0.045);
    const sideMat = new THREE.MeshBasicMaterial({
      color: 0x1c1917,
    });
    const frontTex = isBack
      ? createCardBackTexture()
      : createCardFaceTexture(effectiveCard, languagePt);
    const backTex = createCardBackTexture();

    const frontMat = new THREE.MeshBasicMaterial({
      map: frontTex,
    });
    const backMat = new THREE.MeshBasicMaterial({
      map: backTex,
    });

    const materials = [
      sideMat,
      sideMat,
      sideMat,
      sideMat,
      frontMat, // +Z face towards camera
      backMat,  // -Z face
    ];

    const cardMesh = new THREE.Mesh(cardGeom, materials);
    scene.add(cardMesh);
    cardMeshRef.current = cardMesh;

    createHybridRenderer({ antialias: true, alpha: true })
      .then(({ renderer, backend: resolvedBackend }) => {
        if (!isMounted || !container) {
          disposeSceneResources(scene, renderer);
          return;
        }
        activeRenderer = renderer;
        setBackend(resolvedBackend);
        if (typeof renderer.setSize === 'function') {
          renderer.setSize(container.clientWidth || width, container.clientHeight || height);
        }
        if (typeof renderer.setPixelRatio === 'function') {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        }
        container.innerHTML = '';
        if (renderer.domElement && renderer.domElement instanceof Node) {
          container.appendChild(renderer.domElement);
        }
        isRendererReady = true;
      })
      .catch(() => {});

    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();

      if (cardMeshRef.current) {
        const idleY = Math.sin(elapsed * 1.6) * 0.14;
        const idleX = Math.cos(elapsed * 1.2) * 0.05;
        const targetY = targetTiltRef.current.ry + idleY;
        const targetX = targetTiltRef.current.rx + idleX;

        cardMeshRef.current.rotation.y += (targetY - cardMeshRef.current.rotation.y) * 0.12;
        cardMeshRef.current.rotation.x += (targetX - cardMeshRef.current.rotation.x) * 0.12;
      }

      if (auraRingRef.current) {
        auraRingRef.current.rotation.z = elapsed * 0.4;
      }

      if (isRendererReady && activeRenderer) {
        try {
          activeRenderer.render(scene, camera);
        } catch {}
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { width: w, height: h } = entry.contentRect;
              if (w > 0 && h > 0) {
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                if (isRendererReady && activeRenderer && typeof activeRenderer.setSize === 'function') {
                  activeRenderer.setSize(w, h);
                }
              }
            }
          })
        : null;

    if (resizeObserver) {
      resizeObserver.observe(container);
    }

    return () => {
      isMounted = false;
      isRendererReady = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      disposeSceneResources(scene, activeRenderer);
      if (container) container.innerHTML = '';
    };
  }, []);

  // Update card face texture & palette aura when inspected card changes
  useEffect(() => {
    const mesh = cardMeshRef.current;
    if (!mesh) return;

    const materials = mesh.material as THREE.MeshBasicMaterial[];
    const frontMat = materials[4];
    if (frontMat) {
      if (frontMat.map) {
        frontMat.map.dispose();
      }
      frontMat.map = isBack
        ? createCardBackTexture()
        : createCardFaceTexture(effectiveCard, languagePt);
      frontMat.needsUpdate = true;
    }

    const palette = isBack
      ? { border: 0x854d0e, glow: 0xb45309 }
      : getCardFramePalette(effectiveCard.type || 'Normal');
    if (auraRingRef.current) {
      ((auraRingRef.current.material as THREE.MeshBasicMaterial).color as THREE.Color).set(
        palette.border
      );
    }
    if (auraLightRef.current) {
      auraLightRef.current.color.set(palette.border);
    }
  }, [
    isBack,
    effectiveCard.id,
    effectiveCard.name,
    effectiveCard.namePt,
    effectiveCard.type,
    effectiveCard.level,
    effectiveCard.attack,
    effectiveCard.defense,
    effectiveCard.imageUrl,
    languagePt,
  ]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    targetTiltRef.current = {
      rx: -ny * 0.35,
      ry: nx * 0.48,
    };
  };

  const handlePointerLeave = () => {
    targetTiltRef.current = { rx: 0, ry: 0 };
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative overflow-hidden rounded-lg border border-stone-700/80 bg-gradient-to-b from-[#171513] via-[#100e0d] to-[#0a0908] shadow-inner select-none cursor-grab active:cursor-grabbing ${className}`}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
