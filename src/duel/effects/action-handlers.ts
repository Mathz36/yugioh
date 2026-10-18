import { CardInstance, PlayerDuelState } from '../duel-types.js';

export interface ActionExecutionContext {
  cardInstance: CardInstance;
  player: PlayerDuelState;
  opponent: PlayerDuelState;
  targetUids?: string[];
  randomIntFn?: (maxExclusive: number) => number;
  logFn?: (message: string) => void;
}

export interface BoostAtkResult {
  bonus: number;
}

export interface DestroyMonsterResult {
  destroyedCardUids: string[];
  destroyedNames: string[];
}

export interface ReturnToHandResult {
  returnedCardUids: string[];
  returnedNames: string[];
}

export interface PreventDamageResult {
  prevented: boolean;
  discardedCardUid?: string;
}

export interface CoinTossClearResult {
  success: boolean;
  outcome: 'HEADS' | 'TAILS';
  destroyedUids: string[];
  burnDamage: number;
}

export type ActionHandlerResult =
  | BoostAtkResult
  | DestroyMonsterResult
  | ReturnToHandResult
  | PreventDamageResult
  | CoinTossClearResult;

/**
 * Checks whether a monster card matches the given race condition (e.g. race === 'Dragon').
 * Prioritizes explicit `card.data.race` metadata and ignores Spell/Trap cards.
 */
function matchesRaceOrType(card: CardInstance, targetRace: string): boolean {
  const typeLower = (card.data.type || '').toLowerCase();
  if (
    typeLower.includes('spell') ||
    typeLower.includes('mágica') ||
    typeLower.includes('trap') ||
    typeLower.includes('armadilha')
  ) {
    return false;
  }

  const normRace = targetRace.toLowerCase();
  const race = (card.data.race || '').toLowerCase();
  if (race) {
    return race === normRace;
  }

  const name = (card.data.name || '').toLowerCase();
  return name.includes(normRace) || typeLower.includes(normRace);
}

/**
 * Action Handlers registry implementing modular decoupled card effects.
 */
