import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { CardInstance } from '@duel/duel-types';
import {
  createHybridRenderer,
  disposeSceneResources,
  RendererBackendType,
} from './webgpuCore';
import {
  createCardBackTexture,
  createCardFaceTexture,
} from './cardTextureGenerator';

export interface DuelArena3DProps {
  playerMonsters: (CardInstance | null)[];
  playerSpellTraps: (CardInstance | null)[];
  opponentMonsters: (CardInstance | null)[];
  opponentSpellTraps: (CardInstance | null)[];
  playerHand?: CardInstance[];
  opponentHandCount?: number;
  selectedHandCardUid?: string | null;
  onHandCardClick?: (card: CardInstance) => void;
  playerDeckCount?: number;
  playerGraveyardCount?: number;
  opponentDeckCount?: number;
  opponentGraveyardCount?: number;
  languagePt?: boolean;
  activeFieldVfx?: 'RAIGEKI' | 'DARK_HOLE' | 'MIRROR_FORCE' | 'WABOKU' | null;
  inspectedCardUid?: string | null;
  selectedAttackerZone?: number | null;
  validSummonZones?: number[];
  validSpellTrapZones?: number[];
  tacticalTargetUids?: string[];
  lungingZone?: {
    isPlayer: boolean;
    zoneIndex: number;
    targetIndex?: number | null;
  } | null;
  slamZone?: { isPlayer: boolean; zoneIndex: number } | null;
  targetHitZone?: { isPlayer: boolean; zoneIndex: number | null } | null;
  destroyedCardUids?: string[];
  flippedZones?: { isPlayer: boolean; zoneIndex: number }[];
  onZoneClick?: (isPlayer: boolean, zoneType: 'MONSTER' | 'SPELL_TRAP', index: number) => void;
  onCardHover?: (card: CardInstance | null) => void;
  onError?: (error: Error) => void;
  isCameraShaking?: boolean;
}

export interface HandCardTransform {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

/**
 * Computes the 3D spatial transform for a card in the player's or opponent's hand
 * arranged in a clean, straight horizontal line (zero fan / zero arc).
 */
export function computeHandCardTransform(
  index: number,
  totalCards: number,
  isPlayer: boolean,
  isSelected: boolean = false,
  isHovered: boolean = false
): HandCardTransform {
  const safeTotal = Math.max(1, totalCards);
  const centerIndex = (safeTotal - 1) / 2;

  if (isPlayer) {
    const maxSpan = 8.8;
    const spacing =
      safeTotal <= 1 ? 0 : Math.min(1.62, maxSpan / Math.max(1, safeTotal - 1));
    const x = (index - centerIndex) * spacing;
    const baseY = 0.55;
    const baseZ = 7.15;
    const baseRotX = -0.92;

    if (isSelected || isHovered) {
      return {
        x,
        y: baseY + (isSelected ? 0.42 : 0.32),
        z: baseZ - (isSelected ? 0.28 : 0.2),
        rotX: baseRotX,
        rotY: 0,
        rotZ: 0,
        scale: isSelected ? 1.15 : 1.12,
      };
    }

    return {
      x,
      y: baseY,
      z: baseZ,
      rotX: baseRotX,
      rotY: 0,
      rotZ: 0,
      scale: 1.0,
    };
  }

  const maxSpan = 7.8;
  const spacing =
    safeTotal <= 1 ? 0 : Math.min(1.52, maxSpan / Math.max(1, safeTotal - 1));
  const x = (index - centerIndex) * spacing;

  return {
    x,
    y: 0.55,
    z: -6.15,
    rotX: 0.55,
    rotY: Math.PI,
    rotZ: 0,
    scale: 0.88,
  };
}

// Standard TCG card dimensions in 3D world units
const CARD_WIDTH = 1.52;
const CARD_HEIGHT = 2.18;
const CARD_THICKNESS = 0.032;

// Generous Master Duel spacing between the 5 zone columns (-4.84, -2.42, 0, +2.42, +4.84)
const ZONE_SPACING_X = 2.42;

// Expanded Z coordinates for the 4 field rows
const Z_PLAYER_ST = 3.85;
const Z_PLAYER_MONSTER = 1.35;
const Z_OPPONENT_MONSTER = -1.45;
const Z_OPPONENT_ST = -3.95;

// Elevated camera positioning so the table sits slightly more distant and opens space for the straight hand
const CAM_POS = new THREE.Vector3(0, 16.2, 9.8);
const CAM_LOOK_AT = new THREE.Vector3(0, -0.7, 1.25);

const computeResponsiveFov = (aspect: number): number => {
  if (aspect < 1.2) return 58;
  if (aspect < 1.5) return 50;
  if (aspect < 1.8) return 45;
  return 42;
};

interface ZoneCoord {
  isPlayer: boolean;
  zoneType: 'MONSTER' | 'SPELL_TRAP';
  index: number;
  x: number;
  z: number;
}

interface ParticleVFX {
  points: THREE.Points;
  velocities: THREE.Vector3[];
  createdAt: number;
  duration: number;
}

interface HandVisualItem {
  uid: string;
  mesh: THREE.Mesh;
  frontMat: THREE.MeshBasicMaterial;
  index: number;
  total: number;
}

/**
 * Generates a carved ancient slate/obsidian stone & aged bronze/gold playmat surface texture (Zero RGB/Neon).
 */
function createPlaymatSurfaceTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.Texture();
  }

  // Carved dark slate & obsidian stone radial background
  const grad = ctx.createRadialGradient(512, 384, 40, 512, 384, 640);
  grad.addColorStop(0, '#1c1917');
  grad.addColorStop(0.55, '#141210');
  grad.addColorStop(1, '#0c0a09');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 768);

  // Outer aged bronze / antique gold border
  ctx.strokeStyle = '#926c35';
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, 992, 736);

  ctx.strokeStyle = 'rgba(146, 108, 53, 0.42)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 964, 708);

  // Engraved Ancient Millennium Circle & Pyramid in center
  ctx.save();
  ctx.translate(512, 384);
  ctx.strokeStyle = 'rgba(146, 108, 53, 0.28)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 155, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 92, 50, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 126, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(146, 108, 53, 0.24)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -114);
  ctx.lineTo(108, 78);
  ctx.lineTo(-108, 78);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Helper predicate for tactical stat pills visibility (appears strictly on hover, during attack declaration or targeting)
