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

  private static evaluateAndSummon(session: DuelMatchSession): void {
    const bot = session.getActivePlayer();

    // Find empty monster zone
    const emptyZoneIndex = bot.monsterZones.findIndex((z) => z === null);
    if (emptyZoneIndex === -1) return; // No space

    // Sort hand by attack descending
    const summonableCards = [...bot.hand].sort((a, b) => b.data.attack - a.data.attack);

    // Count available monsters on bot's field for tribute
    const currentMonstersOnField = bot.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

    // Prioritize highest level/attack we can legally afford
    for (const card of summonableCards) {
      if (card.data.level <= 4) {
        // Direct summon, 0 tributes needed
        session.normalSummon(card.uid, emptyZoneIndex, 'ATTACK', []);
        break;
      } else if (card.data.level <= 6 && currentMonstersOnField.length >= 1) {
        // 1 tribute needed: pick weakest monster on field to sacrifice
        const sortedTributes = [...currentMonstersOnField].sort(
          (a, b) => a.card.data.attack - b.card.data.attack
        );
        const sacrifice = sortedTributes[0];
        // The empty zone can be the zone vacated by the sacrifice
        session.normalSummon(card.uid, sacrifice.index, 'ATTACK', [sacrifice.index]);
        break;
      } else if (card.data.level >= 7 && currentMonstersOnField.length >= 2) {
        // 2 tributes needed: pick 2 weakest monsters on field
        const sortedTributes = [...currentMonstersOnField].sort(
          (a, b) => a.card.data.attack - b.card.data.attack
        );
        const sacrifices = [sortedTributes[0].index, sortedTributes[1].index];
        session.normalSummon(card.uid, sacrifices[0], 'ATTACK', sacrifices);
        break;
      }
    }
  }

  private static executeAttacks(session: DuelMatchSession): void {
    const bot = session.getActivePlayer();
    const opponent = session.getOpponentPlayer();

    // Collect bot monsters that can declare an attack
    const botAttackers = bot.monsterZones
      .map((m, idx) => ({ card: m, index: idx }))
      .filter(
        (item): item is { card: CardInstance; index: number } =>
          item.card !== null && item.card.position === 'ATTACK' && !item.card.hasAttacked
      )
      .sort((a, b) => b.card.data.attack - a.card.data.attack);

    for (const attacker of botAttackers) {
      if (session.matchState.isGameOver) break;

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
            (target.card.position === 'ATTACK' && attacker.card.data.attack > target.card.data.attack) ||
            (target.card.position === 'DEFENSE' && attacker.card.data.attack > target.card.data.defense)
        );

        if (vulnerableTarget) {
          session.declareAttack(attacker.index, vulnerableTarget.index);
        }
      }
    }
  }
}

