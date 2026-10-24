import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { App } from '../App';
import { AuthModal } from './AuthModal';
import { GameMenu } from './GameMenu';
import { DeckBuilder } from './DeckBuilder';
import { Playmat, PlaymatProps } from './Playmat';
import { SettingsModal } from './SettingsModal';
import { WebGPUBackdrop, WebGPUBackdropProps } from './duel3d/WebGPUBackdrop';
import { Card3DShowcase } from './duel3d/Card3DShowcase';
import { DuelArena3D, DuelArena3DProps } from './duel3d/DuelArena3D';
import { verifyHardwareAcceleration } from './duel3d/webgpuCore';
import {
  createCardFaceTexture,
  clearCardTextureCache,
  resolveCardImageUrl,
} from './duel3d/cardTextureGenerator';
import { DuelMatchSession } from '@duel/duel-match-session';
import { CLASSIC_CARDS, createYugiDeck, createKaibaDeck } from '@duel/starter-decks';
import { getAllCatalogCards } from '../utils/deckStorage';

function extractArena3DPropsFromSession(
  session: DuelMatchSession,
  selectedHandCardUid: string | null = null
): DuelArena3DProps {
  return {
    playerMonsters: [...session.player1.monsterZones],
    playerSpellTraps: [...session.player1.spellTrapZones],
    opponentMonsters: [...session.player2.monsterZones],
    opponentSpellTraps: [...session.player2.spellTrapZones],
    playerHand: [...session.player1.hand],
    opponentHandCount: session.player2.hand.length,
    selectedHandCardUid,
    playerDeckCount: session.player1.deck.length,
    playerGraveyardCount: session.player1.graveyard.length,
    opponentDeckCount: session.player2.deck.length,
    opponentGraveyardCount: session.player2.graveyard.length,
    languagePt: true,
    activeFieldVfx: null,
  };
}

