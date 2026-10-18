import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeckService,
  STARTER_KAIBA_DECK_ID,
  STARTER_YUGI_DECK_ID,
  StorageLike,
} from './deck-service.js';
import { CLASSIC_CARDS, createKaibaDeck } from './starter-decks.js';
import { DuelMatchSession } from './duel-match-session.js';
import { CardData, CardInstance } from './duel-types.js';
import duelistKingdomCatalog from '../../client/src/data/duelist-kingdom-catalog.json';

class MockStorage implements StorageLike {
  private data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  public removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('DeckService CRUD & Supabase/localStorage Fallback Suite', () => {
  let storage: MockStorage;
  let service: DeckService;

  beforeEach(() => {
    storage = new MockStorage();
    service = new DeckService({ supabaseClient: null, storage });
  });

  it('should return the 2 pre-built starter decks by default with Yugi deck as active main deck', async () => {
    // Arrange
    const userId = 'guest_player';

    // Act
    const decks = await service.getUserDecks(userId);

    // Assert
    expect(decks.length).toBe(2);
    expect(decks[0].id).toBe(STARTER_YUGI_DECK_ID);
    expect(decks[0].isPrebuilt).toBe(true);
    expect(decks[0].isPreset).toBe(true);
    expect(decks[0].isMain).toBe(true);
    expect(decks[0].expandedCards.length).toBe(40);
    expect(decks[1].id).toBe(STARTER_KAIBA_DECK_ID);
    expect(decks[1].isPrebuilt).toBe(true);
    expect(decks[1].isPreset).toBe(true);
    expect(decks[1].isMain).toBe(false);
    expect(decks[1].expandedCards.length).toBe(40);
  });

  it('should save up to 3 custom decks and reject a 4th custom deck for the same user', async () => {
    // Arrange
    const userId = 'duelist_local';
    const sampleCards = [
      CLASSIC_CARDS.DARK_MAGICIAN,
      CLASSIC_CARDS.SUMMONED_SKULL,
      CLASSIC_CARDS.POT_OF_GREED,
    ];

    // Act: Save 3 custom decks
    const d1 = await service.saveCustomDeck(userId, {
      name: 'Deck Mago Sombrio',
      cards: sampleCards,
    });
    const d2 = await service.saveCustomDeck(userId, {
      name: 'Deck Dragões Supremos',
      cards: [CLASSIC_CARDS.BLUE_EYES, CLASSIC_CARDS.BLUE_EYES, CLASSIC_CARDS.LUSTER_DRAGON],
    });
    const d3 = await service.saveCustomDeck(userId, {
      name: 'Deck Controle Flip',
      cardEntries: [
        { cardId: CLASSIC_CARDS.MAN_EATER_BUG.id, quantity: 3 },
        { cardId: CLASSIC_CARDS.PENGUIN_SOLDIER.id, quantity: 2 },
      ],
    });

    const allDecks = await service.getUserDecks(userId);

    // Assert: 2 starter + 3 custom = 5 decks total, and 4th custom deck throws
    expect(d1.isCustom).toBe(true);
    expect(d2.expandedCards.length).toBe(3);
    expect(d2.cards.length).toBe(2); // 2 Blue-Eyes + 1 Luster Dragon grouped
    expect(d3.expandedCards.length).toBe(5);
    expect(allDecks.length).toBe(5);

    await expect(
      service.saveCustomDeck(userId, {
        name: 'Quarto Deck Ilegal',
        cards: sampleCards,
      })
    ).rejects.toThrow(/3/);

    // Updating an existing custom deck when at 3/3 should succeed
    const updatedD1 = await service.saveCustomDeck(userId, {
      id: d1.id,
      name: 'Deck Mago Sombrio v2',
      cards: [CLASSIC_CARDS.DARK_MAGICIAN],
    });
    expect(updatedD1.name).toBe('Deck Mago Sombrio v2');
    expect(updatedD1.expandedCards.length).toBe(1);
  });

  it('should enforce deck nickname validation and max 3 copies per card validation', async () => {
    // Arrange
    const userId = 'duelist_validator';

    // Act & Assert 1: Empty deck name
    await expect(
      service.saveCustomDeck(userId, {
        name: '   ',
        cards: [CLASSIC_CARDS.KURIBOH],
      })
    ).rejects.toThrow(/apelido|nome/i);

    // Act & Assert 2: More than 3 copies via CardData[]
    await expect(
      service.saveCustomDeck(userId, {
        name: 'Quatro Dragões Brancos',
        cards: [
          CLASSIC_CARDS.BLUE_EYES,
          CLASSIC_CARDS.BLUE_EYES,
          CLASSIC_CARDS.BLUE_EYES,
          CLASSIC_CARDS.BLUE_EYES,
        ],
      })
    ).rejects.toThrow(/3 cópias/);

    // Act & Assert 3: More than 3 copies via cardEntries
    await expect(
      service.saveCustomDeck(userId, {
        name: 'Excesso de Potes',
        cardEntries: [{ cardId: CLASSIC_CARDS.POT_OF_GREED.id, quantity: 4 }],
      })
    ).rejects.toThrow(/3 cópias/);
  });

  it('should set a custom or starter deck as the main deck and deactivate all others', async () => {
    // Arrange
    const userId = 'duelist_main_switch';
    const customDeck = await service.saveCustomDeck(userId, {
      name: 'Meu Deck Principal',
      cards: [CLASSIC_CARDS.BUSTER_BLADER, CLASSIC_CARDS.TIME_WIZARD],
    });

    // Act 1: Set custom deck as main
    await service.setMainDeck(userId, customDeck.id);
    const decksAfterCustom = await service.getUserDecks(userId);

    // Assert 1
    const activeDecks1 = decksAfterCustom.filter((d) => d.isMain && d.isActive);
    expect(activeDecks1.length).toBe(1);
    expect(activeDecks1[0].id).toBe(customDeck.id);

    // Act 2: Switch main deck to Kaiba Starter Deck
    await service.setMainDeck(userId, STARTER_KAIBA_DECK_ID);
    const decksAfterKaiba = await service.getUserDecks(userId);

    // Assert 2
    const activeDecks2 = decksAfterKaiba.filter((d) => d.isMain && d.isActive);
    expect(activeDecks2.length).toBe(1);
    expect(activeDecks2[0].id).toBe(STARTER_KAIBA_DECK_ID);
  });

  it('should delete a custom deck, fallback main deck to Yugi starter if active, and protect starter decks', async () => {
    // Arrange
    const userId = 'duelist_deleter';
    const customDeck = await service.saveCustomDeck(userId, {
      name: 'Deck Temporário',
      cards: [CLASSIC_CARDS.LA_JINN],
      isMain: true,
    });

    // Act & Assert 1: Deleting starter deck is forbidden
    await expect(service.deleteCustomDeck(userId, STARTER_YUGI_DECK_ID)).rejects.toThrow(
      /pré-montados/i
    );

    // Act 2: Delete the active custom deck
    await service.deleteCustomDeck(userId, customDeck.id);
    const remainingDecks = await service.getUserDecks(userId);

    // Assert 2: Only 2 starter decks remain and Yugi starter deck is active again
    expect(remainingDecks.length).toBe(2);
    expect(remainingDecks.find((d) => d.id === STARTER_YUGI_DECK_ID)?.isMain).toBe(true);
  });

  it('should transparently fallback to localStorage when Supabase query fails for a UUID user', async () => {
    // Arrange
    const uuidUserId = '123e4567-e89b-12d3-a456-426614174000';
    const brokenSupabaseMock = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: new Error('Network offline') }),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('Network offline') }),
      })),
    } as any;

    const hybridService = new DeckService({
      supabaseClient: brokenSupabaseMock,
      storage,
    });

    // Act: Save and retrieve custom deck while Supabase is unreachable
    const saved = await hybridService.saveCustomDeck(uuidUserId, {
      name: 'Deck Offline Resiliente',
      cards: [CLASSIC_CARDS.SUMMONED_SKULL, CLASSIC_CARDS.TRAP_HOLE],
      isActive: true,
    });
    const decks = await hybridService.getUserDecks(uuidUserId);

    // Assert: Saved and loaded seamlessly via localStorage fallback
    expect(saved.name).toBe('Deck Offline Resiliente');
    expect(decks.length).toBe(3);
    expect(decks.find((d) => d.id === saved.id)?.isMain).toBe(true);
  });
});

