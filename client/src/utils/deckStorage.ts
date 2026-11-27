import { CardData } from '@duel/duel-types';
import { DeckCardEntry, DeckModel, DeckService, deckService } from '@duel/deck-service';
import { createYugiDeck, createKaibaDeck, CLASSIC_CARDS } from '@duel/starter-decks';
import duelistKingdomCatalog from '../data/duelist-kingdom-catalog.json';

const getDeckStorageKey = (nickname?: string): string => {
  const cleanNick = nickname && nickname.trim() ? nickname.trim().toLowerCase() : 'guest';
  return `ygo_decks_${cleanNick}`;
};

interface StoredDeckData {
  activeDeckId: string;
  customDecks: DeckModel[];
}

const groupCardList = (cardList: CardData[]): DeckCardEntry[] => {
  const map = new Map<string, DeckCardEntry>();
  for (const card of cardList) {
    const existing = map.get(card.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      map.set(card.id, { card, quantity: 1 });
    }
  }
  return Array.from(map.values());
};

export const getPrebuiltDecksList = (): DeckModel[] => {
  return [
    {
      id: 'prebuilt-yugi-classic',
      name: 'Yugi Muto - Deck Clássico',
      description: 'Deck clássico lendário de Yugi Muto com Mago Negro, Crânio Convocado e defesas táticas.',
      isActive: false,
      isPrebuilt: true,
      cards: groupCardList(createYugiDeck()),
    },
    {
      id: 'prebuilt-kaiba-classic',
      name: 'Seto Kaiba - Deck Clássico',
      description: 'Deck ofensivo implacável de Seto Kaiba liderado pelo Dragão Branco de Olhos Azuis.',
      isActive: false,
      isPrebuilt: true,
      cards: groupCardList(createKaibaDeck()),
    },
  ];
};

export const sanitizeCatalogCards = (cards: CardData[]): CardData[] => {
  const mapById = new Map<string, CardData>();
  const seenNames = new Set<string>();

  for (const card of cards) {
    if (!card || !card.id || !card.name) continue;
    const cleanId = String(card.id).trim();
    const cleanName = card.name.toLowerCase().trim();

    // Prevent duplicate IDs and duplicate card names
    if (mapById.has(cleanId) || seenNames.has(cleanName)) {
      continue;
    }

    mapById.set(cleanId, card);
    seenNames.add(cleanName);
  }

  const result = Array.from(mapById.values());
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
};

export const getAllCatalogCards = (): CardData[] => {
  const rawCards: CardData[] =
    Array.isArray(duelistKingdomCatalog) && duelistKingdomCatalog.length > 0
      ? (duelistKingdomCatalog as unknown as CardData[])
      : Object.values(CLASSIC_CARDS);

  return sanitizeCatalogCards(rawCards);
};

export type CardFilterType = 'ALL' | 'MONSTER' | 'SPELL' | 'TRAP';

export const isMonsterType = (type?: string): boolean => !!type && type.toLowerCase().includes('monster');
export const isSpellType = (type?: string): boolean =>
  !!type &&
  (type.toLowerCase().includes('spell') ||
    type.toLowerCase().includes('magia') ||
    type.toLowerCase().includes('mágica'));
export const isTrapType = (type?: string): boolean =>
  !!type &&
  (type.toLowerCase().includes('trap') ||
    type.toLowerCase().includes('armadilha'));

export const filterCatalogByType = (cards: CardData[], filter: CardFilterType): CardData[] => {
  if (filter === 'MONSTER') return cards.filter((c) => isMonsterType(c.type));
  if (filter === 'SPELL') return cards.filter((c) => isSpellType(c.type));
  if (filter === 'TRAP') return cards.filter((c) => isTrapType(c.type));
  return cards;
};

