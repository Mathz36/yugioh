import React, { useState, useMemo, useCallback } from 'react';
import { CardData } from '@duel/duel-types';
import { DeckCardEntry, DeckModel, DeckService } from '@duel/deck-service';
import {
  getAllUserDecks,
  setActiveMainDeck,
  createNewCustomDeck,
  updateCustomDeck,
  deleteCustomDeck,
  getAllCatalogCards,
  CardFilterType,
  isMonsterType,
  isSpellType,
  isTrapType,
} from '../utils/deckStorage';
import { getUserSettings } from '../utils/settings';
import { soundFX } from '../utils/soundFX';

export interface DeckBuilderProps {
  userNickname: string;
  onBackToMenu: () => void;
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({ userNickname, onBackToMenu }) => {
  const settings = getUserSettings(userNickname);
  const isPt = settings.language === 'pt';

  // Complete Onda 1 Catalog (493 cards with classic fallback)
  const catalogCards = useMemo(() => getAllCatalogCards(), []);
  const [decks, setDecks] = useState<DeckModel[]>(() => getAllUserDecks(userNickname));

  // Initial selected deck is the currently active main deck
  const initialSelected = useMemo(() => {
    const all = getAllUserDecks(userNickname);
    return all.find((d) => d.isActive) || all[0];
  }, [userNickname]);

  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialSelected.id);
  const [editingName, setEditingName] = useState<string>(initialSelected.name);
  const [editingCards, setEditingCards] = useState<DeckCardEntry[]>(() =>
    initialSelected.cards.map((c) => ({ card: c.card, quantity: c.quantity }))
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Filters for Card Catalog
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<CardFilterType>('ALL');
  const [inspectedCard, setInspectedCard] = useState<CardData | null>(() => catalogCards[0] || null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) || decks[0],
    [decks, selectedDeckId]
  );

  const customDecksCount = useMemo(
    () => decks.filter((d) => !d.isPrebuilt).length,
    [decks]
  );

  // Catalog Category Statistics for Quick Filters
  const catalogStats = useMemo(() => {
    let monsters = 0;
    let spells = 0;
    let traps = 0;
    for (const card of catalogCards) {
      if (isMonsterType(card.type)) monsters += 1;
      else if (isSpellType(card.type)) spells += 1;
      else if (isTrapType(card.type)) traps += 1;
    }
    return {
      total: catalogCards.length,
      monsters,
      spells,
      traps,
    };
  }, [catalogCards]);

  // Select a deck from the left sidebar
  const handleSelectDeck = (deck: DeckModel) => {
    setSelectedDeckId(deck.id);
    setEditingName(deck.name);
    setEditingCards(deck.cards.map((c) => ({ card: c.card, quantity: c.quantity })));
    setHasUnsavedChanges(false);
  };

  // Set a deck as Active Main Deck (Principal ★)
  const handleSetMainDeck = (deckId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = setActiveMainDeck(userNickname, deckId);
    setDecks(updated);
    const target = updated.find((d) => d.id === deckId);
    soundFX.playPlaceCard();
    showToast(
      isPt
        ? `★ "${target?.name}" definido como seu Deck Principal de Duelo!`
        : `★ "${target?.name}" set as your Active Main Deck!`
    );
  };

  // Create a new custom deck (up to 3 custom decks)
  const handleCreateNewDeck = (cloneCurrent = false) => {
    if (customDecksCount >= DeckService.MAX_USER_DECKS) {
      showToast(
        isPt
          ? `⚠️ Limite atingido: máximo de ${DeckService.MAX_USER_DECKS} decks personalizados!`
          : `⚠️ Limit reached: maximum of ${DeckService.MAX_USER_DECKS} custom decks!`
      );
      return;
    }

    try {
      const baseName = cloneCurrent
        ? `${editingName} (Cópia)`
        : isPt
        ? `Meu Deck #${customDecksCount + 1}`
        : `My Deck #${customDecksCount + 1}`;

      const initialCards = cloneCurrent
        ? editingCards.map((c) => ({ card: c.card, quantity: c.quantity }))
        : [];

      const { decks: updatedDecks, createdDeck } = createNewCustomDeck(
        userNickname,
        baseName,
        initialCards
      );

      setDecks(updatedDecks);
      setSelectedDeckId(createdDeck.id);
      setEditingName(createdDeck.name);
      setEditingCards(createdDeck.cards.map((c) => ({ card: c.card, quantity: c.quantity })));
      setHasUnsavedChanges(false);
      soundFX.playPlaceCard();
      showToast(
        isPt
          ? `✨ Novo deck "${createdDeck.name}" criado e definido como Principal!`
          : `✨ New deck "${createdDeck.name}" created and set as Main!`
      );
    } catch (err: any) {
      showToast(`❌ ${err.message || 'Erro ao criar deck'}`);
    }
  };

