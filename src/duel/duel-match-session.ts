import {
  BattlePosition,
  DuelRuleEngine,
  MonsterCard,
} from './duel-rule-engine.js';
import {
  CardData,
  CardInstance,
  DuelPhase,
  MatchTurnState,
  PlayerDuelState,
  PositionChangeResult,
} from './duel-types.js';
import { ACTION_HANDLERS } from './effects/action-handlers.js';

export class DuelMatchSession {
  public matchState: MatchTurnState;
  public player1: PlayerDuelState;
  public player2: PlayerDuelState;
  private instanceCounter = 0;

  constructor(
    p1Name: string,
    p1DeckData: CardData[],
    p2Name: string,
    p2DeckData: CardData[]
  ) {
    this.player1 = this.initializePlayer('player_1', p1Name, p1DeckData);
    this.player2 = this.initializePlayer('player_2', p2Name, p2DeckData);

    this.matchState = {
      matchId: `match_${Date.now()}`,
      currentTurn: 1,
      activePlayerId: this.player1.id,
      phase: 'MAIN1', // Iniciado diretamente em MAIN1 após a compra inicial para corrigir o bug de invocação
      isGameOver: false,
      winnerPlayerId: null,
      winReason: null,
      log: ['O Duelo começou! Ambos os jogadores iniciam com 8000 Pontos de Vida (LP).'],
    };

    // Compra das 5 cartas iniciais
    this.drawInitialHands();
    this.log(`--- Turno 1: Fase Principal 1 de ${this.player1.nickname} ---`);
  }

  private initializePlayer(
    id: string,
    nickname: string,
    deckData: CardData[]
  ): PlayerDuelState {
    const deck: CardInstance[] = this.shuffle(
      deckData.map((data) => ({
        uid: `${id}_card_${++this.instanceCounter}`,
        data,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
        isFaceDown: false,
        turnSet: 0,
      }))
    );

    return {
      id,
      nickname,
      lifePoints: 8000,
      deck,
      hand: [],
      monsterZones: [null, null, null, null, null],
      spellTrapZones: [null, null, null, null, null],
      graveyard: [],
      hasNormalSummonedThisTurn: false,
    };
  }

  private getRandomInt(maxExclusive: number): number {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    // Multiple full entropy passes (simulating authentic competitive riffle and wash shuffles)
    for (let pass = 0; pass < 3; pass++) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.getRandomInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    return arr;
  }

  private drawInitialHands(): void {
    for (let i = 0; i < 5; i++) {
      this.drawCard(this.player1, false);
      this.drawCard(this.player2, false);
    }
  }

  public getActivePlayer(): PlayerDuelState {
    return this.matchState.activePlayerId === this.player1.id
      ? this.player1
      : this.player2;
  }

  public getOpponentPlayer(): PlayerDuelState {
    return this.matchState.activePlayerId === this.player1.id
      ? this.player2
      : this.player1;
  }

  public drawCard(player: PlayerDuelState, logDraw = true): boolean {
    if (player.deck.length === 0) {
      this.declareGameOver(
        player.id === this.player1.id ? this.player2.id : this.player1.id,
        `${player.nickname} ficou sem cartas no Deck (Deck Out)!`
      );
      return false;
    }
    const card = player.deck.pop()!;
    player.hand.push(card);
    if (logDraw) {
      this.log(`${player.nickname} comprou uma carta.`);
    }
    return true;
  }

  public nextPhase(): DuelPhase {
    if (this.matchState.isGameOver) return this.matchState.phase;

    switch (this.matchState.phase) {
      case 'DRAW':
      case 'STANDBY':
        this.matchState.phase = 'MAIN1';
        this.log(`--- Turno ${this.matchState.currentTurn}: Fase Principal 1 de ${this.getActivePlayer().nickname} ---`);
        break;
      case 'MAIN1':
        this.matchState.phase = 'BATTLE';
        this.log(`⚔️ ${this.getActivePlayer().nickname} entrou na Fase de Batalha!`);
        break;
      case 'BATTLE':
        this.matchState.phase = 'MAIN2';
        this.log(`🛡️ ${this.getActivePlayer().nickname} entrou na Fase Principal 2.`);
        break;
      case 'MAIN2':
      case 'END':
        this.endTurn();
        break;
    }
    return this.matchState.phase;
  }