export const ACTION_HANDLERS = {
  /**
   * BOOST_ATK: Calculates continuous dynamic attack boost based on condition (e.g. Dragon monsters in opponent field / GY).
   * Face-down monsters on the field do not reveal their race and are not counted.
   */
  BOOST_ATK(context: ActionExecutionContext): BoostAtkResult {
    const { cardInstance, opponent } = context;
    const effectDef = cardInstance.data.effectDefinition;

    const boostValue = typeof effectDef?.value === 'number' ? effectDef.value : 500;
    const condition = effectDef?.condition;

    // Check condition target race (e.g., 'Dragon' or condition.target_race)
    let targetRace = 'Dragon';
    if (typeof condition === 'object' && condition?.target_race) {
      targetRace = condition.target_race;
    } else if (typeof condition === 'string' && condition.includes('DRAGON')) {
      targetRace = 'Dragon';
    }

    const dragonsOnField = opponent.monsterZones.filter(
      (m): m is CardInstance => m !== null && !m.isFaceDown && matchesRaceOrType(m, targetRace)
    ).length;

    const dragonsInGY = opponent.graveyard.filter((m) => matchesRaceOrType(m, targetRace)).length;

    const totalDragons = dragonsOnField + dragonsInGY;
    return {
      bonus: totalDragons * boostValue,
    };
  },

  /**
   * DESTROY_MONSTER: Destroys target monster(s) and sends them to the GY.
   * If targetUids provided, targets them; otherwise picks the opponent's strongest monster.
   */
  DESTROY_MONSTER(
    context: ActionExecutionContext,
    effectiveAtkFn?: (card: CardInstance, owner: PlayerDuelState, opp: PlayerDuelState) => number
  ): DestroyMonsterResult {
    const { cardInstance, player, opponent, targetUids, logFn } = context;
    const cardName = cardInstance.data.namePt || cardInstance.data.name;

    const opponentMonsters = opponent.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

    if (opponentMonsters.length === 0) {
      logFn?.(`🪲 EFEITO FLIP ATIVADO! ${cardName} não encontrou monstros do oponente para destruir.`);
      return { destroyedCardUids: [], destroyedNames: [] };
    }

    let targetsToDestroy: { card: CardInstance; index: number }[] = [];

    if (targetUids && targetUids.length > 0) {
      const targetSet = new Set(targetUids);
      targetsToDestroy = opponentMonsters.filter((item) => targetSet.has(item.card.uid));
    }

    if (targetsToDestroy.length === 0) {
      // Pick the strongest monster by effective attack
      const getAtk = effectiveAtkFn || ((c: CardInstance) => c.data.attack);
      const strongest = [...opponentMonsters].sort(
        (a, b) => getAtk(b.card, opponent, player) - getAtk(a.card, opponent, player)
      )[0];
      targetsToDestroy = [strongest];
    }

    const destroyedCardUids: string[] = [];
    const destroyedNames: string[] = [];

    for (const target of targetsToDestroy) {
      opponent.monsterZones[target.index] = null;
      opponent.graveyard.push(target.card);
      const targetName = target.card.data.namePt || target.card.data.name;
      destroyedCardUids.push(target.card.uid);
      destroyedNames.push(targetName);
      logFn?.(`🪲 EFEITO FLIP ATIVADO! ${cardName} destruiu o monstro ${targetName} do oponente!`);
    }

    return { destroyedCardUids, destroyedNames };
  },

  /**
   * RETURN_TO_HAND: Smart multi-target bounce effect (e.g. Penguin Soldier).
   * - If eligible opponent monsters <= 2: returns all automatically.
   * - If eligible opponent monsters > 2: returns targets in targetUids (or top 2 highest ATK if Bot/unspecified).
   */
  RETURN_TO_HAND(
    context: ActionExecutionContext,
    effectiveAtkFn?: (card: CardInstance, owner: PlayerDuelState, opp: PlayerDuelState) => number
  ): ReturnToHandResult {
    const { cardInstance, player, opponent, targetUids, logFn } = context;
    const cardName = cardInstance.data.namePt || cardInstance.data.name;

    const opponentMonsters = opponent.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

    if (opponentMonsters.length === 0) {
      logFn?.(`🐧 EFEITO FLIP ATIVADO! ${cardName} não encontrou monstros do oponente para devolver.`);
      return { returnedCardUids: [], returnedNames: [] };
    }

    let targetsToReturn: { card: CardInstance; index: number }[] = [];

    if (opponentMonsters.length <= 2) {
      // <= 2: return all automatically
      targetsToReturn = [...opponentMonsters];
    } else {
      // > 2: check targetUids
      if (targetUids && targetUids.length > 0) {
        const targetSet = new Set(targetUids.slice(0, 2));
        targetsToReturn = opponentMonsters.filter((item) => targetSet.has(item.card.uid));
      }

      // If no valid targetUids or Bot action, automatically pick top 2 by effective ATK
      if (targetsToReturn.length === 0) {
        const getAtk = effectiveAtkFn || ((c: CardInstance) => c.data.attack);
        const sortedByAtk = [...opponentMonsters].sort(
          (a, b) => getAtk(b.card, opponent, player) - getAtk(a.card, opponent, player)
        );
        targetsToReturn = sortedByAtk.slice(0, 2);
      }
    }

    const returnedCardUids: string[] = [];
    const returnedNames: string[] = [];

    for (const target of targetsToReturn) {
      opponent.monsterZones[target.index] = null;
      opponent.hand.push(target.card);
      const targetName = target.card.data.namePt || target.card.data.name;
      returnedCardUids.push(target.card.uid);
      returnedNames.push(targetName);
      logFn?.(`🐧 EFEITO FLIP ATIVADO! ${cardName} devolveu ${targetName} para a mão de ${opponent.nickname}!`);
    }

    return { returnedCardUids, returnedNames };
  },

  /**
   * PREVENT_DAMAGE: Discards trigger card from hand to prevent incoming battle damage (e.g. Kuriboh).
   */
  PREVENT_DAMAGE(context: ActionExecutionContext): PreventDamageResult {
    const { cardInstance, player, logFn } = context;
    const handIndex = player.hand.findIndex((c) => c.uid === cardInstance.uid);

    if (handIndex === -1) {
      return { prevented: false };
    }

    const [discarded] = player.hand.splice(handIndex, 1);
    player.graveyard.push(discarded);

    const cardName = discarded.data.namePt || discarded.data.name;
    logFn?.(`🤎 EFEITO ATIVADO DA MÃO! ${player.nickname} descartou ${cardName} para o Cemitério! O dano de batalha foi anulado!`);

    return {
      prevented: true,
      discardedCardUid: discarded.uid,
    };
  },

  /**
   * COIN_TOSS_CLEAR: 50/50 Coin toss with clear / burn outcomes (e.g. Time Wizard).
   */
  COIN_TOSS_CLEAR(context: ActionExecutionContext): CoinTossClearResult {
    const { cardInstance, player, opponent, randomIntFn, logFn } = context;

    const coinRoll = randomIntFn ? randomIntFn(2) : Math.floor(Math.random() * 2);
    const outcome: 'HEADS' | 'TAILS' = coinRoll === 0 ? 'HEADS' : 'TAILS';
    const destroyedUids: string[] = [];
    let burnDamage = 0;

    const cardName = cardInstance.data.namePt || cardInstance.data.name;
    logFn?.(`⏰ EFEITO DE IGNIÇÃO! ${player.nickname} ativou o efeito de ${cardName}! Girando a moeda...`);

    if (outcome === 'HEADS') {
      logFn?.(`🪙 RESULTADO: CARA (HEADS)! A magia do tempo teve sucesso absoluto!`);
      for (let i = 0; i < opponent.monsterZones.length; i++) {
        const monster = opponent.monsterZones[i];
        if (monster) {
          destroyedUids.push(monster.uid);
          opponent.monsterZones[i] = null;
          opponent.graveyard.push(monster);
          const monName = monster.data.namePt || monster.data.name;
          logFn?.(`💥 Monstro do oponente ${monName} foi destruído pelo efeito do tempo!`);
        }
      }
    } else {
      logFn?.(`🪙 RESULTADO: COROA (TAILS)! O feitiço do tempo voltou-se contra você!`);
      let totalDestroyedAtk = 0;
      for (let i = 0; i < player.monsterZones.length; i++) {
        const monster = player.monsterZones[i];
        if (monster) {
          destroyedUids.push(monster.uid);
          totalDestroyedAtk += monster.data.attack;
          player.monsterZones[i] = null;
          player.graveyard.push(monster);
          const monName = monster.data.namePt || monster.data.name;
          logFn?.(`💥 Seu monstro ${monName} foi destruído pela explosão temporal!`);
        }
      }

      burnDamage = Math.floor(totalDestroyedAtk / 2);
      player.lifePoints = Math.max(0, player.lifePoints - burnDamage);
      logFn?.(`🩸 ${player.nickname} sofreu ${burnDamage} de dano de efeito (metade do ATK total destruído)!`);
    }

    return {
      success: true,
      outcome,
      destroyedUids,
      burnDamage,
    };
  },

  /**
   * DRAW_CARDS: Draws N cards from deck (e.g. Pot of Greed).
   */
  DRAW_CARDS(context: ActionExecutionContext): { cardsDrawn: number } {
    const { cardInstance, player, logFn } = context;
    const cardName = cardInstance.data.namePt || cardInstance.data.name;
    const count = cardInstance.data.effectDefinition?.value || 2;
    let drawn = 0;

    for (let i = 0; i < count; i++) {
      if (player.deck.length > 0) {
        const topCard = player.deck.pop()!;
        player.hand.push(topCard);
        drawn++;
      }
    }

    logFn?.(`🏺 EFEITO MÁGICO! ${player.nickname} ativou ${cardName} e comprou ${drawn} carta(s) do Deck!`);
    return { cardsDrawn: drawn };
  },

  /**
   * DESTROY_ALL_MONSTERS: Destroys all monsters on both sides of the field (e.g. Dark Hole).
   */
  DESTROY_ALL_MONSTERS(context: ActionExecutionContext): { destroyedCardUids: string[] } {
    const { cardInstance, player, opponent, logFn } = context;
    const cardName = cardInstance.data.namePt || cardInstance.data.name;
    const destroyedCardUids: string[] = [];

    // Player monsters
    for (let i = 0; i < player.monsterZones.length; i++) {
      const monster = player.monsterZones[i];
      if (monster) {
        destroyedCardUids.push(monster.uid);
        player.monsterZones[i] = null;
        player.graveyard.push(monster);
      }
    }

    // Opponent monsters
    for (let i = 0; i < opponent.monsterZones.length; i++) {
      const monster = opponent.monsterZones[i];
      if (monster) {
        destroyedCardUids.push(monster.uid);
        opponent.monsterZones[i] = null;
        opponent.graveyard.push(monster);
      }
    }

    logFn?.(`🕳️ EFEITO MÁGICO! ${player.nickname} ativou ${cardName}! Todos os monstros no campo foram destruídos!`);
    return { destroyedCardUids };
  },

  /**
   * DESTROY_LOWEST_ATK_MONSTER: Destroys the opponent's face-up monster with the lowest ATK (e.g. Fissure).
   */
  DESTROY_LOWEST_ATK_MONSTER(
    context: ActionExecutionContext,
    effectiveAtkFn?: (card: CardInstance, owner: PlayerDuelState, opp: PlayerDuelState) => number
  ): { destroyedCardUid?: string; destroyedName?: string } {
    const { cardInstance, player, opponent, logFn } = context;
    const cardName = cardInstance.data.namePt || cardInstance.data.name;

    // Face-up opponent monsters
    const faceUpMonsters = opponent.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter((item): item is { card: CardInstance; index: number } => item.card !== null && !item.card.isFaceDown);

    if (faceUpMonsters.length === 0) {
      logFn?.(`⚡ ${player.nickname} ativou ${cardName}, mas o oponente não controla monstros com a face para cima!`);
      return {};
    }

    const getAtk = effectiveAtkFn || ((c: CardInstance) => c.data.attack);
    const lowest = [...faceUpMonsters].sort(
      (a, b) => getAtk(a.card, opponent, player) - getAtk(b.card, opponent, player)
    )[0];

    opponent.monsterZones[lowest.index] = null;
    opponent.graveyard.push(lowest.card);
    const targetName = lowest.card.data.namePt || lowest.card.data.name;

    logFn?.(`⚡ EFEITO MÁGICO! ${cardName} abriu uma fenda no solo e destruiu ${targetName}!`);
    return {
      destroyedCardUid: lowest.card.uid,
      destroyedName: targetName,
    };
  },

  /**
   * DESTROY_SUMMONED_MONSTER / TRAP_TRIGGER_ON_SUMMON: Destroys a summoned monster (e.g. Trap Hole).
   */
  DESTROY_SUMMONED_MONSTER(context: ActionExecutionContext): { destroyed: boolean } {
    const { cardInstance, opponent, targetUids, logFn } = context;
    const cardName = cardInstance.data.namePt || cardInstance.data.name;

    if (!targetUids || targetUids.length === 0) {
      return { destroyed: false };
    }

    const targetUid = targetUids[0];
    const zoneIdx = opponent.monsterZones.findIndex((m) => m?.uid === targetUid);

    if (zoneIdx === -1) {
      return { destroyed: false };
    }

    const targetMonster = opponent.monsterZones[zoneIdx]!;
    opponent.monsterZones[zoneIdx] = null;
    opponent.graveyard.push(targetMonster);
    const targetName = targetMonster.data.namePt || targetMonster.data.name;

    logFn?.(`🪤 ARMADILHA ATIVADA! ${cardName} destruiu o monstro recém-invocado ${targetName}!`);
    return { destroyed: true };
  },

  TRAP_TRIGGER_ON_SUMMON(context: ActionExecutionContext): { destroyed: boolean } {
    return this.DESTROY_SUMMONED_MONSTER(context);
  },
};