export function isTacticalPillVisible(
  cardUid: string,
  hoveredCardUid: string | null,
  isAttacker: boolean,
  tacticalTargetUids: string[] = []
): boolean {
  return hoveredCardUid === cardUid || isAttacker || tacticalTargetUids.includes(cardUid);
}

export const DuelArena3D: React.FC<DuelArena3DProps> = ({
  playerMonsters,
  playerSpellTraps,
  opponentMonsters,
  opponentSpellTraps,
  playerHand = [],
  opponentHandCount = 0,
  selectedHandCardUid = null,
  onHandCardClick,
  playerDeckCount = 30,
  playerGraveyardCount = 0,
  opponentDeckCount = 30,
  opponentGraveyardCount = 0,
  languagePt = true,
  activeFieldVfx = null,
  inspectedCardUid,
  selectedAttackerZone,
  validSummonZones = [],
  validSpellTrapZones = [],
  tacticalTargetUids = [],
  lungingZone,
  slamZone,
  targetHitZone,
  destroyedCardUids = [],
  flippedZones = [],
  onZoneClick,
  onCardHover,
  onError,
  isCameraShaking = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendererType, setRendererType] = useState<RendererBackendType>('WebGL2');
  const [viewportAspect, setViewportAspect] = useState<number>(16 / 9);
  const [hoveredCardUid, setHoveredCardUid] = useState<string | null>(null);

  // Stale-closure prevention for active monster zones in raycasting
  const monsterCardsRef = useRef<{ p1: (CardInstance | null)[]; p2: (CardInstance | null)[] }>({
    p1: playerMonsters,
    p2: opponentMonsters,
  });
  monsterCardsRef.current = { p1: playerMonsters, p2: opponentMonsters };

  // Refs for zero-flicker 60 FPS hand interpolation & stale closure prevention
  const selectedHandCardUidRef = useRef<string | null>(selectedHandCardUid);
  selectedHandCardUidRef.current = selectedHandCardUid;

  const hoveredHandUidRef = useRef<string | null>(null);
  const lastReportedHoverUidRef = useRef<string | null>(null);

  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;

  const onHandCardClickRef = useRef(onHandCardClick);
  onHandCardClickRef.current = onHandCardClick;

  const onCardHoverRef = useRef(onCardHover);
  onCardHoverRef.current = onCardHover;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<any>(null);
  const isRendererReadyRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  // 3D Meshes & Raycasting Targets
  const cardMeshesMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const zoneMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const zoneBorderMapRef = useRef<Map<string, THREE.LineSegments>>(new Map());
  const flankGroupRef = useRef<THREE.Group | null>(null);
  const handGroupRef = useRef<THREE.Group | null>(null);
  const playerHandMeshesRef = useRef<THREE.Mesh[]>([]);
  const playerHandVisualsRef = useRef<HandVisualItem[]>([]);
  const interactiveObjectsRef = useRef<THREE.Object3D[]>([]);
  const activeParticlesRef = useRef<ParticleVFX[]>([]);

  const syncInteractiveObjects = () => {
    interactiveObjectsRef.current = [
      ...playerHandMeshesRef.current,
      ...Array.from(zoneMeshesRef.current.values()),
      ...Array.from(cardMeshesMapRef.current.values()),
    ];
  };

  // Cached Procedural + Proxy Textures for WebGPU
  const faceTexturesCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const backTextureRef = useRef<THREE.Texture | null>(null);

  const getBackTexture = (): THREE.Texture => {
    if (!backTextureRef.current) {
      backTextureRef.current = createCardBackTexture();
    }
    return backTextureRef.current;
  };

  const getCardFaceTexture = (card: CardInstance): THREE.Texture => {
    const cacheKey = `${card.data.id || card.data.name}-${languagePt ? 'pt' : 'en'}`;
    if (faceTexturesCacheRef.current.has(cacheKey)) {
      return faceTexturesCacheRef.current.get(cacheKey)!;
    }
    const texture = createCardFaceTexture(card.data, languagePt);
    faceTexturesCacheRef.current.set(cacheKey, texture);
    return texture;
  };

  // Spatial coordinates for all 20 field zones
  const zoneCoords: ZoneCoord[] = useMemo(() => {
    const coords: ZoneCoord[] = [];
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * ZONE_SPACING_X;
      coords.push({ isPlayer: true, zoneType: 'SPELL_TRAP', index: i, x, z: Z_PLAYER_ST });
      coords.push({ isPlayer: true, zoneType: 'MONSTER', index: i, x, z: Z_PLAYER_MONSTER });
      coords.push({ isPlayer: false, zoneType: 'MONSTER', index: i, x, z: Z_OPPONENT_MONSTER });
      coords.push({ isPlayer: false, zoneType: 'SPELL_TRAP', index: i, x, z: Z_OPPONENT_ST });
    }
    return coords;
  }, []);

  // Project 3D world position to 2D percentage coordinates for tactical HUD pills
  const projectToScreenPercent = useMemo(() => {
    const fov = computeResponsiveFov(viewportAspect);
    const cam = new THREE.PerspectiveCamera(fov, viewportAspect, 0.1, 100);
    cam.position.copy(CAM_POS);
    cam.lookAt(CAM_LOOK_AT);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    return (x: number, y: number, z: number): { left: string; top: string } => {
      const vec = new THREE.Vector3(x, y, z);
      vec.project(cam);
      const left = ((vec.x + 1) / 2) * 100;
      const top = ((-vec.y + 1) / 2) * 100;
      return {
        left: `${left.toFixed(2)}%`,
        top: `${top.toFixed(2)}%`,
      };
    };
  }, [viewportAspect]);

  // 1. Initialize Three.js Scene & Hybrid WebGPU/WebGL2 Renderer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a09);
    scene.fog = new THREE.FogExp2(0x0c0a09, 0.015);
    sceneRef.current = scene;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const initialAspect = width / Math.max(1, height);
    setViewportAspect(initialAspect);

    let isMounted = true;
    isRendererReadyRef.current = false;

    // Elevated Tactical Camera Framing
    const camera = new THREE.PerspectiveCamera(
      computeResponsiveFov(initialAspect),
      initialAspect,
      0.1,
      100
    );
    camera.position.copy(CAM_POS);
    camera.lookAt(CAM_LOOK_AT);
    cameraRef.current = camera;

    // Classic Warm Stone & Torchlight Illumination (Zero Neon/RGB)
    const hemiLight = new THREE.HemisphereLight(0xf5f5f4, 0x1c1917, 1.35);
    scene.add(hemiLight);

    const mainDirLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    mainDirLight.position.set(0, 18, 6);
    mainDirLight.castShadow = true;
    scene.add(mainDirLight);

    const warmTorchLight = new THREE.DirectionalLight(0xd97706, 0.9);
    warmTorchLight.position.set(0, 10, 12);
    scene.add(warmTorchLight);

    // Carved Dark Slate & Aged Bronze 3D Playmat Base (17.6 x 11.2)
    const playmatTex = createPlaymatSurfaceTexture();
    const boardGeometry = new THREE.BoxGeometry(17.6, 0.36, 11.2);
    const boardSideMat = new THREE.MeshStandardMaterial({
      color: 0x171412,
      roughness: 0.75,
      metalness: 0.15,
    });
    const boardTopMat = new THREE.MeshStandardMaterial({
      map: playmatTex,
      roughness: 0.65,
      metalness: 0.15,
    });
    const boardMaterials = [
      boardSideMat,
      boardSideMat,
      boardTopMat,
      boardSideMat,
      boardSideMat,
      boardSideMat,
    ];
    const boardMesh = new THREE.Mesh(boardGeometry, boardMaterials);
    boardMesh.position.y = -0.19;
    boardMesh.receiveShadow = true;
    scene.add(boardMesh);

    // Central Aged Bronze Duel Divider Line
    const dividerGeom = new THREE.BoxGeometry(16.2, 0.03, 0.08);
    const dividerMat = new THREE.MeshStandardMaterial({
      color: 0x926c35,
      roughness: 0.55,
      metalness: 0.35,
      emissive: 0x926c35,
      emissiveIntensity: 0.05,
    });
    const dividerMesh = new THREE.Mesh(dividerGeom, dividerMat);
    dividerMesh.position.set(0, 0.015, -0.05);
    scene.add(dividerMesh);

    // Flank Group for 3D Decks & Graveyards
    const flankGroup = new THREE.Group();
    scene.add(flankGroup);
    flankGroupRef.current = flankGroup;

    // 3D Hand Group for Player & Opponent Hands
    const handGroup = new THREE.Group();
    scene.add(handGroup);
    handGroupRef.current = handGroup;

    // 20 Ancient Stone Duel Zones with Octagonal Stone Altar Pedestals
    const zoneBoxGeometry = new THREE.BoxGeometry(CARD_WIDTH + 0.34, 0.03, CARD_HEIGHT + 0.24);
    const zoneEdgesGeometry = new THREE.EdgesGeometry(zoneBoxGeometry);
    const octagonPedestalGeom = new THREE.CylinderGeometry(0.68, 0.76, 0.025, 8);
    const octagonPedestalMat = new THREE.MeshStandardMaterial({
      color: 0x292524,
      roughness: 0.78,
      metalness: 0.2,
      emissive: 0x000000,
    });

    zoneMeshesRef.current.clear();
    zoneBorderMapRef.current.clear();
    interactiveObjectsRef.current = [];

    zoneCoords.forEach((z) => {
      const isMonster = z.zoneType === 'MONSTER';
      const defaultColor = isMonster ? 0x57534e : 0x44403c;

      const zoneMaterial = new THREE.MeshBasicMaterial({
        color: defaultColor,
        transparent: true,
        opacity: 0.14,
      });

      const zoneMesh = new THREE.Mesh(zoneBoxGeometry, zoneMaterial);
      zoneMesh.position.set(z.x, 0.02, z.z);
      zoneMesh.userData = {
        isZoneSlot: true,
        isPlayer: z.isPlayer,
        zoneType: z.zoneType,
        index: z.index,
        defaultColor,
      };

      // Octagonal carved stone altar inside each zone
      const pedestalMesh = new THREE.Mesh(octagonPedestalGeom, octagonPedestalMat);
      pedestalMesh.position.set(z.x, 0.01, z.z);
      pedestalMesh.rotation.y = Math.PI / 8;
      scene.add(pedestalMesh);

      const borderMat = new THREE.LineBasicMaterial({
        color: isMonster ? 0xa88958 : 0x78716c,
        transparent: true,
        opacity: 0.5,
      });
      const borderLines = new THREE.LineSegments(zoneEdgesGeometry, borderMat);
      borderLines.position.set(z.x, 0.028, z.z);

      const zoneKey = `${z.isPlayer ? 'p1' : 'p2'}-${z.zoneType}-${z.index}`;
      zoneMeshesRef.current.set(zoneKey, zoneMesh);
      zoneBorderMapRef.current.set(zoneKey, borderLines);
      interactiveObjectsRef.current.push(zoneMesh);
      scene.add(zoneMesh);
      scene.add(borderLines);
    });

    // Initialize Hybrid Renderer (WebGPU -> WebGL2 fallback)
    createHybridRenderer({ antialias: true, alpha: true })
      .then(({ renderer, backend }) => {
        if (!isMounted || !container) {
          disposeSceneResources(scene, renderer);
          return;
        }
        if (typeof renderer.setSize === 'function') {
          renderer.setSize(width, height);
        }
        if (typeof renderer.setPixelRatio === 'function') {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        }
        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        container.innerHTML = '';
        if (renderer.domElement && renderer.domElement instanceof Node) {
          container.appendChild(renderer.domElement);
        }
        rendererRef.current = renderer;
        isRendererReadyRef.current = true;
        setRendererType(backend);
      })
      .catch((err) => {
        if (onErrorRef.current) onErrorRef.current(err);
      });

    // Precision Raycasting for Tactical Click & Hover (Stationary Hand Hitboxes + Field Zones)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const triggerRaycastClick = (clientX: number, clientY: number) => {
      if (!isRendererReadyRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveObjectsRef.current, false);

      for (const hit of intersects) {
        const data = hit.object.userData;
        if (!data) continue;

        if (data.isHandCard && data.cardInstance) {
          if (onHandCardClickRef.current) {
            onHandCardClickRef.current(data.cardInstance);
          }
          break;
        }

        if ((data.isCardMesh || data.isZoneSlot) && onZoneClickRef.current) {
          onZoneClickRef.current(data.isPlayer, data.zoneType, data.index);
          break;
        }
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isRendererReadyRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveObjectsRef.current, false);

      let hoveredCard: CardInstance | null = null;
      let nextHoveredHandUid: string | null = null;
      let hasInteractive = false;

      for (const hit of intersects) {
        const data = hit.object.userData;
        if (data?.isHandCard && data?.cardInstance) {
          if (!hoveredCard) {
            hoveredCard = data.cardInstance;
            nextHoveredHandUid = data.cardInstance.uid;
          }
          hasInteractive = true;
          break;
        }
        if (data?.cardInstance && !hoveredCard) {
          hoveredCard = data.cardInstance;
        }
        if (!hoveredCard && data?.isZoneSlot && data.zoneType === 'MONSTER') {
          const list = data.isPlayer ? monsterCardsRef.current.p1 : monsterCardsRef.current.p2;
          const m = list[data.index];
          if (m) {
            hoveredCard = m;
          }
        }
        if (data?.isCardMesh || data?.isZoneSlot) {
          hasInteractive = true;
        }
        if (hoveredCard && hasInteractive) {
          break;
        }
      }

      hoveredHandUidRef.current = nextHoveredHandUid;
      container.style.cursor = hasInteractive ? 'pointer' : 'default';

      const nextHoverUid = hoveredCard?.uid ?? null;
      if (nextHoverUid !== lastReportedHoverUidRef.current) {
        lastReportedHoverUidRef.current = nextHoverUid;
        setHoveredCardUid(nextHoverUid);
        if (onCardHoverRef.current) {
          onCardHoverRef.current(hoveredCard);
        }
      }
    };

    const handlePointerLeave = () => {
      hoveredHandUidRef.current = null;
      lastReportedHoverUidRef.current = null;
      setHoveredCardUid(null);
      container.style.cursor = 'default';
      if (onCardHoverRef.current) {
        onCardHoverRef.current(null);
      }
    };

    let lastRaycastClickTime = 0;
    const executeRaycastFromEvent = (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastRaycastClickTime < 150) return;
      lastRaycastClickTime = now;
      triggerRaycastClick(clientX, clientY);
    };

    let pointerStartX = 0;
    let pointerStartY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dx = event.clientX - pointerStartX;
      const dy = event.clientY - pointerStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 25) {
        executeRaycastFromEvent(event.clientX, event.clientY);
      }
    };

    const handleClick = (event: MouseEvent) => {
      executeRaycastFromEvent(event.clientX, event.clientY);
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerleave', handlePointerLeave);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('click', handleClick);

    // Continuous 60+ FPS Render Loop with Zero-Flicker Smooth Hand Interpolation
    const clock = new THREE.Clock();
    const renderLoop = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      const lerpAlpha = Math.min(1, delta * 15);

      // Smoothly interpolate 3D player hand visual meshes without moving hitboxes
      for (const item of playerHandVisualsRef.current) {
        const isSelected = selectedHandCardUidRef.current === item.uid;
        const isHovered = hoveredHandUidRef.current === item.uid;
        const target = computeHandCardTransform(
          item.index,
          item.total,
          true,
          isSelected,
          isHovered
        );

        item.mesh.position.x = THREE.MathUtils.lerp(item.mesh.position.x, target.x, lerpAlpha);
        item.mesh.position.y = THREE.MathUtils.lerp(item.mesh.position.y, target.y, lerpAlpha);
        item.mesh.position.z = THREE.MathUtils.lerp(item.mesh.position.z, target.z, lerpAlpha);

        const targetRotX = -target.rotX * 0.55;
        item.mesh.rotation.x = THREE.MathUtils.lerp(item.mesh.rotation.x, targetRotX, lerpAlpha);
        item.mesh.rotation.y = THREE.MathUtils.lerp(item.mesh.rotation.y, target.rotY, lerpAlpha);
        item.mesh.rotation.z = THREE.MathUtils.lerp(item.mesh.rotation.z, target.rotZ, lerpAlpha);

        const nextScale = THREE.MathUtils.lerp(item.mesh.scale.x, target.scale, lerpAlpha);
        item.mesh.scale.setScalar(nextScale);
      }

      // Update active destruction & spell particle systems
      const now = performance.now();
      activeParticlesRef.current = activeParticlesRef.current.filter((p) => {
        const age = (now - p.createdAt) / 1000;
        if (age >= p.duration) {
          scene.remove(p.points);
          p.points.geometry.dispose();
          (p.points.material as THREE.Material).dispose();
          return false;
        }

        const positions = (p.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < p.velocities.length; i++) {
          positions[i * 3 + 0] += p.velocities[i].x * delta;
          positions[i * 3 + 1] += p.velocities[i].y * delta;
          positions[i * 3 + 2] += p.velocities[i].z * delta;
        }
        p.points.geometry.attributes.position.needsUpdate = true;
        (p.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / p.duration);
        return true;
      });

      // Pulse highlighted summon / spell / attack zones with warm gold
      zoneMeshesRef.current.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (mesh.userData.isHighlight) {
          mat.opacity = 0.28 + 0.24 * Math.sin(elapsed * 5);
        } else {
          mat.opacity = 0.14;
        }
      });

      if (
        isRendererReadyRef.current &&
        rendererRef.current &&
        sceneRef.current &&
        cameraRef.current
      ) {
        try {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        } catch (err: any) {
          if (err?.message?.includes('backend is initialized') || err?.message?.includes('WebGPU')) {
            isRendererReadyRef.current = false;
            try {
              if (rendererRef.current?.dispose) rendererRef.current.dispose();
              const fallbackGl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
              fallbackGl.setSize(container.clientWidth, container.clientHeight);
              fallbackGl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
              container.innerHTML = '';
              container.appendChild(fallbackGl.domElement);
              rendererRef.current = fallbackGl;
              setRendererType('WebGL2');
              isRendererReadyRef.current = true;
            } catch (glFallbackErr: any) {
              if (onErrorRef.current) onErrorRef.current(glFallbackErr);
            }
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const updateViewportDimensions = (newWidth: number, newHeight: number) => {
      if (newWidth > 0 && newHeight > 0 && cameraRef.current) {
        const nextAspect = newWidth / newHeight;
        setViewportAspect(nextAspect);
        cameraRef.current.aspect = nextAspect;
        cameraRef.current.fov = computeResponsiveFov(nextAspect);
        cameraRef.current.updateProjectionMatrix();
        if (
          isRendererReadyRef.current &&
          rendererRef.current &&
          typeof rendererRef.current.setSize === 'function'
        ) {
          rendererRef.current.setSize(newWidth, newHeight);
        }
      }
    };

    const handleResize = () => {
      if (!container) return;
      updateViewportDimensions(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { width: newWidth, height: newHeight } = entry.contentRect;
              updateViewportDimensions(newWidth, newHeight);
            }
          })
        : null;

    if (resizeObserver) {
      resizeObserver.observe(container);
    }

    return () => {
      isMounted = false;
      isRendererReadyRef.current = false;
      if (resizeObserver) resizeObserver.disconnect();
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      disposeSceneResources(sceneRef.current, rendererRef.current);
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  // 2. Render 3D Deck Stacks and Aged Bronze Graveyard Pedestals on Board Flanks (x = ±7.25)
  useEffect(() => {
    const flankGroup = flankGroupRef.current;
    if (!flankGroup) return;

    while (flankGroup.children.length > 0) {
      const child = flankGroup.children[0] as THREE.Mesh;
      flankGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }

    const backTex = getBackTexture();
    const deckSideMat = new THREE.MeshBasicMaterial({ color: 0x3b352e });
    const deckTopMat = new THREE.MeshBasicMaterial({ map: backTex });
    const deckMats = [deckSideMat, deckSideMat, deckTopMat, deckSideMat, deckSideMat, deckSideMat];

    // Player Deck Stack (Bottom-Right Flank)
    if (playerDeckCount > 0) {
      const h = Math.max(0.08, (playerDeckCount / 40) * 0.52);
      const deckGeom = new THREE.BoxGeometry(CARD_WIDTH * 0.92, h, CARD_HEIGHT * 0.92);
      const deckMesh = new THREE.Mesh(deckGeom, deckMats);
      deckMesh.position.set(7.25, h / 2, Z_PLAYER_ST);
      flankGroup.add(deckMesh);
    }

    // Opponent Deck Stack (Top-Left Flank)
    if (opponentDeckCount > 0) {
      const h = Math.max(0.08, (opponentDeckCount / 40) * 0.52);
      const deckGeom = new THREE.BoxGeometry(CARD_WIDTH * 0.92, h, CARD_HEIGHT * 0.92);
      const deckMesh = new THREE.Mesh(deckGeom, deckMats);
      deckMesh.position.set(-7.25, h / 2, Z_OPPONENT_ST);
      flankGroup.add(deckMesh);
    }

    // Player Graveyard Pedestal (Right Flank - Muted Aged Bronze)
    const gyPedestalGeom = new THREE.CylinderGeometry(0.74, 0.84, 0.08, 8);
    const gyPedestalMat = new THREE.MeshStandardMaterial({
      color: 0x292524,
      emissive: playerGraveyardCount > 0 ? 0x785c32 : 0x1c1917,
      emissiveIntensity: playerGraveyardCount > 0 ? 0.35 : 0.1,
      roughness: 0.65,
      metalness: 0.3,
    });
    const playerGyMesh = new THREE.Mesh(gyPedestalGeom, gyPedestalMat);
    playerGyMesh.position.set(7.25, 0.04, Z_PLAYER_MONSTER);
    flankGroup.add(playerGyMesh);

    // Opponent Graveyard Pedestal (Left Flank - Muted Aged Bronze)
    const oppGyMat = new THREE.MeshStandardMaterial({
      color: 0x292524,
      emissive: opponentGraveyardCount > 0 ? 0x785c32 : 0x1c1917,
      emissiveIntensity: opponentGraveyardCount > 0 ? 0.35 : 0.1,
      roughness: 0.65,
      metalness: 0.3,
    });
    const oppGyMesh = new THREE.Mesh(gyPedestalGeom, oppGyMat);
    oppGyMesh.position.set(-7.25, 0.04, Z_OPPONENT_MONSTER);
    flankGroup.add(oppGyMesh);
  }, [playerDeckCount, playerGraveyardCount, opponentDeckCount, opponentGraveyardCount]);

  // Signature keys derived from card UIDs ensuring 3D meshes re-sync immediately when a card leaves hand or enters field
  const playerHandSignature = playerHand.map((c) => c.uid).join('|');
  const fieldZonesSignature = [
    ...playerMonsters,
    ...playerSpellTraps,
    ...opponentMonsters,
    ...opponentSpellTraps,
  ]
    .map((c) => (c ? `${c.uid}:${c.position}:${c.isFaceDown}` : 'none'))
    .join('|');

  // 3. Synchronize 3D Player Hand & Opponent Hand in Straight Horizontal Lines
  useEffect(() => {
    const handGroup = handGroupRef.current;
    if (!handGroup) return;

    while (handGroup.children.length > 0) {
      const child = handGroup.children[0] as THREE.Mesh;
      handGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    playerHandMeshesRef.current = [];
    playerHandVisualsRef.current = [];

    const backTexture = getBackTexture();
    const sideMaterial = new THREE.MeshBasicMaterial({
      color: 0x1c1917,
    });
    const hitboxMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    // Render Player 3D Hand Cards (Stationary Hitbox + Smooth Visual Mesh)
    playerHand.forEach((card, idx) => {
      const baseTransform = computeHandCardTransform(
        idx,
        playerHand.length,
        true,
        false,
        false
      );
      const baseRotX = -baseTransform.rotX * 0.55;

      // 1) Stationary Invisible Hitbox (Never moves on hover -> Zero Flickering!)
      const hitboxGeom = new THREE.BoxGeometry(
        CARD_WIDTH * 1.18,
        0.35,
        CARD_HEIGHT * 1.45
      );
      const hitboxMesh = new THREE.Mesh(hitboxGeom, hitboxMaterial);
      hitboxMesh.position.set(baseTransform.x, baseTransform.y, baseTransform.z);
      hitboxMesh.rotation.set(baseRotX, baseTransform.rotY, baseTransform.rotZ);
      hitboxMesh.userData = {
        isHandCard: true,
        isPlayer: true,
        cardInstance: card,
        index: idx,
      };
      handGroup.add(hitboxMesh);
      playerHandMeshesRef.current.push(hitboxMesh);

      // 2) Animated Visual 3D Card Mesh (Unlit natural colors — Zero Glare/Shine)
      const cardGeom = new THREE.BoxGeometry(CARD_WIDTH, CARD_THICKNESS, CARD_HEIGHT);
      const frontTex = getCardFaceTexture(card);

      const frontMat = new THREE.MeshBasicMaterial({
        map: frontTex,
      });

      const backMat = new THREE.MeshBasicMaterial({
        map: backTexture,
      });

      const materials = [
        sideMaterial,
        sideMaterial,
        frontMat, // +Y face tilted towards camera
        backMat,
        sideMaterial,
        sideMaterial,
      ];

      const visualMesh = new THREE.Mesh(cardGeom, materials);
      visualMesh.position.set(baseTransform.x, baseTransform.y, baseTransform.z);
      visualMesh.rotation.set(baseRotX, baseTransform.rotY, baseTransform.rotZ);
      visualMesh.scale.setScalar(baseTransform.scale);
      visualMesh.castShadow = true;

      handGroup.add(visualMesh);
      playerHandVisualsRef.current.push({
        uid: card.uid,
        mesh: visualMesh,
        frontMat,
        index: idx,
        total: playerHand.length,
      });
    });

    // Render Opponent Face-Down 3D Hand Cards in a Straight Line (Unlit — Zero Glare/Shine)
    const oppBackMat = new THREE.MeshBasicMaterial({
      map: backTexture,
    });
    const oppMaterials = [
      sideMaterial,
      sideMaterial,
      oppBackMat,
      oppBackMat,
      sideMaterial,
      sideMaterial,
    ];

    for (let i = 0; i < opponentHandCount; i++) {
      const transform = computeHandCardTransform(i, opponentHandCount, false);
      const cardGeom = new THREE.BoxGeometry(CARD_WIDTH, CARD_THICKNESS, CARD_HEIGHT);
      const mesh = new THREE.Mesh(cardGeom, oppMaterials);
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.rotation.set(transform.rotX, transform.rotY, transform.rotZ);
      mesh.scale.setScalar(transform.scale);
      handGroup.add(mesh);
    }

    syncInteractiveObjects();
  }, [playerHand, playerHandSignature, opponentHandCount, languagePt]);

  // 4. Particle VFX for Card Destruction & Legendary Field Spells/Traps
  const spawnDestructionVFX = (
    x: number,
    y: number,
    z: number,
    colorHex: number = 0xd97706,
    count: number = 42
  ) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = x + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 1] = y + Math.random() * 0.35;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2.8,
          Math.random() * 3.6 + 1.2,
          (Math.random() - 0.5) * 2.8
        )
      );
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.14,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    activeParticlesRef.current.push({
      points,
      velocities,
      createdAt: performance.now(),
      duration: 0.65,
    });
  };

  useEffect(() => {
    if (!activeFieldVfx) return;
    if (activeFieldVfx === 'RAIGEKI') {
      for (let i = -2; i <= 2; i++) {
        spawnDestructionVFX(i * ZONE_SPACING_X, 0.3, Z_OPPONENT_MONSTER, 0xfbbf24, 35);
      }
    } else if (activeFieldVfx === 'DARK_HOLE') {
      spawnDestructionVFX(0, 0.4, 0, 0x78716c, 90);
    } else if (activeFieldVfx === 'MIRROR_FORCE') {
      spawnDestructionVFX(0, 0.3, Z_OPPONENT_MONSTER, 0xfde68a, 75);
    } else if (activeFieldVfx === 'WABOKU') {
      spawnDestructionVFX(0, 0.3, Z_PLAYER_MONSTER, 0xfef3c7, 60);
    }
  }, [activeFieldVfx]);

  // 5. Dynamic Zone Highlighting (Warm Amber Gold for Summon/Set, Crimson for Attacker)
  useEffect(() => {
    zoneMeshesRef.current.forEach((mesh, key) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const border = zoneBorderMapRef.current.get(key);
      const borderMat = border?.material as THREE.LineBasicMaterial | undefined;
      const { isPlayer, zoneType, index, defaultColor } = mesh.userData;

      mesh.userData.isHighlight = false;

      if (isPlayer && zoneType === 'MONSTER' && validSummonZones.includes(index)) {
        mat.color.setHex(0xd97706);
        if (borderMat) borderMat.color.setHex(0xf59e0b);
        mesh.userData.isHighlight = true;
        return;
      }

      if (isPlayer && zoneType === 'SPELL_TRAP' && validSpellTrapZones.includes(index)) {
        mat.color.setHex(0xd97706);
        if (borderMat) borderMat.color.setHex(0xf59e0b);
        mesh.userData.isHighlight = true;
        return;
      }

      if (isPlayer && zoneType === 'MONSTER' && selectedAttackerZone === index) {
        mat.color.setHex(0xb91c1c);
        if (borderMat) borderMat.color.setHex(0xef4444);
        mesh.userData.isHighlight = true;
        return;
      }

      mat.color.setHex(defaultColor);
      if (borderMat) {
        borderMat.color.setHex(zoneType === 'MONSTER' ? 0xa88958 : 0x78716c);
      }
    });
  }, [validSummonZones, validSpellTrapZones, selectedAttackerZone]);

  // 6. Synchronize 3D Card Meshes on the Field
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    cardMeshesMapRef.current.forEach((mesh, uid) => {
      if (destroyedCardUids.includes(uid)) {
        spawnDestructionVFX(mesh.position.x, mesh.position.y, mesh.position.z);
      }
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    });
    cardMeshesMapRef.current.clear();

    const backTexture = getBackTexture();

    const createCardMesh = (
      card: CardInstance,
      x: number,
      z: number,
      isPlayer: boolean,
      zoneType: 'MONSTER' | 'SPELL_TRAP',
      index: number
    ) => {
      if (destroyedCardUids.includes(card.uid)) return;

      const cardGeometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_THICKNESS, CARD_HEIGHT);
      const frontTexture = getCardFaceTexture(card);

      const isFaceDown = Boolean(card.isFaceDown);
      const isTacticalTarget = tacticalTargetUids.includes(card.uid);
      const isAttacker = isPlayer && zoneType === 'MONSTER' && selectedAttackerZone === index;

      const sideMaterial = new THREE.MeshBasicMaterial({
        color: isAttacker ? 0xb91c1c : isTacticalTarget ? 0xd97706 : 0x1c1917,
      });

      const frontMaterial = new THREE.MeshBasicMaterial({
        map: isFaceDown ? backTexture : frontTexture,
      });

      const backMaterial = new THREE.MeshBasicMaterial({
        map: backTexture,
      });

      const materials = [
        sideMaterial,
        sideMaterial,
        frontMaterial, // Top face (Y+)
        backMaterial,  // Bottom face (Y-)
        sideMaterial,
        sideMaterial,
      ];

      const mesh = new THREE.Mesh(cardGeometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      let posX = x;
      let posY = 0.055;
      let posZ = z;

      if (
        lungingZone &&
        lungingZone.isPlayer === isPlayer &&
        lungingZone.zoneIndex === index &&
        zoneType === 'MONSTER'
      ) {
        let targetX = posX;
        const targetZ = isPlayer ? Z_OPPONENT_MONSTER : Z_PLAYER_MONSTER;

        if (lungingZone.targetIndex !== undefined && lungingZone.targetIndex !== null) {
          targetX = (lungingZone.targetIndex - 2) * ZONE_SPACING_X;
        }

        posX = THREE.MathUtils.lerp(posX, targetX, 0.7);
        posZ = THREE.MathUtils.lerp(posZ, targetZ, 0.7);
        posY = 0.55;
      }

      if (slamZone && slamZone.isPlayer === isPlayer && slamZone.zoneIndex === index) {
        posY = 0.35;
      }

      if (inspectedCardUid === card.uid) {
        posY = Math.max(posY, 0.26);
      }

      mesh.position.set(posX, posY, posZ);

      const isDefense = card.position === 'DEFENSE';
      if (isDefense) {
        mesh.rotation.y = Math.PI / 2;
      }

      if (!isPlayer && !isDefense) {
        mesh.rotation.y = Math.PI;
      }

      const isFlipping = flippedZones.some((f) => f.isPlayer === isPlayer && f.zoneIndex === index);
      if (isFlipping) {
        mesh.rotation.z = Math.PI / 4;
        mesh.position.y += 0.2;
      }

      if (
        targetHitZone &&
        targetHitZone.isPlayer === isPlayer &&
        targetHitZone.zoneIndex === index
      ) {
        mesh.position.x += (Math.random() - 0.5) * 0.15;
        mesh.position.z += (Math.random() - 0.5) * 0.15;
      }

      mesh.userData = {
        isCardMesh: true,
        cardInstance: card,
        isPlayer,
        zoneType,
        index,
      };

      scene.add(mesh);
      cardMeshesMapRef.current.set(card.uid, mesh);
    };

    playerMonsters.forEach((c, idx) => {
      if (c) createCardMesh(c, (idx - 2) * ZONE_SPACING_X, Z_PLAYER_MONSTER, true, 'MONSTER', idx);
    });

    playerSpellTraps.forEach((c, idx) => {
      if (c) createCardMesh(c, (idx - 2) * ZONE_SPACING_X, Z_PLAYER_ST, true, 'SPELL_TRAP', idx);
    });

    opponentMonsters.forEach((c, idx) => {
      if (c) createCardMesh(c, (idx - 2) * ZONE_SPACING_X, Z_OPPONENT_MONSTER, false, 'MONSTER', idx);
    });

    opponentSpellTraps.forEach((c, idx) => {
      if (c) createCardMesh(c, (idx - 2) * ZONE_SPACING_X, Z_OPPONENT_ST, false, 'SPELL_TRAP', idx);
    });

    syncInteractiveObjects();
  }, [
    playerMonsters,
    playerSpellTraps,
    opponentMonsters,
    opponentSpellTraps,
    fieldZonesSignature,
    languagePt,
    inspectedCardUid,
    selectedAttackerZone,
    tacticalTargetUids,
    lungingZone,
    slamZone,
    targetHitZone,
    destroyedCardUids,
    flippedZones,
  ]);

  // Collect occupied zones for floating 2D-over-3D tactical stats pills (Sober Dark Stone & Aged Gold)
  const tacticalPills = useMemo(() => {
    const pills: {
      key: string;
      left: string;
      top: string;
      label: string;
      subLabel?: string;
      isPlayer: boolean;
      isDefense: boolean;
      isFaceDown: boolean;
      isAttacker: boolean;
    }[] = [];

    const addMonsterPill = (card: CardInstance | null, idx: number, isPlayer: boolean) => {
      if (!card || destroyedCardUids.includes(card.uid)) return;
      const x = (idx - 2) * ZONE_SPACING_X;
      const z = isPlayer ? Z_PLAYER_MONSTER + 0.88 : Z_OPPONENT_MONSTER + 0.88;
      const pos = projectToScreenPercent(x, 0.08, z);
      const isFaceDown = Boolean(card.isFaceDown);
      const isDefense = card.position === 'DEFENSE';
      const isAttacker = isPlayer && selectedAttackerZone === idx;

      if (isFaceDown && !isPlayer) {
        pills.push({
          key: card.uid,
          left: pos.left,
          top: pos.top,
          label: 'DEF [OCULTO]',
          isPlayer,
          isDefense,
          isFaceDown,
          isAttacker,
        });
      } else {
        const displayName =
          languagePt && card.data.namePt ? card.data.namePt : card.data.name;
        pills.push({
          key: card.uid,
          left: pos.left,
          top: pos.top,
          label: `${card.data.attack ?? 0} / ${card.data.defense ?? 0}`,
          subLabel: displayName.length > 14 ? displayName.slice(0, 12) + '…' : displayName,
          isPlayer,
          isDefense,
          isFaceDown,
          isAttacker,
        });
      }
    };

    playerMonsters.forEach((c, idx) => addMonsterPill(c, idx, true));
    opponentMonsters.forEach((c, idx) => addMonsterPill(c, idx, false));

    return pills;
  }, [
    playerMonsters,
    opponentMonsters,
    destroyedCardUids,
    selectedAttackerZone,
    languagePt,
    projectToScreenPercent,
  ]);

  // 3D Flank Badges for Deck & Graveyard counts (Sober Stone & Bronze)
  const flankBadges = useMemo(() => {
    const pDeck = projectToScreenPercent(7.25, 0.35, Z_PLAYER_ST);
    const pGy = projectToScreenPercent(7.25, 0.2, Z_PLAYER_MONSTER);
    const oDeck = projectToScreenPercent(-7.25, 0.35, Z_OPPONENT_ST);
    const oGy = projectToScreenPercent(-7.25, 0.2, Z_OPPONENT_MONSTER);

    return [
      {
        key: 'p-deck',
        left: pDeck.left,
        top: pDeck.top,
        label: `DECK: ${playerDeckCount}`,
        tone: 'border-amber-900/60 text-amber-200/90 bg-[#141210]/90',
      },
      {
        key: 'p-gy',
        left: pGy.left,
        top: pGy.top,
        label: `${languagePt ? 'CEMITÉRIO' : 'GY'}: ${playerGraveyardCount}`,
        tone: 'border-stone-700/70 text-stone-300 bg-[#141210]/90',
      },
      {
        key: 'o-deck',
        left: oDeck.left,
        top: oDeck.top,
        label: `DECK OP.: ${opponentDeckCount}`,
        tone: 'border-amber-900/50 text-stone-300 bg-[#141210]/90',
      },
      {
        key: 'o-gy',
        left: oGy.left,
        top: oGy.top,
        label: `${languagePt ? 'CEM. OP.' : 'OP. GY'}: ${opponentGraveyardCount}`,
        tone: 'border-stone-700/70 text-stone-400 bg-[#141210]/90',
      },
    ];
  }, [
    playerDeckCount,
    playerGraveyardCount,
    opponentDeckCount,
    opponentGraveyardCount,
    languagePt,
    projectToScreenPercent,
  ]);

  const selectedHandCard = useMemo(
    () => playerHand.find((c) => c.uid === selectedHandCardUid) || null,
    [playerHand, selectedHandCardUid]
  );

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      {/* Three.js / WebGPU Canvas Container */}
      <div
        ref={containerRef}
        className={`w-full h-full transition-transform ${isCameraShaking ? 'anim-camera-shake' : ''}`}
      />

      {/* Pointer-Events-None Tactical Stats & 3D Flank Overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {flankBadges.map((b) => (
          <div
            key={b.key}
            style={{ left: b.left, top: b.top }}
            className={`-translate-x-1/2 -translate-y-1/2 absolute rounded border px-1.5 py-0.5 text-[8px] font-mono font-bold tracking-wider backdrop-blur-md shadow ${b.tone}`}
          >
            {b.label}
          </div>
        ))}

        {tacticalPills.map((pill) => {
          const isVisible = isTacticalPillVisible(
            pill.key,
            hoveredCardUid,
            pill.isAttacker,
            tacticalTargetUids
          );

          return (
            <div
              key={pill.key}
              style={{ left: pill.left, top: pill.top }}
              className={`-translate-x-1/2 -translate-y-1/2 absolute flex flex-col items-center rounded border px-1.5 py-0.5 text-[9px] font-mono backdrop-blur-md shadow-lg transition-all duration-200 pointer-events-none select-none ${
                isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
              } ${
                pill.isAttacker
                  ? 'bg-red-950/90 border-red-700/80 text-red-200'
                  : pill.isDefense
                  ? 'bg-[#141210]/90 border-stone-600/80 text-stone-200'
                  : 'bg-[#141210]/90 border-amber-800/70 text-amber-200'
              }`}
            >
              {pill.subLabel && (
                <span className="text-[8px] font-sans font-bold text-stone-300 leading-tight">
                  {pill.subLabel}
                </span>
              )}
              <span className="font-extrabold tracking-tight leading-tight">
                {pill.isDefense ? `[DEF] ${pill.label}` : `[ATK] ${pill.label}`}
              </span>
            </div>
          );
        })}

        {selectedHandCard && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded border border-amber-700/70 bg-[#141210]/95 px-4 py-1 text-[10px] font-mono font-bold tracking-wider text-amber-200 shadow-lg backdrop-blur-md">
            [MÃO: {(languagePt && selectedHandCard.data.namePt) || selectedHandCard.data.name} — SELECIONE UMA ZONA NO TABULEIRO]
          </div>
        )}
      </div>
    </div>
  );
};