const loadStoredData = (nickname?: string): StoredDeckData => {
  const defaultData: StoredDeckData = {
    activeDeckId: 'prebuilt-yugi-classic',
    customDecks: [],
  };

  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultData;
  }

  try {
    const raw = window.localStorage.getItem(getDeckStorageKey(nickname));
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw);
    return {
      activeDeckId: typeof parsed.activeDeckId === 'string' ? parsed.activeDeckId : 'prebuilt-yugi-classic',
      customDecks: Array.isArray(parsed.customDecks) ? parsed.customDecks : [],
    };
  } catch (err) {
    console.warn('[DeckStorage] Failed to load decks from localStorage:', err);
    return defaultData;
  }
};

const saveStoredData = (nickname: string | undefined, data: StoredDeckData): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getDeckStorageKey(nickname), JSON.stringify(data));
  } catch (err) {
    console.warn('[DeckStorage] Failed to save decks to localStorage:', err);
  }
};

/**
 * Returns all decks (prebuilt + up to 3 custom decks) with isActive properly marked.
 */
export const getAllUserDecks = (nickname?: string): DeckModel[] => {
  const stored = loadStoredData(nickname);
  const prebuilt = getPrebuiltDecksList();
  const all = [...prebuilt, ...stored.customDecks.slice(0, DeckService.MAX_USER_DECKS)];

  const activeExists = all.some((d) => d.id === stored.activeDeckId);
  const effectiveActiveId = activeExists ? stored.activeDeckId : 'prebuilt-yugi-classic';

  return all.map((d) => ({
    ...d,
    isActive: d.id === effectiveActiveId,
  }));
};

/**
 * Sets a deck (prebuilt or custom) as the active main deck for duels.
 */
export const setActiveMainDeck = (
  nickname: string | undefined,
  deckId: string,
  userId?: string
): DeckModel[] => {
  const stored = loadStoredData(nickname);
  stored.activeDeckId = deckId;
  saveStoredData(nickname, stored);

  if (userId && userId !== 'guest') {
    deckService.setMainDeck(userId, deckId).catch(() => {});
  }

  return getAllUserDecks(nickname);
};

/**
 * Creates a new custom deck (enforcing max 3 custom decks).
 */
export const createNewCustomDeck = (
  nickname: string | undefined,
  name: string,
  initialCards?: DeckCardEntry[],
  userId?: string
): { decks: DeckModel[]; createdDeck: DeckModel } => {
  const stored = loadStoredData(nickname);
  if (stored.customDecks.length >= DeckService.MAX_USER_DECKS) {
    throw new Error(`Limite atingido: Você pode ter no máximo ${DeckService.MAX_USER_DECKS} decks personalizados.`);
  }

  const newDeck: DeckModel = {
    id: `custom-deck-${Date.now()}`,
    userId: nickname,
    name: name.trim() || `Deck Personalizado ${stored.customDecks.length + 1}`,
    description: 'Deck personalizado construído pelo duelista.',
    isActive: true,
    isPrebuilt: false,
    cards: initialCards ? initialCards.map((c) => ({ card: c.card, quantity: c.quantity })) : [],
  };

  stored.customDecks.push(newDeck);
  stored.activeDeckId = newDeck.id;
  saveStoredData(nickname, stored);

  if (userId && userId !== 'guest') {
    deckService
      .saveCustomDeck(userId, {
        id: newDeck.id,
        name: newDeck.name,
        description: newDeck.description,
        isActive: newDeck.isActive,
        cards: newDeck.cards,
      })
      .catch(() => {});
  }

  return {
    decks: getAllUserDecks(nickname),
    createdDeck: newDeck,
  };
};

/**
 * Updates an existing custom deck (validating max 3 copies per card).
 */
