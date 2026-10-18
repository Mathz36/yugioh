import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CardData, CardEffectType } from './duel-types.js';
import { CLASSIC_CARDS, createKaibaDeck, createYugiDeck } from './starter-decks.js';
import duelistKingdomCatalog from '../../client/src/data/duelist-kingdom-catalog.json';

export const MAX_CUSTOM_DECKS = 3;
export const MAX_CARD_COPIES = 3;
export const STARTER_YUGI_DECK_ID = 'prebuilt-yugi-classic';
export const STARTER_KAIBA_DECK_ID = 'prebuilt-kaiba-classic';
export const LEGACY_STARTER_YUGI_ID = 'starter_yugi';
export const LEGACY_STARTER_KAIBA_ID = 'starter_kaiba';

export interface DeckCardEntry {
  card: CardData;
  quantity: number;
  cardId?: string;
}

export interface DeckCardIdInput {
  cardId: string;
  quantity: number;
  card?: CardData;
}

export interface DeckModel {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  isActive: boolean;
  isPrebuilt: boolean;
  cards: DeckCardEntry[];
  isMain?: boolean;
  isPreset?: boolean;
  isCustom?: boolean;
  cardEntries?: DeckCardEntry[];
  expandedCards?: CardData[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserDeck extends DeckModel {
  userId: string;
  isMain: boolean;
  isPreset: boolean;
  isCustom: boolean;
  cardEntries: DeckCardEntry[];
  expandedCards: CardData[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomDeckInput {
  id?: string;
  name: string;
  description?: string;
  isActive?: boolean;
  isMain?: boolean;
  cards?: Array<CardData | DeckCardEntry | DeckCardIdInput | string>;
  cardEntries?: Array<DeckCardEntry | DeckCardIdInput>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeckServiceOptions {
  supabaseClient?: SupabaseClient | null;
  supabaseUrl?: string;
  supabaseKey?: string;
  storage?: StorageLike;
}

interface StoredCustomDeckRecord {
  id: string;
  userId: string;
  name: string;
  description?: string;
  isActive: boolean;
  cards: DeckCardEntry[];
  createdAt: string;
  updatedAt: string;
}

interface SharedLocalDeckStore {
  activeDeckId: string;
  customDecks: StoredCustomDeckRecord[];
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * In-memory fallback storage when global localStorage is unavailable (e.g. Node CLI).
 */
class MemoryStorage implements StorageLike {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

const fallbackMemoryStorage = new MemoryStorage();

const CLASSIC_CARD_BY_ID: Map<string, CardData> = new Map();

// Seed catalog cards from Duelist Kingdom Wave 1
if (Array.isArray(duelistKingdomCatalog)) {
  for (const raw of duelistKingdomCatalog as any[]) {
    if (raw && raw.id) {
      CLASSIC_CARD_BY_ID.set(String(raw.id), {
        id: String(raw.id),
        name: String(raw.name),
        namePt: raw.namePt || raw.name_pt || undefined,
        type: String(raw.type || 'Normal Monster'),
        level: Number(raw.level ?? 4),
        attack: Number(raw.attack ?? 0),
        defense: Number(raw.defense ?? 0),
        race: raw.race || undefined,
        attribute: raw.attribute || undefined,
        description: String(raw.description || ''),
        descriptionPt: raw.descriptionPt || raw.description_pt || undefined,
        imageUrl: raw.imageUrl || raw.image_url || undefined,
        effectType: (raw.effectType || raw.effect_type) as CardEffectType | undefined,
        effectDefinition: raw.effectDefinition || raw.effect_definition || undefined,
      });
    }
  }
}

// Overlay classic cards from starter decks (preserving any custom effectDefinitions)
for (const card of Object.values(CLASSIC_CARDS)) {
  CLASSIC_CARD_BY_ID.set(String(card.id), card);
}

/**
 * Service responsible for CRUD operations of user decks (pre-built starter decks
 * + up to 3 custom decks per user), connecting to Supabase (`decks` and `deck_cards`)
 * with automatic, transparent fallback to `localStorage` for quick matches and guest mode.
 */
export class DeckService {
  public static readonly MAX_USER_DECKS = MAX_CUSTOM_DECKS;
  public static readonly MAX_CUSTOM_DECKS = MAX_CUSTOM_DECKS;
  public static readonly MAX_COPIES_PER_CARD = MAX_CARD_COPIES;
  public static readonly MAX_CARD_COPIES = MAX_CARD_COPIES;

  private supabase: SupabaseClient | null = null;
  private customStorage?: StorageLike;

  constructor(options: DeckServiceOptions = {}) {
    this.customStorage = options.storage;

    if (options.supabaseClient !== undefined) {
      this.supabase = options.supabaseClient;
      return;
    }

    const url = options.supabaseUrl || this.readEnv('VITE_SUPABASE_URL') || this.readEnv('SUPABASE_URL');
    const key =
      options.supabaseKey ||
      this.readEnv('VITE_SUPABASE_ANON_KEY') ||
      this.readEnv('SUPABASE_ANON_KEY');

    if (url && key) {
      try {
        this.supabase = createClient(url, key, {
          auth: { persistSession: false },
        });
      } catch {
        this.supabase = null;
      }
    }
  }

  /**
   * Returns the pre-built starter decks plus up to 3 custom decks for the given user.
   * Ensures exactly one deck is marked as the active/main deck.
   */
  public async getUserDecks(userId: string): Promise<UserDeck[]> {
    const normalizedUserId = this.normalizeUserId(userId);
    const starterDecks = this.buildStarterDecks(normalizedUserId);
    const localStore = this.loadLocalDeckStore(normalizedUserId);

    let customRecords: StoredCustomDeckRecord[] | null = null;

    if (this.shouldUseSupabase(normalizedUserId)) {
      customRecords = await this.fetchCustomDecksFromSupabase(normalizedUserId);
      if (customRecords !== null) {
        const activeRemote = customRecords.find((r) => r.isActive);
        this.saveLocalDeckStore(normalizedUserId, {
          activeDeckId: activeRemote ? activeRemote.id : localStore.activeDeckId,
          customDecks: customRecords,
        });
      }
    }

    if (customRecords === null) {
      customRecords = localStore.customDecks;
    }

    const limitedRecords = customRecords.slice(0, MAX_CUSTOM_DECKS);
    const customDecks = limitedRecords.map((rec) => this.hydrateCustomDeck(rec));

    const allDecks = [...starterDecks, ...customDecks];
    this.reconcileMainDeckFlag(normalizedUserId, allDecks);

    return allDecks;
  }

  /**
   * Validates and saves a custom deck for the user.
   * Enforces:
   * - Non-empty deck nickname (`name`)
   * - Max 3 custom decks per user
   * - Max 3 copies per unique card
   */
  public async saveCustomDeck(userId: string, deckData: CustomDeckInput): Promise<UserDeck> {
    const normalizedUserId = this.normalizeUserId(userId);
    const sanitizedName = this.validateAndSanitizeDeckName(deckData?.name);
    const sanitizedDescription = deckData?.description?.trim() || undefined;

    if (deckData.id && this.isStarterDeckId(deckData.id)) {
      throw new Error('Não é permitido sobrescrever um deck inicial pré-montado.');
    }

    const normalizedEntries = this.validateAndNormalizeCards(deckData);
    const localStore = this.loadLocalDeckStore(normalizedUserId);

    // Load current custom decks to enforce the 3-deck limit
    let existingRecords: StoredCustomDeckRecord[] | null = null;
    if (this.shouldUseSupabase(normalizedUserId)) {
      existingRecords = await this.fetchCustomDecksFromSupabase(normalizedUserId);
    }
    if (existingRecords === null) {
      existingRecords = localStore.customDecks;
    }

    const existingIndex = deckData.id
      ? existingRecords.findIndex((d) => d.id === deckData.id)
      : -1;

    if (existingIndex === -1 && existingRecords.length >= MAX_CUSTOM_DECKS) {
      throw new Error(
        `Limite máximo de ${MAX_CUSTOM_DECKS} decks personalizados atingido (maximum of ${MAX_CUSTOM_DECKS} custom decks).`
      );
    }

    const nowIso = new Date().toISOString();
    const deckId =
      existingIndex !== -1
        ? existingRecords[existingIndex].id
        : deckData.id || this.generateUuid();

    const wantsActive = Boolean(
      deckData.isActive ?? deckData.isMain ?? (existingIndex !== -1 ? existingRecords[existingIndex].isActive : false)
    );

    const recordToSave: StoredCustomDeckRecord = {
      id: deckId,
      userId: normalizedUserId,
      name: sanitizedName,
      description: sanitizedDescription,
      isActive: wantsActive,
      cards: normalizedEntries,
      createdAt: existingIndex !== -1 ? existingRecords[existingIndex].createdAt : nowIso,
      updatedAt: nowIso,
    };

    // Persist to Supabase if eligible, falling back transparently to localStorage
    if (this.shouldUseSupabase(normalizedUserId)) {
      const savedRemote = await this.persistCustomDeckToSupabase(
        normalizedUserId,
        recordToSave,
        existingIndex !== -1
      );
      if (savedRemote) {
        recordToSave.id = savedRemote.id;
        recordToSave.createdAt = savedRemote.createdAt;
        recordToSave.updatedAt = savedRemote.updatedAt;
      }
    }

    const updatedRecords = [...existingRecords];
    let nextActiveDeckId = localStore.activeDeckId;
    if (wantsActive) {
      for (const rec of updatedRecords) {
        rec.isActive = false;
      }
      nextActiveDeckId = recordToSave.id;
    }

    if (existingIndex !== -1) {
      updatedRecords[existingIndex] = recordToSave;
    } else {
      updatedRecords.push(recordToSave);
    }

    this.saveLocalDeckStore(normalizedUserId, {
      activeDeckId: nextActiveDeckId,
      customDecks: updatedRecords,
    });

    const savedDeck = this.hydrateCustomDeck(recordToSave);
    if (nextActiveDeckId === savedDeck.id || wantsActive) {
      savedDeck.isActive = true;
      savedDeck.isMain = true;
    }

    return savedDeck;
  }

  /**
   * Sets the specified deck (starter or custom) as the user's main/active deck
   * and deactivates all other decks.
   */
  public async setMainDeck(userId: string, deckId: string): Promise<void> {
    const normalizedUserId = this.normalizeUserId(userId);
    const trimmedDeckId = this.canonicalizeStarterDeckId((deckId || '').trim());
    if (!trimmedDeckId) {
      throw new Error('ID do deck inválido.');
    }

    const allDecks = await this.getUserDecks(normalizedUserId);
    const targetDeck = allDecks.find((d) => d.id === trimmedDeckId);
    if (!targetDeck) {
      throw new Error(`Deck "${trimmedDeckId}" não encontrado para o usuário.`);
    }

    const localStore = this.loadLocalDeckStore(normalizedUserId);
    const updatedRecords = localStore.customDecks.map((rec) => ({
      ...rec,
      isActive: rec.id === trimmedDeckId,
      updatedAt: rec.id === trimmedDeckId ? new Date().toISOString() : rec.updatedAt,
    }));

    this.saveLocalDeckStore(normalizedUserId, {
      activeDeckId: trimmedDeckId,
      customDecks: updatedRecords,
    });

    // Sync active status in Supabase if applicable
    if (this.shouldUseSupabase(normalizedUserId) && this.supabase) {
      try {
        await this.supabase
          .from('decks')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_id', normalizedUserId);

        if (!this.isStarterDeckId(trimmedDeckId)) {
          await this.supabase
            .from('decks')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', trimmedDeckId)
            .eq('user_id', normalizedUserId);
        }
      } catch {
        // Transparent fallback: local state is already updated
      }
    }
  }

  /**
   * Deletes a custom deck owned by the user.
   * Pre-built starter decks cannot be deleted.
   */
  public async deleteCustomDeck(userId: string, deckId: string): Promise<void> {
    const normalizedUserId = this.normalizeUserId(userId);
    const trimmedDeckId = this.canonicalizeStarterDeckId((deckId || '').trim());

    if (!trimmedDeckId) {
      throw new Error('ID do deck inválido.');
    }

    if (this.isStarterDeckId(trimmedDeckId)) {
      throw new Error('Decks iniciais pré-montados não podem ser excluídos.');
    }

    if (this.shouldUseSupabase(normalizedUserId) && this.supabase) {
      try {
        await this.supabase
          .from('decks')
          .delete()
          .eq('id', trimmedDeckId)
          .eq('user_id', normalizedUserId);
      } catch {
        // Transparent fallback to localStorage removal
      }
    }

    const localStore = this.loadLocalDeckStore(normalizedUserId);
    const filteredRecords = localStore.customDecks.filter((rec) => rec.id !== trimmedDeckId);
    const nextActiveDeckId =
      localStore.activeDeckId === trimmedDeckId ? STARTER_YUGI_DECK_ID : localStore.activeDeckId;

    this.saveLocalDeckStore(normalizedUserId, {
      activeDeckId: nextActiveDeckId,
      customDecks: filteredRecords,
    });
  }

  /**
   * Convenience helper that returns the currently active main deck for a user.
   */
  public async getMainDeck(userId: string): Promise<UserDeck> {
    const decks = await this.getUserDecks(userId);
    return decks.find((d) => d.isMain) || decks[0];
  }

  /**
   * Expands a `DeckModel` or `UserDeck` into a flat `CardData[]` array ready for `DuelMatchSession`.
   */
  public static expandDeckCards(deck: DeckModel): CardData[] {
    const expanded: CardData[] = [];
    for (const entry of deck.cards) {
      const qty = Math.min(MAX_CARD_COPIES, Math.max(0, entry.quantity));
      for (let i = 0; i < qty; i++) {
        expanded.push({ ...entry.card });
      }
    }
    return expanded;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private getStorage(): StorageLike {
    if (this.customStorage) {
      return this.customStorage;
    }
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
      }
    } catch {
      // SecurityError or unavailable in environment
    }
    return fallbackMemoryStorage;
  }

  private readEnv(key: string): string | undefined {
    try {
      if (typeof process !== 'undefined' && process.env?.[key]) {
        return String(process.env[key]);
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  private normalizeUserId(userId: string): string {
    const trimmed = (userId || '').trim();
    return trimmed || 'guest';
  }

  private canonicalizeStarterDeckId(deckId: string): string {
    if (deckId === LEGACY_STARTER_YUGI_ID) return STARTER_YUGI_DECK_ID;
    if (deckId === LEGACY_STARTER_KAIBA_ID) return STARTER_KAIBA_DECK_ID;
    return deckId;
  }

  private isStarterDeckId(deckId: string): boolean {
    const canonical = this.canonicalizeStarterDeckId(deckId);
    return canonical === STARTER_YUGI_DECK_ID || canonical === STARTER_KAIBA_DECK_ID;
  }

  private shouldUseSupabase(userId: string): boolean {
    if (!this.supabase) return false;
    if (!userId || userId === 'guest' || userId.toLowerCase().startsWith('guest')) {
      return false;
    }
    return UUID_REGEX.test(userId);
  }

  private validateAndSanitizeDeckName(name: string | undefined): string {
    const sanitized = (name || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (!sanitized) {
      throw new Error('O apelido (nome) do deck não pode estar vazio.');
    }
    if (sanitized.length > 60) {
      throw new Error('O apelido do deck deve ter no máximo 60 caracteres.');
    }
    return sanitized;
  }

  private validateAndNormalizeCards(deckData: CustomDeckInput): DeckCardEntry[] {
    const rawItems = deckData.cardEntries ?? deckData.cards;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error('O deck deve conter pelo menos 1 carta.');
    }

    const quantityByCardId = new Map<string, number>();
    const cardDataByCardId = new Map<string, CardData>();

    for (const item of rawItems) {
      if (!item) {
        throw new Error('Carta inválida ou nula fornecida ao deck.');
      }

      if (typeof item === 'string') {
        const cardId = item.trim();
        if (!cardId) {
          throw new Error('ID de carta inválido.');
        }
        const nextQty = (quantityByCardId.get(cardId) || 0) + 1;
        quantityByCardId.set(cardId, nextQty);
        cardDataByCardId.set(cardId, this.resolveCardData(cardId));
      } else if ('quantity' in item && ('card' in item || 'cardId' in item)) {
        const entryCard = (item as DeckCardEntry).card;
        const rawCardId = (item as DeckCardIdInput).cardId || entryCard?.id;
        const cardId = String(rawCardId || '').trim();
        const qty = Number(item.quantity);
        if (!cardId || !Number.isInteger(qty) || qty < 1) {
          throw new Error(`Quantidade inválida para a carta "${cardId}".`);
        }
        const nextQty = (quantityByCardId.get(cardId) || 0) + qty;
        quantityByCardId.set(cardId, nextQty);
        cardDataByCardId.set(cardId, entryCard || this.resolveCardData(cardId));
      } else if ('id' in item && 'name' in item) {
        const card = item as CardData;
        const cardId = String(card.id).trim();
        if (!cardId) {
          throw new Error('ID de carta inválido.');
        }
        const nextQty = (quantityByCardId.get(cardId) || 0) + 1;
        quantityByCardId.set(cardId, nextQty);
        cardDataByCardId.set(cardId, card);
      } else {
        throw new Error('Formato de carta inválido fornecido ao deck.');
      }
    }

    if (quantityByCardId.size === 0) {
      throw new Error('O deck deve conter pelo menos 1 carta válida.');
    }

    const entries: DeckCardEntry[] = [];
    for (const [cardId, quantity] of quantityByCardId.entries()) {
      const cardData = cardDataByCardId.get(cardId) || this.resolveCardData(cardId);
      if (quantity > MAX_CARD_COPIES) {
        const cardName = cardData.namePt || cardData.name || cardId;
        throw new Error(
          `Limite máximo de ${MAX_CARD_COPIES} cópias por carta excedido para "${cardName}" (${quantity} cópias).`
        );
      }
      entries.push({
        cardId,
        quantity,
        card: cardData,
      });
    }

    return entries;
  }

  private resolveCardData(cardId: string, fallbackRow?: Record<string, any>): CardData {
    const classic = CLASSIC_CARD_BY_ID.get(String(cardId));
    if (classic) {
      return { ...classic };
    }

    if (fallbackRow) {
      return {
        id: String(fallbackRow.id ?? cardId),
        name: String(fallbackRow.name || `Card #${cardId}`),
        namePt: fallbackRow.namePt || fallbackRow.name_pt || undefined,
        type: String(fallbackRow.type || 'Normal Monster'),
        level: Number(fallbackRow.level ?? 4),
        attack: Number(fallbackRow.attack ?? fallbackRow.atk ?? 0),
        defense: Number(fallbackRow.defense ?? fallbackRow.def ?? 0),
        race: fallbackRow.race || undefined,
        description: String(fallbackRow.description || ''),
        descriptionPt: fallbackRow.descriptionPt || fallbackRow.description_pt || undefined,
        imageUrl: fallbackRow.imageUrl || fallbackRow.image_url || undefined,
        effectType: (fallbackRow.effectType || fallbackRow.effect_type) as CardEffectType | undefined,
        effectDefinition: fallbackRow.effectDefinition || fallbackRow.effect_definition || undefined,
      };
    }

    return {
      id: String(cardId),
      name: `Card #${cardId}`,
      type: 'Normal Monster',
      level: 4,
      attack: 1000,
      defense: 1000,
      description: 'Custom catalog card.',
    };
  }

  private expandCardsFromEntries(entries: DeckCardEntry[]): CardData[] {
    const expanded: CardData[] = [];
    for (const entry of entries) {
      const cardData = entry.card || this.resolveCardData(String(entry.cardId || ''));
      for (let i = 0; i < entry.quantity; i++) {
        expanded.push({ ...cardData });
      }
    }
    return expanded;
  }

  private compressCardsToEntries(cards: CardData[]): DeckCardEntry[] {
    const map = new Map<string, DeckCardEntry>();
    for (const card of cards) {
      const existing = map.get(card.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        map.set(card.id, {
          cardId: card.id,
          quantity: 1,
          card: { ...card },
        });
      }
    }
    return Array.from(map.values());
  }

  private buildStarterDecks(userId: string): UserDeck[] {
    const yugiCards = createYugiDeck();
    const kaibaCards = createKaibaDeck();
    const yugiEntries = this.compressCardsToEntries(yugiCards);
    const kaibaEntries = this.compressCardsToEntries(kaibaCards);
    const fixedTimestamp = '2026-10-17T00:00:00.000Z';

    return [
      {
        id: STARTER_YUGI_DECK_ID,
        userId,
        name: 'Yugi Muto - Deck Clássico',
        description: 'Deck clássico lendário de Yugi Muto com Mago Negro, Crânio Convocado e defesas táticas.',
        isPrebuilt: true,
        isPreset: true,
        isCustom: false,
        isActive: false,
        isMain: false,
        cards: yugiEntries,
        cardEntries: yugiEntries,
        expandedCards: yugiCards,
        createdAt: fixedTimestamp,
        updatedAt: fixedTimestamp,
      },
      {
        id: STARTER_KAIBA_DECK_ID,
        userId,
        name: 'Seto Kaiba - Deck Clássico',
        description: 'Deck ofensivo implacável de Seto Kaiba liderado pelo Dragão Branco de Olhos Azuis.',
        isPrebuilt: true,
        isPreset: true,
        isCustom: false,
        isActive: false,
        isMain: false,
        cards: kaibaEntries,
        cardEntries: kaibaEntries,
        expandedCards: kaibaCards,
        createdAt: fixedTimestamp,
        updatedAt: fixedTimestamp,
      },
    ];
  }

  private hydrateCustomDeck(record: StoredCustomDeckRecord): UserDeck {
    const rawEntries = Array.isArray(record.cards) ? record.cards : [];
    const entries: DeckCardEntry[] = rawEntries.map((entry) => {
      const cId = String(entry.cardId || entry.card?.id || '');
      const cardData = entry.card || this.resolveCardData(cId);
      return {
        cardId: cId,
        quantity: entry.quantity,
        card: cardData,
      };
    });

    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      description: record.description,
      isPrebuilt: false,
      isPreset: false,
      isCustom: true,
      isActive: Boolean(record.isActive),
      isMain: Boolean(record.isActive),
      cards: entries,
      cardEntries: entries,
      expandedCards: this.expandCardsFromEntries(entries),
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
  }

  private reconcileMainDeckFlag(userId: string, decks: UserDeck[]): void {
    const localStore = this.loadLocalDeckStore(userId);
    const storedMainId = this.canonicalizeStarterDeckId(localStore.activeDeckId);
    const activeCustomDeck = decks.find((d) => d.isCustom && d.isActive);

    let resolvedMainId: string = STARTER_YUGI_DECK_ID;
    if (activeCustomDeck && storedMainId === STARTER_YUGI_DECK_ID) {
      resolvedMainId = activeCustomDeck.id;
    } else if (storedMainId && decks.some((d) => d.id === storedMainId)) {
      resolvedMainId = storedMainId;
    } else if (activeCustomDeck) {
      resolvedMainId = activeCustomDeck.id;
    }

    for (const deck of decks) {
      const isMain = deck.id === resolvedMainId;
      deck.isActive = isMain;
      deck.isMain = isMain;
    }
  }

  private getDeckStorageKey(userId: string): string {
    const cleanNick = userId && userId.trim() ? userId.trim().toLowerCase() : 'guest';
    return `ygo_decks_${cleanNick}`;
  }

  private loadLocalDeckStore(userId: string): SharedLocalDeckStore {
    const defaultStore: SharedLocalDeckStore = {
      activeDeckId: STARTER_YUGI_DECK_ID,
      customDecks: [],
    };

    const storage = this.getStorage();
    const raw = storage.getItem(this.getDeckStorageKey(userId));
    if (!raw) return defaultStore;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultStore;

      const customDecks: StoredCustomDeckRecord[] = Array.isArray(parsed.customDecks)
        ? parsed.customDecks.map((d: any) => ({
            id: String(d.id),
            userId: String(d.userId || userId),
            name: String(d.name || 'Deck Personalizado'),
            description: d.description ? String(d.description) : undefined,
            isActive: Boolean(d.isActive),
            cards: Array.isArray(d.cards) ? d.cards : Array.isArray(d.cardEntries) ? d.cardEntries : [],
            createdAt: String(d.createdAt || new Date().toISOString()),
            updatedAt: String(d.updatedAt || new Date().toISOString()),
          }))
        : [];

      return {
        activeDeckId:
          typeof parsed.activeDeckId === 'string'
            ? this.canonicalizeStarterDeckId(parsed.activeDeckId)
            : STARTER_YUGI_DECK_ID,
        customDecks,
      };
    } catch {
      return defaultStore;
    }
  }

  private saveLocalDeckStore(userId: string, data: SharedLocalDeckStore): void {
    const storage = this.getStorage();
    storage.setItem(this.getDeckStorageKey(userId), JSON.stringify(data));
  }

  private async fetchCustomDecksFromSupabase(
    userId: string
  ): Promise<StoredCustomDeckRecord[] | null> {
    if (!this.supabase) return null;

    try {
      const { data: deckRows, error: decksError } = await this.supabase
        .from('decks')
        .select('id, user_id, name, description, is_active, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(MAX_CUSTOM_DECKS);

      if (decksError || !Array.isArray(deckRows)) {
        return null;
      }

      if (deckRows.length === 0) {
        return [];
      }

      const deckIds = deckRows.map((d: any) => String(d.id));
      const { data: cardRows, error: cardsError } = await this.supabase
        .from('deck_cards')
        .select('deck_id, card_id, quantity, cards(*)')
        .in('deck_id', deckIds);

      if (cardsError) {
        return null;
      }

      const entriesByDeckId = new Map<string, DeckCardEntry[]>();
      for (const row of cardRows || []) {
        const dId = String((row as any).deck_id);
        const cId = String((row as any).card_id);
        const qty = Number((row as any).quantity) || 1;
        const joinedCard = (row as any).cards;
        const resolvedCard = this.resolveCardData(cId, joinedCard);

        const list = entriesByDeckId.get(dId) || [];
        list.push({
          cardId: cId,
          quantity: qty,
          card: resolvedCard,
        });
        entriesByDeckId.set(dId, list);
      }

      return deckRows.map((row: any) => ({
        id: String(row.id),
        userId: String(row.user_id),
        name: String(row.name),
        description: row.description ? String(row.description) : undefined,
        isActive: Boolean(row.is_active),
        cards: entriesByDeckId.get(String(row.id)) || [],
        createdAt: String(row.created_at || new Date().toISOString()),
        updatedAt: String(row.updated_at || new Date().toISOString()),
      }));
    } catch {
      return null;
    }
  }

  private async persistCustomDeckToSupabase(
    userId: string,
    record: StoredCustomDeckRecord,
    isUpdate: boolean
  ): Promise<{ id: string; createdAt: string; updatedAt: string } | null> {
    if (!this.supabase) return null;

    try {
      if (record.isActive) {
        await this.supabase
          .from('decks')
          .update({ is_active: false, updated_at: record.updatedAt })
          .eq('user_id', userId);
      }

      let persistedDeckId = record.id;
      let createdAt = record.createdAt;
      let updatedAt = record.updatedAt;

      if (isUpdate) {
        const { data, error } = await this.supabase
          .from('decks')
          .update({
            name: record.name,
            description: record.description ?? null,
            is_active: record.isActive,
            updated_at: record.updatedAt,
          })
          .eq('id', record.id)
          .eq('user_id', userId)
          .select('id, created_at, updated_at')
          .single();

        if (error) return null;
        if (data) {
          persistedDeckId = String((data as any).id);
          createdAt = String((data as any).created_at || createdAt);
          updatedAt = String((data as any).updated_at || updatedAt);
        }

        await this.supabase.from('deck_cards').delete().eq('deck_id', persistedDeckId);
      } else {
        const { data, error } = await this.supabase
          .from('decks')
          .insert({
            id: UUID_REGEX.test(record.id) ? record.id : undefined,
            user_id: userId,
            name: record.name,
            description: record.description ?? null,
            is_active: record.isActive,
          })
          .select('id, created_at, updated_at')
          .single();

        if (error) return null;
        if (data) {
          persistedDeckId = String((data as any).id);
          createdAt = String((data as any).created_at || createdAt);
          updatedAt = String((data as any).updated_at || updatedAt);
        }
      }

      const deckCardPayloads = record.cards.map((entry) => {
        const cId = String(entry.cardId || entry.card.id);
        return {
          deck_id: persistedDeckId,
          card_id: Number.isNaN(Number(cId)) ? cId : Number(cId),
          quantity: entry.quantity,
        };
      });

      const { error: cardsInsertError } = await this.supabase
        .from('deck_cards')
        .insert(deckCardPayloads);

      if (cardsInsertError) {
        return null;
      }

      return { id: persistedDeckId, createdAt, updatedAt };
    } catch {
      return null;
    }
  }

  private generateUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export const deckService = new DeckService();
