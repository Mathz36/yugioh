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
});
