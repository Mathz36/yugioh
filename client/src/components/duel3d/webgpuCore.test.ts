import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  isWebGPUAvailable,
  verifyHardwareAcceleration,
  disposeSceneResources,
  createHybridRenderer,
} from './webgpuCore';

describe('webgpuCore - WebGPU Detection, Hardware Acceleration Guard & Resource Disposal', () => {
  describe('isWebGPUAvailable', () => {
    it('should return true when passed a navigator object with a valid gpu adapter property', () => {
      // Arrange
      const mockNavWithGpu = { gpu: { requestAdapter: vi.fn() } };

      // Act
      const result = isWebGPUAvailable(mockNavWithGpu);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when passed an empty object without gpu property', () => {
      // Arrange
      const mockEmptyNav = {};

      // Act
      const result = isWebGPUAvailable(mockEmptyNav);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when passed null, undefined, or { gpu: null }', () => {
      // Arrange
      const nullNav = null;
      const undefinedNav = undefined;
      const nullGpuNav = { gpu: null };

      // Act
      const resultForNull = isWebGPUAvailable(nullNav);
      const resultForUndefined = isWebGPUAvailable(undefinedNav);
      const resultForNullGpu = isWebGPUAvailable(nullGpuNav);

      // Assert
      expect(resultForNull).toBe(false);
      expect(resultForUndefined).toBe(false);
      expect(resultForNullGpu).toBe(false);
    });
  });

  describe('verifyHardwareAcceleration', () => {
    it('should return { supported: true, backend: "WebGPU" } when nav.gpu.requestAdapter resolves to a valid adapter', async () => {
      // Arrange
      const mockAdapter = { name: 'NVIDIA RTX WebGPU Adapter' };
      const mockNav = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        },
      };

      // Act
      const status = await verifyHardwareAcceleration(mockNav, {});

      // Assert
      expect(status).toEqual({
        supported: true,
        backend: 'WebGPU',
      });
      expect(mockNav.gpu.requestAdapter).toHaveBeenCalledTimes(1);
    });

    it('should return { supported: true, backend: "WebGL2" } when WebGPU is unavailable and hardware WebGL2 context is returned', async () => {
      // Arrange
      const mockNav = {};
      const mockGl2Context = {
        getExtension: vi.fn().mockReturnValue({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
        getParameter: vi.fn().mockReturnValue('ANGLE (NVIDIA GeForce RTX 4070 Direct3D11)'),
      };
      const mockDoc = {
        createElement: vi.fn().mockReturnValue({
          getContext: vi.fn((contextType: string) =>
            contextType === 'webgl2' ? mockGl2Context : null
          ),
        }),
      };

      // Act
      const status = await verifyHardwareAcceleration(mockNav, mockDoc);

      // Assert
      expect(status).toEqual({
        supported: true,
        backend: 'WebGL2',
      });
      expect(mockDoc.createElement).toHaveBeenCalledWith('canvas');
    });

    it('should return { supported: false, backend: "NONE", reason } when neither WebGPU nor WebGL context is available', async () => {
      // Arrange
      const mockNav = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(null),
        },
      };
      const mockDoc = {
        createElement: vi.fn().mockReturnValue({
          getContext: vi.fn().mockReturnValue(null),
        }),
      };

      // Act
      const status = await verifyHardwareAcceleration(mockNav, mockDoc);

      // Assert
      expect(status.supported).toBe(false);
      expect(status.backend).toBe('NONE');
      expect(status.reason).toBeTruthy();
    });

    it('should return { supported: false, backend: "NONE", reason } when WEBGL_debug_renderer_info reports a software renderer (SwiftShader or llvmpipe)', async () => {
      // Arrange
      const mockNav = {};
      const createSoftwareMockDoc = (rendererString: string) => ({
        createElement: vi.fn().mockReturnValue({
          getContext: vi.fn().mockReturnValue({
            getExtension: vi.fn().mockReturnValue({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
            getParameter: vi.fn().mockReturnValue(rendererString),
          }),
        }),
      });

      // Act
      const swiftShaderStatus = await verifyHardwareAcceleration(
        mockNav,
        createSoftwareMockDoc('Google SwiftShader')
      );
      const llvmpipeStatus = await verifyHardwareAcceleration(
        mockNav,
        createSoftwareMockDoc('Mesa llvmpipe (LLVM 15.0.7, 256 bits)')
      );

      // Assert
      expect(swiftShaderStatus.supported).toBe(false);
      expect(swiftShaderStatus.backend).toBe('NONE');
      expect(swiftShaderStatus.reason).toContain('software');
      expect(llvmpipeStatus.supported).toBe(false);
      expect(llvmpipeStatus.backend).toBe('NONE');
      expect(llvmpipeStatus.reason).toContain('software');
    });
  });

  describe('disposeSceneResources', () => {
    it('should dispose geometries, single materials, material arrays, and the renderer without throwing', () => {
      // Arrange
      const scene = new THREE.Scene();

      const geom1 = new THREE.BoxGeometry(1, 1, 1);
      const mat1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const meshSingle = new THREE.Mesh(geom1, mat1);

      const geom2 = new THREE.BoxGeometry(2, 2, 2);
      const mat2A = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      const mat2B = new THREE.MeshStandardMaterial({ color: 0x0000ff });
      const meshMulti = new THREE.Mesh(geom2, [mat2A, mat2B]);

      scene.add(meshSingle);
      scene.add(meshMulti);

      const geom1Spy = vi.spyOn(geom1, 'dispose');
      const mat1Spy = vi.spyOn(mat1, 'dispose');
      const geom2Spy = vi.spyOn(geom2, 'dispose');
      const mat2ASpy = vi.spyOn(mat2A, 'dispose');
      const mat2BSpy = vi.spyOn(mat2B, 'dispose');

      const mockRenderer = {
        dispose: vi.fn(),
      };

      // Act
      disposeSceneResources(scene, mockRenderer);

      // Assert
      expect(geom1Spy).toHaveBeenCalledTimes(1);
      expect(mat1Spy).toHaveBeenCalledTimes(1);
      expect(geom2Spy).toHaveBeenCalledTimes(1);
      expect(mat2ASpy).toHaveBeenCalledTimes(1);
      expect(mat2BSpy).toHaveBeenCalledTimes(1);
      expect(mockRenderer.dispose).toHaveBeenCalledTimes(1);
    });

    it('should handle null scene or null renderer gracefully without throwing', () => {
      // Arrange
      const scene = new THREE.Scene();
      const mockRenderer = { dispose: vi.fn() };

      // Act & Assert
      expect(() => disposeSceneResources(null, mockRenderer)).not.toThrow();
      expect(mockRenderer.dispose).toHaveBeenCalledTimes(1);
      expect(() => disposeSceneResources(scene, null)).not.toThrow();
      expect(() => disposeSceneResources(null, null)).not.toThrow();
    });
  });

  describe('createHybridRenderer', () => {
    it('should gracefully initialize a fallback WebGL2 renderer in headless test environments', async () => {
      // Arrange
      const options = { antialias: true, alpha: true, forceWebGL: true };

      // Act
      const result = await createHybridRenderer(options);

      // Assert
      expect(result).toBeDefined();
      expect(result.backend).toBe('WebGL2');
      expect(result.renderer).toBeDefined();
      expect(typeof result.renderer.dispose).toBe('function');
    });
  });
});