  public normalSummon(
    cardUid: string,
    targetZoneIndex: number,
    position: BattlePosition = 'ATTACK',
    tributeZoneIndices: number[] = [],
    isFaceDown: boolean = false
  ): boolean {
    if (this.matchState.isGameOver) return false;
    if (this.matchState.phase !== 'MAIN1' && this.matchState.phase !== 'MAIN2') {
      this.log('Você só pode invocar monstros durante a Fase Principal.');
      return false;
    }

    const player = this.getActivePlayer();
    if (player.hasNormalSummonedThisTurn) {
      this.log('Você já realizou uma Invocação Normal neste turno.');
      return false;
    }

    const handIndex = player.hand.findIndex((c) => c.uid === cardUid);
    if (handIndex === -1) return false;
    const card = player.hand[handIndex];
    if (!card || !card.data) return false;

    const typeLower = (card.data.type || '').toLowerCase();
    const isSpellOrTrap = typeLower.includes('spell') || typeLower.includes('mágica') || typeLower.includes('trap') || typeLower.includes('armadilha');
    if (isSpellOrTrap) {
      this.log('Apenas Cartas de Monstro podem ser invocadas.');
      return false;
    }

    if (targetZoneIndex < 0 || targetZoneIndex > 4) {
      this.log('Zona de monstro inválida.');
      return false;
    }

    const requiredTributes = DuelRuleEngine.getRequiredTributes(card.data.level);
    if (tributeZoneIndices.length !== requiredTributes) {
      this.log(`Monstros Nível ${card.data.level} exigem exatamente ${requiredTributes} sacrifício(s).`);
      return false;
    }

    // Valida se o targetZoneIndex está livre OU se é uma das zonas que serão liberadas pelo sacrifício
    const isTargetZoneFreedByTribute = tributeZoneIndices.includes(targetZoneIndex);
    if (player.monsterZones[targetZoneIndex] !== null && !isTargetZoneFreedByTribute) {
      this.log('Zona de monstro já ocupada.');
      return false;
    }

    // Valida duplicatas de índices de tributo
    const uniqueTributes = new Set(tributeZoneIndices);
    if (uniqueTributes.size !== tributeZoneIndices.length) {
      this.log('Não é permitido selecionar o mesmo monstro mais de uma vez para sacrifício.');
      return false;
    }

    // Processa os sacrifícios
    for (const zoneIdx of tributeZoneIndices) {
      const tributeMonster = player.monsterZones[zoneIdx];
      if (!tributeMonster) {
        this.log('Monstro de sacrifício inválido selecionado.');
        return false;
      }
      player.monsterZones[zoneIdx] = null;
      player.graveyard.push(tributeMonster);
      const name = tributeMonster.data.namePt || tributeMonster.data.name;
      this.log(`🔥 ${player.nickname} sacrificou ${name} para o Cemitério.`);
    }

    // Posiciona o monstro
    player.hand.splice(handIndex, 1);
    card.position = position;
    card.isFaceDown = isFaceDown;
    card.turnSummoned = this.matchState.currentTurn;
    card.turnSet = isFaceDown ? this.matchState.currentTurn : undefined;
    card.hasAttacked = false;
    card.hasChangedPositionThisTurn = false;
    card.hasUsedEffectThisTurn = false;
    player.monsterZones[targetZoneIndex] = card;
    player.hasNormalSummonedThisTurn = true;

    const cardName = card.data.namePt || card.data.name;
    const posName = position === 'ATTACK' ? 'Posição de Ataque' : 'Posição de Defesa';
    if (isFaceDown) {
      this.log(`🎴 ${player.nickname} baixou um monstro de cabeça para baixo!`);
    } else {
      this.log(`🌟 ${player.nickname} invocou ${cardName} em ${posName}!`);
    }
    return true;
  }

  /**
   * Activates a Spell card from hand or spell/trap zone.
   * Resolves the spell effect and sends the card to the GY.
   */
  public activateSpell(cardUid: string, zoneIndex?: number): boolean {
    if (this.matchState.isGameOver) return false;
    if (this.matchState.phase !== 'MAIN1' && this.matchState.phase !== 'MAIN2') {
      this.log('Cartas Mágicas só podem ser ativadas durante a Fase Principal.');
      return false;
    }

    const player = this.getActivePlayer();
    const opponent = this.getOpponentPlayer();

    // Check in hand first
    const handIndex = player.hand.findIndex((c) => c.uid === cardUid);
    let cardInstance: CardInstance | null = null;
    let fromZoneIndex: number | null = null;

    if (handIndex !== -1) {
      cardInstance = player.hand[handIndex];
    } else {
      // Check in spell/trap zones
      const stZoneIndex = player.spellTrapZones.findIndex((c) => c?.uid === cardUid);
      if (stZoneIndex !== -1) {
        cardInstance = player.spellTrapZones[stZoneIndex];
        fromZoneIndex = stZoneIndex;
      }
    }

    if (!cardInstance) {
      this.log('Carta Mágica não encontrada na mão ou campo.');
      return false;
    }

    // Validação de cartas mágicas baixadas no campo (spellTrapZones):
    // Cartas baixadas só podem ser ativadas em turnos posteriores (turnSet < currentTurn)
    if (fromZoneIndex !== null && typeof cardInstance.turnSet === 'number') {
      if (cardInstance.turnSet >= this.matchState.currentTurn) {
        this.log('⏳ Cartas Mágicas baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.');
        return false;
      }
    }

    const cardType = cardInstance.data.type.toLowerCase();
    if (!cardType.includes('spell') && !cardType.includes('mágica')) {
      this.log('Apenas Cartas Mágicas podem ser ativadas diretamente.');
      return false;
    }

    const effectDef = cardInstance.data.effectDefinition;
    const action = effectDef?.action;

    // Remove card from hand or zone
    if (handIndex !== -1) {
      player.hand.splice(handIndex, 1);
    } else if (fromZoneIndex !== null) {
      player.spellTrapZones[fromZoneIndex] = null;
    }

    // Execute spell effect
    if (action === 'DRAW_CARDS') {
      ACTION_HANDLERS.DRAW_CARDS({
        cardInstance,
        player,
        opponent,
        logFn: (msg) => this.log(msg),
      });
    } else if (action === 'DESTROY_ALL_MONSTERS') {
      ACTION_HANDLERS.DESTROY_ALL_MONSTERS({
        cardInstance,
        player,
        opponent,
        logFn: (msg) => this.log(msg),
      });
    } else if (action === 'DESTROY_LOWEST_ATK_MONSTER') {
      ACTION_HANDLERS.DESTROY_LOWEST_ATK_MONSTER(
        {
          cardInstance,
          player,
          opponent,
          logFn: (msg) => this.log(msg),
        },
        (c, own, opp) => this.getEffectiveAttack(c, own, opp)
      );
    } else {
      const cardName = cardInstance.data.namePt || cardInstance.data.name;
      this.log(`✨ ${player.nickname} ativou a Carta Mágica ${cardName}!`);
    }

    // Standard Normal Spell: goes to graveyard upon resolution
    player.graveyard.push(cardInstance);
    return true;
  }