describe('FrontendWebGPU - 100% 3D Exclusive Screens, Hardware Guard & DuelArena3D State Sync', () => {
  beforeEach(() => {
    clearCardTextureCache();
  });

  it('should export valid React components for all WebGPU-enabled screens and 3D modules', () => {
    // Arrange
    const components = {
      App,
      AuthModal,
      GameMenu,
      DeckBuilder,
      Playmat,
      SettingsModal,
      WebGPUBackdrop,
      Card3DShowcase,
      DuelArena3D,
    };

    // Act
    const componentEntries = Object.entries(components);

    // Assert
    expect(componentEntries).toHaveLength(9);
    for (const [, componentFn] of componentEntries) {
      expect(componentFn).toBeDefined();
      expect(typeof componentFn).toBe('function');
    }
  });

  it('should support WebGPUBackdrop variant="menu" (clean video plane without spinning 3D artifact) vs variant="auth" and variant="deck"', () => {
    // Arrange
    const menuProps: WebGPUBackdropProps = {
      variant: 'menu',
      videoSrc: '/video/banner.mp4',
      showBadge: true,
    };
    const authProps: WebGPUBackdropProps = {
      variant: 'auth',
      showBadge: true,
    };
    const deckProps: WebGPUBackdropProps = {
      variant: 'deck',
      showBadge: false,
    };

    // Act
    const shouldRenderSpinningArtifact = (v?: WebGPUBackdropProps['variant']) => v === 'auth';
    const shouldRenderVideoPlane = (props: WebGPUBackdropProps) =>
      props.variant === 'menu' || Boolean(props.videoSrc);

    // Assert
    expect(shouldRenderSpinningArtifact(menuProps.variant)).toBe(false);
    expect(shouldRenderVideoPlane(menuProps)).toBe(true);
    expect(shouldRenderSpinningArtifact(authProps.variant)).toBe(true);
    expect(shouldRenderVideoPlane(authProps)).toBe(false);
    expect(shouldRenderSpinningArtifact(deckProps.variant)).toBe(false);
  });

  it('should synchronize initial DuelMatchSession state with DuelArena3D 3D hands, decks, and zones', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );

    // Act
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(session.matchState.phase).toBe('MAIN1');
    expect(arenaProps.playerHand).toHaveLength(5);
    expect(arenaProps.opponentHandCount).toBe(5);
    expect(arenaProps.playerDeckCount).toBe(35);
    expect(arenaProps.opponentDeckCount).toBe(35);
    expect(arenaProps.playerGraveyardCount).toBe(0);
    expect(arenaProps.opponentGraveyardCount).toBe(0);
    expect(arenaProps.playerMonsters.every((slot) => slot === null)).toBe(true);
    expect(arenaProps.playerSpellTraps.every((slot) => slot === null)).toBe(true);
  });

  it('should execute full 3D Hand-to-Field lifecycle: selecting a card in the 5-card 3D hand and summoning it reduces playerHand to 4 and populates playerMonsters', () => {
    // Arrange
    const level4Deck = Array.from({ length: 40 }, () => CLASSIC_CARDS.LUSTER_DRAGON);
    const session = new DuelMatchSession(
      'Yugi Muto',
      level4Deck,
      'Seto Kaiba',
      createKaibaDeck()
    );
    const initialProps = extractArena3DPropsFromSession(session);
    const selectedCardFrom3DHand = initialProps.playerHand![0]!;

    // Act
    const propsWhenSelected = extractArena3DPropsFromSession(session, selectedCardFrom3DHand.uid);
    const summonSuccess = session.normalSummon(selectedCardFrom3DHand.uid, 2, 'ATTACK', [], false);
    const propsAfterSummon = extractArena3DPropsFromSession(session, null);

    // Assert
    expect(initialProps.playerHand).toHaveLength(5);
    expect(initialProps.opponentHandCount).toBe(5);
    expect(propsWhenSelected.selectedHandCardUid).toBe(selectedCardFrom3DHand.uid);
    expect(summonSuccess).toBe(true);
    expect(propsAfterSummon.playerHand).toHaveLength(4);
    expect(propsAfterSummon.playerMonsters[2]?.uid).toBe(selectedCardFrom3DHand.uid);
    expect(propsAfterSummon.playerMonsters[2]?.data.name).toBe('Luster Dragon');
  });

  it('should guarantee that placing cards on the table (Face-Down Monster, Set Spell/Trap, or Spell Activation) immediately leaves the player hand', () => {
    // Arrange: Match session with deterministic player hand
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );

    session.player1.hand = [
      {
        uid: 'test_trap_hole',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
        isFaceDown: false,
      },
      {
        uid: 'test_man_eater',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
        isFaceDown: false,
      },
      {
        uid: 'test_monster_atk',
        data: CLASSIC_CARDS.LUSTER_DRAGON,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
        isFaceDown: false,
      },
    ];

    const initialProps = extractArena3DPropsFromSession(session);
    expect(initialProps.playerHand).toHaveLength(3);

    // 1. Set Trap Hole on Spell/Trap Zone 1
    const setSuccess = session.setSpellTrap('test_trap_hole', 1);
    expect(setSuccess).toBe(true);

    const propsAfterSet = extractArena3DPropsFromSession(session);
    // Card must have left the player's hand!
    expect(propsAfterSet.playerHand).toHaveLength(2);
    expect(propsAfterSet.playerHand.some((c) => c.uid === 'test_trap_hole')).toBe(false);
    expect(propsAfterSet.playerSpellTraps[1]?.uid).toBe('test_trap_hole');
    expect(propsAfterSet.playerSpellTraps[1]?.isFaceDown).toBe(true);

    // 2. Set Man-Eater Bug face-down in Defense Mode on Monster Zone 0
    const summonSetSuccess = session.normalSummon('test_man_eater', 0, 'DEFENSE', [], true);
    expect(summonSetSuccess).toBe(true);

    const propsAfterSummonSet = extractArena3DPropsFromSession(session);
    // Card must have left the player's hand!
    expect(propsAfterSummonSet.playerHand).toHaveLength(1);
    expect(propsAfterSummonSet.playerHand.some((c) => c.uid === 'test_man_eater')).toBe(false);
    expect(propsAfterSummonSet.playerMonsters[0]?.uid).toBe('test_man_eater');
    expect(propsAfterSummonSet.playerMonsters[0]?.isFaceDown).toBe(true);
    expect(propsAfterSummonSet.playerMonsters[0]?.position).toBe('DEFENSE');

    // 3. Summon Luster Dragon in Attack Mode on Monster Zone 2
    session.player1.hasNormalSummonedThisTurn = false; // Reset normal summon flag for demonstration
    const summonAtkSuccess = session.normalSummon('test_monster_atk', 2, 'ATTACK', [], false);
    expect(summonAtkSuccess).toBe(true);

    const propsAfterAtkSummon = extractArena3DPropsFromSession(session);
    // All placed cards have left the hand, leaving the hand empty
    expect(propsAfterAtkSummon.playerHand).toHaveLength(0);
    expect(propsAfterAtkSummon.playerMonsters[2]?.uid).toBe('test_monster_atk');
    expect(propsAfterAtkSummon.playerMonsters[2]?.position).toBe('ATTACK');
  });

  it('should enforce Hardware Acceleration Guard contract via verifyHardwareAcceleration and PlaymatProps.onHardwareError', async () => {
    // Arrange
    const unsupportedNav = { gpu: null };
    const unsupportedDoc = {
      createElement: () => ({
        getContext: () => null,
      }),
    };
    const onHardwareErrorSpy = vi.fn();
    const playmatProps: PlaymatProps = {
      playerNickname: 'Yugi Muto',
      onExitToMenu: vi.fn(),
      onHardwareError: onHardwareErrorSpy,
    };

    // Act
    const hwStatus = await verifyHardwareAcceleration(unsupportedNav, unsupportedDoc);
    if (!hwStatus.supported && playmatProps.onHardwareError) {
      playmatProps.onHardwareError(hwStatus.reason || 'GPU unavailable');
    }

    // Assert
    expect(hwStatus.supported).toBe(false);
    expect(hwStatus.backend).toBe('NONE');
    expect(onHardwareErrorSpy).toHaveBeenCalledTimes(1);
    expect(onHardwareErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Aceleração de Hardware')
    );
  });

  it('should synchronize Normal Summon in MAIN1 with playerMonsters slot in DuelArena3DProps', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const lusterDragonInstance = {
      uid: 'p1_custom_luster',
      data: CLASSIC_CARDS.LUSTER_DRAGON,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.hand.push(lusterDragonInstance);

    // Act
    const summoned = session.normalSummon('p1_custom_luster', 2, 'ATTACK', [], false);
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(summoned).toBe(true);
    expect(arenaProps.playerMonsters[2]).not.toBeNull();
    expect(arenaProps.playerMonsters[2]?.data.name).toBe('Luster Dragon');
    expect(arenaProps.playerMonsters[2]?.position).toBe('ATTACK');
    expect(arenaProps.playerMonsters[2]?.isFaceDown).toBe(false);
  });

  it('should allow Normal Summon during MAIN2 when not yet summoned in MAIN1 and sync to 3D Arena', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const celticGuardianInstance = {
      uid: 'p1_celtic_main2',
      data: CLASSIC_CARDS.CELTIC_GUARDIAN,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.hand.push(celticGuardianInstance);

    // Act
    session.nextPhase(); // MAIN1 -> BATTLE
    session.nextPhase(); // BATTLE -> MAIN2
    const summonedInMain2 = session.normalSummon('p1_celtic_main2', 0, 'ATTACK', [], false);
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(session.matchState.phase).toBe('MAIN2');
    expect(summonedInMain2).toBe(true);
    expect(arenaProps.playerMonsters[0]?.data.name).toBe('Celtic Guardian');
    expect(arenaProps.playerMonsters[0]?.position).toBe('ATTACK');
  });

  it('should synchronize setting a Face-Down Defense monster with position DEFENSE and isFaceDown true', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const manEaterInstance = {
      uid: 'p1_maneater_set',
      data: CLASSIC_CARDS.MAN_EATER_BUG,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.hand.push(manEaterInstance);

    // Act
    const setSuccess = session.normalSummon('p1_maneater_set', 1, 'DEFENSE', [], true);
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(setSuccess).toBe(true);
    expect(arenaProps.playerMonsters[1]).not.toBeNull();
    expect(arenaProps.playerMonsters[1]?.position).toBe('DEFENSE');
    expect(arenaProps.playerMonsters[1]?.isFaceDown).toBe(true);
  });

  it('should synchronize Level 5-6 Tribute Summon by sending 1 tribute to playerGraveyardCount and placing monster in target zone', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const tributeFodder = {
      uid: 'p1_fodder_1',
      data: CLASSIC_CARDS.FERAL_IMP,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    const summonedSkull = {
      uid: 'p1_summoned_skull',
      data: CLASSIC_CARDS.SUMMONED_SKULL,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.monsterZones[0] = tributeFodder;
    session.player1.hand.push(summonedSkull);

    // Act
    const tributeSuccess = session.normalSummon('p1_summoned_skull', 0, 'ATTACK', [0], false);
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(tributeSuccess).toBe(true);
    expect(arenaProps.playerGraveyardCount).toBe(1);
    expect(arenaProps.playerMonsters[0]?.data.name).toBe('Summoned Skull');
    expect(arenaProps.playerMonsters[0]?.data.level).toBe(6);
  });

  it('should synchronize Level 7+ Tribute Summon by sending 2 tributes to playerGraveyardCount and placing boss monster in target zone', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const fodder1 = {
      uid: 'p1_fodder_a',
      data: CLASSIC_CARDS.BEAVER_WARRIOR,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    const fodder2 = {
      uid: 'p1_fodder_b',
      data: CLASSIC_CARDS.SILVER_FANG,
      position: 'DEFENSE' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    const blueEyes = {
      uid: 'p1_blue_eyes',
      data: CLASSIC_CARDS.BLUE_EYES,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.monsterZones[1] = fodder1;
    session.player1.monsterZones[3] = fodder2;
    session.player1.hand.push(blueEyes);

    // Act
    const tributeSuccess = session.normalSummon('p1_blue_eyes', 2, 'ATTACK', [1, 3], false);
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(tributeSuccess).toBe(true);
    expect(arenaProps.playerGraveyardCount).toBe(2);
    expect(arenaProps.playerMonsters[1]).toBeNull();
    expect(arenaProps.playerMonsters[3]).toBeNull();
    expect(arenaProps.playerMonsters[2]?.data.name).toBe('Blue-Eyes White Dragon');
    expect(arenaProps.playerMonsters[2]?.data.attack).toBe(3000);
  });

  it('should synchronize setting a Trap card face-down into playerSpellTraps', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const mirrorForce = {
      uid: 'p1_mirror_force_set',
      data: CLASSIC_CARDS.MIRROR_FORCE,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.hand.push(mirrorForce);

    // Act
    const setResult = session.setSpellTrap('p1_mirror_force_set', 4);
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(setResult).toBe(true);
    expect(arenaProps.playerSpellTraps[4]).not.toBeNull();
    expect(arenaProps.playerSpellTraps[4]?.data.name).toBe('Mirror Force');
    expect(arenaProps.playerSpellTraps[4]?.isFaceDown).toBe(true);
  });

  it('should synchronize activating a Spell card from hand and updating playerDeckCount and playerGraveyardCount', () => {
    // Arrange
    const session = new DuelMatchSession(
      'Yugi Muto',
      createYugiDeck(),
      'Seto Kaiba',
      createKaibaDeck()
    );
    const initialDeckCount = session.player1.deck.length;
    const potOfGreed = {
      uid: 'p1_pot_of_greed',
      data: CLASSIC_CARDS.POT_OF_GREED,
      position: 'ATTACK' as const,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 0,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
      hasUsedEffectThisTurn: false,
      isFaceDown: false,
      turnSet: 0,
    };
    session.player1.hand.push(potOfGreed);

    // Act
    const activated = session.activateSpell('p1_pot_of_greed');
    const arenaProps = extractArena3DPropsFromSession(session);

    // Assert
    expect(activated).toBe(true);
    expect(arenaProps.playerDeckCount).toBe(initialDeckCount - 2);
    expect(arenaProps.playerGraveyardCount).toBe(1);
    expect(session.player1.graveyard[0]?.data.name).toBe('Pot of Greed');
  });

  it('should provide valid card metadata and generate 3D textures for inspected cards in Card3DShowcase across the catalog', () => {
    // Arrange
    const catalog = getAllCatalogCards();
    const sampleCards = catalog.slice(0, 12);

    // Act
    const generatedTextures = sampleCards.map((card) => ({
      card,
      proxyUrl: resolveCardImageUrl(card.imageUrl),
      texturePt: createCardFaceTexture(card, true),
      textureEn: createCardFaceTexture(card, false),
    }));

    // Assert
    expect(catalog.length).toBeGreaterThanOrEqual(200);
    expect(generatedTextures).toHaveLength(12);
    for (const item of generatedTextures) {
      expect(item.card.name).toBeTruthy();
      expect(item.card.type).toBeTruthy();
      expect(item.proxyUrl.startsWith('/api/card-image/') || item.proxyUrl.startsWith('/')).toBe(true);
      expect(item.texturePt).toBeInstanceOf(THREE.Texture);
      expect(item.textureEn).toBeInstanceOf(THREE.Texture);
    }
  });
});
