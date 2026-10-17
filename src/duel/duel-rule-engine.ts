export type BattlePosition = 'ATTACK' | 'DEFENSE';

export interface MonsterCard {
  id: string;
  name: string;
  level: number;
  attack: number;
  defense: number;
  position: BattlePosition;
}

export interface PlayerState {
  id: string;
  lifePoints: number;
  monsters: MonsterCard[];
}

export interface BattleResult {
  attackerDamageTaken: number;
  defenderDamageTaken: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
}

export class DuelRuleEngine {
  /**
   * Calculates the required number of tributes (tribute summons) based on monster level.
   * - Level 1 to 4: 0 tributes
   * - Level 5 to 6: 1 tribute
   * - Level 7+: 2 tributes
   */
  public static getRequiredTributes(level: number): number {
    if (level < 1) {
      throw new Error(`Invalid monster level: ${level}. Monster level must be at least 1.`);
    }
    if (level <= 4) {
      return 0;
    }
    if (level <= 6) {
      return 1;
    }
    return 2;
  }

  /**
   * Validates whether a tribute summon can be legally performed.
   */
  public static validateTributeSummon(monster: MonsterCard, offeredTributesCount: number): boolean {
    const required = this.getRequiredTributes(monster.level);
    return offeredTributesCount === required;
  }

  /**
   * Resolves battle between an attacking monster and a defending monster.
   */
  public static calculateBattle(attacker: MonsterCard, defender: MonsterCard): BattleResult {
    if (attacker.position !== 'ATTACK') {
      throw new Error('Only monsters in ATTACK position can declare an attack.');
    }

    if (defender.position === 'ATTACK') {
      if (attacker.attack > defender.attack) {
        return {
          attackerDamageTaken: 0,
          defenderDamageTaken: attacker.attack - defender.attack,
          attackerDestroyed: false,
          defenderDestroyed: true,
        };
      } else if (attacker.attack < defender.attack) {
        return {
          attackerDamageTaken: defender.attack - attacker.attack,
          defenderDamageTaken: 0,
          attackerDestroyed: true,
          defenderDestroyed: false,
        };
      } else {
        // Mutual destruction with no battle damage
        return {
          attackerDamageTaken: 0,
          defenderDamageTaken: 0,
          attackerDestroyed: true,
          defenderDestroyed: true,
        };
      }
    } else {
      // Defender in DEFENSE position
      if (attacker.attack > defender.defense) {
        // Defense monster destroyed, no damage inflicted to defending player
        return {
          attackerDamageTaken: 0,
          defenderDamageTaken: 0,
          attackerDestroyed: false,
          defenderDestroyed: true,
        };
      } else if (attacker.attack < defender.defense) {
        // Reflected damage taken by attacking player, neither monster destroyed
        return {
          attackerDamageTaken: defender.defense - attacker.attack,
          defenderDamageTaken: 0,
          attackerDestroyed: false,
          defenderDestroyed: false,
        };
      } else {
        // Tie: no monster destroyed, no damage taken
        return {
          attackerDamageTaken: 0,
          defenderDamageTaken: 0,
          attackerDestroyed: false,
          defenderDestroyed: false,
        };
      }
    }
  }

  /**
   * Resolves a direct attack on a player with no monsters on field.
   */
  public static calculateDirectAttack(attacker: MonsterCard, defenderField: PlayerState): number {
    if (attacker.position !== 'ATTACK') {
      throw new Error('Only monsters in ATTACK position can declare a direct attack.');
    }

    if (defenderField.monsters.length > 0) {
      throw new Error('Cannot perform direct attack when opponent field is not empty.');
    }

    return attacker.attack;
  }
}
