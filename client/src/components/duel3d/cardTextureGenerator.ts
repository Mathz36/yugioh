import * as THREE from 'three';

export interface CardFramePalette {
  primary: string;
  secondary: string;
  border: string;
  textColor: string;
  category: 'NORMAL_MONSTER' | 'EFFECT_MONSTER' | 'SPELL' | 'TRAP';
}

export interface CardTextureInput {
  id?: string;
  name: string;
  namePt?: string;
  type: string;
  level?: number;
  attack?: number;
  defense?: number;
  imageUrl?: string;
}

const YGOPRO_IMAGE_PREFIX = 'https://images.ygoprodeck.com/images/cards/';
const PROXY_IMAGE_PREFIX = '/api/card-image/';

const cardFaceTextureCache = new Map<string, THREE.Texture>();
let cachedBackTexture: THREE.Texture | null = null;
let cachedBackDataUrl: string | null = null;

/**
 * Disposes and clears all cached procedural/proxy card textures.
 */
export function clearCardTextureCache(): void {
  cardFaceTextureCache.forEach((tex) => {
    try {
      tex.dispose();
    } catch {}
  });
  cardFaceTextureCache.clear();
  if (cachedBackTexture) {
    try {
      cachedBackTexture.dispose();
    } catch {}
    cachedBackTexture = null;
  }
  cachedBackDataUrl = null;
}

/**
 * Determines the classic Yu-Gi-Oh! card frame palette based on card type string.
 */
export function getCardFramePalette(cardType: string): CardFramePalette {
  const normalized = (cardType || '').toLowerCase();

  if (normalized.includes('spell') || normalized.includes('mágica') || normalized.includes('magica')) {
    return {
      category: 'SPELL',
      primary: '#0f766e',
      secondary: '#064e3b',
      border: '#34d399',
      textColor: '#ecfdf5',
    };
  }

  if (normalized.includes('trap') || normalized.includes('armadilha')) {
    return {
      category: 'TRAP',
      primary: '#9d174d',
      secondary: '#500724',
      border: '#f472b6',
      textColor: '#fdf2f8',
    };
  }

  if (
    normalized.includes('effect') ||
    normalized.includes('efeito') ||
    normalized.includes('flip')
  ) {
    return {
      category: 'EFFECT_MONSTER',
      primary: '#c2410c',
      secondary: '#7c2d12',
      border: '#fb923c',
      textColor: '#fff7ed',
    };
  }

  return {
    category: 'NORMAL_MONSTER',
    primary: '#b45309',
    secondary: '#78350f',
    border: '#fbbf24',
    textColor: '#fffbeb',
  };
}

/**
 * Rewrites remote YGOPRODeck image URLs to go through the local CORS-safe proxy.
 */
export function resolveCardImageUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) {
    return '/card-back.jpg';
  }
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith(YGOPRO_IMAGE_PREFIX)) {
    return trimmed.replace(YGOPRO_IMAGE_PREFIX, PROXY_IMAGE_PREFIX);
  }
  return trimmed;
}

/**
 * Generates a WebGPU-safe THREE.CanvasTexture for a card face with immediate procedural
 * Yu-Gi-Oh! frame rendering and asynchronous high-resolution artwork overlay.
 */
