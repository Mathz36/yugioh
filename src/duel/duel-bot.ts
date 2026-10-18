import { DuelMatchSession } from './duel-match-session.js';
import { CardInstance } from './duel-types.js';

export class DuelBot {
  /**
   * Executes a full AI bot turn automatically:
   * 1. Evaluates hand and summons the strongest possible monster (Main Phase 1)
   * 2. Transitions to Battle Phase and attacks optimal targets or direct attacks
   * 3. Transitions to Main Phase 2 / End Phase
   */
  public static executeTurn(session: DuelMatchSession): void {
    if (session.matchState.isGameOver) return;

    const bot = session.getActivePlayer();
    const opponent = session.getOpponentPlayer();

    // Ensure we are in MAIN1
    if (session.matchState.phase !== 'MAIN1') {
      session.matchState.phase = 'MAIN1';
    }

    // 1. Main Phase 1: Try to Summon
    if (!bot.hasNormalSummonedThisTurn) {
      this.evaluateAndSummon(session);
    }

    // 2. Battle Phase
    const currentPhase = session.nextPhase();

    if (currentPhase === 'BATTLE') {
      this.executeAttacks(session);
    }

    // 3. End Turn
    session.nextPhase(); // Move to MAIN2
    session.nextPhase(); // End turn, passing back to user
  }

  public static evaluateAndSummon(session: DuelMatchSession): { summonedCard: CardInstance; zoneIndex: number } | null {
    const bot = session.getActivePlayer();

    // Find empty monster zone
    const emptyZoneIndex = bot.monsterZones.findIndex((z) => z === null);

    // Count available monsters on bot's field for tribute
    const currentMonstersOnField = bot.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

    // Sort hand by attack descending
    const summonableCards = [...bot.hand].sort((a, b) => b.data.attack - a.data.attack);

    // Prioritize highest level/attack we can legally afford
    for (const card of summonableCards) {
      if (card.data.level <= 4 && emptyZoneIndex !== -1) {
        // Direct summon, 0 tributes needed
        const isFlipMonster = card.data.effectType === 'FLIP';
        const position = isFlipMonster ? 'DEFENSE' : 'ATTACK';
        const isFaceDown = isFlipMonster;

        const success = session.normalSummon(card.uid, emptyZoneIndex, position, [], isFaceDown);
        if (success) {
          return { summonedCard: card, zoneIndex: emptyZoneIndex };
        }
      } else if (card.data.level >= 5 && card.data.level <= 6 && currentMonstersOnField.length >= 1) {
        // 1 tribute needed: pick weakest monster on field to sacrifice
        const sortedTributes = [...currentMonstersOnField].sort(
          (a, b) => a.card.data.attack - b.card.data.attack
        );
        const sacrifice = sortedTributes[0];
        const targetZone = emptyZoneIndex !== -1 ? emptyZoneIndex : sacrifice.index;
        const success = session.normalSummon(card.uid, targetZone, 'ATTACK', [sacrifice.index]);
        if (success) {
          return { summonedCard: card, zoneIndex: targetZone };
        }
      } else if (card.data.level >= 7 && currentMonstersOnField.length >= 2) {
        // 2 tributes needed: pick 2 weakest monsters on field
        const sortedTributes = [...currentMonstersOnField].sort(
          (a, b) => a.card.data.attack - b.card.data.attack
        );
        const sacrifices = [sortedTributes[0].index, sortedTributes[1].index];
        const targetZone = emptyZoneIndex !== -1 ? emptyZoneIndex : sacrifices[0];
        const success = session.normalSummon(card.uid, targetZone, 'ATTACK', sacrifices);
        if (success) {
          return { summonedCard: card, zoneIndex: targetZone };
        }
      }
    }

    return null;
  }

  public static executeAttacks(session: DuelMatchSession): void {
    const bot = session.getActivePlayer();
    const opponent = session.getOpponentPlayer();

    // Collect bot monsters that can declare an attack (only if not summoned on the current turn)
    const botAttackers = bot.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter(
        (item): item is { card: CardInstance; index: number } =>
          item.card !== null &&
          item.card.position === 'ATTACK' &&
          !item.card.hasAttacked &&
          item.card.turnSummoned !== session.matchState.currentTurn
      )
      .sort(
        (a, b) =>
          session.getEffectiveAttack(b.card, bot, opponent) -
          session.getEffectiveAttack(a.card, bot, opponent)
      );

    for (const attacker of botAttackers) {
      if (session.matchState.isGameOver) break;

      const attackerAtk = session.getEffectiveAttack(attacker.card, bot, opponent);
      const opponentMonsters = opponent.monsterZones
        .map((m, idx) => ({ card: m, index: idx }))
        .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

      if (opponentMonsters.length === 0) {
        // Field is empty: Direct Attack!
        session.declareAttack(attacker.index, null);
      } else {
        // Find best target to destroy with favorable exchange
        const vulnerableTarget = opponentMonsters.find(
          (target) =>
            (target.card.position === 'ATTACK' && attackerAtk > session.getEffectiveAttack(target.card, opponent, bot)) ||
            (target.card.position === 'DEFENSE' && attackerAtk > target.card.data.defense)
        );

        if (vulnerableTarget) {
          session.declareAttack(attacker.index, vulnerableTarget.index);
        }
      }
    }
  }
}

