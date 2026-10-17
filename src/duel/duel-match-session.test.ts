import { describe, it, expect } from 'vitest';
import { DuelMatchSession } from './duel-match-session.js';
import { createKaibaDeck, createYugiDeck } from './starter-decks.js';
import { DuelBot } from './duel-bot.js';

describe('DuelMatchSession & DuelBot Integration', () => {
  it('should initialize a match with 8000 LP, 5 cards in hand, and start directly in MAIN1', () => {
    // Arrange & Act
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());

    // Assert
    expect(session.player1.lifePoints).toBe(8000);
    expect(session.player2.lifePoints).toBe(8000);
    expect(session.player1.hand.length).toBe(5);
    expect(session.player2.hand.length).toBe(5);
    expect(session.player1.deck.length).toBe(35);
    expect(session.player2.deck.length).toBe(35);
    // Starts directly in MAIN1 to enable instant summon without bug
    expect(session.matchState.phase).toBe('MAIN1');
  });

  it('should transition through phases correctly from MAIN1 to BATTLE to MAIN2', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());

    // Act & Assert
    expect(session.matchState.phase).toBe('MAIN1');
    session.nextPhase();
    expect(session.matchState.phase).toBe('BATTLE');
    session.nextPhase();
    expect(session.matchState.phase).toBe('MAIN2');
  });

  it('should allow normal summon in DEFENSE position', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const lvl4Card = session.player1.hand.find((c) => c.data.level <= 4);
    expect(lvl4Card).toBeDefined();

    // Act
    const summoned = session.normalSummon(lvl4Card!.uid, 0, 'DEFENSE', []);

    // Assert
    expect(summoned).toBe(true);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');
  });

  it('should allow changing position freely during Main Phase, but prevent it during Battle Phase or opponent turn', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const lvl4Card = session.player1.hand.find((c) => c.data.level <= 4);
    session.normalSummon(lvl4Card!.uid, 0, 'ATTACK', []);

    // Act 1: Monstro entra em ATTACK por padrão
    expect(session.player1.monsterZones[0]?.position).toBe('ATTACK');

    // Act 2: Mudar para DEFENSE na Main Phase (mesmo no turno em que foi invocado) -> sucesso
    const changeToDef = session.changeMonsterPosition(0);
    expect(changeToDef).toBe(true);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');

    // Act 3: Mudar de volta para ATTACK ilimitadamente na Main Phase -> sucesso
    const changeBackToAtk = session.changeMonsterPosition(0);
    expect(changeBackToAtk).toBe(true);
    expect(session.player1.monsterZones[0]?.position).toBe('ATTACK');

    // Act 4: Mudar novamente para DEFENSE antes da Batalha -> sucesso
    session.changeMonsterPosition(0);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');

    // Act 5: Avançar para Fase de Batalha
    session.nextPhase();
    expect(session.matchState.phase).toBe('BATTLE');

    // Act 6: Tentar mudar de posição durante a Fase de Batalha -> DEVE FALHAR
    const changeDuringBattle = session.changeMonsterPosition(0);
    expect(changeDuringBattle).toBe(false);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE'); // Permanece a posição fixada

    // Act 7: Passar o turno para o oponente -> a posição de DEFENSE prevalece
    session.endTurn();
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');
  });

  it('should allow player to surrender and declare opponent as winner', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());

    // Act
    session.surrender(session.player1.id);

    // Assert
    expect(session.matchState.isGameOver).toBe(true);
    expect(session.matchState.winnerPlayerId).toBe(session.player2.id);
    expect(session.matchState.winReason).toContain('rendeu-se');
  });

  it('should allow DuelBot to automatically execute its turn', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Seto Kaiba (Bot)', createKaibaDeck());
    session.endTurn(); // Pass Yugi turn to bot

    expect(session.getActivePlayer().id).toBe(session.player2.id);

    // Act
    DuelBot.executeTurn(session);

    // Assert: Bot must have attempted to summon or attack and passed turn back to player 1
    expect(session.getActivePlayer().id).toBe(session.player1.id);
    expect(session.player2.monsterZones.some((z) => z !== null)).toBe(true);
  });

  it('should require exactly 1 tribute for level 5-6 monsters and 2 tributes for level 7+ monsters', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const p1 = session.player1;

    // Coloca 2 monstros nível 4 no campo para servirem de tributo
    const lvl4Cards = p1.deck.filter((c) => c.data.level <= 4);
    p1.monsterZones[0] = { ...lvl4Cards[0], uid: 'tribute_1' };
    p1.monsterZones[1] = { ...lvl4Cards[1], uid: 'tribute_2' };

    // Cartas de teste
    const lvl6Card = { ...p1.deck.find((c) => c.data.level === 6)!, uid: 'summon_lvl6' };
    const lvl7Card = { ...p1.deck.find((c) => c.data.level >= 7)!, uid: 'summon_lvl7' };
    p1.hand.push(lvl6Card, lvl7Card);

    // Act 1: Tentar invocar monstro nível 6 sem tributos -> deve falhar
    p1.hasNormalSummonedThisTurn = false;
    const failLvl6NoTribute = session.normalSummon(lvl6Card.uid, 2, 'ATTACK', []);
    expect(failLvl6NoTribute).toBe(false);

    // Act 2: Invocar monstro nível 6 com exatamente 1 tributo -> deve ter sucesso
    const successLvl6 = session.normalSummon(lvl6Card.uid, 0, 'ATTACK', [0]);
    expect(successLvl6).toBe(true);
    expect(p1.graveyard.some((c) => c.uid === 'tribute_1')).toBe(true);
    expect(p1.monsterZones[0]?.uid).toBe('summon_lvl6');

    // Prepara para o teste de nível 7+
    p1.hasNormalSummonedThisTurn = false;
    p1.monsterZones[2] = { ...lvl4Cards[2], uid: 'tribute_3' }; // Agora tem zona 0, 1 e 2 ocupadas

    // Act 3: Tentar invocar nível 7+ com apenas 1 tributo -> deve falhar
    const failLvl7With1Tribute = session.normalSummon(lvl7Card.uid, 3, 'ATTACK', [1]);
    expect(failLvl7With1Tribute).toBe(false);

    // Act 4: Invocar nível 7+ com 2 tributos -> deve ter sucesso
    const successLvl7 = session.normalSummon(lvl7Card.uid, 1, 'ATTACK', [1, 2]);
    expect(successLvl7).toBe(true);
    expect(p1.graveyard.some((c) => c.uid === 'tribute_2')).toBe(true);
    expect(p1.graveyard.some((c) => c.uid === 'tribute_3')).toBe(true);
    expect(p1.monsterZones[1]?.uid).toBe('summon_lvl7');
  });

  it('should prevent a monster summoned on the current turn from attacking until the next turn', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const p1 = session.player1;
    const lvl4Card = p1.hand.find((c) => c.data.level <= 4)!;

    // Invocação no Turno 1
    session.normalSummon(lvl4Card.uid, 0, 'ATTACK', []);
    expect(p1.monsterZones[0]?.turnSummoned).toBe(1);

    // Muda para Fase de Batalha (Turno 1)
    session.nextPhase();
    expect(session.matchState.phase).toBe('BATTLE');

    // Act 1: Tentar atacar no mesmo turno da invocação (Turno 1) -> DEVE FALHAR
    const attackOnSameTurn = session.declareAttack(0, null);
    expect(attackOnSameTurn).toBe(false);
    expect(p1.monsterZones[0]?.hasAttacked).toBe(false);

    // Passa turno para o Bot e de volta para o Jogador (Turno 3)
    session.endTurn(); // Bot turn
    session.endTurn(); // Player turn again (Turno 3)

    // Muda para Fase de Batalha do Turno 3
    session.nextPhase();
    expect(session.matchState.phase).toBe('BATTLE');
    expect(session.matchState.currentTurn).toBe(3);

    // Act 2: Tentar atacar no próximo turno (Turno 3) -> DEVE TER SUCESSO
    const attackOnNextTurn = session.declareAttack(0, null);
    expect(attackOnNextTurn).toBe(true);
    expect(p1.monsterZones[0]?.hasAttacked).toBe(true);
  });

  it('should ensure DuelBot summons an eligible Level <= 4 monster even when higher ATK tribute monsters exist in hand (Regression Fix)', () => {
    // Arrange: Simulates Kaiba bot having Blue-Eyes (3000 ATK, Level 8) and Vorse Raider (1900 ATK, Level 4)
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    session.endTurn(); // Pass to Kaiba (turn 2)

    const bot = session.getActivePlayer();
    // Clear hand and set specific cards to recreate the bug condition
    bot.hand = [
      {
        uid: 'kaiba_blue_eyes',
        data: {
          id: '89631139',
          name: 'Blue-Eyes White Dragon',
          type: 'Normal Monster',
          level: 8,
          attack: 3000,
          defense: 2500,
          description: 'Legendary dragon',
          imageUrl: '',
        },
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      },
      {
        uid: 'kaiba_vorse_raider',
        data: {
          id: '14898066',
          name: 'Vorse Raider',
          type: 'Normal Monster',
          level: 4,
          attack: 1900,
          defense: 1200,
          description: 'Warrior',
          imageUrl: '',
        },
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      },
    ];

    // Act
    const result = DuelBot.evaluateAndSummon(session);

    // Assert: Bot must not be blocked by Blue-Eyes and must successfully summon Vorse Raider
    expect(result).not.toBeNull();
    expect(result?.summonedCard.uid).toBe('kaiba_vorse_raider');
    expect(bot.monsterZones[0]?.uid).toBe('kaiba_vorse_raider');
    expect(bot.monsterZones[0]?.position).toBe('ATTACK');
    expect(bot.hasNormalSummonedThisTurn).toBe(true);
  });

  it('should allow Level 5-6 tribute summon occupying the EXACT SAME zone vacated by the sacrificed monster (Regression Fix)', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const p1 = session.player1;

    // Fill zone 0 with a Level 4 monster to be sacrificed
    const lvl4Card = p1.deck.find((c) => c.data.level <= 4)!;
    p1.monsterZones[0] = { ...lvl4Card, uid: 'tribute_zone_0_monster' };

    // Prepare a Level 6 monster in hand
    const lvl6Card = { ...p1.deck.find((c) => c.data.level === 6)!, uid: 'summon_lvl6_in_same_zone' };
    p1.hand.push(lvl6Card);
    p1.hasNormalSummonedThisTurn = false;

    // Act: Summon Level 6 into targetZoneIndex 0 sacrificing zone 0
    const summonSuccess = session.normalSummon(lvl6Card.uid, 0, 'ATTACK', [0]);

    // Assert
    expect(summonSuccess).toBe(true);
    expect(p1.graveyard.some((c) => c.uid === 'tribute_zone_0_monster')).toBe(true);
    expect(p1.monsterZones[0]?.uid).toBe('summon_lvl6_in_same_zone');
    expect(p1.monsterZones[0]?.position).toBe('ATTACK');
    expect(p1.hasNormalSummonedThisTurn).toBe(true);
  });

  it('should allow Level 7+ tribute summon occupying the EXACT SAME zone of one of the sacrificed monsters (Regression Fix)', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const p1 = session.player1;

    // Fill zones 1 and 2 with monsters to be sacrificed
    const lvl4Cards = p1.deck.filter((c) => c.data.level <= 4);
    p1.monsterZones[1] = { ...lvl4Cards[0], uid: 'tribute_zone_1' };
    p1.monsterZones[2] = { ...lvl4Cards[1], uid: 'tribute_zone_2' };

    // Prepare Level 7+ monster in hand
    const lvl7Card = { ...p1.deck.find((c) => c.data.level >= 7)!, uid: 'summon_lvl7_in_same_zone' };
    p1.hand.push(lvl7Card);
    p1.hasNormalSummonedThisTurn = false;

    // Act: Summon Level 7+ into targetZoneIndex 1 sacrificing zones [1, 2]
    const summonSuccess = session.normalSummon(lvl7Card.uid, 1, 'ATTACK', [1, 2]);

    // Assert
    expect(summonSuccess).toBe(true);
    expect(p1.graveyard.some((c) => c.uid === 'tribute_zone_1')).toBe(true);
    expect(p1.graveyard.some((c) => c.uid === 'tribute_zone_2')).toBe(true);
    expect(p1.monsterZones[1]?.uid).toBe('summon_lvl7_in_same_zone');
    expect(p1.monsterZones[1]?.position).toBe('ATTACK');
    expect(p1.monsterZones[2]).toBeNull();
    expect(p1.hasNormalSummonedThisTurn).toBe(true);
  });

  it('should ensure DuelBot attacks favorable targets when opponent field has monsters', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const bot = session.player2;
    const opponent = session.player1;

    // Set opponent with a weaker attack monster in zone 0
    opponent.monsterZones[0] = {
      uid: 'yugi_kuriboh',
      data: {
        id: '40640057',
        name: 'Kuriboh',
        type: 'Effect Monster',
        level: 1,
        attack: 300,
        defense: 200,
        description: 'Kuriboh',
        imageUrl: '',
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    // Set bot active turn
    session.matchState.activePlayerId = bot.id;
    session.matchState.currentTurn = 2;
    session.matchState.phase = 'BATTLE';

    // Place a strong bot monster summoned in turn 1 (ready to attack)
    bot.monsterZones[0] = {
      uid: 'kaiba_vorse_raider_atk',
      data: {
        id: '14898066',
        name: 'Vorse Raider',
        type: 'Normal Monster',
        level: 4,
        attack: 1900,
        defense: 1200,
        description: 'Warrior',
        imageUrl: '',
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1, // Summoned in previous turn
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    // Act
    DuelBot.executeAttacks(session);

    // Assert: Kuriboh destroyed, Vorse Raider marked as hasAttacked, damage inflicted to opponent
    expect(opponent.monsterZones[0]).toBeNull();
    expect(opponent.graveyard.some((c) => c.uid === 'yugi_kuriboh')).toBe(true);
    expect(bot.monsterZones[0]?.hasAttacked).toBe(true);
    expect(opponent.lifePoints).toBe(8000 - (1900 - 300)); // 6400 LP
  });
});