  /**
   * Sets a Spell or Trap card face-down in a spell/trap zone.
   */
  public setSpellTrap(cardUid: string, zoneIndex: number): boolean {
    if (this.matchState.isGameOver) return false;
    if (this.matchState.phase !== 'MAIN1' && this.matchState.phase !== 'MAIN2') {
      this.log('Você só pode baixar cartas durante a Fase Principal.');
      return false;
    }

    if (zoneIndex < 0 || zoneIndex > 4) {
      this.log('Zona de Magia/Armadilha inválida.');
      return false;
    }

    const player = this.getActivePlayer();
    if (player.spellTrapZones[zoneIndex] !== null) {
      this.log('A Zona de Magia/Armadilha já está ocupada.');
      return false;
    }

    const handIndex = player.hand.findIndex((c) => c.uid === cardUid);
    if (handIndex === -1) {
      this.log('Carta não encontrada na mão.');
      return false;
    }

    const card = player.hand.splice(handIndex, 1)[0];
    card.isFaceDown = true;
    card.turnSet = this.matchState.currentTurn;
    player.spellTrapZones[zoneIndex] = card;

    const cardType = card.data.type.toLowerCase();
    const typeLabel = cardType.includes('trap') || cardType.includes('armadilha') ? 'Armadilha' : 'Mágica';
    this.log(`🎴 ${player.nickname} baixou uma Carta ${typeLabel} virada para baixo.`);
    return true;
  }

  /**
   * Checks whether the defender has a set Trap Hole ready to trigger against a summoned monster:
   * - Must have Trap Hole set face-down in spell/trap zone with turnSet < currentTurn.
   * - Target monster must have effective ATK >= 1000.
   */
  public canActivateTrapHole(
    targetMonster: CardInstance,
    defenderPlayerId: string
  ): { canActivate: boolean; trapZoneIndex: number } {
    const defender = this.player1.id === defenderPlayerId ? this.player1 : this.player2;
    const attacker = this.player1.id === defenderPlayerId ? this.player2 : this.player1;

    // Check effective attack of target monster >= 1000
    const effectiveAtk = this.getEffectiveAttack(targetMonster, attacker, defender);
    if (effectiveAtk < 1000) {
      return { canActivate: false, trapZoneIndex: -1 };
    }

    // Look for face-down Trap Hole set before the current turn
    const trapZoneIndex = defender.spellTrapZones.findIndex((card) => {
      if (!card || !card.isFaceDown) return false;
      if (typeof card.turnSet !== 'number' || card.turnSet >= this.matchState.currentTurn) return false;

      const isTrapHoleCard =
        card.data.id === '04206964' ||
        card.data.id === '4206964' ||
        card.data.name.toLowerCase().includes('trap hole') ||
        card.data.effectDefinition?.action === 'TRAP_TRIGGER_ON_SUMMON' ||
        card.data.effectDefinition?.action === 'DESTROY_SUMMONED_MONSTER';

      return isTrapHoleCard;
    });

    if (trapZoneIndex === -1) {
      return { canActivate: false, trapZoneIndex: -1 };
    }

    return { canActivate: true, trapZoneIndex };
  }

