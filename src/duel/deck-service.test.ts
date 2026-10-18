import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeckService,
  STARTER_KAIBA_DECK_ID,
  STARTER_YUGI_DECK_ID,
  StorageLike,
} from './deck-service.js';
import { CLASSIC_CARDS } from './starter-decks.js';

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
