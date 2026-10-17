import { describe, it, expect } from 'vitest';
import {
  DuelRuleEngine,
  MonsterCard,
  PlayerState,
} from './duel-rule-engine.js';

describe('DuelRuleEngine', () => {
  describe('1. Tribute Validation (Tribute Summon Rules)', () => {
    it('should require 0 tributes for Level 4 monsters (Happy Path)', () => {
      // Arrange
      const level4Monster: MonsterCard = {
        id: 'c1',
        name: 'Celtic Guardian',
        level: 4,
        attack: 1400,
        defense: 1200,
        position: 'ATTACK',
      };

      // Act
      const tributesNeeded = DuelRuleEngine.getRequiredTributes(level4Monster.level);
      const isValidWithZero = DuelRuleEngine.validateTributeSummon(level4Monster, 0);
      const isValidWithOne = DuelRuleEngine.validateTributeSummon(level4Monster, 1);

      // Assert
      expect(tributesNeeded).toBe(0);
      expect(isValidWithZero).toBe(true);
      expect(isValidWithOne).toBe(false);
    });

    it('should require 1 tribute for Level 6 monsters (Happy Path)', () => {
      // Arrange
      const level6Monster: MonsterCard = {
        id: 'c2',
        name: 'Summoned Skull',
        level: 6,
        attack: 2500,
        defense: 1200,
        position: 'ATTACK',
      };

      // Act
      const tributesNeeded = DuelRuleEngine.getRequiredTributes(level6Monster.level);
      const isValidWithOne = DuelRuleEngine.validateTributeSummon(level6Monster, 1);
      const isValidWithZero = DuelRuleEngine.validateTributeSummon(level6Monster, 0);

      // Assert
      expect(tributesNeeded).toBe(1);
      expect(isValidWithOne).toBe(true);
      expect(isValidWithZero).toBe(false);
    });

    it('should require 2 tributes for Level 7 monsters (Happy Path)', () => {
      // Arrange
      const level7Monster: MonsterCard = {
        id: 'c3',
        name: 'Dark Magician',
        level: 7,
        attack: 2500,
        defense: 2100,
        position: 'ATTACK',
      };

      // Act
      const tributesNeeded = DuelRuleEngine.getRequiredTributes(level7Monster.level);
      const isValidWithTwo = DuelRuleEngine.validateTributeSummon(level7Monster, 2);
      const isValidWithOne = DuelRuleEngine.validateTributeSummon(level7Monster, 1);

      // Assert
      expect(tributesNeeded).toBe(2);
      expect(isValidWithTwo).toBe(true);
      expect(isValidWithOne).toBe(false);
    });

    it('should throw an error for monsters with invalid level less than 1 (Edge Case)', () => {
      // Arrange
      const invalidLevel = 0;

      // Act & Assert
      expect(() => DuelRuleEngine.getRequiredTributes(invalidLevel)).toThrow(
        'Invalid monster level: 0. Monster level must be at least 1.'
      );
    });
  });

  describe('2. Battle Calculation (Attack vs Attack & Attack vs Defense)', () => {
    describe('Attack vs Attack', () => {
      it('should destroy weaker defender and deal LP difference to defender player when attacker ATK > defender ATK', () => {
        // Arrange
        const attacker: MonsterCard = {
          id: 'atk-1',
          name: 'Blue-Eyes White Dragon',
          level: 8,
          attack: 3000,
          defense: 2500,
          position: 'ATTACK',
        };
        const defender: MonsterCard = {
          id: 'def-1',
          name: 'Dark Magician',
          level: 7,
          attack: 2500,
          defense: 2100,
          position: 'ATTACK',
        };

        // Act
        const result = DuelRuleEngine.calculateBattle(attacker, defender);

        // Assert
        expect(result.attackerDestroyed).toBe(false);
        expect(result.defenderDestroyed).toBe(true);
        expect(result.attackerDamageTaken).toBe(0);
        expect(result.defenderDamageTaken).toBe(500); // 3000 - 2500
      });

      it('should destroy weaker attacker and deal LP difference to attacker player when attacker ATK < defender ATK', () => {
        // Arrange
        const attacker: MonsterCard = {
          id: 'atk-2',
          name: 'Kuriboh',
          level: 1,
          attack: 300,
          defense: 200,
          position: 'ATTACK',
        };
        const defender: MonsterCard = {
          id: 'def-2',
          name: 'Summoned Skull',
          level: 6,
          attack: 2500,
          defense: 1200,
          position: 'ATTACK',
        };

        // Act
        const result = DuelRuleEngine.calculateBattle(attacker, defender);

        // Assert
        expect(result.attackerDestroyed).toBe(true);
        expect(result.defenderDestroyed).toBe(false);
        expect(result.attackerDamageTaken).toBe(2200); // 2500 - 300
        expect(result.defenderDamageTaken).toBe(0);
      });

      it('should destroy both monsters and deal 0 damage when ATK is equal', () => {
        // Arrange
        const attacker: MonsterCard = {
          id: 'atk-3',
          name: 'Dark Magician',
          level: 7,
          attack: 2500,
          defense: 2100,
          position: 'ATTACK',
        };
        const defender: MonsterCard = {
          id: 'def-3',
          name: 'Summoned Skull',
          level: 6,
          attack: 2500,
          defense: 1200,
          position: 'ATTACK',
        };

        // Act
        const result = DuelRuleEngine.calculateBattle(attacker, defender);

        // Assert
        expect(result.attackerDestroyed).toBe(true);
        expect(result.defenderDestroyed).toBe(true);
        expect(result.attackerDamageTaken).toBe(0);
        expect(result.defenderDamageTaken).toBe(0);
      });
    });

    describe('Attack vs Defense', () => {
      it('should destroy defender monster without inflicting LP damage when attacker ATK > defender DEF', () => {
        // Arrange
        const attacker: MonsterCard = {
          id: 'atk-4',
          name: 'Vorse Raider',
          level: 4,
          attack: 1900,
          defense: 1200,
          position: 'ATTACK',
        };
        const defender: MonsterCard = {
          id: 'def-4',
          name: 'Mystical Elf',
          level: 4,
          attack: 800,
          defense: 1200,
          position: 'DEFENSE',
        };

        // Act
        const result = DuelRuleEngine.calculateBattle(attacker, defender);

        // Assert
        expect(result.attackerDestroyed).toBe(false);
        expect(result.defenderDestroyed).toBe(true);
        expect(result.attackerDamageTaken).toBe(0);
        expect(result.defenderDamageTaken).toBe(0); // Defense position protects LP
      });

      it('should reflect damage to attacking player and destroy neither monster when attacker ATK < defender DEF', () => {
        // Arrange
        const attacker: MonsterCard = {
          id: 'atk-5',
          name: 'Celtic Guardian',
          level: 4,
          attack: 1400,
          defense: 1200,
          position: 'ATTACK',
        };
        const defender: MonsterCard = {
          id: 'def-5',
          name: 'Mystical Elf',
          level: 4,
          attack: 800,
          defense: 2000,
          position: 'DEFENSE',
        };

        // Act
        const result = DuelRuleEngine.calculateBattle(attacker, defender);

        // Assert
        expect(result.attackerDestroyed).toBe(false);
        expect(result.defenderDestroyed).toBe(false);
        expect(result.attackerDamageTaken).toBe(600); // 2000 - 1400 reflected damage
        expect(result.defenderDamageTaken).toBe(0);
      });

      it('should neither destroy any monster nor inflict damage when attacker ATK equals defender DEF', () => {
        // Arrange
        const attacker: MonsterCard = {
          id: 'atk-6',
          name: 'Giant Soldier of Stone',
          level: 3,
          attack: 1300,
          defense: 2000,
          position: 'ATTACK',
        };
        const defender: MonsterCard = {
          id: 'def-6',
          name: 'Wall of Illusion',
          level: 4,
          attack: 1000,
          defense: 1300,
          position: 'DEFENSE',
        };

        // Act
        const result = DuelRuleEngine.calculateBattle(attacker, defender);

        // Assert
        expect(result.attackerDestroyed).toBe(false);
        expect(result.defenderDestroyed).toBe(false);
        expect(result.attackerDamageTaken).toBe(0);
        expect(result.defenderDamageTaken).toBe(0);
      });
    });
  });

  describe('3. Direct Attack with Empty Opponent Field', () => {
    it('should inflict full attacker ATK to defender LP when defender field has no monsters (Happy Path)', () => {
      // Arrange
      const attacker: MonsterCard = {
        id: 'atk-7',
        name: 'Dark Magician',
        level: 7,
        attack: 2500,
        defense: 2100,
        position: 'ATTACK',
      };
      const opponentState: PlayerState = {
        id: 'player-2',
        lifePoints: 8000,
        monsters: [],
      };

      // Act
      const directDamage = DuelRuleEngine.calculateDirectAttack(attacker, opponentState);

      // Assert
      expect(directDamage).toBe(2500);
    });

    it('should reject direct attack and throw an error when defender field has monsters (Edge Case / Rule Violation)', () => {
      // Arrange
      const attacker: MonsterCard = {
        id: 'atk-8',
        name: 'Dark Magician',
        level: 7,
        attack: 2500,
        defense: 2100,
        position: 'ATTACK',
      };
      const opponentMonster: MonsterCard = {
        id: 'def-8',
        name: 'Kuriboh',
        level: 1,
        attack: 300,
        defense: 200,
        position: 'DEFENSE',
      };
      const opponentState: PlayerState = {
        id: 'player-2',
        lifePoints: 8000,
        monsters: [opponentMonster],
      };

      // Act & Assert
      expect(() => DuelRuleEngine.calculateDirectAttack(attacker, opponentState)).toThrow(
        'Cannot perform direct attack when opponent field is not empty.'
      );
    });
  });
});
