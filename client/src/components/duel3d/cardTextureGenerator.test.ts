import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CLASSIC_CARDS } from '@duel/starter-decks';
import {
  getCardFramePalette,
  resolveCardImageUrl,
  createCardFaceTexture,
  createCardBackTexture,
  clearCardTextureCache,
} from './cardTextureGenerator';

describe('cardTextureGenerator - Procedural Yu-Gi-Oh! Frames & CORS-Safe Proxy URLs', () => {
  beforeEach(() => {
    clearCardTextureCache();
  });

  describe('getCardFramePalette', () => {
    it('should return NORMAL_MONSTER golden palette for Normal Monster', () => {
      // Arrange
      const cardType = 'Normal Monster';

      // Act
      const palette = getCardFramePalette(cardType);

      // Assert
      expect(palette.category).toBe('NORMAL_MONSTER');
      expect(palette.primary).toBe('#b45309');
      expect(palette.border).toBe('#fbbf24');
    });

    it('should return EFFECT_MONSTER orange palette for Effect Monster and Flip Effect Monster', () => {
      // Arrange
      const effectType = 'Effect Monster';
      const flipType = 'Flip Effect Monster';

      // Act
      const effectPalette = getCardFramePalette(effectType);
      const flipPalette = getCardFramePalette(flipType);

      // Assert
      expect(effectPalette.category).toBe('EFFECT_MONSTER');
      expect(effectPalette.primary).toBe('#c2410c');
      expect(effectPalette.border).toBe('#fb923c');
      expect(flipPalette.category).toBe('EFFECT_MONSTER');
      expect(flipPalette.primary).toBe('#c2410c');
    });

    it('should return SPELL emerald palette for Spell Card and Carta Mágica', () => {
      // Arrange
      const spellEn = 'Spell Card';
      const spellPt = 'Carta Mágica';

      // Act
      const paletteEn = getCardFramePalette(spellEn);
      const palettePt = getCardFramePalette(spellPt);

      // Assert
      expect(paletteEn.category).toBe('SPELL');
      expect(paletteEn.primary).toBe('#0f766e');
      expect(paletteEn.border).toBe('#34d399');
      expect(palettePt.category).toBe('SPELL');
      expect(palettePt.primary).toBe('#0f766e');
    });

    it('should return TRAP magenta palette for Trap Card and Carta Armadilha', () => {
      // Arrange
      const trapEn = 'Trap Card';
      const trapPt = 'Carta Armadilha';

      // Act
      const paletteEn = getCardFramePalette(trapEn);
      const palettePt = getCardFramePalette(trapPt);

      // Assert
      expect(paletteEn.category).toBe('TRAP');
      expect(paletteEn.primary).toBe('#9d174d');
      expect(paletteEn.border).toBe('#f472b6');
      expect(palettePt.category).toBe('TRAP');
      expect(palettePt.primary).toBe('#9d174d');
    });
  });

  describe('resolveCardImageUrl', () => {
    it('should rewrite YGOPRODeck remote URLs to local CORS-safe proxy paths', () => {
      // Arrange
      const lusterDragonUrl = 'https://images.ygoprodeck.com/images/cards/11091375.jpg';

      // Act
      const resolvedUrl = resolveCardImageUrl(lusterDragonUrl);

      // Assert
      expect(resolvedUrl).toBe('/api/card-image/11091375.jpg');
    });

    it('should preserve local asset paths such as /card-back.jpg', () => {
      // Arrange
      const localPath = '/card-back.jpg';

      // Act
      const resolvedUrl = resolveCardImageUrl(localPath);

      // Assert
      expect(resolvedUrl).toBe('/card-back.jpg');
    });

    it('should fall back to /card-back.jpg when given undefined or empty string', () => {
      // Arrange
      const undefinedUrl = undefined;
      const emptyUrl = '';
      const whitespaceUrl = '   ';

      // Act
      const resUndefined = resolveCardImageUrl(undefinedUrl);
      const resEmpty = resolveCardImageUrl(emptyUrl);
      const resWhitespace = resolveCardImageUrl(whitespaceUrl);

      // Assert
      expect(resUndefined).toBe('/card-back.jpg');
      expect(resEmpty).toBe('/card-back.jpg');
      expect(resWhitespace).toBe('/card-back.jpg');
    });
  });

  describe('createCardFaceTexture, createCardBackTexture, and clearCardTextureCache', () => {
    it('should return valid THREE.Texture instances for Normal, Effect, Spell, and Trap cards in both PT and EN', () => {
      // Arrange
      const lusterDragon = CLASSIC_CARDS.LUSTER_DRAGON;
      const manEaterBug = CLASSIC_CARDS.MAN_EATER_BUG;
      const raigeki = CLASSIC_CARDS.RAIGEKI;
      const mirrorForce = CLASSIC_CARDS.MIRROR_FORCE;

      // Act
      const texNormalPt = createCardFaceTexture(lusterDragon, true);
      const texNormalEn = createCardFaceTexture(lusterDragon, false);
      const texEffectPt = createCardFaceTexture(manEaterBug, true);
      const texEffectEn = createCardFaceTexture(manEaterBug, false);
      const texSpellPt = createCardFaceTexture(raigeki, true);
      const texSpellEn = createCardFaceTexture(raigeki, false);
      const texTrapPt = createCardFaceTexture(mirrorForce, true);
      const texTrapEn = createCardFaceTexture(mirrorForce, false);
      const texBack = createCardBackTexture();

      // Assert
      expect(texNormalPt).toBeInstanceOf(THREE.Texture);
      expect(texNormalEn).toBeInstanceOf(THREE.Texture);
      expect(texEffectPt).toBeInstanceOf(THREE.Texture);
      expect(texEffectEn).toBeInstanceOf(THREE.Texture);
      expect(texSpellPt).toBeInstanceOf(THREE.Texture);
      expect(texSpellEn).toBeInstanceOf(THREE.Texture);
      expect(texTrapPt).toBeInstanceOf(THREE.Texture);
      expect(texTrapEn).toBeInstanceOf(THREE.Texture);
      expect(texBack).toBeInstanceOf(THREE.Texture);
    });

    it('should cache generated textures and reset cache cleanly when clearCardTextureCache is called', () => {
      // Arrange
      const lusterDragon = CLASSIC_CARDS.LUSTER_DRAGON;

      // Act
      const firstFaceTex = createCardFaceTexture(lusterDragon, true);
      const cachedFaceTex = createCardFaceTexture(lusterDragon, true);
      const firstBackTex = createCardBackTexture();
      const cachedBackTex = createCardBackTexture();

      clearCardTextureCache();

      const freshFaceTex = createCardFaceTexture(lusterDragon, true);
      const freshBackTex = createCardBackTexture();

      // Assert
      expect(firstFaceTex).toBe(cachedFaceTex);
      expect(firstBackTex).toBe(cachedBackTex);
      expect(freshFaceTex).not.toBe(firstFaceTex);
      expect(freshBackTex).not.toBe(firstBackTex);
    });
  });
});
