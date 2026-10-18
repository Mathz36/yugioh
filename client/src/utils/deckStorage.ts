import { CardData } from '@duel/duel-types';
import { DeckCardEntry, DeckModel, DeckService } from '@duel/deck-service';
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

export const getAllCatalogCards = (): CardData[] => {
  if (Array.isArray(duelistKingdomCatalog) && duelistKingdomCatalog.length > 0) {
    return duelistKingdomCatalog as unknown as CardData[];
  }
  return Object.values(CLASSIC_CARDS);
};

export type CardFilterType = 'ALL' | 'MONSTER' | 'SPELL' | 'TRAP';

export const isMonsterType = (type?: string): boolean => !!type && type.toLowerCase().includes('monster');
export const isSpellType = (type?: string): boolean => !!type && type.toLowerCase().includes('spell');
export const isTrapType = (type?: string): boolean => !!type && type.toLowerCase().includes('trap');

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
export const setActiveMainDeck = (nickname: string | undefined, deckId: string): DeckModel[] => {
  const stored = loadStoredData(nickname);
  stored.activeDeckId = deckId;
  saveStoredData(nickname, stored);
  return getAllUserDecks(nickname);
};

/**
 * Creates a new custom deck (enforcing max 3 custom decks).
 */
export const createNewCustomDeck = (
  nickname: string | undefined,
  name: string,
  initialCards?: DeckCardEntry[]
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
  updatedDeck: DeckModel
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
  return getAllUserDecks(nickname);
};

/**
 * Deletes a custom deck and resets active deck if necessary.
 */
export const deleteCustomDeck = (nickname: string | undefined, deckId: string): DeckModel[] => {
  const stored = loadStoredData(nickname);
  stored.customDecks = stored.customDecks.filter((d) => d.id !== deckId);
  if (stored.activeDeckId === deckId) {
    stored.activeDeckId = 'prebuilt-yugi-classic';
  }
  saveStoredData(nickname, stored);
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