  /**
   * Activates Trap Hole in response to a summoned monster:
   * Sends the Trap Hole to the defender's GY, destroys the summoned monster sending it to the GY,
   * and records everything in the duel log.
   */
  public activateTrapHole(
    defenderPlayerId: string,
    trapZoneIndex: number,
    summonedMonsterZoneIndex: number
  ): boolean {
    if (this.matchState.isGameOver) return false;

    const defender = this.player1.id === defenderPlayerId ? this.player1 : this.player2;
    const attacker = this.player1.id === defenderPlayerId ? this.player2 : this.player1;

    if (trapZoneIndex < 0 || trapZoneIndex > 4) {
      this.log('Zona de Armadilha inválida.');
      return false;
    }

    if (summonedMonsterZoneIndex < 0 || summonedMonsterZoneIndex > 4) {
      this.log('Zona de monstro invocado inválida.');
      return false;
    }

    const trapCard = defender.spellTrapZones[trapZoneIndex];
    if (!trapCard) {
      this.log('Nenhuma carta na Zona de Armadilha selecionada.');
      return false;
    }

    const summonedMonster = attacker.monsterZones[summonedMonsterZoneIndex];
    if (!summonedMonster) {
      this.log('Nenhum monstro na zona indicada para ser destruído por Trap Hole.');
      return false;
    }

    const { canActivate } = this.canActivateTrapHole(summonedMonster, defenderPlayerId);
    if (!canActivate) {
      this.log('Condições para ativação de Trap Hole não atendidas.');
      return false;
    }

    // Send Trap Hole to defender's graveyard
    defender.spellTrapZones[trapZoneIndex] = null;
    trapCard.isFaceDown = false;
    defender.graveyard.push(trapCard);

    // Destroy the summoned monster and send to attacker's graveyard
    attacker.monsterZones[summonedMonsterZoneIndex] = null;
    attacker.graveyard.push(summonedMonster);

    const trapName = trapCard.data.namePt || trapCard.data.name;
    const monsterName = summonedMonster.data.namePt || summonedMonster.data.name;

    this.log(`🪤 ARMADILHA ATIVADA! ${defender.nickname} ativou ${trapName}! O monstro recém-invocado ${monsterName} caiu no buraco e foi destruído!`);
    return true;
  }

  /**
   * Activates a set Trap card from the spell/trap zone in response to a game action.
   * Enforces rules:
   * - Cannot be activated on the same turn it was set.
   * - Must be face-down in spell/trap zone.
   * - For Trap Hole (DESTROY_SUMMONED_MONSTER):
   *     - Target monster must be controlled by the opponent.
   *     - Target monster must have been summoned this turn.
   *     - Target monster must have effective ATK >= 1000.
   * Sends the trap card to the graveyard upon successful activation.
   */
  public activateTrap(trapCardUid: string, targetMonsterUid?: string): boolean {
    if (this.matchState.isGameOver) return false;

    // Find the trap card across both players' spell/trap zones
    let trapOwner: PlayerDuelState | null = null;
    let trapZoneIndex = -1;

    for (const player of [this.player1, this.player2]) {
      const idx = player.spellTrapZones.findIndex((c) => c?.uid === trapCardUid);
      if (idx !== -1) {
        trapOwner = player;
        trapZoneIndex = idx;
        break;
      }
    }

    if (!trapOwner || trapZoneIndex === -1) {
      this.log('Carta Armadilha não encontrada nas zonas de Magia/Armadilha.');
      return false;
    }

    const trapCard = trapOwner.spellTrapZones[trapZoneIndex]!;
    const opponent = trapOwner.id === this.player1.id ? this.player2 : this.player1;

    // Trap cards must be face-down when activated from spell/trap zone
    if (!trapCard.isFaceDown) {
      this.log('A Carta Armadilha já está ativada ou revelada.');
      return false;
    }

    // Traps cannot be activated in the same turn they were set
    if (trapCard.turnSet === this.matchState.currentTurn) {
      this.log('⏳ Cartas Armadilha não podem ser ativadas no mesmo turno em que foram baixadas.');
      return false;
    }

    const action = trapCard.data.effectDefinition?.action;

    // Trap Hole reaction validation (supports TRAP_TRIGGER_ON_SUMMON and DESTROY_SUMMONED_MONSTER)
    if (
      action === 'TRAP_TRIGGER_ON_SUMMON' ||
      action === 'DESTROY_SUMMONED_MONSTER' ||
      trapCard.data.id === '04206964' ||
      trapCard.data.name.toLowerCase().includes('trap hole')
    ) {
      if (!targetMonsterUid) {
        this.log('Nenhum monstro alvo foi especificado para a Carta Armadilha.');
        return false;
      }

      const targetMonster = opponent.monsterZones.find((m) => m?.uid === targetMonsterUid);
      if (!targetMonster) {
        this.log('O monstro alvo não se encontra no campo do oponente.');
        return false;
      }

      // Check if summoned this turn
      if (targetMonster.turnSummoned !== this.matchState.currentTurn) {
        this.log('Trap Hole só pode ser ativada em resposta a um monstro invocado neste turno.');
        return false;
      }

      // Calculate effective ATK: must be >= 1000 (or minAtk defined on effect)
      const minAtk = trapCard.data.effectDefinition?.minAtk ?? 1000;
      const effectiveAtk = this.getEffectiveAttack(targetMonster, opponent, trapOwner);
      if (effectiveAtk < minAtk) {
        this.log(`⚠️ Trap Hole não pode ser ativada contra ${targetMonster.data.namePt || targetMonster.data.name} pois seu ATK (${effectiveAtk}) é inferior a ${minAtk}!`);
        return false;
      }

      // Execute trap effect
      const result = ACTION_HANDLERS.DESTROY_SUMMONED_MONSTER({
        cardInstance: trapCard,
        player: trapOwner,
        opponent,
        targetUids: [targetMonsterUid],
        logFn: (msg) => this.log(msg),
      });

      if (!result.destroyed) {
        return false;
      }
    } else {
      const cardName = trapCard.data.namePt || trapCard.data.name;
      this.log(`🪤 ${trapOwner.nickname} ativou a Carta Armadilha ${cardName}!`);
    }

    // Send trap to owner's graveyard
    trapOwner.spellTrapZones[trapZoneIndex] = null;
    trapCard.isFaceDown = false;
    trapOwner.graveyard.push(trapCard);

    return true;
  }