describe('Wave 1 Expanded Catalog Deck Assembly & Duel Simulation Suite', () => {
  let storage: MockStorage;
  let service: DeckService;

  beforeEach(() => {
    storage = new MockStorage();
    service = new DeckService({ supabaseClient: null, storage });
  });

  it('should assemble and validate a 40-card custom deck composed exclusively of new Normal Monsters from Wave 1', async () => {
    // Arrange
    const userId = 'joey_wheeler_onde1';
    const catalogNormalMonsters = (duelistKingdomCatalog as CardData[]).filter(
      (c) => c.type === 'Normal Monster'
    );

    // Select 14 distinct Normal Monsters, including Red-Eyes and Two-Headed King Rex
    const redEyes = catalogNormalMonsters.find((c) => c.name === 'Red-Eyes Black Dragon')!;
    const rex = catalogNormalMonsters.find((c) => c.name === 'Two-Headed King Rex')!;
    expect(redEyes).toBeDefined();
    expect(rex).toBeDefined();

    const otherMonsters = catalogNormalMonsters
      .filter((c) => c.id !== redEyes.id && c.id !== rex.id)
      .slice(0, 12);

    // 13 cards with 3 copies each = 39 cards, plus 1 card with 1 copy = 40 cards total
    const cardEntries = [
      { cardId: redEyes.id, quantity: 3, card: redEyes },
      { cardId: rex.id, quantity: 3, card: rex },
      ...otherMonsters.slice(0, 11).map((c) => ({ cardId: c.id, quantity: 3, card: c })),
      { cardId: otherMonsters[11].id, quantity: 1, card: otherMonsters[11] },
    ];

    const totalCardsCount = cardEntries.reduce((sum, e) => sum + e.quantity, 0);
    expect(totalCardsCount).toBe(40);

    // Act
    const customDeck = await service.saveCustomDeck(userId, {
      name: 'Deck Beatdown Dragão Negro Onda 1',
      description: 'Deck competitivo de 40 monstros normais da era Reino dos Duelistas.',
      cardEntries,
      isActive: true,
    });

    // Assert
    expect(customDeck).toBeDefined();
    expect(customDeck.name).toBe('Deck Beatdown Dragão Negro Onda 1');
    expect(customDeck.isCustom).toBe(true);
    expect(customDeck.isMain).toBe(true);
    expect(customDeck.isActive).toBe(true);
    expect(customDeck.expandedCards.length).toBe(40);
    expect(customDeck.cards.length).toBe(14); // 14 distinct cards

    // Enforce all cards are Normal Monsters
    expect(customDeck.expandedCards.every((c) => c.type === 'Normal Monster')).toBe(true);

    // Enforce max 3 copies rule
    for (const entry of customDeck.cards) {
      expect(entry.quantity).toBeLessThanOrEqual(3);
      expect(entry.quantity).toBeGreaterThanOrEqual(1);
    }

    // Verify key monster stats
    const resolvedRedEyes = customDeck.expandedCards.find((c) => c.name === 'Red-Eyes Black Dragon');
    expect(resolvedRedEyes).toBeDefined();
    expect(resolvedRedEyes?.attack).toBe(2400);
    expect(resolvedRedEyes?.defense).toBe(2000);
    expect(resolvedRedEyes?.level).toBe(7);

    const resolvedRex = customDeck.expandedCards.find((c) => c.name === 'Two-Headed King Rex');
    expect(resolvedRex).toBeDefined();
    expect(resolvedRex?.attack).toBe(1600);
    expect(resolvedRex?.defense).toBe(1200);
    expect(resolvedRex?.level).toBe(4);
  });

  it('should instantiate DuelMatchSession with the 40-card Wave 1 deck and execute tribute summon, normal summon, combat, and damage without errors', async () => {
    // Arrange
    const userId = 'joey_duel_test';
    const catalogNormalMonsters = (duelistKingdomCatalog as CardData[]).filter(
      (c) => c.type === 'Normal Monster'
    );
    const redEyes = catalogNormalMonsters.find((c) => c.name === 'Red-Eyes Black Dragon')!;
    const rex = catalogNormalMonsters.find((c) => c.name === 'Two-Headed King Rex')!;
    const otherMonsters = catalogNormalMonsters
      .filter((c) => c.id !== redEyes.id && c.id !== rex.id)
      .slice(0, 12);

    const cardEntries = [
      { cardId: redEyes.id, quantity: 3, card: redEyes },
      { cardId: rex.id, quantity: 3, card: rex },
      ...otherMonsters.slice(0, 11).map((c) => ({ cardId: c.id, quantity: 3, card: c })),
      { cardId: otherMonsters[11].id, quantity: 1, card: otherMonsters[11] },
    ];

    const customDeck = await service.saveCustomDeck(userId, {
      name: 'Joey Red-Eyes 40 Cards',
      cardEntries,
    });

    // Act 1: Initialize match session with the 40-card custom deck vs Kaiba starter deck
    const session = new DuelMatchSession(
      'Joey',
      customDeck.expandedCards,
      'Kaiba',
      createKaibaDeck()
    );

    // Assert 1: Match starts cleanly with official rules (8000 LP, 5 in hand, 35 in deck)
    expect(session.player1.lifePoints).toBe(8000);
    expect(session.player2.lifePoints).toBe(8000);
    expect(session.player1.hand.length).toBe(5);
    expect(session.player1.deck.length).toBe(35);
    expect(session.player2.hand.length).toBe(5);
    expect(session.player2.deck.length).toBe(35);
    expect(session.matchState.phase).toBe('MAIN1');

    // Act 2: Normal Summon Level 4 monster (Two-Headed King Rex) with 0 tributes
    const rexCardInstance: CardInstance = {
      uid: 'rex_norm_1',
      data: rex,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
    session.player1.hand.push(rexCardInstance);
    session.player1.hasNormalSummonedThisTurn = false;

    const normalSummonSuccess = session.normalSummon(rexCardInstance.uid, 0, 'ATTACK', []);

    // Assert 2: Level 4 normal summon successfully enters zone 0 without tribute
    expect(normalSummonSuccess).toBe(true);
    expect(session.player1.monsterZones[0]?.data.name).toBe('Two-Headed King Rex');
    expect(session.player1.monsterZones[0]?.data.level).toBe(4);
    expect(session.player1.monsterZones[0]?.position).toBe('ATTACK');

    // Act 3: Tribute Summon Level 7 monster (Red-Eyes Black Dragon) requiring exactly 2 tributes
    // Place 2 tribute monsters in zone 1 and zone 2
    session.player1.monsterZones[1] = {
      uid: 'tribute_fodder_1',
      data: rex,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
    session.player1.monsterZones[2] = {
      uid: 'tribute_fodder_2',
      data: rex,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    const redEyesInstance: CardInstance = {
      uid: 'red_eyes_tribute_1',
      data: redEyes,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
    session.player1.hand.push(redEyesInstance);

    // Fail case: Level 7 summon with only 1 tribute must be rejected
    session.player1.hasNormalSummonedThisTurn = false;
    const failWithOneTribute = session.normalSummon(redEyesInstance.uid, 1, 'ATTACK', [1]);
    expect(failWithOneTribute).toBe(false);

    // Success case: Level 7 summon with 2 tributes in zone 1 and 2
    session.player1.hasNormalSummonedThisTurn = false;
    const tributeSummonSuccess = session.normalSummon(redEyesInstance.uid, 1, 'ATTACK', [1, 2]);

    // Assert 3: Red-Eyes enters zone 1, and the 2 tributes are sent to the graveyard
    expect(tributeSummonSuccess).toBe(true);
    expect(session.player1.monsterZones[1]?.data.name).toBe('Red-Eyes Black Dragon');
    expect(session.player1.monsterZones[1]?.data.attack).toBe(2400);
    expect(session.player1.monsterZones[2]).toBeNull();
    expect(session.player1.graveyard.some((c) => c.uid === 'tribute_fodder_1')).toBe(true);
    expect(session.player1.graveyard.some((c) => c.uid === 'tribute_fodder_2')).toBe(true);

    // Act 4: Combat and Battle Damage Resolution with Red-Eyes
    // Place an opponent monster with 1700 ATK (Battle Ox) in Kaiba's zone 0
    session.player2.monsterZones[0] = {
      uid: 'kaiba_battle_ox',
      data: CLASSIC_CARDS.BATTLE_OX,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    session.matchState.phase = 'BATTLE';
    session.matchState.currentTurn = 3; // Eligible to attack
    session.player1.monsterZones[1]!.turnSummoned = 1;

    // Red-Eyes (2400 ATK, zone 1) attacks Battle Ox (1700 ATK, zone 0)
    const attackSuccess = session.declareAttack(1, 0);

    // Assert 4: Combat successfully executes without error
    expect(attackSuccess).toBe(true);
    // Opponent monster destroyed and sent to graveyard
    expect(session.player2.monsterZones[0]).toBeNull();
    expect(session.player2.graveyard.some((c) => c.uid === 'kaiba_battle_ox')).toBe(true);
    // Kaiba receives 700 battle damage (2400 - 1700 = 700)
    expect(session.player2.lifePoints).toBe(8000 - 700);
    // Red-Eyes stays on field and marked as hasAttacked
    expect(session.player1.monsterZones[1]?.data.name).toBe('Red-Eyes Black Dragon');
    expect(session.player1.monsterZones[1]?.hasAttacked).toBe(true);
  });
});
