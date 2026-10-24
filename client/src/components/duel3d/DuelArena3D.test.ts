import { describe, it, expect, vi } from 'vitest';
import { CLASSIC_CARDS } from '@duel/starter-decks';
import { CardInstance } from '@duel/duel-types';
import {
  DuelArena3D,
  DuelArena3DProps,
  computeHandCardTransform,
} from './DuelArena3D';

function createMockCardInstance(
  uid: string,
  cardData = CLASSIC_CARDS.LUSTER_DRAGON,
  position: 'ATTACK' | 'DEFENSE' = 'ATTACK',
  isFaceDown = false
): CardInstance {
  return {
    uid,
    data: cardData,
    position,
    hasAttacked: false,
    hasChangedPositionThisTurn: false,
    turnSummoned: 1,
    monstersDestroyedCount: 0,
    hasAttackedDirectly: false,
    hasUsedEffectThisTurn: false,
    isFaceDown,
    turnSet: isFaceDown ? 1 : 0,
  };
}

describe('DuelArena3D Component Contract, 3D Hand Fan, Spatial Zones, Callbacks & VFX', () => {
  it('should export the DuelArena3D React component function and computeHandCardTransform helper', () => {
    // Arrange
    const componentRef = DuelArena3D;
    const transformFnRef = computeHandCardTransform;

    // Act
    const componentType = typeof componentRef;
    const transformFnType = typeof transformFnRef;

    // Assert
    expect(componentRef).toBeDefined();
    expect(componentType).toBe('function');
    expect(transformFnRef).toBeDefined();
    expect(transformFnType).toBe('function');
  });

  it('should accept the full DuelArena3DProps contract including 3D Hand props, deck/graveyard counts, languagePt, and activeFieldVfx', () => {
    // Arrange
    const lusterCard = createMockCardInstance('p1_luster_1', CLASSIC_CARDS.LUSTER_DRAGON, 'ATTACK', false);
    const mirrorForceCard = createMockCardInstance('p1_mirror_1', CLASSIC_CARDS.MIRROR_FORCE, 'ATTACK', true);
    const handCard1 = createMockCardInstance('p1_hand_1', CLASSIC_CARDS.DARK_MAGICIAN);
    const handCard2 = createMockCardInstance('p1_hand_2', CLASSIC_CARDS.POT_OF_GREED);

    // Act
    const props: DuelArena3DProps = {
      playerMonsters: [lusterCard, null, null, null, null],
      playerSpellTraps: [mirrorForceCard, null, null, null, null],
      opponentMonsters: [null, null, null, null, null],
      opponentSpellTraps: [null, null, null, null, null],
      playerHand: [handCard1, handCard2],
      opponentHandCount: 5,
      selectedHandCardUid: 'p1_hand_1',
      onHandCardClick: vi.fn(),
      playerDeckCount: 34,
      playerGraveyardCount: 2,
      opponentDeckCount: 33,
      opponentGraveyardCount: 1,
      languagePt: true,
      activeFieldVfx: 'RAIGEKI',
      inspectedCardUid: 'p1_luster_1',
      selectedAttackerZone: 0,
      validSummonZones: [1, 2, 3, 4],
      validSpellTrapZones: [1, 2, 3, 4],
      tacticalTargetUids: [],
      lungingZone: null,
      slamZone: null,
      targetHitZone: null,
      destroyedCardUids: [],
      flippedZones: [],
      onZoneClick: vi.fn(),
      onCardHover: vi.fn(),
      onError: vi.fn(),
      isCameraShaking: false,
    };

    // Assert
    expect(props.playerMonsters[0]?.data.name).toBe('Luster Dragon');
    expect(props.playerSpellTraps[0]?.isFaceDown).toBe(true);
    expect(props.playerHand).toHaveLength(2);
    expect(props.opponentHandCount).toBe(5);
    expect(props.selectedHandCardUid).toBe('p1_hand_1');
    expect(typeof props.onHandCardClick).toBe('function');
    expect(props.playerDeckCount).toBe(34);
    expect(props.playerGraveyardCount).toBe(2);
    expect(props.opponentDeckCount).toBe(33);
    expect(props.opponentGraveyardCount).toBe(1);
    expect(props.languagePt).toBe(true);
    expect(props.activeFieldVfx).toBe('RAIGEKI');
  });

  it('should compute straight-line 3D transforms for Player Hand (isPlayer = true) with zero fan rotation, uniform Y=0.55 and Z=7.15, and selection/hover elevation', () => {
    // Arrange
    const totalCards = 5;

    // Act
    const restingCards = Array.from({ length: totalCards }, (_, idx) =>
      computeHandCardTransform(idx, totalCards, true, false, false)
    );
    const centerIdle = restingCards[2]!;
    const centerSelected = computeHandCardTransform(2, totalCards, true, true, false);
    const centerHovered = computeHandCardTransform(2, totalCards, true, false, true);

    // Assert
    expect(restingCards[0]!.x).toBeLessThan(0);
    expect(centerIdle.x).toBeCloseTo(0, 5);
    expect(restingCards[4]!.x).toBeGreaterThan(0);
    for (let i = 0; i < totalCards; i++) {
      expect(restingCards[i]!.rotZ).toBe(0);
      expect(restingCards[i]!.y).toBe(0.55);
      expect(restingCards[i]!.z).toBe(7.15);
      if (i < totalCards - 1) {
        expect(restingCards[i + 1]!.x - restingCards[i]!.x).toBeGreaterThan(1.5);
      }
    }
    expect(centerIdle.rotX).toBeLessThan(0);
    expect(centerSelected.scale).toBeGreaterThan(1.1);
    expect(centerSelected.y).toBeGreaterThan(centerIdle.y);
    expect(centerSelected.z).toBeLessThan(centerIdle.z);
    expect(centerSelected.rotZ).toBe(0);
    expect(centerHovered.scale).toBeGreaterThan(1.1);
    expect(centerHovered.y).toBeGreaterThan(centerIdle.y);
    expect(centerHovered.rotZ).toBe(0);
  });

  it('should guarantee stationary base hitbox coordinates while visual mesh elevates on hover/selection (zero-flicker anti-oscillation)', () => {
    // Arrange
    const totalCards = 5;
    const cardIndex = 1;

    // Act
    const stationaryHitboxBeforeHover = computeHandCardTransform(cardIndex, totalCards, true, false, false);
    const visualMeshDuringHover = computeHandCardTransform(cardIndex, totalCards, true, false, true);
    const visualMeshDuringSelect = computeHandCardTransform(cardIndex, totalCards, true, true, false);
    const stationaryHitboxDuringHover = computeHandCardTransform(cardIndex, totalCards, true, false, false);

    // Assert
    expect(stationaryHitboxDuringHover).toEqual(stationaryHitboxBeforeHover);
    expect(stationaryHitboxDuringHover.x).toBe(visualMeshDuringHover.x);
    expect(visualMeshDuringHover.y).toBeGreaterThan(stationaryHitboxDuringHover.y);
    expect(visualMeshDuringSelect.y).toBeGreaterThan(visualMeshDuringHover.y);
    expect(visualMeshDuringHover.z).toBeLessThan(stationaryHitboxDuringHover.z);
  });

  it('should compute Opponent Hand 3D straight-line transforms (isPlayer = false) with rotZ=0, uniform Y=0.55, Z=-6.15, and rotated 180 degrees (Math.PI)', () => {
    // Arrange
    const totalOpponentCards = 5;

    // Act
    const oppCards = Array.from({ length: totalOpponentCards }, (_, idx) =>
      computeHandCardTransform(idx, totalOpponentCards, false, false, false)
    );
    const oppLeft = oppCards[0]!;
    const oppCenter = oppCards[2]!;
    const oppRight = oppCards[4]!;

    // Assert
    expect(oppLeft.x).toBeLessThan(0);
    expect(oppCenter.x).toBeCloseTo(0, 5);
    expect(oppRight.x).toBeGreaterThan(0);
    for (let i = 0; i < totalOpponentCards; i++) {
      const card = oppCards[i]!;
      expect(card.rotZ).toBe(0);
      expect(card.y).toBe(0.55);
      expect(card.z).toBe(-6.15);
      expect(card.rotY).toBeCloseTo(Math.PI, 5);
      expect(card.rotX).toBeGreaterThan(0);
      if (i < totalOpponentCards - 1) {
        expect(oppCards[i + 1]!.x - card.x).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('should invoke onHandCardClick with the clicked CardInstance when a 3D hand card is selected', () => {
    // Arrange
    const clickedCards: CardInstance[] = [];
    const onHandCardClick = vi.fn((card: CardInstance) => {
      clickedCards.push(card);
    });
    const handCard = createMockCardInstance('p1_hand_raigeki', CLASSIC_CARDS.RAIGEKI);

    // Act
    onHandCardClick(handCard);

    // Assert
    expect(onHandCardClick).toHaveBeenCalledTimes(1);
    expect(clickedCards[0]?.uid).toBe('p1_hand_raigeki');
    expect(clickedCards[0]?.data.name).toBe('Raigeki');
  });

  it('should dispatch onZoneClick across all 4 rows (player/opponent MONSTER and SPELL_TRAP zones 0..4)', () => {
    // Arrange
    const onZoneClickSpy = vi.fn();
    const rows: Array<{ isPlayer: boolean; zoneType: 'MONSTER' | 'SPELL_TRAP' }> = [
      { isPlayer: true, zoneType: 'MONSTER' },
      { isPlayer: true, zoneType: 'SPELL_TRAP' },
      { isPlayer: false, zoneType: 'MONSTER' },
      { isPlayer: false, zoneType: 'SPELL_TRAP' },
    ];

    // Act
    for (const row of rows) {
      for (let index = 0; index < 5; index++) {
        onZoneClickSpy(row.isPlayer, row.zoneType, index);
      }
    }

    // Assert
    expect(onZoneClickSpy).toHaveBeenCalledTimes(20);
    expect(onZoneClickSpy).toHaveBeenCalledWith(true, 'MONSTER', 0);
    expect(onZoneClickSpy).toHaveBeenCalledWith(true, 'SPELL_TRAP', 4);
    expect(onZoneClickSpy).toHaveBeenCalledWith(false, 'MONSTER', 2);
    expect(onZoneClickSpy).toHaveBeenCalledWith(false, 'SPELL_TRAP', 3);
  });

  it('should prevent stale closures when onZoneClick callback reference is updated dynamically across turns', () => {
    // Arrange
    let currentTurnPhase = 'MAIN1';
    const turnLog: string[] = [];

    const onZoneClickRef: {
      current?: (isPlayer: boolean, zoneType: 'MONSTER' | 'SPELL_TRAP', index: number) => void;
    } = {};

    const createHandlerForPhase = (phaseSnapshot: string) => {
      return (isPlayer: boolean, zoneType: 'MONSTER' | 'SPELL_TRAP', index: number) => {
        turnLog.push(`${phaseSnapshot}:${isPlayer ? 'P1' : 'P2'}:${zoneType}:${index}`);
      };
    };

    // Act
    onZoneClickRef.current = createHandlerForPhase(currentTurnPhase);
    onZoneClickRef.current(true, 'MONSTER', 2);

    currentTurnPhase = 'MAIN2';
    onZoneClickRef.current = createHandlerForPhase(currentTurnPhase);
    onZoneClickRef.current(true, 'SPELL_TRAP', 1);

    // Assert
    expect(turnLog).toEqual(['MAIN1:P1:MONSTER:2', 'MAIN2:P1:SPELL_TRAP:1']);
  });

  it('should invoke onCardHover when inspecting a 3D card mesh and clear with null when pointer leaves', () => {
    // Arrange
    const hoveredHistory: Array<string | null> = [];
    const onCardHover = vi.fn((card: CardInstance | null) => {
      hoveredHistory.push(card ? card.uid : null);
    });
    const darkMagicianCard = createMockCardInstance('p1_dm_1', CLASSIC_CARDS.DARK_MAGICIAN);

    // Act
    onCardHover(darkMagicianCard);
    onCardHover(null);

    // Assert
    expect(onCardHover).toHaveBeenCalledTimes(2);
    expect(hoveredHistory).toEqual(['p1_dm_1', null]);
  });

  it('should invoke onError callback with an Error instance when 3D hardware initialization fails', () => {
    // Arrange
    let errorReported = false;
    let capturedErrorMessage = '';
    const onError = vi.fn((err: Error) => {
      errorReported = true;
      capturedErrorMessage = err.message;
    });

    // Act
    onError(new Error('WebGPU adapter initialization rejected by device'));

    // Assert
    expect(onError).toHaveBeenCalledTimes(1);
    expect(errorReported).toBe(true);
    expect(capturedErrorMessage).toContain('WebGPU adapter');
  });

  it('should support all legendary field VFX states (RAIGEKI, DARK_HOLE, MIRROR_FORCE, WABOKU, and null)', () => {
    // Arrange
    const vfxStates: Array<DuelArena3DProps['activeFieldVfx']> = [
      'RAIGEKI',
      'DARK_HOLE',
      'MIRROR_FORCE',
      'WABOKU',
      null,
    ];

    // Act
    const descriptors = vfxStates.map((vfx) => ({
      activeFieldVfx: vfx,
      isCameraShaking: vfx === 'RAIGEKI' || vfx === 'DARK_HOLE',
    }));

    // Assert
    expect(descriptors).toHaveLength(5);
    expect(descriptors[0]).toEqual({ activeFieldVfx: 'RAIGEKI', isCameraShaking: true });
    expect(descriptors[1]).toEqual({ activeFieldVfx: 'DARK_HOLE', isCameraShaking: true });
    expect(descriptors[2]).toEqual({ activeFieldVfx: 'MIRROR_FORCE', isCameraShaking: false });
    expect(descriptors[3]).toEqual({ activeFieldVfx: 'WABOKU', isCameraShaking: false });
    expect(descriptors[4]).toEqual({ activeFieldVfx: null, isCameraShaking: false });
  });

  it('should accurately model combat animation descriptors (lungingZone, slamZone, targetHitZone, destroyedCardUids, flippedZones)', () => {
    // Arrange
    const attackerCard = createMockCardInstance('p1_attacker', CLASSIC_CARDS.BLUE_EYES, 'ATTACK', false);
    const defenderCard = createMockCardInstance('p2_defender', CLASSIC_CARDS.MAN_EATER_BUG, 'DEFENSE', false);

    // Act
    const combatProps: Partial<DuelArena3DProps> = {
      playerMonsters: [null, null, attackerCard, null, null],
      opponentMonsters: [null, defenderCard, null, null, null],
      selectedAttackerZone: 2,
      lungingZone: { isPlayer: true, zoneIndex: 2, targetIndex: 1 },
      slamZone: { isPlayer: true, zoneIndex: 2 },
      targetHitZone: { isPlayer: false, zoneIndex: 1 },
      destroyedCardUids: ['p2_defender'],
      flippedZones: [{ isPlayer: false, zoneIndex: 1 }],
    };

    // Assert
    expect(combatProps.lungingZone).toEqual({ isPlayer: true, zoneIndex: 2, targetIndex: 1 });
    expect(combatProps.slamZone).toEqual({ isPlayer: true, zoneIndex: 2 });
    expect(combatProps.targetHitZone).toEqual({ isPlayer: false, zoneIndex: 1 });
    expect(combatProps.destroyedCardUids).toContain('p2_defender');
    expect(combatProps.flippedZones).toEqual([{ isPlayer: false, zoneIndex: 1 }]);
  });

  it('should ensure that placing a monster on the field removes it from the 3D player hand and re-centers the remaining cards', () => {
    // Arrange
    const cardA = createMockCardInstance('card_a', CLASSIC_CARDS.LUSTER_DRAGON);
    const cardB = createMockCardInstance('card_b', CLASSIC_CARDS.DARK_MAGICIAN);
    const cardC = createMockCardInstance('card_c', CLASSIC_CARDS.SUMMONED_SKULL);
    const cardD = createMockCardInstance('card_d', CLASSIC_CARDS.GIANT_SOLDIER_OF_STONE);
    const cardE = createMockCardInstance('card_e', CLASSIC_CARDS.KURIBOH);

    const initialHand = [cardA, cardB, cardC, cardD, cardE];
    const initialSignature = initialHand.map((c) => c.uid).join('|');

    // Act: Place cardC (Summoned Skull) on Monster Zone 2
    const remainingHandAfterPlacement = initialHand.filter((c) => c.uid !== cardC.uid);
    const placedMonsterZones: (CardInstance | null)[] = [null, null, cardC, null, null];
    const updatedSignature = remainingHandAfterPlacement.map((c) => c.uid).join('|');

    // Assert: Card must be completely gone from hand
    expect(initialHand).toHaveLength(5);
    expect(remainingHandAfterPlacement).toHaveLength(4);
    expect(remainingHandAfterPlacement.some((c) => c.uid === cardC.uid)).toBe(false);
    expect(placedMonsterZones[2]?.uid).toBe('card_c');
    expect(initialSignature).not.toBe(updatedSignature);

    // Verify 3D coordinates re-calculate properly for the 4 remaining cards
    const initialTransforms = initialHand.map((_, idx) =>
      computeHandCardTransform(idx, initialHand.length, true, false, false)
    );
    const updatedTransforms = remainingHandAfterPlacement.map((_, idx) =>
      computeHandCardTransform(idx, remainingHandAfterPlacement.length, true, false, false)
    );

    expect(initialTransforms).toHaveLength(5);
    expect(updatedTransforms).toHaveLength(4);
    // 4 cards are centered symmetrically around 0: indices 1 and 2 flank the center (x < 0 and x > 0)
    expect(updatedTransforms[0]!.x).toBeLessThan(0);
    expect(updatedTransforms[1]!.x).toBeLessThan(0);
    expect(updatedTransforms[2]!.x).toBeGreaterThan(0);
    expect(updatedTransforms[3]!.x).toBeGreaterThan(0);
  });

  it('should ensure that setting a Spell or Trap card on the field removes it from player hand', () => {
    // Arrange
    const monsterCard = createMockCardInstance('p1_m1', CLASSIC_CARDS.LUSTER_DRAGON);
    const trapHole = createMockCardInstance('p1_th', CLASSIC_CARDS.TRAP_HOLE);
    const mirrorForce = createMockCardInstance('p1_mf', CLASSIC_CARDS.MIRROR_FORCE);
    const fissure = createMockCardInstance('p1_fis', CLASSIC_CARDS.FISSURE);
    const darkHole = createMockCardInstance('p1_dh', CLASSIC_CARDS.DARK_HOLE);

    const playerHand = [monsterCard, trapHole, mirrorForce, fissure, darkHole];

    // Act: Set Trap Hole on Spell/Trap Zone 0
    const cardToSet = trapHole;
    const handIndex = playerHand.findIndex((c) => c.uid === cardToSet.uid);
    const [setCard] = playerHand.splice(handIndex, 1);
    const playerSpellTrapZones: (CardInstance | null)[] = [setCard!, null, null, null, null];

    // Assert
    expect(playerHand).toHaveLength(4);
    expect(playerHand.some((c) => c.uid === 'p1_th')).toBe(false);
    expect(playerSpellTrapZones[0]?.uid).toBe('p1_th');
    expect(playerSpellTrapZones[0]?.data.name).toBe('Trap Hole');
  });
});