  public changeMonsterPosition(
    zoneIndex: number,
    selectedTargetUids?: string[]
  ): PositionChangeResult {
    if (this.matchState.isGameOver) {
      return { success: false, flipped: false };
    }
    if (this.matchState.phase !== 'MAIN1' && this.matchState.phase !== 'MAIN2') {
      this.log('A posição de batalha só pode ser alterada durante a Fase Principal (antes ou depois da Batalha).');
      return { success: false, flipped: false };
    }

    const player = this.getActivePlayer();
    const opponent = this.getOpponentPlayer();
    const monster = player.monsterZones[zoneIndex];
    if (!monster) {
      this.log('Nenhum monstro na zona para alterar posição.');
      return { success: false, flipped: false };
    }

    if (monster.hasAttacked) {
      this.log('Um monstro que já atacou não pode mudar de posição neste turno.');
      return { success: false, flipped: false };
    }

    // Trava de Flip: se monster.isFaceDown && monster.turnSet === currentTurn, impede
    if (monster.isFaceDown && monster.turnSet === this.matchState.currentTurn) {
      this.log('⏳ Um monstro baixado para baixo só pode ser virado de face para cima a partir do próximo turno.');
      return { success: false, flipped: false };
    }

    // Se estiver virado para baixo, ao mudar de posição é revelado (Flip Summon)
    if (monster.isFaceDown) {
      monster.isFaceDown = false;
      monster.position = 'ATTACK';
      monster.hasChangedPositionThisTurn = true;
      const cardName = monster.data.namePt || monster.data.name;
      this.log(`✨ INVOCAÇÃO POR VIRAR (FLIP)! ${player.nickname} revelou ${cardName} em Posição de Ataque!`);

      let flipEffect: PositionChangeResult['flipEffect'];

      // Dispara efeito FLIP caso possua
      if (monster.data.effectType === 'FLIP') {
        const action = monster.data.effectDefinition?.action;

        if (action === 'DESTROY_MONSTER') {
          const res = ACTION_HANDLERS.DESTROY_MONSTER(
            {
              cardInstance: monster,
              player,
              opponent,
              targetUids: selectedTargetUids,
              logFn: (msg) => this.log(msg),
            },
            (c, own, opp) => this.getEffectiveAttack(c, own, opp)
          );

          flipEffect = {
            cardName,
            action: 'DESTROY_MONSTER',
            targetCardUid: res.destroyedCardUids[0],
            targetName: res.destroyedNames[0],
            targetCardUids: res.destroyedCardUids,
            targetNames: res.destroyedNames,
          };
        } else if (action === 'RETURN_TO_HAND') {
          const res = ACTION_HANDLERS.RETURN_TO_HAND(
            {
              cardInstance: monster,
              player,
              opponent,
              targetUids: selectedTargetUids,
              logFn: (msg) => this.log(msg),
            },
            (c, own, opp) => this.getEffectiveAttack(c, own, opp)
          );

          flipEffect = {
            cardName,
            action: 'RETURN_TO_HAND',
            targetCardUid: res.returnedCardUids[0],
            targetName: res.returnedNames.join(', '),
            targetCardUids: res.returnedCardUids,
            targetNames: res.returnedNames,
          };
        }
      }
      return { success: true, flipped: true, flipEffect };
    }

    monster.position = monster.position === 'ATTACK' ? 'DEFENSE' : 'ATTACK';
    monster.hasChangedPositionThisTurn = true;

    const cardName = monster.data.namePt || monster.data.name;
    const newPosName = monster.position === 'ATTACK' ? 'Posição de Ataque (Vertical)' : 'Posição de Defesa (Horizontal)';
    this.log(`🔄 ${player.nickname} alterou ${cardName} para ${newPosName}.`);
    return { success: true, flipped: false };
  }

