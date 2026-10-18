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
} from './duel-types.js';

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

  public changeMonsterPosition(zoneIndex: number): boolean {
    if (this.matchState.isGameOver) return false;
    if (this.matchState.phase !== 'MAIN1' && this.matchState.phase !== 'MAIN2') {
      this.log('A posição de batalha só pode ser alterada durante a Fase Principal (antes ou depois da Batalha).');
      return false;
    }

    const player = this.getActivePlayer();
    const opponent = this.getOpponentPlayer();
    const monster = player.monsterZones[zoneIndex];
    if (!monster) {
      this.log('Nenhum monstro na zona para alterar posição.');
      return false;
    }

    if (monster.hasAttacked) {
      this.log('Um monstro que já atacou não pode mudar de posição neste turno.');
      return false;
    }

    // Trava de Flip: se monster.isFaceDown && monster.turnSet === currentTurn, impede
    if (monster.isFaceDown && monster.turnSet === this.matchState.currentTurn) {
      this.log('⏳ Um monstro baixado para baixo só pode ser virado de face para cima a partir do próximo turno.');
      return false;
    }

    // Se estiver virado para baixo, ao mudar de posição é revelado (Flip Summon)
    if (monster.isFaceDown) {
      monster.isFaceDown = false;
      monster.position = 'ATTACK';
      monster.hasChangedPositionThisTurn = true;
      const cardName = monster.data.namePt || monster.data.name;
      this.log(`✨ INVOCAÇÃO POR VIRAR (FLIP)! ${player.nickname} revelou ${cardName} em Posição de Ataque!`);

      // Dispara efeito FLIP caso possua
      if (monster.data.effectType === 'FLIP') {
        const action = monster.data.effectDefinition?.action;

        if (action === 'DESTROY_MONSTER') {
          // Man-Eater Bug: Destrói 1 monstro do oponente
          const opponentMonsters = opponent.monsterZones
            .map((m, idx) => ({ card: m, index: idx }))
            .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

          if (opponentMonsters.length > 0) {
            const strongest = [...opponentMonsters].sort(
              (a, b) =>
                this.getEffectiveAttack(b.card, opponent, player) -
                this.getEffectiveAttack(a.card, opponent, player)
            )[0];

            opponent.monsterZones[strongest.index] = null;
            opponent.graveyard.push(strongest.card);
            const targetName = strongest.card.data.namePt || strongest.card.data.name;
            this.log(`🪲 EFEITO FLIP ATIVADO! ${cardName} destruiu o monstro ${targetName} do oponente!`);
          }
        } else if (action === 'RETURN_TO_HAND') {
          // Penguin Soldier: Devolve 1 monstro do oponente para a mão
          const opponentMonsters = opponent.monsterZones
            .map((m, idx) => ({ card: m, index: idx }))
            .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

          if (opponentMonsters.length > 0) {
            const strongest = [...opponentMonsters].sort(
              (a, b) =>
                this.getEffectiveAttack(b.card, opponent, player) -
                this.getEffectiveAttack(a.card, opponent, player)
            )[0];

            opponent.monsterZones[strongest.index] = null;
            opponent.hand.push(strongest.card);
            const targetName = strongest.card.data.namePt || strongest.card.data.name;
            this.log(`🐧 EFEITO FLIP ATIVADO! ${cardName} devolveu ${targetName} para a mão de ${opponent.nickname}!`);
          }
        }
      }
      return true;
    }

    monster.position = monster.position === 'ATTACK' ? 'DEFENSE' : 'ATTACK';
    monster.hasChangedPositionThisTurn = true;

    const cardName = monster.data.namePt || monster.data.name;
    const newPosName = monster.position === 'ATTACK' ? 'Posição de Ataque (Vertical)' : 'Posição de Defesa (Horizontal)';
    this.log(`🔄 ${player.nickname} alterou ${cardName} para ${newPosName}.`);
    return true;
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

    // Efeito CONTINUOUS do Buster Blader (ID 78193831): +500 ATK por monstro Dragão
    const isBusterBlader =
      cardInstance.data.id === '78193831' ||
      cardInstance.data.name.toLowerCase().includes('buster blader') ||
      (cardInstance.data.effectType === 'CONTINUOUS' &&
        cardInstance.data.effectDefinition?.action === 'BOOST_ATK');

    if (isBusterBlader) {
      const isDragon = (c: CardInstance) => {
        const race = (c.data as any).race?.toLowerCase() || '';
        const name = c.data.name.toLowerCase();
        const type = c.data.type.toLowerCase();
        return race === 'dragon' || name.includes('dragon') || type.includes('dragon');
      };

      const opponentDragonsOnField = opponent.monsterZones.filter(
        (m): m is CardInstance => m !== null && isDragon(m)
      ).length;

      const opponentDragonsInGY = opponent.graveyard.filter((m) => isDragon(m)).length;

      const totalOpponentDragons = opponentDragonsOnField + opponentDragonsInGY;
      if (totalOpponentDragons > 0) {
        const boostValue = cardInstance.data.effectDefinition?.value || 500;
        const totalBoost = totalOpponentDragons * boostValue;
        effectiveAtk += totalBoost;
      }
    }

    return effectiveAtk;
  }

  /**
   * Checks if the specified player has Kuriboh in their hand.
   */
  public canActivateKuriboh(playerId: string): boolean {
    const player = this.player1.id === playerId ? this.player1 : this.player2;
    return player.hand.some(
      (c) =>
        c.data.id === '40640057' ||
        c.data.name.toLowerCase().includes('kuriboh') ||
        (c.data.effectType === 'HAND_TRIGGER' && c.data.effectDefinition?.action === 'PREVENT_DAMAGE')
    );
  }

  /**
   * Discards Kuriboh from the player's hand to the GY and returns true (annulling pending battle damage), with duel log.
   */
  public activateKuriboh(playerId: string): boolean {
    if (this.matchState.isGameOver) return false;

    const player = this.player1.id === playerId ? this.player1 : this.player2;
    const kuribohIndex = player.hand.findIndex(
      (c) =>
        c.data.id === '40640057' ||
        c.data.name.toLowerCase().includes('kuriboh') ||
        (c.data.effectType === 'HAND_TRIGGER' && c.data.effectDefinition?.action === 'PREVENT_DAMAGE')
    );

    if (kuribohIndex === -1) {
      this.log(`${player.nickname} não possui Kuriboh na mão para ativar.`);
      return false;
    }

    const [kuribohCard] = player.hand.splice(kuribohIndex, 1);
    player.graveyard.push(kuribohCard);

    this.log(`🤎 EFEITO ATIVADO DA MÃO! ${player.nickname} descartou Kuriboh para o Cemitério! O dano de batalha foi anulado!`);
    return true;
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
      timeWizardCard.data.id === '71625222' ||
      timeWizardCard.data.name.toLowerCase().includes('time wizard') ||
      (timeWizardCard.data.effectType === 'IGNITION' &&
        timeWizardCard.data.effectDefinition?.action === 'COIN_TOSS_CLEAR');

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

    // Simulate high entropy 50/50 coin toss
    const coinRoll = this.getRandomInt(2); // 0 or 1
    const outcome: 'HEADS' | 'TAILS' = coinRoll === 0 ? 'HEADS' : 'TAILS';
    const destroyedUids: string[] = [];
    let burnDamage = 0;

    const wizardName = timeWizardCard.data.namePt || timeWizardCard.data.name;
    this.log(`⏰ EFEITO DE IGNIÇÃO! ${player.nickname} ativou a Roleta do Tempo de ${wizardName}! Girando a moeda...`);

    if (outcome === 'HEADS') {
      this.log(`🪙 RESULTADO: CARA (HEADS)! A magia do tempo teve sucesso absoluto!`);
      // Destrói todos os monstros do oponente
      for (let i = 0; i < opponent.monsterZones.length; i++) {
        const monster = opponent.monsterZones[i];
        if (monster) {
          destroyedUids.push(monster.uid);
          opponent.monsterZones[i] = null;
          opponent.graveyard.push(monster);
          const monName = monster.data.namePt || monster.data.name;
          this.log(`💥 Monstro do oponente ${monName} foi destruído pelo efeito do tempo!`);
        }
      }
    } else {
      this.log(`🪙 RESULTADO: COROA (TAILS)! O feitiço do tempo voltou-se contra você!`);
      // Destrói todos os monstros do próprio jogador e soma metade do ATK total
      let totalDestroyedAtk = 0;
      for (let i = 0; i < player.monsterZones.length; i++) {
        const monster = player.monsterZones[i];
        if (monster) {
          destroyedUids.push(monster.uid);
          totalDestroyedAtk += monster.data.attack;
          player.monsterZones[i] = null;
          player.graveyard.push(monster);
          const monName = monster.data.namePt || monster.data.name;
          this.log(`💥 Seu monstro ${monName} foi destruído pela explosão temporal!`);
        }
      }

      burnDamage = Math.floor(totalDestroyedAtk / 2);
      player.lifePoints = Math.max(0, player.lifePoints - burnDamage);
      this.log(`🩸 ${player.nickname} sofreu ${burnDamage} de dano de efeito (metade do ATK total destruído)!`);

      if (player.lifePoints <= 0) {
        this.declareGameOver(opponent.id, `Os Pontos de Vida de ${player.nickname} chegaram a 0 pela explosão de Time Wizard!`);
      }
    }

    return {
      success: true,
      outcome,
      destroyedUids,
      burnDamage,
    };
  }

  public declareAttack(attackerZoneIndex: number, targetZoneIndex: number | null): boolean {
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
    // Dispara se a carta era virada para baixo (Face-Down) OU se estava em Posição de Defesa com efeito FLIP
    const triggersFlip = (wasFaceDown || defendingCard.position === 'DEFENSE') && defendingCard.data.effectType === 'FLIP';
    let attackerRemovedByFlip = false;

    if (triggersFlip) {
      const action = defendingCard.data.effectDefinition?.action;

      if (action === 'DESTROY_MONSTER') {
        // Man-Eater Bug: Destrói o monstro atacante
        attackerPlayer.monsterZones[attackerZoneIndex] = null;
        attackerPlayer.graveyard.push(attackingCard);
        attackerRemovedByFlip = true;
        this.log(`🪲 EFEITO FLIP ATIVADO! ${defenderName} ativou seu efeito e destruiu o monstro atacante ${attackerName}! O ataque foi interrompido!`);
      } else if (action === 'RETURN_TO_HAND') {
        // Penguin Soldier: Devolve o monstro atacante para a mão do dono
        attackerPlayer.monsterZones[attackerZoneIndex] = null;
        attackerPlayer.hand.push(attackingCard);
        attackerRemovedByFlip = true;
        this.log(`🐧 EFEITO FLIP ATIVADO! ${defenderName} ativou seu efeito e devolveu ${attackerName} para a mão de ${attackerPlayer.nickname}! O ataque foi interrompido!`);
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
