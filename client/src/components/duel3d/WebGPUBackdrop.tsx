import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createHybridRenderer,
  disposeSceneResources,
  RendererBackendType,
} from './webgpuCore';

export interface WebGPUBackdropProps {
  variant?: 'auth' | 'menu' | 'deck';
  videoSrc?: string;
  className?: string;
  showBadge?: boolean;
}

export const WebGPUBackdrop: React.FC<WebGPUBackdropProps> = ({
  variant = 'menu',
  videoSrc,
  className = '',
  showBadge = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [backend, setBackend] = useState<RendererBackendType>('WebGL2');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isMounted = true;
    let isRendererReady = false;
    let animationFrameId: number | null = null;
    let activeRenderer: any = null;
    let videoElement: HTMLVideoElement | null = null;
    let videoTexture: THREE.VideoTexture | null = null;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    // Ambient and gold/purple point lights
    const ambientLight = new THREE.AmbientLight(0xd8b4fe, 0.95);
    scene.add(ambientLight);

    const goldLight = new THREE.PointLight(0xf59e0b, 3.2, 25);
    goldLight.position.set(4, 3, 5);
    scene.add(goldLight);

    const purpleLight = new THREE.PointLight(0x9333ea, 2.8, 25);
    purpleLight.position.set(-4, -3, 4);
    scene.add(purpleLight);

    // 3D Video Texture Plane inside the WebGPU/Three.js Scene (for Menu or custom videoSrc)
    const shouldRenderVideoPlane =
      typeof document !== 'undefined' && (variant === 'menu' || Boolean(videoSrc));

    if (shouldRenderVideoPlane) {
      try {
        const video = document.createElement('video');
        video.src = videoSrc || '/video/banner.mp4';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.play().catch(() => {});
        videoElement = video;

        const vTex = new THREE.VideoTexture(video);
        vTex.colorSpace = THREE.SRGBColorSpace;
        videoTexture = vTex;

        const videoPlaneGeom = new THREE.PlaneGeometry(25, 14);
        const videoPlaneMat = new THREE.MeshBasicMaterial({
          map: vTex,
          transparent: true,
          opacity: 0.95,
        });
        const videoPlaneMesh = new THREE.Mesh(videoPlaneGeom, videoPlaneMat);
        videoPlaneMesh.position.set(0.8, 0, -4.0);
        scene.add(videoPlaneMesh);
      } catch {
        // Fallback silently if VideoTexture creation fails in headless environments
      }
    }

    // Millennium Sacred Geometry Group (Only rendered on Auth screen, NOT on Menu)
    let artifactGroup: THREE.Group | null = null;
    let ring1: THREE.Mesh | null = null;
    let ring2: THREE.Mesh | null = null;

    if (variant === 'auth') {
      artifactGroup = new THREE.Group();
      artifactGroup.position.set(0, 0.3, -1.0);
      scene.add(artifactGroup);

      const octaGeom = new THREE.OctahedronGeometry(1.65, 0);
      const octaSolidMat = new THREE.MeshStandardMaterial({
        color: 0x2e1065,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.85,
        transparent: true,
        opacity: 0.45,
      });
      const octaMesh = new THREE.Mesh(octaGeom, octaSolidMat);
      artifactGroup.add(octaMesh);

      const octaWireMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      });
      const octaWire = new THREE.Mesh(octaGeom, octaWireMat);
      octaWire.scale.setScalar(1.03);
      artifactGroup.add(octaWire);

      const ring1Geom = new THREE.TorusGeometry(2.45, 0.025, 12, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.45,
      });
      ring1 = new THREE.Mesh(ring1Geom, ringMat);
      ring1.rotation.x = Math.PI / 3;
      artifactGroup.add(ring1);

      const ring2Geom = new THREE.TorusGeometry(3.05, 0.018, 12, 64);
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.35,
      });
      ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
      ring2.rotation.y = Math.PI / 4;
      artifactGroup.add(ring2);
    }

    // Floating Mystic Particles (Object Pooled BufferGeometry)
    const particleCount = variant === 'deck' ? 65 : 95;
    const particleGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1.5;
      speeds[i] = 0.22 + Math.random() * 0.48;
    }

    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.08,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeom, particleMat);
    scene.add(particleSystem);

    let targetParallaxX = 0;
    let targetParallaxY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
      targetParallaxX = nx * 0.35;
      targetParallaxY = ny * 0.25;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

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
      .catch(() => {
        // Ignore silent backdrop failure
      });

    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (artifactGroup && ring1 && ring2) {
        artifactGroup.rotation.y += delta * 0.32;
        artifactGroup.rotation.x = Math.sin(elapsed * 0.5) * 0.18 + targetParallaxY * 0.4;
        ring1.rotation.z += delta * 0.45;
        ring2.rotation.x -= delta * 0.35;
      }

      camera.position.x += (targetParallaxX - camera.position.x) * 0.05;
      camera.position.y += (targetParallaxY - camera.position.y) * 0.05;

      const posAttr = particleGeom.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        arr[i * 3 + 1] += speeds[i] * delta;
        if (arr[i * 3 + 1] > 6) {
          arr[i * 3 + 1] = -6;
        }
      }
      posAttr.needsUpdate = true;

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
      window.removeEventListener('pointermove', handlePointerMove);
      if (resizeObserver) resizeObserver.disconnect();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      if (videoTexture) {
        try {
          videoTexture.dispose();
        } catch {}
      }
      if (videoElement) {
        try {
          videoElement.pause();
          videoElement.removeAttribute('src');
          videoElement.load();
        } catch {}
      }
      disposeSceneResources(scene, activeRenderer);
      if (container) container.innerHTML = '';
    };
  }, [variant, videoSrc]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      <div ref={containerRef} className="w-full h-full" />
      {showBadge && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded bg-black/65 border border-amber-500/40 px-2 py-0.5 text-[9px] font-mono text-amber-300/90 backdrop-blur-sm shadow">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>[{backend.toUpperCase()} • 3D]</span>
        </div>
      )}
    </div>
  );
};