  /**
   * Calculates the dynamic effective ATK of a monster on the field,
   * applying continuous effects (e.g. Buster Blader gaining +500 ATK per Dragon).
   */
  public getEffectiveAttack(
    cardInstance: CardInstance,
    owner: PlayerDuelState,
    opponent: PlayerDuelState
  ): number {
    let effectiveAtk = cardInstance.data.attack;

    // Efeito CONTINUOUS delegado aos ACTION_HANDLERS (ex: BOOST_ATK)
    if (
      cardInstance.data.effectType === 'CONTINUOUS' ||
      cardInstance.data.effectDefinition?.action === 'BOOST_ATK' ||
      cardInstance.data.id === '78193831' ||
      cardInstance.data.name.toLowerCase().includes('buster blader')
    ) {
      const res = ACTION_HANDLERS.BOOST_ATK({
        cardInstance,
        player: owner,
        opponent,
      });
      effectiveAtk += res.bonus;
    }

    return effectiveAtk;
  }

  /**
   * Checks if the specified player has Kuriboh (or PREVENT_DAMAGE hand trigger) in their hand.
   */
  public canActivateKuriboh(playerId: string): boolean {
    const player = this.player1.id === playerId ? this.player1 : this.player2;
    return player.hand.some(
      (c) =>
        (c.data.effectType === 'HAND_TRIGGER' && c.data.effectDefinition?.action === 'PREVENT_DAMAGE') ||
        c.data.id === '40640057' ||
        c.data.name.toLowerCase().includes('kuriboh')
    );
  }

  /**
   * Discards Kuriboh from the player's hand to the GY and returns true (annulling pending battle damage), with duel log.
   */
  public activateKuriboh(playerId: string): boolean {
    if (this.matchState.isGameOver) return false;

    const player = this.player1.id === playerId ? this.player1 : this.player2;
    const kuribohCard = player.hand.find(
      (c) =>
        (c.data.effectType === 'HAND_TRIGGER' && c.data.effectDefinition?.action === 'PREVENT_DAMAGE') ||
        c.data.id === '40640057' ||
        c.data.name.toLowerCase().includes('kuriboh')
    );

    if (!kuribohCard) {
      this.log(`${player.nickname} não possui Kuriboh na mão para ativar.`);
      return false;
    }

    const res = ACTION_HANDLERS.PREVENT_DAMAGE({
      cardInstance: kuribohCard,
      player,
      opponent: this.getOpponentPlayer(),
      logFn: (msg) => this.log(msg),
    });

    return res.prevented;
  }

  /**
   * Activates Time Wizard ignition effect:
   * 50/50 Coin toss with high entropy (crypto.getRandomValues).
   * HEADS: Destroys all opponent monsters, sending them to GY.
   * TAILS: Destroys all user monsters and burns user LP equal to half total destroyed ATK.
   */
  public activateTimeWizard(
    zoneIndex: number
  ): {
    success: boolean;
    outcome: 'HEADS' | 'TAILS';
    destroyedUids: string[];
    burnDamage: number;
  } {
    const failureResult = {
      success: false,
      outcome: 'TAILS' as const,
      destroyedUids: [],
      burnDamage: 0,
    };

    if (this.matchState.isGameOver) {
      return failureResult;
    }

    if (this.matchState.phase !== 'MAIN1' && this.matchState.phase !== 'MAIN2') {
      this.log('O efeito de Time Wizard só pode ser ativado durante a Fase Principal.');
      return failureResult;
    }

    if (zoneIndex < 0 || zoneIndex > 4) {
      this.log('Zona de monstro inválida.');
      return failureResult;
    }

    const player = this.getActivePlayer();
    const opponent = this.getOpponentPlayer();

    const timeWizardCard = player.monsterZones[zoneIndex];
    if (!timeWizardCard) {
      this.log('Nenhum monstro na zona para ativar o efeito.');
      return failureResult;
    }

    const isTimeWizard =
      (timeWizardCard.data.effectType === 'IGNITION' &&
        timeWizardCard.data.effectDefinition?.action === 'COIN_TOSS_CLEAR') ||
      timeWizardCard.data.id === '71625222' ||
      timeWizardCard.data.name.toLowerCase().includes('time wizard');

    if (!isTimeWizard) {
      this.log('O monstro selecionado não é o Time Wizard.');
      return failureResult;
    }

    if (timeWizardCard.hasUsedEffectThisTurn) {
      this.log('Time Wizard só pode usar seu efeito uma vez por turno.');
      return failureResult;
    }

    // Mark effect as used for this turn
    timeWizardCard.hasUsedEffectThisTurn = true;

    const res = ACTION_HANDLERS.COIN_TOSS_CLEAR({
      cardInstance: timeWizardCard,
      player,
      opponent,
      randomIntFn: (max) => this.getRandomInt(max),
      logFn: (msg) => this.log(msg),
    });

    if (player.lifePoints <= 0) {
      this.declareGameOver(opponent.id, `Os Pontos de Vida de ${player.nickname} chegaram a 0 pela explosão de Time Wizard!`);
    }

    return {
      success: res.success,
      outcome: res.outcome,
      destroyedUids: res.destroyedUids,
      burnDamage: res.burnDamage,
    };
  }