export function createCardFaceTexture(
  cardData: CardTextureInput,
  languagePt: boolean = true
): THREE.Texture {
  const cacheKey = `${cardData.id || cardData.name || 'card'}::${cardData.type}::${languagePt ? 'pt' : 'en'}`;
  const cached = cardFaceTextureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (typeof document === 'undefined') {
    const fallbackTex = new THREE.Texture();
    cardFaceTextureCache.set(cacheKey, fallbackTex);
    return fallbackTex;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 372;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallbackTex = new THREE.Texture();
    cardFaceTextureCache.set(cacheKey, fallbackTex);
    return fallbackTex;
  }

  const palette = getCardFramePalette(cardData.type);
  const displayName =
    languagePt && cardData.namePt ? cardData.namePt : cardData.name || 'Duel Card';

  // 1. Subtle Dark Matte Border (Zero artificial glow)
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, 256, 372);

  // 2. Inner Card Frame Gradient
  const frameGrad = ctx.createLinearGradient(0, 6, 0, 366);
  frameGrad.addColorStop(0, palette.primary);
  frameGrad.addColorStop(1, palette.secondary);
  ctx.fillStyle = frameGrad;
  ctx.fillRect(6, 6, 244, 360);

  ctx.strokeStyle = '#44403c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(8, 8, 240, 356);

  // 3. Top Title Bar
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(16, 16, 224, 28);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(16, 16, 224, 28);

  ctx.fillStyle = palette.textColor;
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'middle';
  const truncatedName =
    displayName.length > 22 ? displayName.slice(0, 20) + '...' : displayName;
  ctx.fillText(truncatedName, 22, 30);

  // 4. Level Stars or Spell/Trap Subtitle
  ctx.textAlign = 'right';
  if (palette.category === 'SPELL') {
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(languagePt ? '[CARTA MÁGICA]' : '[SPELL CARD]', 236, 56);
  } else if (palette.category === 'TRAP') {
    ctx.fillStyle = '#f9a8d4';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(languagePt ? '[CARTA ARMADILHA]' : '[TRAP CARD]', 236, 56);
  } else {
    const level = Math.max(1, Math.min(12, cardData.level ?? 4));
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('★'.repeat(level), 236, 56);
  }
  ctx.textAlign = 'left';

  // 5. Central Artwork Box (Mystic Placeholder before image loads)
  const artGrad = ctx.createRadialGradient(128, 172, 12, 128, 172, 110);
  artGrad.addColorStop(0, '#4c1d95');
  artGrad.addColorStop(0.6, '#1e1b4b');
  artGrad.addColorStop(1, '#090514');
  ctx.fillStyle = artGrad;
  ctx.fillRect(24, 66, 208, 206);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(24, 66, 208, 206);

  // Sacred geometry emblem inside placeholder art box
  ctx.save();
  ctx.translate(128, 169);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.lineTo(42, 28);
  ctx.lineTo(-42, 28);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // 6. Bottom Lore & Stats Box
  ctx.fillStyle = 'rgba(15, 10, 25, 0.88)';
  ctx.fillRect(16, 280, 224, 74);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 280, 224, 74);

  if (palette.category === 'SPELL' || palette.category === 'TRAP') {
    ctx.fillStyle = palette.textColor;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      palette.category === 'SPELL'
        ? languagePt
          ? 'EFEITO MÁGICO'
          : 'SPELL EFFECT'
        : languagePt
        ? 'EFEITO DE ARMADILHA'
        : 'TRAP EFFECT',
      128,
      318
    );
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(
      palette.category === 'EFFECT_MONSTER'
        ? languagePt
          ? '[MONSTRO / EFEITO]'
          : '[MONSTER / EFFECT]'
        : languagePt
        ? '[MONSTRO NORMAL]'
        : '[NORMAL MONSTER]',
      24,
      298
    );

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.beginPath();
    ctx.moveTo(22, 322);
    ctx.lineTo(234, 322);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `ATK/${cardData.attack ?? 0}  DEF/${cardData.defense ?? 0}`,
      232,
      340
    );
    ctx.textAlign = 'left';
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // 7. Asynchronous Artwork Download via CORS-Safe Proxy
  if (typeof Image !== 'undefined' && cardData.imageUrl) {
    const resolvedUrl = resolveCardImageUrl(cardData.imageUrl);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // Draw the full high-res card scan cleanly edge-to-edge without artificial glowing borders
        ctx.drawImage(img, 0, 0, 256, 372);
        texture.needsUpdate = true;
      } catch {
        // Keep procedural card face if canvas is tainted
      }
    };
    img.src = resolvedUrl;
  }

  cardFaceTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Renders an authentic procedural Yu-Gi-Oh! card back onto a 2D canvas context.
 * Features the signature dark reddish-brown border, inner dark chamber,
 * cosmic vortex glow and central oval medallion, with zero external network dependencies.
 */
