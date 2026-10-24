import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

export type RendererBackendType = 'WebGPU' | 'WebGL2';

export interface HybridRendererResult {
  renderer: any;
  backend: RendererBackendType;
}

export interface HybridRendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  forceWebGL?: boolean;
}

export interface HardwareAccelerationStatus {
  supported: boolean;
  backend: RendererBackendType | 'NONE';
  reason?: string;
}

/**
 * Checks whether the WebGPU API is available on the target navigator instance.
 */
export function isWebGPUAvailable(nav?: any): boolean {
  const targetNav =
    nav !== undefined ? nav : typeof navigator !== 'undefined' ? navigator : undefined;
  return Boolean(
    targetNav &&
      typeof targetNav === 'object' &&
      'gpu' in targetNav &&
      Boolean(targetNav.gpu)
  );
}

/**
 * Verifies whether hardware-accelerated 3D rendering (WebGPU or hardware WebGL2)
 * is actively available on the user's device and browser.
 */
export async function verifyHardwareAcceleration(
  nav?: any,
  doc?: any
): Promise<HardwareAccelerationStatus> {
  const targetNav =
    nav !== undefined ? nav : typeof navigator !== 'undefined' ? navigator : undefined;
  const targetDoc =
    doc !== undefined ? doc : typeof document !== 'undefined' ? document : undefined;

  // 1. Probe WebGPU hardware adapter
  if (isWebGPUAvailable(targetNav) && typeof targetNav.gpu?.requestAdapter === 'function') {
    try {
      const adapter = await targetNav.gpu.requestAdapter();
      if (adapter) {
        return {
          supported: true,
          backend: 'WebGPU',
        };
      }
    } catch {
      // Fall through to WebGL2 hardware probe
    }
  }

  // 2. Probe WebGL2 / WebGL hardware context
  if (!targetDoc || typeof targetDoc.createElement !== 'function') {
    return {
      supported: false,
      backend: 'NONE',
      reason: 'Ambiente sem suporte a DOM/Canvas 3D.',
    };
  }

  try {
    const canvas = targetDoc.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return {
        supported: false,
        backend: 'NONE',
        reason: 'Aceleração de Hardware desativada ou GPU incompatível.',
      };
    }

    const gl: any =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl');

    if (!gl) {
      return {
        supported: false,
        backend: 'NONE',
        reason: 'Aceleração de Hardware desativada ou GPU incompatível.',
      };
    }

    if (typeof gl.getExtension === 'function' && typeof gl.getParameter === 'function') {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const rendererName = String(
          gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
        );
        if (/swiftshader|llvmpipe|software/i.test(rendererName)) {
          return {
            supported: false,
            backend: 'NONE',
            reason:
              'Renderizador por software detectado. Ative a Aceleração de Hardware nas configurações do navegador.',
          };
        }
      }
    }

    return {
      supported: true,
      backend: 'WebGL2',
    };
  } catch {
    return {
      supported: false,
      backend: 'NONE',
      reason: 'Aceleração de Hardware desativada ou GPU incompatível.',
    };
  }
}

/**
 * Initializes a Three.js WebGPURenderer with asynchronous backend setup,
 * gracefully falling back to WebGLRenderer (WebGL2) if WebGPU is unavailable or rejected.
 */
export async function createHybridRenderer(
  options?: HybridRendererOptions
): Promise<HybridRendererResult> {
  const antialias = options?.antialias ?? true;
  const alpha = options?.alpha ?? true;
  const forceWebGL = options?.forceWebGL ?? false;

  if (!forceWebGL && isWebGPUAvailable()) {
    let gpuRenderer: any = null;
    try {
      gpuRenderer = new WebGPURenderer({ antialias, alpha });
      await gpuRenderer.init();
      return {
        renderer: gpuRenderer,
        backend: 'WebGPU',
      };
    } catch (err) {
      console.warn('[webgpuCore] WebGPURenderer initialization failed, falling back to WebGL2:', err);
      if (gpuRenderer?.dispose) {
        try {
          gpuRenderer.dispose();
        } catch {}
      }
    }
  }

  try {
    const glRenderer = new THREE.WebGLRenderer({ antialias, alpha });
    return {
      renderer: glRenderer,
      backend: 'WebGL2',
    };
  } catch (glErr) {
    if (typeof document === 'undefined') {
      // Headless Node test environment fallback
      return {
        renderer: {
          domElement: {},
          shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
          setSize: () => {},
          setPixelRatio: () => {},
          render: () => {},
          dispose: () => {},
        },
        backend: 'WebGL2',
      };
    }
    throw glErr;
  }
}

/**
 * Safely traverses a Three.js scene and disposes all geometries, materials, and renderer resources.
 */
export function disposeSceneResources(scene: THREE.Scene | null, renderer: any): void {
  if (scene) {
    try {
      scene.traverse((obj: any) => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') {
          try {
            obj.geometry.dispose();
          } catch {}
        }
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of materials) {
            if (mat && typeof mat.dispose === 'function') {
              try {
                mat.dispose();
              } catch {}
            }
          }
        }
      });
    } catch {}
  }

  if (renderer && typeof renderer.dispose === 'function') {
    try {
      renderer.dispose();
    } catch {}
  }
}