  public declareAttack(
    attackerZoneIndex: number,
    targetZoneIndex: number | null,
    selectedDefenderTargetUids?: string[]
  ): boolean {
    if (this.matchState.isGameOver) return false;
    if (this.matchState.phase !== 'BATTLE') {
      this.log('Você só pode declarar ataques durante a Fase de Batalha.');
      return false;
    }

    const attackerPlayer = this.getActivePlayer();
    const defenderPlayer = this.getOpponentPlayer();

    const attackingCard = attackerPlayer.monsterZones[attackerZoneIndex];
    if (!attackingCard) {
      this.log('Nenhum monstro na zona atacante.');
      return false;
    }

    if (attackingCard.position !== 'ATTACK') {
      this.log('Monstros em Posição de Defesa não podem atacar.');
      return false;
    }

    if (attackingCard.turnSummoned === this.matchState.currentTurn) {
      this.log(`⚠️ ${attackingCard.data.namePt || attackingCard.data.name} foi invocado neste turno e só poderá atacar a partir do próximo turno!`);
      return false;
    }

    if (attackingCard.hasAttacked) {
      this.log(`${attackingCard.data.namePt || attackingCard.data.name} já atacou neste turno.`);
      return false;
    }

    const opponentMonsters = defenderPlayer.monsterZones.filter((m): m is CardInstance => m !== null);
    const attackerName = attackingCard.data.namePt || attackingCard.data.name;

    // Cálculo dinâmico do ATK do atacante
    const attackerEffectiveAtk = this.getEffectiveAttack(attackingCard, attackerPlayer, defenderPlayer);

    // Ataque direto
    if (targetZoneIndex === null) {
      if (opponentMonsters.length > 0) {
        this.log('Não é permitido atacar diretamente enquanto o oponente controlar monstros!');
        return false;
      }

      const damage = attackerEffectiveAtk;
      defenderPlayer.lifePoints = Math.max(0, defenderPlayer.lifePoints - damage);
      attackingCard.hasAttacked = true;
      attackingCard.hasAttackedDirectly = true;
      this.log(`⚔️ ATAQUE DIRETO! ${attackerName} atacou diretamente causando ${damage} de dano!`);

      if (defenderPlayer.lifePoints <= 0) {
        this.declareGameOver(attackerPlayer.id, `Os Pontos de Vida de ${defenderPlayer.nickname} chegaram a 0!`);
      }
      return true;
    }

    // Monstro vs Monstro
    const defendingCard = defenderPlayer.monsterZones[targetZoneIndex];
    if (!defendingCard) {
      this.log('O monstro alvo não existe.');
      return false;
    }

    const defenderName = defendingCard.data.namePt || defendingCard.data.name;
    const defenderEffectiveAtk = this.getEffectiveAttack(defendingCard, defenderPlayer, attackerPlayer);

    const wasFaceDown = Boolean(defendingCard.isFaceDown);
    if (defendingCard.isFaceDown) {
      defendingCard.isFaceDown = false;
      this.log(`👁️ O monstro virado para baixo do oponente foi revelado: ${defenderName}!`);
    }

    const defPosName = defendingCard.position === 'ATTACK' ? 'Ataque' : 'Defesa';
    this.log(`⚔️ BATALHA: ${attackerName} (ATK ${attackerEffectiveAtk}) atacou ${defenderName} em ${defPosName}!`);

    // 1. Resolução prioritária de Efeito FLIP antes do combate/dano
    // Dispara estritamente se a carta era virada para baixo (Face-Down) com efeito FLIP
    const triggersFlip = wasFaceDown && defendingCard.data.effectType === 'FLIP';
    let attackerRemovedByFlip = false;

    if (triggersFlip) {
      const action = defendingCard.data.effectDefinition?.action;

      if (action === 'DESTROY_MONSTER') {
        const targets = selectedDefenderTargetUids && selectedDefenderTargetUids.length > 0
          ? selectedDefenderTargetUids
          : [attackingCard.uid];

        ACTION_HANDLERS.DESTROY_MONSTER(
          {
            cardInstance: defendingCard,
            player: defenderPlayer,
            opponent: attackerPlayer,
            targetUids: targets,
            logFn: (msg) => this.log(msg),
          },
          (c, own, opp) => this.getEffectiveAttack(c, own, opp)
        );

        if (!attackerPlayer.monsterZones.some((m) => m?.uid === attackingCard.uid)) {
          attackerRemovedByFlip = true;
        }
      } else if (action === 'RETURN_TO_HAND') {
        const targets = selectedDefenderTargetUids && selectedDefenderTargetUids.length > 0
          ? selectedDefenderTargetUids
          : undefined;

        ACTION_HANDLERS.RETURN_TO_HAND(
          {
            cardInstance: defendingCard,
            player: defenderPlayer,
            opponent: attackerPlayer,
            targetUids: targets,
            logFn: (msg) => this.log(msg),
          },
          (c, own, opp) => this.getEffectiveAttack(c, own, opp)
        );

        if (!attackerPlayer.monsterZones.some((m) => m?.uid === attackingCard.uid)) {
          attackerRemovedByFlip = true;
        }
      }
    }

    // Se o efeito FLIP destruiu ou devolveu o monstro atacante para a mão:
    // INTERROMPE o ataque imediatamente: o defensor permanece vivo e não sofre dano de batalha
    if (attackerRemovedByFlip) {
      attackingCard.hasAttacked = true;
      return true;
    }

    // 2. Cálculo regular de batalha (apenas se o atacante ainda estiver no campo)
    const attackerDomain: MonsterCard = {
      id: attackingCard.uid,
      name: attackerName,
      level: attackingCard.data.level,
      attack: attackerEffectiveAtk,
      defense: defendingCard.data.defense,
      position: attackingCard.position,
    };

    const defenderDomain: MonsterCard = {
      id: defendingCard.uid,
      name: defenderName,
      level: defendingCard.data.level,
      attack: defenderEffectiveAtk,
      defense: defendingCard.data.defense,
      position: defendingCard.position,
    };

    const result = DuelRuleEngine.calculateBattle(attackerDomain, defenderDomain);

    if (result.attackerDestroyed) {
      attackerPlayer.monsterZones[attackerZoneIndex] = null;
      attackerPlayer.graveyard.push(attackingCard);
      this.log(`💥 ${attackerName} foi destruído e enviado ao Cemitério!`);
    }

    if (result.defenderDestroyed) {
      defenderPlayer.monsterZones[targetZoneIndex] = null;
      defenderPlayer.graveyard.push(defendingCard);
      attackingCard.monstersDestroyedCount = (attackingCard.monstersDestroyedCount || 0) + 1;
      this.log(`💥 ${defenderName} foi destruído e enviado ao Cemitério! (${attackerName} já destruiu ${attackingCard.monstersDestroyedCount} monstros)`);
    }

    if (result.attackerDamageTaken > 0) {
      attackerPlayer.lifePoints = Math.max(0, attackerPlayer.lifePoints - result.attackerDamageTaken);
      this.log(`🩸 ${attackerPlayer.nickname} recebeu ${result.attackerDamageTaken} de dano de batalha!`);
    }

    if (result.defenderDamageTaken > 0) {
      defenderPlayer.lifePoints = Math.max(0, defenderPlayer.lifePoints - result.defenderDamageTaken);
      this.log(`🩸 ${defenderPlayer.nickname} recebeu ${result.defenderDamageTaken} de dano de batalha!`);
    }

    attackingCard.hasAttacked = true;

    if (attackerPlayer.lifePoints <= 0) {
      this.declareGameOver(defenderPlayer.id, `Os Pontos de Vida de ${attackerPlayer.nickname} chegaram a 0!`);
    } else if (defenderPlayer.lifePoints <= 0) {
      this.declareGameOver(attackerPlayer.id, `Os Pontos de Vida de ${defenderPlayer.nickname} chegaram a 0!`);
    }

    return true;
  }

