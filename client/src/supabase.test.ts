import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { syncUserDecksWithCloud, createNewCustomDeck, getAllUserDecks } from './utils/deckStorage';
import { deckService } from '@duel/deck-service';

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

describe('Supabase Client & Cloud Sync Integration (AAA Standard)', () => {
  beforeEach(() => {
    const mockStorage = new LocalStorageMock();
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: mockStorage },
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('should export valid environment configuration flags', () => {
    // Arrange & Act
    const configured = isSupabaseConfigured;
    const url = SUPABASE_URL;
    const anonKey = SUPABASE_ANON_KEY;

    // Assert
    expect(typeof configured).toBe('boolean');
    expect(typeof url).toBe('string');
    expect(typeof anonKey).toBe('string');
  });

  it('should return local decks immediately without cloud call when userId is guest', async () => {
    // Arrange
    const getUserDecksSpy = vi.spyOn(deckService, 'getUserDecks');

    // Act
    const decks = await syncUserDecksWithCloud('guest', 'Yugi Muto');

    // Assert
    expect(getUserDecksSpy).not.toHaveBeenCalled();
    expect(Array.isArray(decks)).toBe(true);
    expect(decks.length).toBeGreaterThanOrEqual(2);
  });

  it('should synchronize cloud custom decks when valid UUID is provided', async () => {
    // Arrange
    const testUserId = '11111111-2222-4333-8444-555555555555';
    const mockCloudDecks = [
      {
        id: 'prebuilt-yugi-classic',
        name: 'Yugi Muto - Deck Clássico',
        description: 'Deck clássico',
        isActive: false,
        isPrebuilt: true,
        cards: [],
      },
      {
        id: 'mock-cloud-deck-1',
        name: 'Deck Sincronizado da Nuvem',
        description: 'Criado no Supabase',
        isActive: true,
        isPrebuilt: false,
        cards: [],
      },
    ];

    vi.spyOn(deckService, 'getUserDecks').mockResolvedValue(mockCloudDecks as any);

    // Act
    const result = await syncUserDecksWithCloud(testUserId, 'DuelistaCloud');

    // Assert
    expect(deckService.getUserDecks).toHaveBeenCalledWith(testUserId);
    expect(result.some((d) => d.id === 'mock-cloud-deck-1')).toBe(true);
    const active = result.find((d) => d.isActive);
    expect(active?.id).toBe('mock-cloud-deck-1');
  });

  it('should gracefully fallback to local cache if cloud synchronization rejects', async () => {
    // Arrange
    const testUserId = '11111111-2222-4333-8444-555555555555';
    vi.spyOn(deckService, 'getUserDecks').mockRejectedValue(new Error('Network offline'));

    // Act
    const fallbackDecks = await syncUserDecksWithCloud(testUserId, 'DuelistaOffline');

    // Assert
    expect(Array.isArray(fallbackDecks)).toBe(true);
    expect(fallbackDecks.length).toBeGreaterThanOrEqual(2);
  });

  it('should trigger optimistic UI creation and dispatch background cloud persistence', async () => {
    // Arrange
    const testUserId = '11111111-2222-4333-8444-555555555555';
    const saveSpy = vi.spyOn(deckService, 'saveCustomDeck').mockResolvedValue({} as any);

    // Act
    const { createdDeck, decks } = createNewCustomDeck(
      'TestUser',
      'Deck Rápido Optimistic',
      [],
      testUserId
    );

    // Assert (Immediate optimistic response)
    expect(createdDeck).toBeDefined();
    expect(createdDeck.name).toBe('Deck Rápido Optimistic');
    expect(decks.some((d) => d.id === createdDeck.id)).toBe(true);

    // Assert (Background cloud call initiated)
    expect(saveSpy).toHaveBeenCalledWith(testUserId, expect.objectContaining({
      name: 'Deck Rápido Optimistic',
    }));
  });
});
