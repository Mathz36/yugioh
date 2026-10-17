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

  it('should prevent changing position on the same turn summoned, but allow it on subsequent turns', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const lvl4Card = session.player1.hand.find((c) => c.data.level <= 4);
    session.normalSummon(lvl4Card!.uid, 0, 'ATTACK', []);

    // Act 1: Attempt to change position on the same turn (Turn 1) -> must fail
    const changeOnSameTurn = session.changeMonsterPosition(0);
    expect(changeOnSameTurn).toBe(false);
    expect(session.player1.monsterZones[0]?.position).toBe('ATTACK');

    // Simulate turn advancement: pass to bot, bot finishes, returns to player 1 (Turn 3)
    session.endTurn(); // Bot turn
    session.endTurn(); // Player turn again (Turn 3)

    // Act 2: Attempt to change position on subsequent turn -> must succeed
    const changeOnNextTurn = session.changeMonsterPosition(0);
    expect(changeOnNextTurn).toBe(true);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');

    // Act 3: Attempt to change a SECOND time in the same turn -> must fail (limit 1x per turn)
    const secondChangeInSameTurn = session.changeMonsterPosition(0);
    expect(secondChangeInSameTurn).toBe(false);
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
});