  // Delete a custom deck
  const handleDeleteCustomDeck = (deck: DeckModel, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deck.isPrebuilt) return;
    const updated = deleteCustomDeck(userNickname, deck.id);
    setDecks(updated);
    if (selectedDeckId === deck.id) {
      const fallback = updated.find((d) => d.isActive) || updated[0];
      handleSelectDeck(fallback);
    }
    showToast(
      isPt
        ? `🗑️ Deck "${deck.name}" removido.`
        : `🗑️ Deck "${deck.name}" deleted.`
    );
  };

  // Total cards & breakdown in current editing deck
  const deckStats = useMemo(() => {
    let total = 0;
    let monsters = 0;
    let spells = 0;
    let traps = 0;
    for (const entry of editingCards) {
      total += entry.quantity;
      if (isMonsterType(entry.card.type)) monsters += entry.quantity;
      else if (isSpellType(entry.card.type)) spells += entry.quantity;
      else if (isTrapType(entry.card.type)) traps += entry.quantity;
    }
    return { total, monsters, spells, traps };
  }, [editingCards]);

  // Fast Map lookup for current quantity of a card in editingCards
  const cardQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of editingCards) {
      map.set(entry.card.id, entry.quantity);
    }
    return map;
  }, [editingCards]);

  const getCardQuantityInDeck = useCallback(
    (cardId: string): number => {
      return cardQuantityMap.get(cardId) || 0;
    },
    [cardQuantityMap]
  );

  // Add 1 copy of a card to the editing deck
  const handleAddCardToDeck = useCallback(
    (card: CardData) => {
      setInspectedCard(card);

      if (selectedDeck.isPrebuilt) {
        showToast(
          isPt
            ? 'ℹ️ Decks Clássicos são fixos. Clique em "+ Novo Deck" para montar ou clonar seu próprio deck!'
            : 'ℹ️ Classic Decks are locked. Click "+ New Deck" to build or clone your own custom deck!'
        );
        return;
      }

      if (deckStats.total >= 60) {
        showToast(
          isPt
            ? '⚠️ O deck já atingiu o limite máximo de 60 cartas!'
            : '⚠️ Deck has reached the maximum limit of 60 cards!'
        );
        return;
      }

      const currentQty = getCardQuantityInDeck(card.id);
      if (currentQty >= DeckService.MAX_COPIES_PER_CARD) {
        showToast(
          isPt
            ? `⚠️ Limite de ${DeckService.MAX_COPIES_PER_CARD} cópias por carta atingido para "${card.namePt || card.name}"!`
            : `⚠️ Maximum of ${DeckService.MAX_COPIES_PER_CARD} copies reached for "${card.name}"!`
        );
        return;
      }

      soundFX.playPlaceCard();
      setEditingCards((prev) => {
        const exists = prev.find((e) => e.card.id === card.id);
        if (exists) {
          return prev.map((e) =>
            e.card.id === card.id ? { ...e, quantity: e.quantity + 1 } : e
          );
        }
        return [...prev, { card, quantity: 1 }];
      });
      setHasUnsavedChanges(true);
    },
    [selectedDeck.isPrebuilt, deckStats.total, getCardQuantityInDeck, isPt, showToast]
  );

  // Remove 1 copy of a card from the editing deck
  const handleRemoveCardFromDeck = useCallback(
    (card: CardData, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setInspectedCard(card);

      if (selectedDeck.isPrebuilt) {
        showToast(
          isPt
            ? 'ℹ️ Decks Clássicos são fixos. Crie um Novo Deck personalizado para editar cartas!'
            : 'ℹ️ Classic Decks are locked. Create a New Custom Deck to edit cards!'
        );
        return;
      }

      const currentQty = getCardQuantityInDeck(card.id);
      if (currentQty <= 0) return;

      soundFX.playPlaceCard();
      setEditingCards((prev) =>
        prev
          .map((entry) =>
            entry.card.id === card.id
              ? { ...entry, quantity: entry.quantity - 1 }
              : entry
          )
          .filter((entry) => entry.quantity > 0)
      );
      setHasUnsavedChanges(true);
    },
    [selectedDeck.isPrebuilt, getCardQuantityInDeck, isPt, showToast]
  );

  // Save current deck
  const handleSaveDeck = () => {
    if (selectedDeck.isPrebuilt) {
      // Offer quick clone if user clicks Save on a prebuilt deck
      handleCreateNewDeck(true);
      return;
    }

    try {
      const updatedModel: DeckModel = {
        ...selectedDeck,
        name: editingName.trim() || 'Deck Personalizado',
        cards: editingCards,
      };
      const updatedList = updateCustomDeck(userNickname, updatedModel);
      setDecks(updatedList);
      setHasUnsavedChanges(false);
      soundFX.playPlaceCard();
      showToast(
        isPt
          ? `💾 Deck "${updatedModel.name}" (${deckStats.total} cartas) salvo com sucesso!`
          : `💾 Deck "${updatedModel.name}" (${deckStats.total} cards) saved successfully!`
      );
    } catch (err: any) {
      showToast(`❌ ${err.message || 'Erro ao salvar deck'}`);
    }
  };

  // Instant Filtered catalog cards with memoization
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalogCards.filter((card) => {
      if (filterType === 'MONSTER' && !isMonsterType(card.type)) return false;
      if (filterType === 'SPELL' && !isSpellType(card.type)) return false;
      if (filterType === 'TRAP' && !isTrapType(card.type)) return false;

      if (!q) return true;
      const nameEn = card.name.toLowerCase();
      const namePt = (card.namePt || '').toLowerCase();
      const descEn = (card.description || '').toLowerCase();
      const descPt = (card.descriptionPt || '').toLowerCase();
      const race = (card.race || '').toLowerCase();
      const attr = (card.attribute || '').toLowerCase();
      return (
        nameEn.includes(q) ||
        namePt.includes(q) ||
        descEn.includes(q) ||
        descPt.includes(q) ||
        race.includes(q) ||
        attr.includes(q)
      );
    });
  }, [catalogCards, searchQuery, filterType]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07050d] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1b1035] via-[#090614] to-[#030206] text-slate-100 select-none font-sans relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className="bg-[#180e2d]/95 border-2 border-amber-400 text-amber-200 px-6 py-2.5 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.85)] backdrop-blur-md font-serif font-bold text-xs sm:text-sm tracking-wide flex items-center gap-2">
            <span className="text-amber-400">𓂀</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          LADO ESQUERDO: LISTA DE DECKS + INSPETOR LATERAL AMPLIADO (GRIMOIRE)
         ===================================================================== */}
      <aside className="w-80 lg:w-96 bg-[#0d0918]/95 border-r-2 border-[#382654] flex flex-col justify-between p-4 shadow-[5px_0_30px_rgba(0,0,0,0.85)] z-20 shrink-0 overflow-y-auto">
        <div className="space-y-3.5">
          {/* Header e Botão Voltar ao Menu */}
          <div className="flex items-center justify-between pb-3 border-b border-purple-900/50">
            <div className="flex items-center gap-2">
              <span className="text-2xl text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]">
                🎴
              </span>
              <div>
                <h1 className="text-sm sm:text-base font-black font-serif tracking-wider text-amber-300 uppercase">
                  {isPt ? 'Construtor de Decks' : 'Deck Builder'}
                </h1>
                <p className="text-[10px] font-mono text-purple-300/75">
                  {isPt ? `Duelista: ${userNickname}` : `Duelist: ${userNickname}`}
                </p>
              </div>
            </div>

            <button
              onClick={onBackToMenu}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 hover:border-amber-400 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
              title={isPt ? 'Voltar ao Menu Principal' : 'Back to Main Menu'}
            >
              <span>⬅</span>
              <span>{isPt ? 'Voltar ao Menu' : 'Menu'}</span>
            </button>
          </div>

          {/* Botões de Ação: Novo Deck e Clonar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-purple-300/80 px-1">
              <span>{isPt ? 'SEUS DECKS' : 'YOUR DECKS'}</span>
              <span className="text-amber-300 font-bold">
                {isPt
                  ? `Personalizados: ${customDecksCount}/${DeckService.MAX_USER_DECKS}`
                  : `Custom: ${customDecksCount}/${DeckService.MAX_USER_DECKS}`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleCreateNewDeck(false)}
                disabled={customDecksCount >= DeckService.MAX_USER_DECKS}
                className={`py-2 px-3 rounded-xl font-serif font-black text-xs uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all ${
                  customDecksCount >= DeckService.MAX_USER_DECKS
                    ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 border-yellow-200 shadow-[0_0_15px_rgba(245,158,11,0.4)] cursor-pointer'
                }`}
              >
                <span>➕</span>
                <span>{isPt ? 'Novo Deck' : 'New Deck'}</span>
              </button>

              <button
                onClick={() => handleCreateNewDeck(true)}
                disabled={customDecksCount >= DeckService.MAX_USER_DECKS}
                className={`py-2 px-3 rounded-xl font-serif font-bold text-xs border flex items-center justify-center gap-1 transition-all ${
                  customDecksCount >= DeckService.MAX_USER_DECKS
                    ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-purple-950/80 hover:bg-purple-900/80 text-purple-200 border-purple-500/50 cursor-pointer'
                }`}
                title={
                  isPt
                    ? 'Clonar o deck selecionado para um novo slot editável'
                    : 'Clone selected deck into a new editable slot'
                }
              >
                <span>📋</span>
                <span>{isPt ? 'Clonar Atual' : 'Clone Deck'}</span>
              </button>
            </div>
          </div>

          {/* Lista Compacta de Decks (Pré-montados e Personalizados) */}
          <div className="space-y-2 max-h-[22vh] overflow-y-auto pr-1">
            {decks.map((deck) => {
              const isSelected = deck.id === selectedDeckId;
              const cardCount = deck.cards.reduce((acc, c) => acc + c.quantity, 0);

              return (
                <div
                  key={deck.id}
                  onClick={() => handleSelectDeck(deck)}
                  className={`p-2.5 rounded-xl border-2 transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-950/60 via-purple-950/60 to-slate-900 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                      : 'bg-slate-950/80 border-slate-800/90 hover:border-purple-600/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[8.5px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                            deck.isPrebuilt
                              ? 'bg-purple-900/80 text-purple-200 border border-purple-600/40'
                              : 'bg-emerald-900/80 text-emerald-200 border border-emerald-600/40'
                          }`}
                        >
                          {deck.isPrebuilt
                            ? isPt
                              ? 'Clássico'
                              : 'Prebuilt'
                            : isPt
                            ? 'Personalizado'
                            : 'Custom'}
                        </span>
                        <span className="text-[9.5px] font-mono text-slate-400">
                          {cardCount}/60 {isPt ? 'cartas' : 'cards'}
                        </span>
                      </div>

                      <h3 className="text-xs font-black font-serif text-amber-200 truncate mt-1">
                        {deck.name}
                      </h3>
                    </div>

                    {/* Botão Excluir para Decks Personalizados */}
                    {!deck.isPrebuilt && (
                      <button
                        onClick={(e) => handleDeleteCustomDeck(deck, e)}
                        className="text-xs text-rose-400 hover:text-rose-200 p-1 rounded hover:bg-rose-950/60 transition-colors cursor-pointer"
                        title={isPt ? 'Excluir Deck Personalizado' : 'Delete Custom Deck'}
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {/* Ação Inferior do Card de Deck: Definir como Principal ★ */}
                  <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={(e) => handleSetMainDeck(deck.id, e)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        deck.isActive
                          ? 'bg-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.7)] font-black'
                          : 'bg-slate-900 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      <span>★</span>
                      <span>
                        {deck.isActive
                          ? isPt
                            ? 'Principal ★'
                            : 'Main ★'
                          : isPt
                          ? 'Definir Principal ★'
                          : 'Set Main ★'}
                      </span>
                    </button>

                    {isSelected && (
                      <span className="text-[9px] font-mono text-amber-300 font-bold">
                        {isPt ? 'Em edição ➔' : 'Editing ➔'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* =====================================================================
            INSPETOR LATERAL AMPLIADO: ARTE EM DESTAQUE E ATRIBUTOS COMPLETOS
           ===================================================================== */}
        {inspectedCard && (
          <div className="mt-3 pt-3 border-t border-purple-900/60 bg-gradient-to-b from-[#150d28]/95 to-black/90 rounded-2xl p-3.5 border border-purple-700/50 shadow-2xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1">
                <span>👁️</span> {isPt ? 'Inspeção de Carta' : 'Card Inspector'}
              </span>
              {inspectedCard.attribute && (
                <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-400 text-amber-300 font-mono font-bold text-[9px]">
                  {inspectedCard.attribute}
                </span>
              )}
            </div>

            {/* Arte Ampliada com Moldura Dourada */}
            <div className="relative group mx-auto">
              <img
                src={inspectedCard.imageUrl}
                alt={inspectedCard.name}
                loading="lazy"
                decoding="async"
                className="w-32 sm:w-40 aspect-[2/2.8] object-cover rounded-xl border-2 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.35)] transition-transform group-hover:scale-[1.02]"
              />
              {/* Badge com quantidade no deck em edição */}
              <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-black/90 border border-amber-400 text-amber-300 font-mono font-black text-[9px]">
                {getCardQuantityInDeck(inspectedCard.id)}/3
              </div>
            </div>

            {/* Nome da Carta & Tipo / Raça */}
            <div className="text-center">
              <h4 className="text-xs sm:text-sm font-black font-serif text-amber-200 leading-snug">
                {isPt ? inspectedCard.namePt || inspectedCard.name : inspectedCard.name}
              </h4>
              {inspectedCard.namePt && inspectedCard.namePt !== inspectedCard.name && (
                <p className="text-[10px] text-purple-300/70 font-serif italic">
                  {inspectedCard.name}
                </p>
              )}
              <div className="flex items-center justify-center gap-1.5 mt-1 text-[10px] font-mono text-purple-300">
                <span>{inspectedCard.type}</span>
                {inspectedCard.race && <span>• {inspectedCard.race}</span>}
              </div>
              {/* Estrelas de Nível para Monstros */}
              {inspectedCard.level !== undefined && inspectedCard.level > 0 && (
                <div className="flex items-center justify-center gap-0.5 mt-1 text-amber-400 text-[11px]" title={`Nível ${inspectedCard.level}`}>
                  {'★'.repeat(inspectedCard.level)}
                  <span className="text-[10px] font-mono text-slate-400 ml-1">
                    (Nv. {inspectedCard.level})
                  </span>
                </div>
              )}
            </div>

            {/* Caixa de ATK / DEF em Destaque (Apenas para Monstros) */}
            {isMonsterType(inspectedCard.type) && inspectedCard.attack !== undefined && (
              <div className="bg-black/60 rounded-xl p-1.5 border border-amber-400/40 grid grid-cols-2 gap-2 text-center">
                <div className="border-r border-purple-800/60">
                  <span className="text-[9px] font-mono text-slate-400 uppercase block">ATK</span>
                  <span className="text-xs sm:text-sm font-black font-mono text-amber-300">
                    {inspectedCard.attack}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-mono text-slate-400 uppercase block">DEF</span>
                  <span className="text-xs sm:text-sm font-black font-mono text-sky-300">
                    {inspectedCard.defense ?? 0}
                  </span>
                </div>
              </div>
            )}

            {/* Destaque para Cartas Mágicas */}
            {isSpellType(inspectedCard.type) && (
              <div className="bg-emerald-950/40 rounded-xl p-1.5 border border-emerald-500/50 flex items-center justify-center gap-2 text-center">
                <span className="text-xs">✨</span>
                <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider">
                  {isPt ? 'Carta Mágica' : 'Spell Card'}
                  {inspectedCard.race ? ` • ${inspectedCard.race}` : ''}
                </span>
              </div>
            )}

            {/* Destaque para Cartas Armadilhas */}
            {isTrapType(inspectedCard.type) && (
              <div className="bg-fuchsia-950/40 rounded-xl p-1.5 border border-fuchsia-500/50 flex items-center justify-center gap-2 text-center">
                <span className="text-xs">🪤</span>
                <span className="text-xs font-mono font-bold text-fuchsia-300 uppercase tracking-wider">
                  {isPt ? 'Carta Armadilha' : 'Trap Card'}
                  {inspectedCard.race ? ` • ${inspectedCard.race}` : ''}
                </span>
              </div>
            )}

            {/* Descrição / Efeito da Carta com Rolagem Suave */}
            <div className="bg-black/40 rounded-xl p-2 border border-purple-900/40 max-h-24 overflow-y-auto">
              <p className="text-[10px] sm:text-[10.5px] text-slate-300 leading-relaxed font-sans">
                {isPt
                  ? inspectedCard.descriptionPt || inspectedCard.description
                  : inspectedCard.description}
              </p>
            </div>

            {/* Ação Rápida no Inspetor: Adicionar ao Deck */}
            {!selectedDeck.isPrebuilt && (
              <button
                onClick={() => handleAddCardToDeck(inspectedCard)}
                disabled={getCardQuantityInDeck(inspectedCard.id) >= DeckService.MAX_COPIES_PER_CARD || deckStats.total >= 60}
                className={`py-1.5 rounded-xl font-serif font-black text-xs uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  getCardQuantityInDeck(inspectedCard.id) >= DeckService.MAX_COPIES_PER_CARD || deckStats.total >= 60
                    ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                }`}
              >
                <span>➕</span>
                <span>
                  {getCardQuantityInDeck(inspectedCard.id) >= DeckService.MAX_COPIES_PER_CARD
                    ? isPt ? 'Limite 3/3 Atingido' : 'Max 3/3 Reached'
                    : isPt ? 'Adicionar ao Deck (+1)' : 'Add to Deck (+1)'}
                </span>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* =====================================================================
          ÁREA CENTRAL / DIREITA: TOPO (DECK EM EDIÇÃO) + INFERIOR (CATÁLOGO)
         ===================================================================== */}
      <section className="flex-1 flex flex-col h-full overflow-hidden p-3 sm:p-5 gap-3.5">
        {/* -------------------------------------------------------------------
            CENTRO SUPERIOR: DECK EM EDIÇÃO (INPUT DE NOME, CONTAGEM E SALVAR)
           ------------------------------------------------------------------- */}
        <div className="bg-[#110b22]/90 border-2 border-[#3c285c] rounded-2xl p-3.5 shadow-xl flex flex-col gap-2.5 shrink-0 max-h-[38vh]">
          {/* Barra Superior do Deck em Edição */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-purple-900/50">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="flex flex-col flex-1 max-w-md">
                <label className="text-[9.5px] font-mono uppercase tracking-wider text-purple-300/80 mb-0.5">
                  {selectedDeck.isPrebuilt
                    ? isPt
                      ? 'Deck Clássico (Somente Leitura - Clique em Clonar para Editar)'
                      : 'Classic Deck (Read-Only - Click Clone to Edit)'
                    : isPt
                    ? 'Nome / Apelido do Deck em Edição'
                    : 'Editing Deck Nickname'}
                </label>
                <input
                  type="text"
                  value={editingName}
                  disabled={selectedDeck.isPrebuilt}
                  onChange={(e) => {
                    setEditingName(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder={isPt ? 'Digite o apelido do seu deck...' : 'Enter deck name...'}
                  className={`px-3 py-1.5 rounded-lg font-serif font-bold text-xs sm:text-sm border focus:outline-none transition-all ${
                    selectedDeck.isPrebuilt
                      ? 'bg-slate-900/60 border-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-950 border-amber-500/60 focus:border-amber-300 text-amber-200 shadow-inner'
                  }`}
                />
              </div>

              {/* Contagem de Cartas (ex: 40/60) e Subtotais */}
              <div className="flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-xl border border-purple-800/50">
                <div className="text-center pr-2 border-r border-purple-800/50">
                  <div className="text-[8.5px] font-mono uppercase text-purple-300">
                    {isPt ? 'Cartas' : 'Cards'}
                  </div>
                  <div
                    className={`text-sm sm:text-base font-black font-mono ${
                      deckStats.total >= 40 && deckStats.total <= 60
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {deckStats.total}/60
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono">
                  <span className="text-amber-300" title="Monstros">
                    👾 {deckStats.monsters}
                  </span>
                  <span className="text-emerald-300" title="Mágicas">
                    ✨ {deckStats.spells}
                  </span>
                  <span className="text-pink-300" title="Armadilhas">
                    🪤 {deckStats.traps}
                  </span>
                </div>
              </div>
            </div>

            {/* Botões de Salvar Deck e Definir Principal */}
            <div className="flex items-center gap-2">
              {!selectedDeck.isActive && (
                <button
                  onClick={() => handleSetMainDeck(selectedDeck.id)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-amber-500/20 text-amber-300 border border-amber-400/50 text-xs font-serif font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>★</span>
                  <span>{isPt ? 'Tornar Principal' : 'Set Main'}</span>
                </button>
              )}

              <button
                onClick={handleSaveDeck}
                className={`px-4 py-2 rounded-xl font-serif font-black text-xs uppercase tracking-wider border flex items-center gap-2 transition-all cursor-pointer ${
                  selectedDeck.isPrebuilt
                    ? 'bg-purple-900 hover:bg-purple-800 text-amber-200 border-purple-400'
                    : hasUnsavedChanges
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 border-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.6)] animate-pulse'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 border-yellow-200 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                }`}
              >
                <span>💾</span>
                <span>
                  {selectedDeck.isPrebuilt
                    ? isPt
                      ? 'Salvar como Novo Deck'
                      : 'Save as New Deck'
                    : isPt
                    ? 'Salvar Deck'
                    : 'Save Deck'}
                </span>
              </button>
            </div>
          </div>

          {/* Grade de Cartas dentro do Deck em Edição */}
          <div className="flex-1 overflow-y-auto pr-1 scroll-smooth">
            {editingCards.length === 0 ? (
              <div className="h-24 flex flex-col items-center justify-center text-slate-400 border border-dashed border-purple-800/50 rounded-xl bg-black/30">
                <p className="text-xs font-serif">
                  {isPt
                    ? 'Este deck está vazio. Clique nas cartas do Catálogo abaixo para adicioná-las!'
                    : 'This deck is empty. Click cards in the Catalog below to add them!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
                {editingCards.map(({ card, quantity }) => (
                  <div
                    key={card.id}
                    onClick={() => handleRemoveCardFromDeck(card)}
                    onMouseEnter={() => setInspectedCard(card)}
                    className="group relative rounded-lg overflow-hidden border border-amber-500/40 hover:border-rose-400 bg-slate-950 transition-all cursor-pointer shadow hover:scale-105"
                    title={
                      isPt
                        ? `${card.namePt || card.name} (Clique para remover 1 cópia)`
                        : `${card.name} (Click to remove 1 copy)`
                    }
                  >
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full aspect-[2/2.8] object-cover"
                    />
                    {/* Badge de Quantidade (x1, x2, x3) */}
                    <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/85 border border-amber-400 text-amber-300 font-mono font-black text-[9px]">
                      x{quantity}
                    </div>
                    {/* Overlay de Remover no Hover */}
                    {!selectedDeck.isPrebuilt && (
                      <div className="absolute inset-0 bg-rose-950/75 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-xs font-black text-white bg-rose-600 px-2 py-0.5 rounded-full">
                          -1
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* -------------------------------------------------------------------
            CENTRO / INFERIOR: CATÁLOGO DE CARTAS (PESQUISA + FILTROS + GRID)
           ------------------------------------------------------------------- */}
        <div className="flex-1 bg-[#110b22]/90 border-2 border-[#3c285c] rounded-2xl p-3.5 shadow-xl flex flex-col gap-3 overflow-hidden">
          {/* Barra Superior: Título, Quantidade de Cartas Disponíveis, Busca e Filtros */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-purple-900/50">
            {/* Lado Esquerdo: Título e Badge de Cartas Disponíveis no Catálogo */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xl">📚</span>
                <h2 className="text-sm sm:text-base font-black font-serif text-amber-300 uppercase tracking-wider">
                  {isPt ? 'Catálogo de Cartas' : 'Card Catalog'}
                </h2>
              </div>

              {/* Badge de Destaque da Onda 1 (200+ cartas disponíveis) */}
              <div className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-950 to-indigo-950 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.25)] flex items-center gap-1.5">
                <span className="text-[10px] text-amber-300 animate-pulse">✨</span>
                <span className="text-[11px] font-mono font-black text-amber-200">
                  {isPt
                    ? `Catálogo: ${catalogCards.length > 200 ? '200+ cartas disponíveis' : `${catalogCards.length} cartas disponíveis`} (${filteredCatalog.length} exibidas)`
                    : `Catalog: ${catalogCards.length > 200 ? '200+ cards available' : `${catalogCards.length} cards available`} (${filteredCatalog.length} shown)`}
                </span>
              </div>
            </div>

            {/* Centro / Direita: Input de Pesquisa Instantânea */}
            <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[200px]">
              <div className="relative w-full">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isPt
                      ? '🔍 Pesquisar por nome, tipo, atributo ou efeito...'
                      : '🔍 Search by name, type, attribute or effect...'
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-purple-700/60 focus:border-amber-400 text-xs text-slate-100 focus:outline-none shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Botões de Filtro Rápido com Contadores Dinâmicos */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'ALL', labelPt: 'Todas', labelEn: 'All', icon: '🃏', count: catalogStats.total },
                  { id: 'MONSTER', labelPt: 'Monstros', labelEn: 'Monsters', icon: '👾', count: catalogStats.monsters },
                  { id: 'SPELL', labelPt: 'Magia', labelEn: 'Spells', icon: '✨', count: catalogStats.spells },
                  { id: 'TRAP', labelPt: 'Armadilhas', labelEn: 'Traps', icon: '🪤', count: catalogStats.traps },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-serif font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    filterType === tab.id
                      ? 'bg-amber-400 text-slate-950 border-yellow-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] font-black scale-[1.02]'
                      : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{isPt ? tab.labelPt : tab.labelEn}</span>
                  <span
                    className={`text-[9.5px] font-mono px-1 rounded ${
                      filterType === tab.id
                        ? 'bg-black/30 text-slate-950 font-bold'
                        : 'bg-purple-950/80 text-purple-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Grade Responsiva de Cartas Otimizada para Alta Performance (Lazy Loading + Content Visibility) */}
          <div className="flex-1 overflow-y-auto pr-1 scroll-smooth">
            {filteredCatalog.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-slate-400 border border-dashed border-purple-800/50 rounded-xl bg-black/20 gap-2">
                <span className="text-3xl">🔍</span>
                <p className="text-xs font-serif">
                  {isPt
                    ? 'Nenhuma carta encontrada com o filtro e busca atuais.'
                    : 'No cards found matching your search and filter criteria.'}
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterType('ALL');
                  }}
                  className="px-3 py-1 bg-purple-900/70 hover:bg-purple-800 text-amber-300 rounded-lg text-xs font-serif border border-purple-600/50 cursor-pointer"
                >
                  {isPt ? 'Limpar Filtros' : 'Clear Filters'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                {filteredCatalog.map((card) => {
                  const qtyInDeck = getCardQuantityInDeck(card.id);
                  const isMaxed = qtyInDeck >= DeckService.MAX_COPIES_PER_CARD;
                  const displayName = isPt ? card.namePt || card.name : card.name;
                  const isInspected = inspectedCard?.id === card.id;

                  return (
                    <div
                      key={card.id}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '140px 220px' }}
                      onMouseEnter={() => setInspectedCard(card)}
                      onClick={() => handleAddCardToDeck(card)}
                      className={`group rounded-xl overflow-hidden bg-slate-950/90 border-2 flex flex-col justify-between transition-all cursor-pointer hover:-translate-y-0.5 shadow-md ${
                        isInspected
                          ? 'border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.5)] ring-1 ring-amber-300'
                          : qtyInDeck > 0
                          ? 'border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                          : 'border-slate-800 hover:border-purple-500/70'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={card.imageUrl}
                          alt={displayName}
                          loading="lazy"
                          decoding="async"
                          className="w-full aspect-[2/2.8] object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />

                        {/* Badge de Cópias no Deck (0/3 a 3/3) */}
                        <div
                          className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full font-mono font-black text-[10px] border shadow-md ${
                            isMaxed
                              ? 'bg-amber-400 text-slate-950 border-yellow-200'
                              : qtyInDeck > 0
                              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-400'
                              : 'bg-black/80 text-slate-300 border-slate-600'
                          }`}
                        >
                          {qtyInDeck}/{DeckService.MAX_COPIES_PER_CARD}
                        </div>

                        {/* Tag de Atributo ou Tipo sutil no canto superior esquerdo */}
                        {card.attribute && (
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 border border-purple-800/80 text-amber-300 font-mono text-[8px] font-bold">
                            {card.attribute}
                          </div>
                        )}
                      </div>

                      {/* Rodapé da Carta no Catálogo com Informações e Botões Rápidos (- / +) */}
                      <div className="p-2 flex flex-col gap-1 bg-gradient-to-b from-slate-900 to-slate-950 border-t border-purple-950">
                        <div className="text-[11px] font-serif font-bold text-amber-100 truncate" title={displayName}>
                          {displayName}
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span className="truncate pr-1">
                            {isMonsterType(card.type) && card.attack !== undefined
                              ? `${card.attack}/${card.defense ?? 0}`
                              : isSpellType(card.type)
                              ? isPt
                                ? 'Magia'
                                : 'Spell'
                              : isPt
                              ? 'Armadilha'
                              : 'Trap'}
                          </span>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleRemoveCardFromDeck(card, e)}
                              disabled={qtyInDeck === 0 || selectedDeck.isPrebuilt}
                              className={`w-5 h-5 rounded flex items-center justify-center font-bold text-xs border transition-colors ${
                                qtyInDeck === 0 || selectedDeck.isPrebuilt
                                  ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                                  : 'bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white border-rose-500/50 cursor-pointer'
                              }`}
                              title={isPt ? 'Remover 1 cópia' : 'Remove 1 copy'}
                            >
                              -
                            </button>
                            <button
                              onClick={() => handleAddCardToDeck(card)}
                              disabled={isMaxed || selectedDeck.isPrebuilt}
                              className={`w-5 h-5 rounded flex items-center justify-center font-bold text-xs border transition-colors ${
                                isMaxed || selectedDeck.isPrebuilt
                                  ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                                  : 'bg-emerald-950/80 hover:bg-emerald-500 text-emerald-200 hover:text-slate-950 border-emerald-500/50 cursor-pointer'
                              }`}
                              title={isPt ? 'Adicionar 1 cópia' : 'Add 1 copy'}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
