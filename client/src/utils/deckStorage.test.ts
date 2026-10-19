import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllUserDecks,
  setActiveMainDeck,
  createNewCustomDeck,
  updateCustomDeck,
  deleteCustomDeck,
  getActiveDeckForDuel,
  getAllCatalogCards,
  isMonsterType,
  isSpellType,
  isTrapType,
  filterCatalogByType,
  sanitizeCatalogCards,
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
  });

  it('should load full Wave 1 catalog (200+ cards) with valid card metadata', () => {
    // Act
    const catalog = getAllCatalogCards();

    // Assert
    expect(catalog.length).toBeGreaterThanOrEqual(200);
    const sample = catalog[0];
    expect(sample).toBeDefined();
    expect(typeof sample.id).toBe('string');
    expect(typeof sample.name).toBe('string');
    expect(typeof sample.type).toBe('string');
    expect(sample.imageUrl).toMatch(/^https?:\/\//);
  });
});

describe('Wave 1 Expanded Catalog Integrity & Filtering Suite', () => {
  it('should return >200 unique cards with 100% unique IDs, containing iconic Wave 1 cards', () => {
    // Arrange & Act
    const catalog = getAllCatalogCards();
    const uniqueIds = new Set(catalog.map((c) => String(c.id)));
    const redEyes = catalog.find((c) => c.name === 'Red-Eyes Black Dragon');
    const rex = catalog.find((c) => c.name === 'Two-Headed King Rex');

    // Assert
    expect(catalog.length).toBeGreaterThan(200);
    expect(uniqueIds.size).toBe(catalog.length);
    expect(redEyes).toBeDefined();
    expect(redEyes?.id).toBe('74677422');
    expect(rex).toBeDefined();
    expect(rex?.id).toBe('94119974');
  });

  it('should ensure every catalog card has valid name, type, imageUrl and valid numeric stats', () => {
    // Arrange
    const catalog = getAllCatalogCards();

    // Act & Assert
    expect(catalog.length).toBeGreaterThan(200);
    for (const card of catalog) {
      // Identity & Strings
      expect(typeof card.id).toBe('string');
      expect(card.id.trim().length).toBeGreaterThan(0);

      expect(typeof card.name).toBe('string');
      expect(card.name.trim().length).toBeGreaterThan(0);

      expect(typeof card.type).toBe('string');
      expect(card.type.trim().length).toBeGreaterThan(0);

      expect(typeof card.imageUrl).toBe('string');
      expect(card.imageUrl).toMatch(/^https?:\/\//);

      // Numeric Stats
      expect(typeof card.level).toBe('number');
      expect(Number.isFinite(card.level)).toBe(true);
      expect(card.level).toBeGreaterThanOrEqual(0);

      expect(typeof card.attack).toBe('number');
      expect(Number.isFinite(card.attack)).toBe(true);
      expect(card.attack).toBeGreaterThanOrEqual(0);

      expect(typeof card.defense).toBe('number');
      expect(Number.isFinite(card.defense)).toBe(true);
      expect(card.defense).toBeGreaterThanOrEqual(0);
    }
  });

  it('should accurately partition and categorize all catalog cards into MONSTER, SPELL, and TRAP filters', () => {
    // Arrange
    const catalog = getAllCatalogCards();

    // Act
    const monsterCards = filterCatalogByType(catalog, 'MONSTER');
    const spellCards = filterCatalogByType(catalog, 'SPELL');
    const trapCards = filterCatalogByType(catalog, 'TRAP');
    const allCards = filterCatalogByType(catalog, 'ALL');

    // Assert: Counts & Partitions
    expect(allCards.length).toBe(catalog.length);
    expect(monsterCards.length).toBeGreaterThan(0);
    expect(spellCards.length).toBeGreaterThan(0);
    expect(trapCards.length).toBeGreaterThan(0);

    // Type matching predicates
    expect(monsterCards.every((c) => isMonsterType(c.type))).toBe(true);
    expect(spellCards.every((c) => isSpellType(c.type))).toBe(true);
    expect(trapCards.every((c) => isTrapType(c.type))).toBe(true);

    // 100% of the catalog is categorized without uncategorized gaps or overlaps
    expect(monsterCards.length + spellCards.length + trapCards.length).toBe(catalog.length);

    // Key iconic cards are present in their correct categories
    expect(monsterCards.some((c) => c.name === 'Red-Eyes Black Dragon')).toBe(true);
    expect(monsterCards.some((c) => c.name === 'Two-Headed King Rex')).toBe(true);
    expect(spellCards.some((c) => c.name === 'Pot of Greed')).toBe(true);
    expect(spellCards.some((c) => c.name === 'Dark Hole')).toBe(true);
    expect(spellCards.some((c) => c.name === 'Fissure')).toBe(true);
    expect(trapCards.some((c) => c.name === 'Trap Hole')).toBe(true);
  });
});

describe('Regression Suite: Zero Duplicates & Image URL / ID Integrity (AAA Pattern)', () => {
  it('Teste 1: should guarantee 0 duplicate IDs and 0 duplicate names in catalog', () => {
    // Arrange
    const catalog = getAllCatalogCards();

    // Act
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    const seenNames = new Set<string>();
    const duplicateNames: string[] = [];

    for (const card of catalog) {
      const normalizedId = String(card.id).trim();
      if (seenIds.has(normalizedId)) {
        duplicateIds.push(`${card.name} (id: ${normalizedId})`);
      } else {
        seenIds.add(normalizedId);
      }

      const normalizedName = card.name.toLowerCase().trim();
      if (seenNames.has(normalizedName)) {
        duplicateNames.push(`${card.name} (id: ${normalizedId})`);
      } else {
        seenNames.add(normalizedName);
      }
    }

    // Assert
    expect(duplicateIds).toEqual([]);
    expect(duplicateNames).toEqual([]);
    expect(seenIds.size).toBe(catalog.length);
    expect(seenNames.size).toBe(catalog.length);
  });

  it('Teste 2: should ensure every card image URL strictly matches its official card ID (preventing Gate Guardian image on Waboku)', () => {
    // Arrange
    const catalog = getAllCatalogCards();

    // Act & Assert
    const mismatches: string[] = [];

    for (const card of catalog) {
      const urlMatch = card.imageUrl && card.imageUrl.match(/\/(\d+)\.(jpg|png)/);
      if (!urlMatch) {
        mismatches.push(`${card.name}: Missing valid numeric ID in imageUrl (${card.imageUrl})`);
        continue;
      }
      const imgIdNum = parseInt(urlMatch[1], 10);
      const cardIdNum = parseInt(card.id, 10);

      if (imgIdNum !== cardIdNum) {
        mismatches.push(`${card.name}: Card ID (${card.id}) != Image URL ID (${urlMatch[1]})`);
      }
    }

    expect(mismatches).toEqual([]);

    // Specific regression validations for reported bugs:
    // 1. Waboku must be ID 12607053 with 12607053.jpg (NEVER 25833572 which is Gate Guardian)
    const waboku = catalog.find((c) => c.name.toLowerCase() === 'waboku');
    expect(waboku).toBeDefined();
    expect(waboku?.id).toBe('12607053');
    expect(waboku?.imageUrl).toContain('12607053.jpg');
    expect(waboku?.imageUrl).not.toContain('25833572');

    // 2. Gate Guardian passcode (25833572) must never be assigned to a Trap card or named Waboku
    const fakeTrap = catalog.find((c) => String(c.id) === '25833572' || c.imageUrl.includes('25833572'));
    if (fakeTrap) {
      expect(fakeTrap.type).not.toContain('Trap');
      expect(fakeTrap.name.toLowerCase()).not.toBe('waboku');
    }

    // 3. Castle Walls must be official passcode 44209392 with 44209392.jpg
    const castleWalls = catalog.find((c) => c.name.toLowerCase() === 'castle walls');
    expect(castleWalls).toBeDefined();
    expect(castleWalls?.id).toBe('44209392');
    expect(castleWalls?.imageUrl).toContain('44209392.jpg');
  });

  it('Teste 3: should guarantee 0 cross-contamination between Monsters and Spells/Traps', () => {
    // Arrange
    const catalog = getAllCatalogCards();

    // Act
    const monsters = filterCatalogByType(catalog, 'MONSTER');
    const spells = filterCatalogByType(catalog, 'SPELL');
    const traps = filterCatalogByType(catalog, 'TRAP');

    // Assert: No Spells or Traps leak into Monsters filter
    const spellsInMonsters = monsters.filter((c) => isSpellType(c.type) || isTrapType(c.type));
    expect(spellsInMonsters).toHaveLength(0);

    // No Raigeki or Mirror Force in monsters
    expect(monsters.some((c) => c.name === 'Raigeki')).toBe(false);
    expect(monsters.some((c) => c.name === 'Mirror Force')).toBe(false);
    expect(monsters.some((c) => c.name === 'Waboku')).toBe(false);

    // No Monsters in Spells or Traps
    expect(spells.some((c) => isMonsterType(c.type))).toBe(false);
    expect(traps.some((c) => isMonsterType(c.type))).toBe(false);

    // Exactly one copy of Raigeki, Mirror Force, Waboku in catalog
    expect(catalog.filter((c) => c.name === 'Raigeki')).toHaveLength(1);
    expect(catalog.filter((c) => c.name === 'Mirror Force')).toHaveLength(1);
    expect(catalog.filter((c) => c.name === 'Waboku')).toHaveLength(1);
  });

  it('Teste 4: should automatically deduplicate and sanitize corrupted raw lists maintaining alphabetical sort', () => {
    // Arrange: Simulate dirty list with duplicate IDs, duplicate names, and corrupted entries
    const dirtyList = [
      { id: '1001', name: 'Zombies', type: 'Normal Monster', level: 3, attack: 1000, defense: 1000, description: '', imageUrl: 'https://images.ygoprodeck.com/images/cards/1001.jpg' },
      { id: '1001', name: 'Zombies Duplicate', type: 'Normal Monster', level: 3, attack: 1000, defense: 1000, description: '', imageUrl: 'https://images.ygoprodeck.com/images/cards/1001.jpg' },
      { id: '1002', name: 'Alpha Warrior', type: 'Normal Monster', level: 4, attack: 1400, defense: 1200, description: '', imageUrl: 'https://images.ygoprodeck.com/images/cards/1002.jpg' },
      { id: '1003', name: 'Alpha Warrior', type: 'Normal Monster', level: 4, attack: 1400, defense: 1200, description: '', imageUrl: 'https://images.ygoprodeck.com/images/cards/1003.jpg' },
      { id: '1004', name: 'Beta Beetle', type: 'Normal Monster', level: 2, attack: 500, defense: 500, description: '', imageUrl: 'https://images.ygoprodeck.com/images/cards/1004.jpg' },
    ];

    // Act
    const cleaned = sanitizeCatalogCards(dirtyList);

    // Assert
    expect(cleaned).toHaveLength(3);
    // Deduplicated by ID (1001 kept once) and by Name ('Alpha Warrior' kept once)
    expect(cleaned.map((c) => c.id)).toEqual(['1002', '1004', '1001']);
    // Sorted alphabetically
    expect(cleaned.map((c) => c.name)).toEqual(['Alpha Warrior', 'Beta Beetle', 'Zombies']);
  });
});