export function drawProceduralCardBack(
  ctx: CanvasRenderingContext2D,
  width: number = 256,
  height: number = 372
): void {
  // 1. Deep reddish-brown outer border
  ctx.fillStyle = '#2e1208';
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle outer border trim
  ctx.strokeStyle = '#180a04';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

  // 3. Inner dark card body
  const innerMarginX = 14;
  const innerMarginY = 16;
  const innerW = width - innerMarginX * 2;
  const innerH = height - innerMarginY * 2;

  const bgGrad = ctx.createRadialGradient(
    width / 2, height / 2, 10,
    width / 2, height / 2, innerW / 1.1
  );
  bgGrad.addColorStop(0, '#381c10');
  bgGrad.addColorStop(0.5, '#200f07');
  bgGrad.addColorStop(1, '#0e0603');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(innerMarginX, innerMarginY, innerW, innerH);

  // Inner border outline
  ctx.strokeStyle = '#5a2d18';
  ctx.lineWidth = 2;
  ctx.strokeRect(innerMarginX, innerMarginY, innerW, innerH);

  // 4. Central cosmic vortex swirl
  ctx.save();
  ctx.translate(width / 2, height / 2);

  // Outer vortex glow
  const vortexGrad = ctx.createRadialGradient(0, 0, 15, 0, 0, 85);
  vortexGrad.addColorStop(0, 'rgba(217, 119, 6, 0.45)');
  vortexGrad.addColorStop(0.5, 'rgba(146, 64, 14, 0.25)');
  vortexGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vortexGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 68, 104, 0, 0, Math.PI * 2);
  ctx.fill();

  // Swirl arcs
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 56, 88, -0.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(180, 83, 9, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 44, 70, 0.2, 0, Math.PI * 2);
  ctx.stroke();

  // Central dark medallion
  ctx.fillStyle = '#140a05';
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 52, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 52, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 38, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // 5. Bottom right authentic hologram square
  const holoSize = 12;
  const holoX = innerMarginX + innerW - holoSize - 4;
  const holoY = innerMarginY + innerH - holoSize - 4;
  const holoGrad = ctx.createLinearGradient(holoX, holoY, holoX + holoSize, holoY + holoSize);
  holoGrad.addColorStop(0, '#fef08a');
  holoGrad.addColorStop(0.5, '#ca8a04');
  holoGrad.addColorStop(1, '#854d0e');
  ctx.fillStyle = holoGrad;
  ctx.fillRect(holoX, holoY, holoSize, holoSize);
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(holoX, holoY, holoSize, holoSize);
}

/**
 * Returns a robust data URL for the procedural card back (for 2D img fallbacks).
 */
export function getCardBackDataUrl(): string {
  if (cachedBackDataUrl) return cachedBackDataUrl;
  if (typeof document === 'undefined') return '/card-back.jpg';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 372;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '/card-back.jpg';
    drawProceduralCardBack(ctx, 256, 372);
    cachedBackDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return cachedBackDataUrl;
  } catch {
    return '/card-back.jpg';
  }
}

/**
 * Generates a WebGPU-safe THREE.CanvasTexture for the classic Yu-Gi-Oh! card back.
 */
export function createCardBackTexture(): THREE.Texture {
  if (cachedBackTexture) {
    return cachedBackTexture;
  }

  if (typeof document === 'undefined') {
    cachedBackTexture = new THREE.Texture();
    return cachedBackTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 372;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cachedBackTexture = new THREE.Texture();
    return cachedBackTexture;
  }

  drawProceduralCardBack(ctx, 256, 372);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  if (typeof Image !== 'undefined') {
    const tryLoad = (url: string, next?: () => void) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, 256, 372);
          texture.needsUpdate = true;
        } catch {}
      };
      if (next) {
        img.onerror = () => next();
      }
      img.src = url;
    };

    tryLoad('/card-back.jpg', () => {
      tryLoad('./card-back.jpg');
    });
  }

  cachedBackTexture = texture;
  return texture;
}
