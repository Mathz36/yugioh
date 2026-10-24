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

  // Subtle dark matte card back placeholder (zero bright borders)
  const bgGrad = ctx.createRadialGradient(128, 186, 15, 128, 186, 190);
  bgGrad.addColorStop(0, '#291d18');
  bgGrad.addColorStop(0.6, '#1c1412');
  bgGrad.addColorStop(1, '#120c0a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 256, 372);

  ctx.strokeStyle = '#3f342c';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 368);

  // Subtle dark vortex oval in the center
  ctx.save();
  ctx.translate(128, 186);
  ctx.strokeStyle = 'rgba(120, 92, 50, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, 92, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(28, 20, 18, 0.65)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, 256, 372);
        texture.needsUpdate = true;
      } catch {}
    };
    img.src = '/card-back.jpg';
  }

  cachedBackTexture = texture;
  return texture;
}