  public surrender(surrenderingPlayerId: string): void {
    const winnerId = surrenderingPlayerId === this.player1.id ? this.player2.id : this.player1.id;
    const loserName = surrenderingPlayerId === this.player1.id ? this.player1.nickname : this.player2.nickname;
    this.declareGameOver(winnerId, `${loserName} rendeu-se da partida.`);
  }

  public endTurn(): void {
    if (this.matchState.isGameOver) return;

    // Reset flags de turno
    const player = this.getActivePlayer();
    player.hasNormalSummonedThisTurn = false;
    player.monsterZones.forEach((m) => {
      if (m) {
        m.hasAttacked = false;
        m.hasChangedPositionThisTurn = false;
        m.hasUsedEffectThisTurn = false;
      }
    });

    // Alterna o jogador ativo
    const previousPlayer = this.getActivePlayer();
    this.matchState.activePlayerId =
      this.matchState.activePlayerId === this.player1.id
        ? this.player2.id
        : this.player1.id;

    this.matchState.currentTurn++;

    const newActivePlayer = this.getActivePlayer();
    this.log(`⏳ ${previousPlayer.nickname} passou o turno para ${newActivePlayer.nickname}.`);
    this.log(`\n=================== Turno ${this.matchState.currentTurn}: Turno de ${newActivePlayer.nickname} ===================`);

    // Compra de carta do turno
    this.drawCard(newActivePlayer);
    this.matchState.phase = 'MAIN1';
  }

  private declareGameOver(winnerId: string, reason: string): void {
    this.matchState.isGameOver = true;
    this.matchState.winnerPlayerId = winnerId;
    this.matchState.winReason = reason;
    const winnerName = winnerId === this.player1.id ? this.player1.nickname : this.player2.nickname;
    this.log(`🏆 VITÓRIA NO DUELO! ${winnerName} venceu! Motivo: ${reason}`);
  }

  private log(message: string): void {
    this.matchState.log.push(message);
  }
}