export const updateCustomDeck = (
  nickname: string | undefined,
  updatedDeck: DeckModel,
  userId?: string
): DeckModel[] => {
  if (updatedDeck.isPrebuilt) {
    throw new Error('Decks pré-montados clássicos não podem ser alterados diretamente.');
  }

  for (const entry of updatedDeck.cards) {
    if (entry.quantity > DeckService.MAX_COPIES_PER_CARD) {
      const cardName = entry.card.namePt || entry.card.name;
      throw new Error(`A carta "${cardName}" excede o limite de ${DeckService.MAX_COPIES_PER_CARD} cópias.`);
    }
  }

  const stored = loadStoredData(nickname);
  const idx = stored.customDecks.findIndex((d) => d.id === updatedDeck.id);
  if (idx === -1) {
    if (stored.customDecks.length >= DeckService.MAX_USER_DECKS) {
      throw new Error(`Limite máximo de ${DeckService.MAX_USER_DECKS} decks personalizados atingido.`);
    }
    stored.customDecks.push({
      ...updatedDeck,
      cards: updatedDeck.cards.filter((c) => c.quantity > 0),
    });
  } else {
    stored.customDecks[idx] = {
      ...updatedDeck,
      name: updatedDeck.name.trim() || 'Deck sem Nome',
      cards: updatedDeck.cards.filter((c) => c.quantity > 0),
    };
  }

  saveStoredData(nickname, stored);

  if (userId && userId !== 'guest') {
    deckService
      .saveCustomDeck(userId, {
        id: updatedDeck.id,
        name: updatedDeck.name,
        description: updatedDeck.description,
        isActive: updatedDeck.isActive,
        cards: updatedDeck.cards,
      })
      .catch(() => {});
  }

  return getAllUserDecks(nickname);
};

/**
 * Deletes a custom deck and resets active deck if necessary.
 */
export const deleteCustomDeck = (
  nickname: string | undefined,
  deckId: string,
  userId?: string
): DeckModel[] => {
  const stored = loadStoredData(nickname);
  stored.customDecks = stored.customDecks.filter((d) => d.id !== deckId);
  if (stored.activeDeckId === deckId) {
    stored.activeDeckId = 'prebuilt-yugi-classic';
  }
  saveStoredData(nickname, stored);

  if (userId && userId !== 'guest') {
    deckService.deleteCustomDeck(userId, deckId).catch(() => {});
  }

  return getAllUserDecks(nickname);
};

/**
 * Asynchronously synchronizes user decks from Supabase into local cache.
 */
export const syncUserDecksWithCloud = async (
  userId: string,
  nickname?: string
): Promise<DeckModel[]> => {
  if (!userId || userId === 'guest') {
    return getAllUserDecks(nickname);
  }

  try {
    const cloudDecks = await deckService.getUserDecks(userId);
    if (Array.isArray(cloudDecks) && cloudDecks.length > 0) {
      const stored = loadStoredData(nickname);
      const customOnly = cloudDecks
        .filter((d) => !d.isPrebuilt)
        .slice(0, DeckService.MAX_USER_DECKS);
      const activeCloud = cloudDecks.find((d) => d.isActive);

      if (customOnly.length > 0) {
        stored.customDecks = customOnly;
      }
      if (activeCloud) {
        stored.activeDeckId = activeCloud.id;
      }
      saveStoredData(nickname, stored);
    }
  } catch {
    // Graceful fallback to local cache
  }

  return getAllUserDecks(nickname);
};

/**
 * Expands the user's active main deck into a flat CardData[] array for DuelMatchSession.
 */
export const getActiveDeckForDuel = (nickname?: string): { deckName: string; cards: CardData[] } => {
  const allDecks = getAllUserDecks(nickname);
  const activeDeck = allDecks.find((d) => d.isActive) || allDecks[0];

  const expanded: CardData[] = [];
  for (const entry of activeDeck.cards) {
    const qty = Math.min(DeckService.MAX_COPIES_PER_CARD, Math.max(0, entry.quantity));
    for (let i = 0; i < qty; i++) {
      expanded.push(entry.card);
    }
  }

  // Fallback to Yugi's classic 40-card deck if active custom deck has fewer than 5 cards for initial hand
  if (expanded.length < 5) {
    return {
      deckName: 'Yugi Muto - Deck Clássico (Padrão)',
      cards: createYugiDeck(),
    };
  }

  return {
    deckName: activeDeck.name,
    cards: expanded,
  };
};

