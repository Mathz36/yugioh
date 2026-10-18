import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllUserDecks,
  setActiveMainDeck,
  createNewCustomDeck,
  updateCustomDeck,
  deleteCustomDeck,
  getActiveDeckForDuel,
  getAllCatalogCards,
} from './deckStorage';
import { CLASSIC_CARDS } from '@duel/starter-decks';

class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
}

describe('deckStorage helper (Deck Builder persistence)', () => {
  beforeEach(() => {
    const mockStorage = new LocalStorageMock();
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: mockStorage },
      writable: true,
      configurable: true,
    });
  });

  it('should return the 2 prebuilt decks by default with Yugi as active', () => {
    // Arrange & Act
    const decks = getAllUserDecks('Yugi');

    // Assert
    expect(decks).toHaveLength(2);
    expect(decks[0].id).toBe('prebuilt-yugi-classic');
    expect(decks[0].isActive).toBe(true);
    expect(decks[1].id).toBe('prebuilt-kaiba-classic');
    expect(decks[1].isActive).toBe(false);
  });

  it('should allow creating up to 3 custom decks and block the 4th', () => {
    // Arrange
    const nick = 'Seto';

    // Act
    createNewCustomDeck(nick, 'Dragons #1');
    createNewCustomDeck(nick, 'Dragons #2');
    const third = createNewCustomDeck(nick, 'Dragons #3');

    // Assert
    expect(third.decks.filter((d) => !d.isPrebuilt)).toHaveLength(3);
    expect(() => createNewCustomDeck(nick, 'Dragons #4')).toThrow(/Limite atingido/);
  });

  it('should enforce max 3 copies per card when updating a custom deck and expand active deck for duel', () => {
    // Arrange
    const nick = 'Joey';
    const { createdDeck } = createNewCustomDeck(nick, 'Red-Eyes Deck', [
      { card: CLASSIC_CARDS.BLUE_EYES, quantity: 3 },
      { card: CLASSIC_CARDS.DARK_MAGICIAN, quantity: 3 },
    ]);

    // Act
    setActiveMainDeck(nick, createdDeck.id);
    const activeForDuel = getActiveDeckForDuel(nick);

    // Assert
    expect(activeForDuel.deckName).toBe('Red-Eyes Deck');
    expect(activeForDuel.cards).toHaveLength(6);

    // Exceeding 3 copies should throw
    expect(() =>
      updateCustomDeck(nick, {
        ...createdDeck,
        cards: [{ card: CLASSIC_CARDS.BLUE_EYES, quantity: 4 }],
      })
    ).toThrow(/excede o limite de 3 cópias/);
  });

  it('should delete a custom deck and fallback active deck to prebuilt-yugi-classic', () => {
    // Arrange
    const nick = 'Mai';
    const { createdDeck } = createNewCustomDeck(nick, 'Harpie Deck');

    // Act
    const remaining = deleteCustomDeck(nick, createdDeck.id);

    // Assert
    expect(remaining.some((d) => d.id === createdDeck.id)).toBe(false);
    expect(remaining.find((d) => d.isActive)?.id).toBe('prebuilt-yugi-classic');
    expect(getAllCatalogCards().length).toBeGreaterThan(20);
  });
});

