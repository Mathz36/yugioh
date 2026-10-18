import { describe, it, expect, vi } from 'vitest';
import { DuelMatchSession } from './duel-match-session.js';
import { createKaibaDeck, createYugiDeck, CLASSIC_CARDS } from './starter-decks.js';
import { DuelBot } from './duel-bot.js';
import { CardInstance } from './duel-types.js';

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
    const lvl4Card = session.player1.hand.find((c) => c.data.level >= 1 && c.data.level <= 4);
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
    const lvl4Card = session.player1.hand.find((c) => c.data.level >= 1 && c.data.level <= 4);
    session.normalSummon(lvl4Card!.uid, 0, 'ATTACK', []);

    // Act 1: Monstro entra em ATTACK por padrão
    expect(session.player1.monsterZones[0]?.position).toBe('ATTACK');

    // Act 2: Mudar para DEFENSE na Main Phase (mesmo no turno em que foi invocado) -> sucesso
    const changeToDef = session.changeMonsterPosition(0);
    expect(changeToDef.success).toBe(true);
    expect(changeToDef.flipped).toBe(false);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');

    // Act 3: Mudar de volta para ATTACK ilimitadamente na Main Phase -> sucesso
    const changeBackToAtk = session.changeMonsterPosition(0);
    expect(changeBackToAtk.success).toBe(true);
    expect(changeBackToAtk.flipped).toBe(false);
    expect(session.player1.monsterZones[0]?.position).toBe('ATTACK');

    // Act 4: Mudar novamente para DEFENSE antes da Batalha -> sucesso
    session.changeMonsterPosition(0);
    expect(session.player1.monsterZones[0]?.position).toBe('DEFENSE');

    // Act 5: Avançar para Fase de Batalha
    session.nextPhase();
    expect(session.matchState.phase).toBe('BATTLE');

    // Act 6: Tentar mudar de posição durante a Fase de Batalha -> DEVE FALHAR
    const changeDuringBattle = session.changeMonsterPosition(0);
    expect(changeDuringBattle.success).toBe(false);
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

    // Cartas de teste garantidas
    const lvl6Data = CLASSIC_CARDS.SUMMONED_SKULL;
    const lvl7Data = CLASSIC_CARDS.DARK_MAGICIAN;
    const lvl6Card: CardInstance = {
      uid: 'summon_lvl6',
      data: lvl6Data,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
    const lvl7Card: CardInstance = {
      uid: 'summon_lvl7',
      data: lvl7Data,
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
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
    const lvl4Card = p1.hand.find((c) => {
      const typeLower = (c.data.type || '').toLowerCase();
      const isSpellOrTrap = typeLower.includes('spell') || typeLower.includes('mágica') || typeLower.includes('trap') || typeLower.includes('armadilha');
      return !isSpellOrTrap && c.data.level >= 1 && c.data.level <= 4;
    })!;

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
    const lvl4Card = [...p1.deck, ...p1.hand].find((c) => c.data.level >= 1 && c.data.level <= 4)!;
    p1.monsterZones[0] = { ...lvl4Card, uid: 'tribute_zone_0_monster' };

    // Prepare a Level 6 monster in hand
    const lvl6Card = { ...[...p1.deck, ...p1.hand].find((c) => c.data.level === 6)!, uid: 'summon_lvl6_in_same_zone' };
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
    const lvl4Cards = [...p1.deck, ...p1.hand].filter((c) => c.data.level >= 1 && c.data.level <= 4);
    p1.monsterZones[1] = { ...lvl4Cards[0], uid: 'tribute_zone_1' };
    p1.monsterZones[2] = { ...lvl4Cards[1], uid: 'tribute_zone_2' };

    // Prepare Level 7+ monster in hand
    const lvl7Card = { ...[...p1.deck, ...p1.hand].find((c) => c.data.level >= 7)!, uid: 'summon_lvl7_in_same_zone' };
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

  it('should dynamically boost Buster Blader ATK by 500 for each Dragon on opponent field or graveyard', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const yugi = session.player1;
    const kaiba = session.player2;

    const busterBlader: CardInstance = {
      uid: 'buster_blader_1',
      data: {
        id: '78193831',
        name: 'Buster Blader',
        type: 'Effect Monster',
        race: 'Warrior',
        level: 7,
        attack: 2600,
        defense: 2300,
        description: 'Gains 500 ATK for each Dragon monster on your opponent side of the field or in their GY.',
        imageUrl: '',
        effectType: 'CONTINUOUS',
        effectDefinition: { action: 'BOOST_ATK', value: 500, condition: 'OPPONENT_DRAGON' },
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    yugi.monsterZones[0] = busterBlader;

    // Base attack with 0 Dragons
    expect(session.getEffectiveAttack(busterBlader, yugi, kaiba)).toBe(2600);

    // Add 1 Dragon on opponent field (Blue-Eyes)
    kaiba.monsterZones[0] = {
      uid: 'blue_eyes_1',
      data: {
        id: '89631139',
        name: 'Blue-Eyes White Dragon',
        type: 'Normal Monster',
        race: 'Dragon',
        level: 8,
        attack: 3000,
        defense: 2500,
        description: 'Dragon monster',
        imageUrl: '',
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    // Should gain +500 -> 3100
    expect(session.getEffectiveAttack(busterBlader, yugi, kaiba)).toBe(3100);

    // Add 1 Dragon in opponent graveyard (Koumori Dragon)
    kaiba.graveyard.push({
      uid: 'koumori_dragon_gy',
      data: {
        id: '67724855',
        name: 'Koumori Dragon',
        type: 'Normal Monster',
        race: 'Dragon',
        level: 4,
        attack: 1500,
        defense: 1200,
        description: 'Dragon monster',
        imageUrl: '',
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    });

    // Should gain +1000 total -> 3600
    expect(session.getEffectiveAttack(busterBlader, yugi, kaiba)).toBe(3600);

    // Act: Buster Blader attacks Blue-Eyes White Dragon
    session.matchState.phase = 'BATTLE';
    session.matchState.currentTurn = 3; // Eligible to attack
    busterBlader.turnSummoned = 1;

    const attackSuccess = session.declareAttack(0, 0);

    // Assert: Blue-Eyes (3000 ATK) destroyed by Buster Blader (3600 effective ATK), 600 damage to Kaiba
    expect(attackSuccess).toBe(true);
    expect(kaiba.monsterZones[0]).toBeNull();
    expect(kaiba.graveyard.some((c) => c.uid === 'blue_eyes_1')).toBe(true);
    expect(kaiba.lifePoints).toBe(8000 - 600);
  });

  it('should trigger Man-Eater Bug FLIP effect to destroy the attacking monster when attacked in DEFENSE position', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const yugi = session.player1;
    const kaiba = session.player2;

    const manEaterBug: CardInstance = {
      uid: 'man_eater_bug_1',
      data: {
        id: '54652250',
        name: 'Man-Eater Bug',
        type: 'Flip Effect Monster',
        race: 'Insect',
        level: 2,
        attack: 450,
        defense: 600,
        description: 'FLIP: Target 1 monster on the field; destroy that target.',
        imageUrl: '',
        effectType: 'FLIP',
        effectDefinition: {
          trigger: 'FLIP',
          action: 'DESTROY_MONSTER',
          target: { scope: 'OPPONENT_MONSTERS', minTargets: 1, maxTargets: 1 },
        },
      },
      position: 'DEFENSE',
      isFaceDown: true,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    kaiba.monsterZones[0] = manEaterBug;

    const attacker: CardInstance = {
      uid: 'summoned_skull_1',
      data: {
        id: '70781052',
        name: 'Summoned Skull',
        type: 'Normal Monster',
        race: 'Fiend',
        level: 6,
        attack: 2500,
        defense: 1200,
        description: 'Fiend monster',
        imageUrl: '',
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
    yugi.monsterZones[0] = attacker;

    session.matchState.phase = 'BATTLE';
    session.matchState.currentTurn = 3;

    // Act: Summoned Skull attacks face-down/DEFENSE Man-Eater Bug
    const attackSuccess = session.declareAttack(0, 0);

    // Assert:
    // 1. Attack succeeded
    // 2. FLIP effect destroyed the attacker Summoned Skull and sent it to Yugi GY
    // 3. Attack was interrupted before damage calculation: Man-Eater Bug stays alive on field!
    expect(attackSuccess).toBe(true);
    expect(kaiba.monsterZones[0]?.uid).toBe('man_eater_bug_1');
    expect(yugi.monsterZones[0]).toBeNull();
    expect(yugi.graveyard.some((c) => c.uid === 'summoned_skull_1')).toBe(true);
    expect(kaiba.graveyard.some((c) => c.uid === 'man_eater_bug_1')).toBe(false);
  });

  it('should trigger Penguin Soldier FLIP effect to return the attacking monster to hand when attacked in DEFENSE position', () => {
    // Arrange
    const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
    const yugi = session.player1;
    const kaiba = session.player2;

    const penguinSoldier: CardInstance = {
      uid: 'penguin_soldier_1',
      data: {
        id: '93920745',
        name: 'Penguin Soldier',
        type: 'Flip Effect Monster',
        race: 'Aqua',
        level: 2,
        attack: 750,
        defense: 500,
        description: 'FLIP: Target up to 2 monsters on the field; return those targets to the hand.',
        imageUrl: '',
        effectType: 'FLIP',
        effectDefinition: {
          trigger: 'FLIP',
          action: 'RETURN_TO_HAND',
          target: { scope: 'OPPONENT_MONSTERS', minTargets: 1, maxTargets: 2 },
        },
      },
      position: 'DEFENSE',
      isFaceDown: true,
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };

    kaiba.monsterZones[0] = penguinSoldier;

    const attacker: CardInstance = {
      uid: 'dark_magician_1',
      data: {
        id: '46986414',
        name: 'Dark Magician',
        type: 'Normal Monster',
        race: 'Spellcaster',
        level: 7,
        attack: 2500,
        defense: 2100,
        description: 'The ultimate wizard in terms of attack and defense.',
        imageUrl: '',
      },
      position: 'ATTACK',
      hasAttacked: false,
      hasChangedPositionThisTurn: false,
      turnSummoned: 1,
      monstersDestroyedCount: 0,
      hasAttackedDirectly: false,
    };
    yugi.monsterZones[0] = attacker;

    session.matchState.phase = 'BATTLE';
    session.matchState.currentTurn = 3;

    // Act: Dark Magician attacks Penguin Soldier
    const attackSuccess = session.declareAttack(0, 0);

    // Assert:
    // 1. Attack succeeded
    // 2. FLIP effect returned Dark Magician to Yugi hand (NOT graveyard, NOT on field)
    // 3. Attack was interrupted: Penguin Soldier stays alive on field!
    expect(attackSuccess).toBe(true);
    expect(yugi.monsterZones[0]).toBeNull();
    expect(yugi.hand.some((c) => c.uid === 'dark_magician_1')).toBe(true);
    expect(yugi.graveyard.some((c) => c.uid === 'dark_magician_1')).toBe(false);
    expect(kaiba.monsterZones[0]?.uid).toBe('penguin_soldier_1');
    expect(kaiba.graveyard.some((c) => c.uid === 'penguin_soldier_1')).toBe(false);
  });

  describe('Card Effects: Continuous and Flip Effects', () => {
    it('Teste 1: Buster Blader ganha 500 de ATK para cada Blue-Eyes no campo/cemitério do oponente', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;
      const p2 = session.player2;

      // Equip player 1 with Buster Blader (Base ATK: 2600)
      const busterBladerInstance = {
        uid: 'buster_blader_p1',
        data: CLASSIC_CARDS.BUSTER_BLADER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      p1.monsterZones[0] = busterBladerInstance;

      // Base: sem dragões do oponente, ATK efetivo é 2600
      expect(session.getEffectiveAttack(busterBladerInstance, p1, p2)).toBe(2600);

      // Coloca 1 Blue-Eyes no campo do oponente
      const blueEyesField = {
        uid: 'blue_eyes_field',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      p2.monsterZones[0] = blueEyesField;

      // Coloca 1 Blue-Eyes no cemitério do oponente
      const blueEyesGraveyard = {
        uid: 'blue_eyes_gy',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      p2.graveyard.push(blueEyesGraveyard);

      // Act
      const effectiveAtkWithTwoDragons = session.getEffectiveAttack(busterBladerInstance, p1, p2);

      // Assert
      // 2600 (base) + 500 (campo) + 500 (cemitério) = 3600 ATK
      expect(effectiveAtkWithTwoDragons).toBe(3600);

      // Adiciona mais um dragão no cemitério do oponente (total 3 dragões)
      const blueEyesGY2 = {
        uid: 'blue_eyes_gy_2',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      p2.graveyard.push(blueEyesGY2);

      const effectiveAtkWithThreeDragons = session.getEffectiveAttack(busterBladerInstance, p1, p2);
      expect(effectiveAtkWithThreeDragons).toBe(4100);
    });

    it('Teste 2: Atacar Man-Eater Bug virado em defesa destrói o atacante através do efeito FLIP', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;
      const p2 = session.player2;

      // Kaiba (p2) tem Man-Eater Bug em DEFENSE (ATK 450, DEF 600) virado para baixo
      p2.monsterZones[0] = {
        uid: 'man_eater_bug_p2',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi (p1) tem Celtic Guardian em ATTACK (ATK 1400, DEF 1200) convocado no turno anterior
      p1.monsterZones[0] = {
        uid: 'celtic_guardian_p1',
        data: CLASSIC_CARDS.CELTIC_GUARDIAN,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = p1.id;
      session.matchState.phase = 'BATTLE';

      // Act
      const attackSuccess = session.declareAttack(0, 0);

      // Assert
      expect(attackSuccess).toBe(true);
      // Man-Eater Bug destrói o atacante Celtic Guardian
      expect(p1.monsterZones[0]).toBeNull();
      expect(p1.graveyard.some((c) => c.uid === 'celtic_guardian_p1')).toBe(true);

      // Como o efeito FLIP interrompe o ataque antes do cálculo de dano,
      // o Man-Eater Bug permanece vivo no campo e NÃO vai para o cemitério
      expect(p2.monsterZones[0]?.uid).toBe('man_eater_bug_p2');
      expect(p2.graveyard.some((c) => c.uid === 'man_eater_bug_p2')).toBe(false);
    });

    it('Teste 3: Atacar Penguin Soldier virado em defesa devolve o monstro atacante para a mão do dono', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;
      const p2 = session.player2;

      // Kaiba (p2) tem Penguin Soldier em DEFENSE (DEF 500) virado para baixo
      p2.monsterZones[0] = {
        uid: 'penguin_soldier_p2',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi (p1) tem Summoned Skull em ATTACK (ATK 2500)
      p1.monsterZones[0] = {
        uid: 'summoned_skull_p1',
        data: CLASSIC_CARDS.SUMMONED_SKULL,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      const initialP1HandCount = p1.hand.length;

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = p1.id;
      session.matchState.phase = 'BATTLE';

      // Act
      const attackSuccess = session.declareAttack(0, 0);

      // Assert
      expect(attackSuccess).toBe(true);

      // O monstro atacante (Summoned Skull) deve ser devolvido para a mão do dono (P1)
      expect(p1.monsterZones[0]).toBeNull();
      expect(p1.hand.some((c) => c.uid === 'summoned_skull_p1')).toBe(true);
      expect(p1.hand.length).toBe(initialP1HandCount + 1);
      expect(p1.graveyard.some((c) => c.uid === 'summoned_skull_p1')).toBe(false);

      // O ataque foi interrompido antes do cálculo de dano: Penguin Soldier permanece no campo!
      expect(p2.monsterZones[0]?.uid).toBe('penguin_soldier_p2');
      expect(p2.graveyard.some((c) => c.uid === 'penguin_soldier_p2')).toBe(false);
    });

    it('Teste 4: canActivateKuriboh e activateKuriboh descartam Kuriboh da mão para o cemitério e anulam dano', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;

      // Limpa a mão e insere Kuriboh
      p1.hand = [];
      expect(session.canActivateKuriboh(p1.id)).toBe(false);

      const kuribohCard: CardInstance = {
        uid: 'kuriboh_hand_1',
        data: CLASSIC_CARDS.KURIBOH,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
      };
      p1.hand.push(kuribohCard);

      // Act 1: Verificar se pode ativar Kuriboh
      expect(session.canActivateKuriboh(p1.id)).toBe(true);

      // Act 2: Ativar Kuriboh
      const activated = session.activateKuriboh(p1.id);

      // Assert
      expect(activated).toBe(true);
      expect(p1.hand.some((c) => c.uid === 'kuriboh_hand_1')).toBe(false);
      expect(p1.graveyard.some((c) => c.uid === 'kuriboh_hand_1')).toBe(true);
      expect(session.canActivateKuriboh(p1.id)).toBe(false);
    });

    it('Teste 5: Time Wizard com resultado HEADS destrói todos os monstros do oponente', () => {
      // Arrange
      const session = new DuelMatchSession('Joey', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const joey = session.player1;
      const kaiba = session.player2;

      // Coloca Time Wizard no campo de Joey na zona 0
      const timeWizard: CardInstance = {
        uid: 'time_wizard_joey',
        data: CLASSIC_CARDS.TIME_WIZARD,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
      };
      joey.monsterZones[0] = timeWizard;

      // Coloca 2 monstros no campo de Kaiba (Blue-Eyes e Battle Ox)
      kaiba.monsterZones[0] = {
        uid: 'blue_eyes_kaiba',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'battle_ox_kaiba',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
      };

      session.matchState.phase = 'MAIN1';
      session.matchState.activePlayerId = joey.id;

      // Mock de getRandomInt para garantir HEADS (0)
      vi.spyOn(session as any, 'getRandomInt').mockReturnValue(0);

      // Act
      const result = session.activateTimeWizard(0);

      // Assert
      expect(result.success).toBe(true);
      expect(result.outcome).toBe('HEADS');
      expect(result.destroyedUids).toEqual(['blue_eyes_kaiba', 'battle_ox_kaiba']);
      expect(result.burnDamage).toBe(0);

      // Monstros do oponente devem ser destruídos e enviados ao cemitério
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === 'blue_eyes_kaiba')).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === 'battle_ox_kaiba')).toBe(true);

      // Joey ainda mantém seu Time Wizard e LP intactos
      expect(joey.monsterZones[0]?.uid).toBe('time_wizard_joey');
      expect(joey.monsterZones[0]?.hasUsedEffectThisTurn).toBe(true);
      expect(joey.lifePoints).toBe(8000);

      // Não pode ativar uma segunda vez no mesmo turno
      const secondActivation = session.activateTimeWizard(0);
      expect(secondActivation.success).toBe(false);

      // Ao passar o turno e voltar para Joey, hasUsedEffectThisTurn reseta
      session.endTurn(); // Kaiba turn
      session.endTurn(); // Joey turn
      expect(joey.monsterZones[0]?.hasUsedEffectThisTurn).toBe(false);
    });

    it('Teste 6: Time Wizard com resultado TAILS destrói os monstros do jogador e aplica metade do ATK como burn dano', () => {
      // Arrange
      const session = new DuelMatchSession('Joey', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const joey = session.player1;

      // Coloca Time Wizard (ATK 500) e Summoned Skull (ATK 2500) no campo de Joey (Total ATK = 3000)
      const timeWizard: CardInstance = {
        uid: 'time_wizard_joey',
        data: CLASSIC_CARDS.TIME_WIZARD,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
      };
      const summonedSkull: CardInstance = {
        uid: 'skull_joey',
        data: CLASSIC_CARDS.SUMMONED_SKULL,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
        hasUsedEffectThisTurn: false,
      };
      joey.monsterZones[0] = timeWizard;
      joey.monsterZones[1] = summonedSkull;

      session.matchState.phase = 'MAIN1';
      session.matchState.activePlayerId = joey.id;

      // Mock de getRandomInt para garantir TAILS (1)
      vi.spyOn(session as any, 'getRandomInt').mockReturnValue(1);

      // Act
      const result = session.activateTimeWizard(0);

      // Assert
      expect(result.success).toBe(true);
      expect(result.outcome).toBe('TAILS');
      expect(result.destroyedUids).toEqual(['time_wizard_joey', 'skull_joey']);
      // Dano = metade de 3000 = 1500
      expect(result.burnDamage).toBe(1500);

      // Monstros do próprio Joey devem ter sido destruídos e enviados ao cemitério
      expect(joey.monsterZones[0]).toBeNull();
      expect(joey.monsterZones[1]).toBeNull();
      expect(joey.graveyard.some((c) => c.uid === 'time_wizard_joey')).toBe(true);
      expect(joey.graveyard.some((c) => c.uid === 'skull_joey')).toBe(true);

      // Joey sofre 1500 de dano: 8000 - 1500 = 6500 LP
      expect(joey.lifePoints).toBe(6500);
    });

    it('Teste 7: Bloqueio de flip manual no mesmo turno em que o monstro foi baixado', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;

      // Localiza uma carta na mão para baixar virada para baixo
      const card = p1.hand.find((c) => c.data.level >= 1 && c.data.level <= 4)!;
      const summonSuccess = session.normalSummon(card.uid, 0, 'DEFENSE', [], true);

      expect(summonSuccess).toBe(true);
      expect(p1.monsterZones[0]?.isFaceDown).toBe(true);
      expect(p1.monsterZones[0]?.turnSet).toBe(1);

      // Act: Tentar flipar manualmente no mesmo turno (Turno 1)
      const flipOnSameTurn = session.changeMonsterPosition(0);

      // Assert: Deve ser bloqueado
      expect(flipOnSameTurn.success).toBe(false);
      expect(flipOnSameTurn.flipped).toBe(false);
      expect(p1.monsterZones[0]?.isFaceDown).toBe(true);
      expect(p1.monsterZones[0]?.position).toBe('DEFENSE');
    });

    it('Teste 8: Flip manual liberado nos turnos subsequentes disparando o efeito FLIP e retornando dados do efeito', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;
      const p2 = session.player2;

      // Coloca Man-Eater Bug virado para baixo no Turno 1
      p1.monsterZones[0] = {
        uid: 'man_eater_p1',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Oponente tem Blue-Eyes White Dragon no campo
      p2.monsterZones[0] = {
        uid: 'blue_eyes_p2',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Avança o turno para o turno 3 do jogador
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = p1.id;
      session.matchState.phase = 'MAIN1';

      // Act: Virar manualmente para cima (Flip Summon)
      const flipResult = session.changeMonsterPosition(0);

      // Assert
      expect(flipResult.success).toBe(true);
      expect(flipResult.flipped).toBe(true);
      expect(flipResult.flipEffect).toBeDefined();
      expect(flipResult.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(flipResult.flipEffect?.cardName).toBe('Inseto Come-Homem');
      expect(flipResult.flipEffect?.targetCardUid).toBe('blue_eyes_p2');
      expect(flipResult.flipEffect?.targetName).toBe('Dragão Branco de Olhos Azuis');

      expect(p1.monsterZones[0]?.isFaceDown).toBe(false);
      expect(p1.monsterZones[0]?.position).toBe('ATTACK');
      expect(p1.monsterZones[0]?.hasChangedPositionThisTurn).toBe(true);

      // Efeito FLIP destruiu o monstro mais forte do oponente (Blue-Eyes)
      expect(p2.monsterZones[0]).toBeNull();
      expect(p2.graveyard.some((c) => c.uid === 'blue_eyes_p2')).toBe(true);
    });

    it('Teste 9: Flip por combate interrompe o ataque do agressor antes do cálculo de dano e mantém o defensor vivo', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Kaiba possui Man-Eater Bug virado para baixo em DEFENSE (DEF 600)
      kaiba.monsterZones[0] = {
        uid: 'meb_face_down',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi possui Blue-Eyes White Dragon em ATTACK (ATK 3000)
      yugi.monsterZones[0] = {
        uid: 'blue_eyes_attacker',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.phase = 'BATTLE';
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;

      // Act: Blue-Eyes ataca o Man-Eater Bug virado para baixo
      const attackSuccess = session.declareAttack(0, 0);

      // Assert:
      // 1. O ataque é declarado com sucesso
      expect(attackSuccess).toBe(true);
      // 2. O monstro virado para baixo foi revelado
      expect(kaiba.monsterZones[0]?.isFaceDown).toBe(false);
      // 3. Efeito FLIP destruiu o atacante Blue-Eyes White Dragon (enviado ao cemitério de Yugi)
      expect(yugi.monsterZones[0]).toBeNull();
      expect(yugi.graveyard.some((c) => c.uid === 'blue_eyes_attacker')).toBe(true);
      // 4. Ataque foi INTERROMPIDO: Man-Eater Bug não sofre dano e permanece VIVO no campo!
      expect(kaiba.monsterZones[0]?.uid).toBe('meb_face_down');
      expect(kaiba.graveyard.some((c) => c.uid === 'meb_face_down')).toBe(false);
      // 5. Nenhum dano de batalha foi aplicado aos LPs
      expect(kaiba.lifePoints).toBe(8000);
      expect(yugi.lifePoints).toBe(8000);
    });
  });

  describe('Regression Tests: FLIP Effects & Face-Down State Consistency', () => {
    it('Teste 1: Soldado Pinguim não é destruído e devolve atacante', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Kaiba possui Blue-Eyes White Dragon (3000 ATK) em ATTACK
      kaiba.monsterZones[0] = {
        uid: 'kaiba_blue_eyes_attacker',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi possui Penguin Soldier virado para baixo (isFaceDown = true) em DEFENSE
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_soldier',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Configura turno de ataque de Kaiba (Turno 2, Battle Phase)
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: Kaiba declara ataque contra o Penguin Soldier (zona 0)
      const attackSuccess = session.declareAttack(0, 0);

      // Assert
      // 1. O ataque tem sucesso e dispara o efeito FLIP
      expect(attackSuccess).toBe(true);

      // 2. O atacante (Blue-Eyes) é removido da zona de monstros e adicionado à mão do Kaiba
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_blue_eyes_attacker')).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === 'kaiba_blue_eyes_attacker')).toBe(false);

      // 3. O defensor (Penguin Soldier) PERMANECE VIVO na zona de monstro de Yugi e com isFaceDown === false
      expect(yugi.monsterZones[0]).not.toBeNull();
      expect(yugi.monsterZones[0]?.uid).toBe('yugi_penguin_soldier');
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.graveyard.some((c) => c.uid === 'yugi_penguin_soldier')).toBe(false);

      // 4. Nenhum dano de batalha é aplicado aos LPs de Yugi
      expect(yugi.lifePoints).toBe(8000);
      expect(kaiba.lifePoints).toBe(8000);
    });

    it('Teste 2: Flip manual do Man-Eater Bug ativa efeito e retorna dados do alvo', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi baixa Man-Eater Bug no Turno 1 em DEFENSE virado para baixo
      const mebCard = {
        uid: 'yugi_meb_set_1',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.hand.push(mebCard);

      // Invocação set (Face-Down) no Turno 1 por Yugi
      const summonSuccess = session.normalSummon(mebCard.uid, 0, 'DEFENSE', [], true);
      expect(summonSuccess).toBe(true);
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(true);
      expect(yugi.monsterZones[0]?.turnSet).toBe(1);

      // Kaiba possui Vorse Raider (1900 ATK) em campo
      kaiba.monsterZones[0] = {
        uid: 'kaiba_vorse_raider_target',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Simula o avanço de turno para o Turno 3 (turno de Yugi, Main Phase 1)
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Yugi clica para mudar a posição (Flip Manual / Invocação por Virar)
      const changeResult = session.changeMonsterPosition(0);

      // Assert
      // 1. O método retorna { success: true, flipped: true, flipEffect: { action: 'DESTROY_MONSTER', ... } }
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect).toBeDefined();
      expect(changeResult.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(changeResult.flipEffect?.targetCardUid).toBe('kaiba_vorse_raider_target');

      // 2. O Man-Eater Bug é revelado (isFaceDown === false) em ATTACK
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.monsterZones[0]?.position).toBe('ATTACK');

      // 3. O Vorse Raider do Kaiba é removido do campo e enviado ao cemitério
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === 'kaiba_vorse_raider_target')).toBe(true);
    });

    it('Teste 3: Soldado Pinguim devolve automaticamente todos os monstros se oponente tiver <= 2 monstros', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi tem Penguin Soldier virado para baixo no Turno 1
      yugi.monsterZones[0] = {
        uid: 'penguin_yugi',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Kaiba tem exatamente 2 monstros no campo (Blue-Eyes e Vorse Raider)
      kaiba.monsterZones[0] = {
        uid: 'kaiba_blue_eyes',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'kaiba_vorse',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Flip manual do Penguin Soldier (sem passar alvos específicos)
      const res = session.changeMonsterPosition(0);

      // Assert: Ambos os 2 monstros devem ser devolvidos para a mão de Kaiba
      expect(res.success).toBe(true);
      expect(res.flipped).toBe(true);
      expect(res.flipEffect?.action).toBe('RETURN_TO_HAND');
      expect(res.flipEffect?.targetCardUids).toEqual(['kaiba_blue_eyes', 'kaiba_vorse']);

      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_blue_eyes')).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_vorse')).toBe(true);
    });

    it('Teste 4: Soldado Pinguim devolve exatamente os alvos especificados quando oponente tiver > 2 monstros', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      yugi.monsterZones[0] = {
        uid: 'penguin_yugi',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Kaiba tem 3 monstros no campo: Blue-Eyes (3000), Vorse Raider (1900), Battle Ox (1700)
      kaiba.monsterZones[0] = {
        uid: 'kaiba_blue_eyes',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'kaiba_vorse',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[2] = {
        uid: 'kaiba_ox',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Usuário seleciona especificamente Vorse Raider e Battle Ox para devolver
      const res = session.changeMonsterPosition(0, ['kaiba_vorse', 'kaiba_ox']);

      // Assert
      expect(res.success).toBe(true);
      expect(res.flipped).toBe(true);
      expect(res.flipEffect?.targetCardUids).toEqual(['kaiba_vorse', 'kaiba_ox']);

      expect(kaiba.monsterZones[0]?.uid).toBe('kaiba_blue_eyes'); // Permaneceu no campo!
      expect(kaiba.monsterZones[1]).toBeNull(); // Devolvido!
      expect(kaiba.monsterZones[2]).toBeNull(); // Devolvido!
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_vorse')).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_ox')).toBe(true);
    });

    it('Teste 5: Soldado Pinguim seleciona automaticamente os 2 monstros de maior ATK se oponente tiver > 2 monstros e nenhum alvo for fornecido (Bot)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const kaiba = session.player2;
      const yugi = session.player1;

      // Bot (Kaiba) tem Penguin Soldier
      kaiba.monsterZones[0] = {
        uid: 'penguin_kaiba',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi tem 3 monstros: Dark Magician (2500), Summoned Skull (2500), Beaver Warrior (1200)
      yugi.monsterZones[0] = {
        uid: 'yugi_dark_magician',
        data: CLASSIC_CARDS.DARK_MAGICIAN,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[1] = {
        uid: 'yugi_beaver',
        data: CLASSIC_CARDS.BEAVER_WARRIOR,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[2] = {
        uid: 'yugi_skull',
        data: CLASSIC_CARDS.SUMMONED_SKULL,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 4;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'MAIN1';

      // Act: Flip pelo Bot sem selectedTargetUids
      const res = session.changeMonsterPosition(0);

      // Assert: Deve devolver os 2 maiores (Dark Magician e Summoned Skull, ambos 2500), deixando o Beaver Warrior (1200)
      expect(res.success).toBe(true);
      expect(res.flipped).toBe(true);
      expect(res.flipEffect?.targetCardUids).toContain('yugi_dark_magician');
      expect(res.flipEffect?.targetCardUids).toContain('yugi_skull');
      expect(res.flipEffect?.targetCardUids).not.toContain('yugi_beaver');

      expect(yugi.monsterZones[0]).toBeNull();
      expect(yugi.monsterZones[2]).toBeNull();
      expect(yugi.monsterZones[1]?.uid).toBe('yugi_beaver');
    });

    it('Teste A (Auto-resolução com <= 2 monstros): Oponente ataca com Blue-Eyes e retorna automaticamente para a mão', () => {
      // Arrange: Oponente (Kaiba) tem 1 monstro atacante (Blue-Eyes). O jogador (Yugi) defende com Soldado Pinguim virado para baixo.
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Oponente tem 1 monstro atacante (Blue-Eyes, 3000 ATK) em ATTACK
      kaiba.monsterZones[0] = {
        uid: 'kaiba_blue_eyes_single_atk',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Jogador (Yugi) defende com Soldado Pinguim virado para baixo em DEFENSE
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_soldier_auto',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: Oponente ataca
      const attackSuccess = session.declareAttack(0, 0);

      // Assert:
      // O ataque foi declarado e o efeito FLIP executado
      expect(attackSuccess).toBe(true);
      // O Blue-Eyes retorna automaticamente para a mão sem requerer interação pendente
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_blue_eyes_single_atk')).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === 'kaiba_blue_eyes_single_atk')).toBe(false);
      // Soldado Pinguim permanece em campo
      expect(yugi.monsterZones[0]).not.toBeNull();
      expect(yugi.monsterZones[0]?.uid).toBe('yugi_penguin_soldier_auto');
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.graveyard.some((c) => c.uid === 'yugi_penguin_soldier_auto')).toBe(false);
      // Sem dano aos LPs
      expect(yugi.lifePoints).toBe(8000);
      expect(kaiba.lifePoints).toBe(8000);
    });

    it('Teste B (Seleção quando > 2 monstros): Efeito do Soldado Pinguim é acionado com seleção de alvos [Blue-Eyes, Vorse Raider]', () => {
      // Arrange: Oponente (Kaiba) tem 3 monstros em campo (Blue-Eyes, Vorse Raider e Battle Ox)
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Kaiba possui 3 monstros no campo
      kaiba.monsterZones[0] = {
        uid: 'kaiba_blue_eyes_target_1',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'kaiba_vorse_raider_target_2',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[2] = {
        uid: 'kaiba_battle_ox_remain',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi possui Soldado Pinguim baixado no Turno 1 virado para baixo
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_manual_selection',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Efeito do Soldado Pinguim é acionado com seleção de alvos [Blue-Eyes, Vorse Raider]
      const changeResult = session.changeMonsterPosition(0, [
        'kaiba_blue_eyes_target_1',
        'kaiba_vorse_raider_target_2',
      ]);

      // Assert:
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.action).toBe('RETURN_TO_HAND');
      expect(changeResult.flipEffect?.targetCardUids).toEqual([
        'kaiba_blue_eyes_target_1',
        'kaiba_vorse_raider_target_2',
      ]);

      // Exatamente os 2 alvos selecionados retornam para a mão do oponente
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_blue_eyes_target_1')).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_vorse_raider_target_2')).toBe(true);

      // O terceiro (Battle Ox) permanece em campo!
      expect(kaiba.monsterZones[2]).not.toBeNull();
      expect(kaiba.monsterZones[2]?.uid).toBe('kaiba_battle_ox_remain');
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_battle_ox_remain')).toBe(false);

      // Soldado Pinguim permanece no campo em posição de ATTACK revelado
      expect(yugi.monsterZones[0]?.uid).toBe('yugi_penguin_manual_selection');
      expect(yugi.monsterZones[0]?.position).toBe('ATTACK');
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
    });
  });

  describe('Regression Suite: Smart Targeting & FLIP Battle Consistency', () => {
    it('Teste 1 (Soldado Pinguim em Combate - Não Morre e Devolve Atacante)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Kaiba ataca com Blue-Eyes (3000 ATK)
      kaiba.monsterZones[0] = {
        uid: 'kaiba_blue_eyes_lunge_atk',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi defende com Soldado Pinguim (500 DEF) virado para baixo
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_soldier_combat',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act
      const attackSuccess = session.declareAttack(0, 0);

      // Assert
      // 1. O ataque tem sucesso e dispara o efeito FLIP
      expect(attackSuccess).toBe(true);

      // 2. Blue-Eyes sai do campo e é adicionado à mão de Kaiba
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_blue_eyes_lunge_atk')).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === 'kaiba_blue_eyes_lunge_atk')).toBe(false);

      // 3. O Soldado Pinguim PERMANECE VIVO na zona de Yugi e isFaceDown === false
      expect(yugi.monsterZones[0]).not.toBeNull();
      expect(yugi.monsterZones[0]?.uid).toBe('yugi_penguin_soldier_combat');
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.graveyard.some((c) => c.uid === 'yugi_penguin_soldier_combat')).toBe(false);

      // 4. Yugi não sofre nenhum dano aos Life Points
      expect(yugi.lifePoints).toBe(8000);
      expect(kaiba.lifePoints).toBe(8000);
    });

    it('Teste 2 (Smart Targeting do Soldado Pinguim - <= 2 alvos é Automático)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Oponente possui exatamente 2 monstros em campo
      kaiba.monsterZones[0] = {
        uid: 'kaiba_beater_1',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'kaiba_beater_2',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Soldado Pinguim é flipado sem passar alvos manuais
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_auto_2',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Executa o efeito FLIP sem passar alvos manuais
      const changeResult = session.changeMonsterPosition(0);

      // Assert
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.action).toBe('RETURN_TO_HAND');
      // Ambos os monstros do oponente retornam automaticamente para a mão sem estado de interação pendente
      expect(changeResult.flipEffect?.targetCardUids).toEqual(['kaiba_beater_1', 'kaiba_beater_2']);
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_beater_1')).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === 'kaiba_beater_2')).toBe(true);
    });

    it('Teste 3 (Smart Targeting do Soldado Pinguim - > 2 alvos é Seletivo)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Oponente possui 3 monstros (Monstro A, Monstro B, Monstro C)
      kaiba.monsterZones[0] = {
        uid: 'monster_A',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'monster_B',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[2] = {
        uid: 'monster_C',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Soldado Pinguim no campo de Yugi
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_selective',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Executa o efeito com os alvos selecionados [uidA, uidB]
      const changeResult = session.changeMonsterPosition(0, ['monster_A', 'monster_B']);

      // Assert
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.targetCardUids).toEqual(['monster_A', 'monster_B']);

      // Apenas os monstros A e B retornam para a mão
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === 'monster_A')).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === 'monster_B')).toBe(true);

      // O Monstro C permanece intacto no campo
      expect(kaiba.monsterZones[2]).not.toBeNull();
      expect(kaiba.monsterZones[2]?.uid).toBe('monster_C');
      expect(kaiba.hand.some((c) => c.uid === 'monster_C')).toBe(false);
    });

    it('Teste 4 (Smart Targeting do Man-Eater Bug - Destruição de 1 Alvo Escolhido)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Oponente possui 2 monstros (Vorse Raider e Blue-Eyes)
      const vorseUid = 'kaiba_vorse_spared';
      const blueEyesUid = 'kaiba_blue_eyes_chosen_target';

      kaiba.monsterZones[0] = {
        uid: vorseUid,
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaiba.monsterZones[1] = {
        uid: blueEyesUid,
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi possui Man-Eater Bug virado para baixo do turno anterior
      yugi.monsterZones[0] = {
        uid: 'yugi_meb_selective',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Yugi flipa Man-Eater Bug escolhendo blueEyesUid
      const changeResult = session.changeMonsterPosition(0, [blueEyesUid]);

      // Assert
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(changeResult.flipEffect?.targetCardUid).toBe(blueEyesUid);

      // O Blue-Eyes é destruído e enviado ao cemitério
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === blueEyesUid)).toBe(true);

      // O Vorse Raider permanece intacto no campo
      expect(kaiba.monsterZones[0]).not.toBeNull();
      expect(kaiba.monsterZones[0]?.uid).toBe(vorseUid);
      expect(kaiba.graveyard.some((c) => c.uid === vorseUid)).toBe(false);
    });

    it('Teste 5 (Flip Manual do Man-Eater Bug)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi tem Man-Eater Bug virado para baixo do turno anterior
      yugi.monsterZones[0] = {
        uid: 'yugi_meb_manual',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Kaiba tem Vorse Raider em campo
      const vorseRaiderUid = 'kaiba_vorse_victim';
      kaiba.monsterZones[0] = {
        uid: vorseRaiderUid,
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act
      const changeResult = session.changeMonsterPosition(0);

      // Assert
      // Retorna { success: true, flipped: true, flipEffect: { action: 'DESTROY_MONSTER', targetCardUid: vorseRaiderUid } }
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect).toBeDefined();
      expect(changeResult.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(changeResult.flipEffect?.targetCardUid).toBe(vorseRaiderUid);

      // Vorse Raider vai para o cemitério de Kaiba
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === vorseRaiderUid)).toBe(true);
    });
  });

  describe('Regression Suite: Multi-Target Selection & Smart Targeting Logic', () => {
    it('Teste 1 (Soldado Pinguim contra 5 monstros exige e respeita a seleção de 2 alvos)', () => {
      // Arrange: Oponente possui 5 monstros em campo (Zonas 0 a 4). O jogador ativa o Soldado Pinguim (maxTargets = 2)
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Preenche as 5 zonas de monstros do oponente (Kaiba)
      const monster0 = {
        uid: 'kaiba_slot_0',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const monster1 = {
        uid: 'kaiba_slot_1_target',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const monster2 = {
        uid: 'kaiba_slot_2',
        data: CLASSIC_CARDS.LA_JINN,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const monster3 = {
        uid: 'kaiba_slot_3_target',
        data: CLASSIC_CARDS.OPTICLOPS,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const monster4 = {
        uid: 'kaiba_slot_4',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaiba.monsterZones[0] = monster0;
      kaiba.monsterZones[1] = monster1;
      kaiba.monsterZones[2] = monster2;
      kaiba.monsterZones[3] = monster3;
      kaiba.monsterZones[4] = monster4;

      // Yugi possui Soldado Pinguim virado para baixo do turno anterior
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_multi_5',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: O jogador fornece a seleção explícita de 2 alvos: [monster1.uid, monster3.uid]
      const changeResult = session.changeMonsterPosition(0, [monster1.uid, monster3.uid]);

      // Assert:
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.action).toBe('RETURN_TO_HAND');
      expect(changeResult.flipEffect?.targetCardUids).toEqual([monster1.uid, monster3.uid]);

      // Exatamente os 2 monstros escolhidos retornam para a mão do oponente
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.monsterZones[3]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === monster1.uid)).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === monster3.uid)).toBe(true);

      // As zonas 0, 2 e 4 continuam ocupadas pelos seus respectivos monstros
      expect(kaiba.monsterZones[0]?.uid).toBe(monster0.uid);
      expect(kaiba.monsterZones[2]?.uid).toBe(monster2.uid);
      expect(kaiba.monsterZones[4]?.uid).toBe(monster4.uid);

      // Nenhuma carta foi devolvida arbitrariamente pelo motor
      expect(kaiba.hand.some((c) => c.uid === monster0.uid)).toBe(false);
      expect(kaiba.hand.some((c) => c.uid === monster2.uid)).toBe(false);
      expect(kaiba.hand.some((c) => c.uid === monster4.uid)).toBe(false);
    });

    it('Teste 2 (Inseto Come-Homem contra múltiplos monstros destrói apenas o 1 alvo selecionado)', () => {
      // Arrange: Oponente possui 3 monstros em campo. Man-Eater Bug (maxTargets = 1) é ativado selecionando o monstro da zona 1.
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      const monsterZone0 = {
        uid: 'kaiba_m0',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const monsterZone1 = {
        uid: 'kaiba_m1_target_destroy',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const monsterZone2 = {
        uid: 'kaiba_m2',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaiba.monsterZones[0] = monsterZone0;
      kaiba.monsterZones[1] = monsterZone1;
      kaiba.monsterZones[2] = monsterZone2;

      // Yugi possui Man-Eater Bug virado para baixo do turno anterior
      yugi.monsterZones[0] = {
        uid: 'yugi_meb_target_1',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Executa a destruição com targetUid = monsterZone1.uid
      const changeResult = session.changeMonsterPosition(0, [monsterZone1.uid]);

      // Assert:
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(changeResult.flipEffect?.targetCardUid).toBe(monsterZone1.uid);

      // Apenas o monstro da zona 1 é enviado ao cemitério
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === monsterZone1.uid)).toBe(true);

      // Os monstros da zona 0 e 2 permanecem intactos no campo
      expect(kaiba.monsterZones[0]?.uid).toBe(monsterZone0.uid);
      expect(kaiba.monsterZones[2]?.uid).toBe(monsterZone2.uid);
      expect(kaiba.graveyard.some((c) => c.uid === monsterZone0.uid)).toBe(false);
      expect(kaiba.graveyard.some((c) => c.uid === monsterZone2.uid)).toBe(false);
    });

    it('Teste 3 (Auto-resolução quando a mesa tem <= limite do efeito)', () => {
      // Arrange & Act Parte A: Soldado Pinguim (maxTargets = 2) contra exatamente 2 monstros
      const sessionA = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugiA = sessionA.player1;
      const kaibaA = sessionA.player2;

      const cardA1 = {
        uid: 'kaiba_auto_p1',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const cardA2 = {
        uid: 'kaiba_auto_p2',
        data: CLASSIC_CARDS.LA_JINN,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaibaA.monsterZones[0] = cardA1;
      kaibaA.monsterZones[1] = cardA2;

      yugiA.monsterZones[0] = {
        uid: 'penguin_auto_resolve',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      sessionA.matchState.currentTurn = 3;
      sessionA.matchState.activePlayerId = yugiA.id;
      sessionA.matchState.phase = 'MAIN1';

      // Act Parte A: Ativação do Soldado Pinguim sem array de seleção prévia
      const resA = sessionA.changeMonsterPosition(0);

      // Assert Parte A:
      expect(resA.success).toBe(true);
      expect(resA.flipped).toBe(true);
      expect(resA.flipEffect?.action).toBe('RETURN_TO_HAND');
      expect(resA.flipEffect?.targetCardUids).toEqual([cardA1.uid, cardA2.uid]);
      expect(kaibaA.monsterZones[0]).toBeNull();
      expect(kaibaA.monsterZones[1]).toBeNull();
      expect(kaibaA.hand.some((c) => c.uid === cardA1.uid)).toBe(true);
      expect(kaibaA.hand.some((c) => c.uid === cardA2.uid)).toBe(true);

      // Arrange & Act Parte B: Inseto Come-Homem (maxTargets = 1) contra exatamente 1 monstro
      const sessionB = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugiB = sessionB.player1;
      const kaibaB = sessionB.player2;

      const cardB1 = {
        uid: 'kaiba_single_target',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaibaB.monsterZones[0] = cardB1;

      yugiB.monsterZones[0] = {
        uid: 'meb_auto_resolve',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      sessionB.matchState.currentTurn = 3;
      sessionB.matchState.activePlayerId = yugiB.id;
      sessionB.matchState.phase = 'MAIN1';

      // Act Parte B: Ativação do Man-Eater Bug sem array de seleção prévia
      const resB = sessionB.changeMonsterPosition(0);

      // Assert Parte B:
      expect(resB.success).toBe(true);
      expect(resB.flipped).toBe(true);
      expect(resB.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(resB.flipEffect?.targetCardUid).toBe(cardB1.uid);
      expect(kaibaB.monsterZones[0]).toBeNull();
      expect(kaibaB.graveyard.some((c) => c.uid === cardB1.uid)).toBe(true);
    });
  });

  describe('Regression Suite: Smart Multi-Target Selection on Combat & Flip', () => {
    it('Teste 1 (Soldado Pinguim atacado com 5 monstros na mesa do oponente)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Oponente tem 5 monstros em campo (zonas 0 a 4), sendo a zona 0 o atacante (Blue-Eyes)
      const m0 = {
        uid: 'combat_blue_eyes_attacker',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const m1 = {
        uid: 'combat_m1_target_return',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const m2 = {
        uid: 'combat_m2_stay',
        data: CLASSIC_CARDS.LA_JINN,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const m3 = {
        uid: 'combat_m3_stay',
        data: CLASSIC_CARDS.OPTICLOPS,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const m4 = {
        uid: 'combat_m4_stay',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaiba.monsterZones[0] = m0;
      kaiba.monsterZones[1] = m1;
      kaiba.monsterZones[2] = m2;
      kaiba.monsterZones[3] = m3;
      kaiba.monsterZones[4] = m4;

      // O jogador defende com Soldado Pinguim virado para baixo
      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_combat_defense',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: O ataque ocorre passando a seleção dos 2 alvos desejados pelo defensor: [m0.uid, m1.uid]
      const attackSuccess = session.declareAttack(0, 0, [m0.uid, m1.uid]);

      // Assert:
      expect(attackSuccess).toBe(true);

      // Exatamente os 2 alvos selecionados retornam para a mão do oponente
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === m0.uid)).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === m1.uid)).toBe(true);

      // Os outros 3 monstros permanecem no campo
      expect(kaiba.monsterZones[2]?.uid).toBe(m2.uid);
      expect(kaiba.monsterZones[3]?.uid).toBe(m3.uid);
      expect(kaiba.monsterZones[4]?.uid).toBe(m4.uid);
      expect(kaiba.hand.some((c) => c.uid === m2.uid)).toBe(false);
      expect(kaiba.hand.some((c) => c.uid === m3.uid)).toBe(false);
      expect(kaiba.hand.some((c) => c.uid === m4.uid)).toBe(false);

      // Como o atacante foi um dos devolvidos, o combate foi cancelado e o Soldado Pinguim permaneceu vivo
      expect(yugi.monsterZones[0]).not.toBeNull();
      expect(yugi.monsterZones[0]?.uid).toBe('yugi_penguin_combat_defense');
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.graveyard.some((c) => c.uid === 'yugi_penguin_combat_defense')).toBe(false);
      expect(yugi.lifePoints).toBe(8000);
      expect(kaiba.lifePoints).toBe(8000);
    });

    it('Teste 2 (Soldado Pinguim atacado com <= 2 monstros na mesa)', () => {
      // Arrange: Oponente tem apenas 2 monstros no total
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      const atk0 = {
        uid: 'kaiba_pair_atk0',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const atk1 = {
        uid: 'kaiba_pair_atk1',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaiba.monsterZones[0] = atk0;
      kaiba.monsterZones[1] = atk1;

      yugi.monsterZones[0] = {
        uid: 'yugi_penguin_auto_def',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: Ataque ocorre sem seleção prévia
      const attackSuccess = session.declareAttack(0, 0);

      // Assert:
      expect(attackSuccess).toBe(true);

      // Todos os monstros presentes (2) retornam automaticamente
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === atk0.uid)).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === atk1.uid)).toBe(true);

      // Soldado Pinguim permanece vivo
      expect(yugi.monsterZones[0]?.uid).toBe('yugi_penguin_auto_def');
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.lifePoints).toBe(8000);
      expect(kaiba.lifePoints).toBe(8000);
    });

    it('Teste 3 (Inseto Come-Homem com múltiplos monstros destrói apenas o alvo escolhido)', () => {
      // Arrange: Oponente tem 3 monstros. Inseto Come-Homem é virado e o jogador escolhe especificamente a zona 2
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      const zone0Mon = {
        uid: 'target_zone_0_monster',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const zone1Mon = {
        uid: 'target_zone_1_monster',
        data: CLASSIC_CARDS.LA_JINN,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const zone2Mon = {
        uid: 'target_zone_2_monster',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      kaiba.monsterZones[0] = zone0Mon;
      kaiba.monsterZones[1] = zone1Mon;
      kaiba.monsterZones[2] = zone2Mon;

      yugi.monsterZones[0] = {
        uid: 'meb_picker',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        isFaceDown: true,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Efeito resolve com o targetUid escolhido (zona 2)
      const changeResult = session.changeMonsterPosition(0, [zone2Mon.uid]);

      // Assert:
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(true);
      expect(changeResult.flipEffect?.action).toBe('DESTROY_MONSTER');
      expect(changeResult.flipEffect?.targetCardUid).toBe(zone2Mon.uid);

      // Apenas o monstro da zona 2 é enviado ao cemitério
      expect(kaiba.monsterZones[2]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === zone2Mon.uid)).toBe(true);

      // As zonas 0 e 1 permanecem ocupadas
      expect(kaiba.monsterZones[0]?.uid).toBe(zone0Mon.uid);
      expect(kaiba.monsterZones[1]?.uid).toBe(zone1Mon.uid);
      expect(kaiba.graveyard.some((c) => c.uid === zone0Mon.uid)).toBe(false);
      expect(kaiba.graveyard.some((c) => c.uid === zone1Mon.uid)).toBe(false);
    });
  });

  describe('Spell and Trap Cards Engine Suite', () => {
    it('Teste 1 (Ativação do Pote da Ganância - Pot of Greed)', () => {
      // Arrange: Jogador tem Pot of Greed na mão. Mão possui 5 cartas.
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;

      // Garante que a mão tenha exatamente 5 cartas incluindo o Pot of Greed
      const potOfGreedCard = {
        uid: 'p1_pot_of_greed',
        data: CLASSIC_CARDS.POT_OF_GREED,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Limita a mão a 4 cartas + Pot of Greed (total 5)
      p1.hand = p1.hand.slice(0, 4);
      p1.hand.push(potOfGreedCard);
      expect(p1.hand.length).toBe(5);

      const deckCountBefore = p1.deck.length;

      // Act: session.activateSpell(potOfGreedUid, zoneIndex)
      const activationSuccess = session.activateSpell(potOfGreedCard.uid, 0);

      // Assert:
      expect(activationSuccess).toBe(true);

      // Compra 2 cartas do deck (mão agora tem 6 cartas: 5 - 1 jogada + 2 compradas)
      expect(p1.hand.length).toBe(6);
      expect(p1.deck.length).toBe(deckCountBefore - 2);

      // Pot of Greed vai para o cemitério (player.graveyard)
      expect(p1.graveyard.some((c) => c.uid === potOfGreedCard.uid)).toBe(true);
      expect(p1.hand.some((c) => c.uid === potOfGreedCard.uid)).toBe(false);

      // A zona de magia/armadilha fica livre
      expect(p1.spellTrapZones[0]).toBeNull();
    });

    it('Teste 2 (Ativação do Buraco Negro - Dark Hole)', () => {
      // Arrange: Yugi tem 2 monstros e Kaiba tem 2 monstros em campo
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi tem 2 monstros em campo
      const yugiMon1 = {
        uid: 'yugi_field_mon1',
        data: CLASSIC_CARDS.CELTIC_GUARDIAN,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const yugiMon2 = {
        uid: 'yugi_field_mon2',
        data: CLASSIC_CARDS.FERAL_IMP,
        position: 'DEFENSE' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = yugiMon1;
      yugi.monsterZones[1] = yugiMon2;

      // Kaiba tem 2 monstros em campo
      const kaibaMon1 = {
        uid: 'kaiba_field_mon1',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const kaibaMon2 = {
        uid: 'kaiba_field_mon2',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = kaibaMon1;
      kaiba.monsterZones[1] = kaibaMon2;

      // Adiciona Dark Hole à mão de Yugi
      const darkHoleCard = {
        uid: 'yugi_dark_hole',
        data: CLASSIC_CARDS.DARK_HOLE,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.hand.push(darkHoleCard);

      // Act: Yugi ativa Dark Hole (session.activateSpell(darkHoleUid, zoneIndex))
      const activationSuccess = session.activateSpell(darkHoleCard.uid, 0);

      // Assert:
      expect(activationSuccess).toBe(true);

      // Todos os 4 monstros no campo são destruídos e enviados aos respectivos cemitérios
      expect(yugi.graveyard.some((c) => c.uid === yugiMon1.uid)).toBe(true);
      expect(yugi.graveyard.some((c) => c.uid === yugiMon2.uid)).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === kaibaMon1.uid)).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === kaibaMon2.uid)).toBe(true);

      // Todas as zonas de monstros ficam vazias (null)
      expect(yugi.monsterZones.every((z) => z === null)).toBe(true);
      expect(kaiba.monsterZones.every((z) => z === null)).toBe(true);

      // Dark Hole vai para o cemitério de Yugi
      expect(yugi.graveyard.some((c) => c.uid === darkHoleCard.uid)).toBe(true);
    });

    it('Teste 3 (Baixar Carta Mágica ou Armadilha virada para baixo - Set)', () => {
      // Arrange: Jogador tem Trap Hole na mão
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;

      const trapHoleCard = {
        uid: 'p1_trap_hole',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      p1.hand.push(trapHoleCard);

      // Act: session.setSpellTrap(trapHoleUid, zoneIndex)
      const setSuccess = session.setSpellTrap(trapHoleCard.uid, 2);

      // Assert:
      expect(setSuccess).toBe(true);

      // A carta é removida da mão e colocada em player.spellTrapZones[zoneIndex]
      expect(p1.hand.some((c) => c.uid === trapHoleCard.uid)).toBe(false);
      expect(p1.spellTrapZones[2]).not.toBeNull();
      expect(p1.spellTrapZones[2]?.uid).toBe(trapHoleCard.uid);

      // Possui isFaceDown === true
      expect(p1.spellTrapZones[2]?.isFaceDown).toBe(true);
      expect(p1.spellTrapZones[2]?.turnSet).toBe(session.matchState.currentTurn);
    });

    it('Teste 4 (Trap Hole baixada no turno anterior destrói monstro inimigo recém-invocado com ATK >= 1000)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi baixou Trap Hole no turno 1
      const trapHole = {
        uid: 'yugi_trap_hole',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.spellTrapZones[0] = trapHole;

      // Avança para o turno 2 (Turno de Kaiba)
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'MAIN1';

      // Kaiba invoca Vorse Raider (ATK 1900 >= 1000)
      const vorseRaider = {
        uid: 'kaiba_vorse_raider',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = vorseRaider;

      // Act: Yugi ativa a Trap Hole em resposta à invocação de Vorse Raider
      const activationSuccess = session.activateTrap(trapHole.uid, vorseRaider.uid);

      // Assert
      expect(activationSuccess).toBe(true);

      // O monstro de Kaiba é destruído e enviado ao cemitério
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === vorseRaider.uid)).toBe(true);

      // A Trap Hole vai para o cemitério de Yugi e sai da zona de Magia/Armadilha
      expect(yugi.spellTrapZones[0]).toBeNull();
      expect(yugi.graveyard.some((c) => c.uid === trapHole.uid)).toBe(true);
    });

    it('Teste 5 (Trap Hole NÃO pode ser ativada no mesmo turno em que foi baixada)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi baixou Trap Hole no turno 1
      const trapHole = {
        uid: 'yugi_trap_hole_same_turn',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 1, // Set no turno 1
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.spellTrapZones[0] = trapHole;

      // O turno atual ainda é o Turno 1
      session.matchState.currentTurn = 1;
      session.matchState.activePlayerId = yugi.id;

      // Monstro alvo qualquer invocado no turno 1
      const enemyMonster = {
        uid: 'kaiba_summoned_mon',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = enemyMonster;

      // Act: Tentativa de ativar a armadilha no mesmo turno que foi baixada
      const activationSuccess = session.activateTrap(trapHole.uid, enemyMonster.uid);

      // Assert
      expect(activationSuccess).toBe(false);

      // A armadilha permanece intacta virada para baixo no campo
      expect(yugi.spellTrapZones[0]).not.toBeNull();
      expect(yugi.spellTrapZones[0]?.uid).toBe(trapHole.uid);
      expect(yugi.spellTrapZones[0]?.isFaceDown).toBe(true);

      // O monstro inimigo permanece no campo
      expect(kaiba.monsterZones[0]).not.toBeNull();
      expect(kaiba.monsterZones[0]?.uid).toBe(enemyMonster.uid);
    });

    it('Teste 6 (Trap Hole NÃO pode ser ativada contra monstro com ATK < 1000)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi baixou Trap Hole no turno 1
      const trapHole = {
        uid: 'yugi_trap_hole_vs_weak',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.spellTrapZones[0] = trapHole;

      // Turno 2 (Turno de Kaiba)
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'MAIN1';

      // Kaiba invoca Kuriboh (ATK 300 < 1000)
      const kuriboh = {
        uid: 'kaiba_kuriboh',
        data: CLASSIC_CARDS.KURIBOH,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = kuriboh;

      // Act: Tentativa de ativar Trap Hole contra o Kuriboh (ATK 300)
      const activationSuccess = session.activateTrap(trapHole.uid, kuriboh.uid);

      // Assert
      expect(activationSuccess).toBe(false);

      // Kuriboh permanece vivo no campo
      expect(kaiba.monsterZones[0]).not.toBeNull();
      expect(kaiba.monsterZones[0]?.uid).toBe(kuriboh.uid);
      expect(kaiba.graveyard.some((c) => c.uid === kuriboh.uid)).toBe(false);

      // Trap Hole permanece virada para baixo no campo de Yugi
      expect(yugi.spellTrapZones[0]).not.toBeNull();
      expect(yugi.spellTrapZones[0]?.uid).toBe(trapHole.uid);
      expect(yugi.spellTrapZones[0]?.isFaceDown).toBe(true);
      expect(yugi.graveyard.some((c) => c.uid === trapHole.uid)).toBe(false);
    });

    it('Teste 7 (canActivateTrapHole e activateTrapHole métodos dedicados)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi baixou Trap Hole no turno 1
      const trapHole = {
        uid: 'yugi_trap_hole_method_test',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.spellTrapZones[2] = trapHole;

      // Turno 2 (Turno de Kaiba)
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'MAIN1';

      // Kaiba invoca Vorse Raider (ATK 1900 >= 1000) na zona 1
      const vorseRaider = {
        uid: 'kaiba_vorse_raider_summoned',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = vorseRaider;

      // Act 1: canActivateTrapHole
      const checkResult = session.canActivateTrapHole(vorseRaider, yugi.id);
      expect(checkResult.canActivate).toBe(true);
      expect(checkResult.trapZoneIndex).toBe(2);

      // Act 2: activateTrapHole
      const activateSuccess = session.activateTrapHole(yugi.id, checkResult.trapZoneIndex, 1);
      expect(activateSuccess).toBe(true);

      // Assert:
      // Trap Hole enviada para o cemitério de Yugi e removida da zona
      expect(yugi.spellTrapZones[2]).toBeNull();
      expect(yugi.graveyard.some((c) => c.uid === trapHole.uid)).toBe(true);

      // Vorse Raider destruído e enviado para o cemitério de Kaiba
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === vorseRaider.uid)).toBe(true);
    });

    it('Teste 8 (canActivateTrapHole retorna falso se Trap Hole foi baixada no mesmo turno)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi baixou Trap Hole no turno 2 (mesmo turno atual)
      const trapHole = {
        uid: 'yugi_trap_hole_same_turn',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.spellTrapZones[0] = trapHole;

      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;

      const vorseRaider = {
        uid: 'kaiba_vorse_raider_2',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = vorseRaider;

      // Act & Assert
      const checkResult = session.canActivateTrapHole(vorseRaider, yugi.id);
      expect(checkResult.canActivate).toBe(false);
      expect(checkResult.trapZoneIndex).toBe(-1);

      const activateResult = session.activateTrapHole(yugi.id, 0, 0);
      expect(activateResult).toBe(false);
    });

    it('Teste 9: Tentar chamar normalSummon com uma Carta Mágica retorna false e não altera monsterZones', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;

      // Adiciona Pot of Greed e Dark Hole à mão do jogador
      const potOfGreed = {
        uid: 'p1_pot_of_greed_summon_attempt',
        data: CLASSIC_CARDS.POT_OF_GREED,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(potOfGreed);

      const darkHole = {
        uid: 'p1_dark_hole_summon_attempt',
        data: CLASSIC_CARDS.DARK_HOLE,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(darkHole);

      expect(player.monsterZones[0]).toBeNull();
      const initialHandCount = player.hand.length;

      // Act 1: Tenta invocar Pot of Greed na zona de monstro 0
      const summonPotResult = session.normalSummon(potOfGreed.uid, 0, 'ATTACK', []);

      // Assert 1: Deve falhar, manter a zona nula e manter a carta na mão
      expect(summonPotResult).toBe(false);
      expect(player.monsterZones[0]).toBeNull();
      expect(player.hand.some((c) => c.uid === potOfGreed.uid)).toBe(true);
      expect(player.hasNormalSummonedThisTurn).toBe(false);

      // Act 2: Tenta invocar Dark Hole na zona de monstro 1
      const summonDarkHoleResult = session.normalSummon(darkHole.uid, 1, 'DEFENSE', []);

      // Assert 2: Deve falhar, manter a zona nula e não consumir a invocação normal
      expect(summonDarkHoleResult).toBe(false);
      expect(player.monsterZones[1]).toBeNull();
      expect(player.hand.some((c) => c.uid === darkHole.uid)).toBe(true);
      expect(player.hand.length).toBe(initialHandCount);
      expect(player.hasNormalSummonedThisTurn).toBe(false);
    });

    it('Teste 10: Tentar chamar normalSummon com uma Carta Armadilha retorna false e a carta permanece na mão', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;

      // Adiciona Trap Hole à mão do jogador
      const trapHole = {
        uid: 'p1_trap_hole_summon_attempt',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(trapHole);

      expect(player.monsterZones[2]).toBeNull();
      const initialHandCount = player.hand.length;

      // Act: Tenta invocar Trap Hole na zona de monstro 2
      const summonTrapResult = session.normalSummon(trapHole.uid, 2, 'ATTACK', []);

      // Assert:
      // Retorna false, a carta permanece na mão, a zona continua vazia e hasNormalSummonedThisTurn não é ativado
      expect(summonTrapResult).toBe(false);
      expect(player.monsterZones[2]).toBeNull();
      expect(player.hand.some((c) => c.uid === trapHole.uid)).toBe(true);
      expect(player.hand.length).toBe(initialHandCount);
      expect(player.hasNormalSummonedThisTurn).toBe(false);
    });

    it('Teste 11 (Face-up FLIP Defense: Atacar Man-Eater Bug de face para cima em defesa NÃO deve acionar o efeito FLIP)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;
      const p2 = session.player2;

      // Kaiba (p2) tem Man-Eater Bug virado DE FACE PARA CIMA (isFaceDown: false) em DEFENSE
      p2.monsterZones[0] = {
        uid: 'man_eater_bug_face_up_def',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Yugi (p1) tem Blue-Eyes White Dragon em ATTACK (3000 ATK)
      p1.monsterZones[0] = {
        uid: 'blue_eyes_attacker',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = p1.id;
      session.matchState.phase = 'BATTLE';

      // Act: Yugi ataca o Man-Eater Bug de face para cima
      const attackSuccess = session.declareAttack(0, 0);

      // Assert:
      // O ataque é bem-sucedido
      expect(attackSuccess).toBe(true);

      // O efeito FLIP NÃO é acionado, logo Blue-Eyes NÃO deve ter sido destruído!
      expect(p1.monsterZones[0]).not.toBeNull();
      expect(p1.monsterZones[0]?.uid).toBe('blue_eyes_attacker');
      expect(p1.graveyard.some((c) => c.uid === 'blue_eyes_attacker')).toBe(false);

      // Man-Eater Bug (600 DEF) é destruído em batalha contra 3000 ATK e enviado para o cemitério de Kaiba
      expect(p2.monsterZones[0]).toBeNull();
      expect(p2.graveyard.some((c) => c.uid === 'man_eater_bug_face_up_def')).toBe(true);
    });

    it('Teste 12 (Set Spell Trap-Lock: Carta Mágica baixada não pode ser ativada no mesmo turno, mas no turno seguinte sim)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const p1 = session.player1;

      // Adiciona Dark Hole à mão de p1
      const darkHole = {
        uid: 'p1_dark_hole_set_test',
        data: CLASSIC_CARDS.DARK_HOLE,
        position: 'ATTACK' as const,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      p1.hand.push(darkHole);

      session.matchState.currentTurn = 1;
      session.matchState.activePlayerId = p1.id;
      session.matchState.phase = 'MAIN1';

      // Baixa Dark Hole na zona 0
      const setResult = session.setSpellTrap(darkHole.uid, 0);
      expect(setResult).toBe(true);
      expect(p1.spellTrapZones[0]?.uid).toBe(darkHole.uid);
      expect(p1.spellTrapZones[0]?.turnSet).toBe(1);

      // Act 1: Tenta ativar Dark Hole no mesmo turno em que foi baixada (Turno 1)
      const activateSameTurn = session.activateSpell(darkHole.uid);

      // Assert 1: Deve retornar false e continuar no campo virada para baixo
      expect(activateSameTurn).toBe(false);
      expect(p1.spellTrapZones[0]).not.toBeNull();
      expect(p1.spellTrapZones[0]?.uid).toBe(darkHole.uid);

      // Act 2: Avança para o turno 3 (próximo turno do jogador p1, turnSet < currentTurn)
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = p1.id;
      session.matchState.phase = 'MAIN1';

      const activateNextTurn = session.activateSpell(darkHole.uid);

      // Assert 2: No turno seguinte a ativação deve ter sucesso e enviar a carta para o cemitério
      expect(activateNextTurn).toBe(true);
      expect(p1.spellTrapZones[0]).toBeNull();
      expect(p1.graveyard.some((c) => c.uid === darkHole.uid)).toBe(true);
    });

    it('Teste 13 (Resolução tática do Man-Eater Bug em Flip Summon: destrói estritamente o alvo selecionado)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi possui Man-Eater Bug virado para baixo em DEFENSE (baixado no turno 1)
      const manEaterBug = {
        uid: 'yugi_meb_tactical',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = manEaterBug;

      // Kaiba possui 3 monstros em campo
      const kaibaMon0 = {
        uid: 'kaiba_mon_0_blue_eyes',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const kaibaMon1 = {
        uid: 'kaiba_mon_1_vorse_raider',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const kaibaMon2 = {
        uid: 'kaiba_mon_2_battle_ox',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 2,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = kaibaMon0;
      kaiba.monsterZones[1] = kaibaMon1;
      kaiba.monsterZones[2] = kaibaMon2;

      // Avança para o turno 3 (Turno de Yugi, MAIN1)
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Yugi realiza Flip Summon do Man-Eater Bug selecionando estritamente kaibaMon1 (Vorse Raider)
      const flipResult = session.changeMonsterPosition(0, [kaibaMon1.uid]);

      // Assert:
      expect(flipResult.success).toBe(true);
      expect(flipResult.flipped).toBe(true);

      // Apenas o alvo selecionado (Vorse Raider) é destruído e vai ao cemitério
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === kaibaMon1.uid)).toBe(true);

      // Monstros não selecionados (Blue-Eyes e Battle Ox) permanecem intactos na mesa
      expect(kaiba.monsterZones[0]).not.toBeNull();
      expect(kaiba.monsterZones[0]?.uid).toBe(kaibaMon0.uid);
      expect(kaiba.graveyard.some((c) => c.uid === kaibaMon0.uid)).toBe(false);

      expect(kaiba.monsterZones[2]).not.toBeNull();
      expect(kaiba.monsterZones[2]?.uid).toBe(kaibaMon2.uid);
      expect(kaiba.graveyard.some((c) => c.uid === kaibaMon2.uid)).toBe(false);

      // Man-Eater Bug virou para cima em modo de ataque e permanece em campo
      expect(yugi.monsterZones[0]?.uid).toBe(manEaterBug.uid);
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.monsterZones[0]?.position).toBe('ATTACK');
    });

    it('Teste 14 (Resolução tática do Man-Eater Bug virado por ataque: destrói atacante antes do cálculo de dano e defensor sobrevive)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi possui Man-Eater Bug virado para baixo em DEFENSE (450 ATK / 600 DEF)
      const manEaterBug = {
        uid: 'yugi_meb_battle_tactical',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = manEaterBug;

      // Kaiba possui 2 monstros: Blue-Eyes (3000 ATK atacante) e Vorse Raider (1900 ATK espectador)
      const blueEyesAttacker = {
        uid: 'kaiba_blue_eyes_attacker',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const vorseRaiderBench = {
        uid: 'kaiba_vorse_bench',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = blueEyesAttacker;
      kaiba.monsterZones[1] = vorseRaiderBench;

      // Turno 2: Turno de Kaiba, Battle Phase
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: Kaiba ataca com Blue-Eyes contra o Man-Eater Bug de Yugi.
      // O defensor Yugi seleciona estritamente o atacante (blueEyesAttacker.uid) como alvo do efeito FLIP.
      const attackSuccess = session.declareAttack(0, 0, [blueEyesAttacker.uid]);

      // Assert:
      expect(attackSuccess).toBe(true);

      // 1. O atacante Blue-Eyes foi destruído pelo efeito FLIP do Man-Eater Bug antes do cálculo de dano
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === blueEyesAttacker.uid)).toBe(true);

      // 2. O defensor Man-Eater Bug NÃO é destruído e PERMANECE VIVO no campo com a face para cima
      expect(yugi.monsterZones[0]).not.toBeNull();
      expect(yugi.monsterZones[0]?.uid).toBe(manEaterBug.uid);
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.graveyard.some((c) => c.uid === manEaterBug.uid)).toBe(false);

      // 3. O monstro espectador Vorse Raider permanece intacto no campo
      expect(kaiba.monsterZones[1]).not.toBeNull();
      expect(kaiba.monsterZones[1]?.uid).toBe(vorseRaiderBench.uid);
      expect(kaiba.graveyard.some((c) => c.uid === vorseRaiderBench.uid)).toBe(false);

      // 4. Nenhum dano de batalha foi sofrido por Yugi
      expect(yugi.lifePoints).toBe(8000);
    });

    it('Teste 15 (Regressão: Monstro colocado de face para cima PODE mudar para posição de defesa no mesmo turno da invocação)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;

      // Invocação Normal de Feral Imp de face para cima em modo de ataque no Turno 1
      const feralImp = {
        uid: 'feral_imp_face_up_turn1',
        data: CLASSIC_CARDS.FERAL_IMP,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.monsterZones[0] = feralImp;
      session.matchState.currentTurn = 1;
      session.matchState.activePlayerId = player.id;
      session.matchState.phase = 'MAIN1';

      // Act: Jogador altera a posição da carta de face para cima para Defesa
      const changeResult = session.changeMonsterPosition(0);

      // Assert:
      expect(changeResult.success).toBe(true);
      expect(changeResult.flipped).toBe(false);
      expect(player.monsterZones[0]?.position).toBe('DEFENSE');
      expect(player.monsterZones[0]?.isFaceDown).toBe(false);

      // Pode voltar para ATAQUE na mesma Main Phase
      const changeBackResult = session.changeMonsterPosition(0);
      expect(changeBackResult.success).toBe(true);
      expect(player.monsterZones[0]?.position).toBe('ATTACK');
    });

    it('Teste 16 (Regressão: Soldado Pinguim atacado virado para baixo devolve o atacante para a mão e defensor sobrevive)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi possui Penguin Soldier virado para baixo em DEFENSE
      const penguinSoldier = {
        uid: 'yugi_penguin_soldier_combat_test',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE' as const,
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = penguinSoldier;

      // Kaiba possui Blue-Eyes White Dragon em ATTACK (3000 ATK)
      const blueEyes = {
        uid: 'kaiba_blue_eyes_attacker_test',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = blueEyes;
      const initialKaibaHandCount = kaiba.hand.length;

      // Turno 2 (Turno de Kaiba), BATTLE Phase
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: Kaiba ataca com Blue-Eyes contra o Penguin Soldier virado para baixo
      const attackSuccess = session.declareAttack(0, 0);

      // Assert:
      expect(attackSuccess).toBe(true);

      // 1. O Blue-Eyes atacante é removido da zona de monstros do oponente
      expect(kaiba.monsterZones[0]).toBeNull();

      // 2. O Blue-Eyes atacante retornou para a mão de Kaiba
      expect(kaiba.hand.some((c) => c.uid === blueEyes.uid)).toBe(true);
      expect(kaiba.hand.length).toBe(initialKaibaHandCount + 1);

      // 3. O defensor Penguin Soldier PERMANECE VIVO no campo de Yugi virado para cima
      expect(yugi.monsterZones[0]).not.toBeNull();
      expect(yugi.monsterZones[0]?.uid).toBe(penguinSoldier.uid);
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.graveyard.some((c) => c.uid === penguinSoldier.uid)).toBe(false);

      // 4. Nenhum dano de batalha foi aplicado aos LPs de Yugi
      expect(yugi.lifePoints).toBe(8000);
    });
  });

  describe('Architecture Audit Regression Suite (D1, D2, D4, D5, D8)', () => {
    it('D1: activateKuriboh arms a battle damage shield so declareAttack destroys the weaker monster while dealing 0 LP damage', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      yugi.monsterZones[0] = {
        uid: 'yugi_celtic_guardian',
        data: CLASSIC_CARDS.CELTIC_GUARDIAN, // 1400 ATK
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.hand.push({
        uid: 'yugi_kuriboh_shield',
        data: CLASSIC_CARDS.KURIBOH,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      });

      kaiba.monsterZones[0] = {
        uid: 'kaiba_vorse_raider',
        data: CLASSIC_CARDS.VORSE_RAIDER, // 1900 ATK
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'BATTLE';

      // Act: Yugi activates Kuriboh before declareAttack resolves
      const shielded = session.activateKuriboh(yugi.id);
      const attackResolved = session.declareAttack(0, 0);

      // Assert: Celtic Guardian is destroyed, Vorse Raider is marked hasAttacked, and Yugi takes 0 LP damage
      expect(shielded).toBe(true);
      expect(attackResolved).toBe(true);
      expect(yugi.monsterZones[0]).toBeNull();
      expect(yugi.graveyard.some((c) => c.uid === 'yugi_celtic_guardian')).toBe(true);
      expect(kaiba.monsterZones[0]?.hasAttacked).toBe(true);
      expect(yugi.lifePoints).toBe(8000);
    });

    it('D2: DuelBot evaluates and plays Pot of Greed, Fissure, sets Trap Hole, and triggers Trap Hole on opponent summon', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Yugi has a face-up monster on field
      yugi.monsterZones[0] = {
        uid: 'yugi_feral_imp',
        data: CLASSIC_CARDS.FERAL_IMP,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Turn 2: Kaiba's Main Phase 1 with Pot of Greed, Fissure, and Trap Hole in hand
      session.matchState.currentTurn = 2;
      session.matchState.activePlayerId = kaiba.id;
      session.matchState.phase = 'MAIN1';
      kaiba.hand = [
        {
          uid: 'bot_pot',
          data: CLASSIC_CARDS.POT_OF_GREED,
          position: 'ATTACK',
          hasAttacked: false,
          hasChangedPositionThisTurn: false,
          turnSummoned: 0,
          monstersDestroyedCount: 0,
          hasAttackedDirectly: false,
        },
        {
          uid: 'bot_fissure',
          data: CLASSIC_CARDS.FISSURE,
          position: 'ATTACK',
          hasAttacked: false,
          hasChangedPositionThisTurn: false,
          turnSummoned: 0,
          monstersDestroyedCount: 0,
          hasAttackedDirectly: false,
        },
        {
          uid: 'bot_trap_hole',
          data: CLASSIC_CARDS.TRAP_HOLE,
          position: 'ATTACK',
          hasAttacked: false,
          hasChangedPositionThisTurn: false,
          turnSummoned: 0,
          monstersDestroyedCount: 0,
          hasAttackedDirectly: false,
        },
      ];

      // Act 1: Bot plays Spells & sets Trap Hole
      DuelBot.evaluateAndPlaySpellsAndTraps(session);

      // Assert 1: Pot of Greed & Fissure were activated, Feral Imp was destroyed, and Trap Hole was set
      expect(kaiba.graveyard.some((c) => c.uid === 'bot_pot')).toBe(true);
      expect(kaiba.graveyard.some((c) => c.uid === 'bot_fissure')).toBe(true);
      expect(yugi.monsterZones[0]).toBeNull();
      expect(kaiba.spellTrapZones.some((c) => c?.uid === 'bot_trap_hole' && c.isFaceDown)).toBe(true);

      // Act 2: Advance to Turn 3 (Yugi's turn); Yugi summons La Jinn (1800 ATK) and Bot triggers Trap Hole
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';
      yugi.hasNormalSummonedThisTurn = false;
      yugi.hand.push({
        uid: 'yugi_la_jinn',
        data: CLASSIC_CARDS.LA_JINN,
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      });

      const summoned = session.normalSummon('yugi_la_jinn', 0, 'ATTACK');
      const trapTriggered = DuelBot.tryActivateTrapHoleOnSummon(session, kaiba.id, 0);

      // Assert 2: La Jinn was destroyed by Bot's Trap Hole
      expect(summoned).toBe(true);
      expect(trapTriggered).toBe(true);
      expect(yugi.monsterZones[0]).toBeNull();
      expect(yugi.graveyard.some((c) => c.uid === 'yugi_la_jinn')).toBe(true);
    });

    it('D4 & D5: Buster Blader counts Hyozanryu (race Dragon), ignores face-down opponent Dragons, and non-BOOST_ATK CONTINUOUS monsters get no Dragon bonus', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      const busterBlader = {
        uid: 'yugi_bb',
        data: CLASSIC_CARDS.BUSTER_BLADER, // 2600 ATK
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const genericContinuousMonster = {
        uid: 'yugi_other_continuous',
        data: {
          ...CLASSIC_CARDS.DARK_MAGICIAN,
          effectType: 'CONTINUOUS' as const,
          effectDefinition: undefined,
        },
        position: 'ATTACK' as const,
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = busterBlader;
      yugi.monsterZones[1] = genericContinuousMonster;

      // Kaiba has 1 face-up Hyozanryu ('Dragon' race, even though name lacks 'Dragon') and 1 face-downoum Dragon
      kaiba.monsterZones[0] = {
        uid: 'kaiba_hyozanryu_faceup',
        data: CLASSIC_CARDS.HYOZANRYU,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[1] = {
        uid: 'kaiba_koumori_facedown',
        data: CLASSIC_CARDS.KOUMORI_DRAGON,
        position: 'DEFENSE',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Act
      const bbEffectiveAtk = session.getEffectiveAttack(busterBlader, yugi, kaiba);
      const otherContinuousAtk = session.getEffectiveAttack(genericContinuousMonster, yugi, kaiba);

      // Assert: Buster Blader gets +500 only from face-up Hyozanryu (2600 + 500 = 3100), not from face-down Koumori Dragon;
      // and genericContinuousMonster remains at base 2500 ATK
      expect(bbEffectiveAtk).toBe(3100);
      expect(otherContinuousAtk).toBe(2500);
    });

    it('D8: normalSummon rejects malformed monster cards with level < 1 gracefully without throwing', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      yugi.hand.push({
        uid: 'malformed_lvl0_monster',
        data: {
          ...CLASSIC_CARDS.KURIBOH,
          level: 0,
        },
        position: 'ATTACK',
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      });

      // Act & Assert
      expect(() => session.normalSummon('malformed_lvl0_monster', 0, 'ATTACK')).not.toThrow();
      expect(session.normalSummon('malformed_lvl0_monster', 0, 'ATTACK')).toBe(false);
    });
  });

  describe('Declarative & Generic Card Effects Resolution Suite (AAA Pattern)', () => {
    it('1. Efeito FLIP Declarativo Genérico (Destruição com Alvo Escolhido): apenas o alvo selecionado é destruído', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Carta mock sem nome específico (ex: "Generic Destroyer Bug") com effectType FLIP e effectDefinition declarativa
      const genericDestroyerBug: CardInstance = {
        uid: 'generic_destroyer_bug_uid',
        data: {
          id: 'mock_flip_destroy_999',
          name: 'Generic Destroyer Bug',
          type: 'Flip Effect Monster',
          level: 2,
          attack: 500,
          defense: 500,
          description: 'FLIP: Target 1 monster on the field; destroy it.',
          effectType: 'FLIP',
          effectDefinition: {
            action: 'DESTROY_MONSTER',
            target: {
              scope: 'OPPONENT_MONSTERS',
              maxTargets: 1,
            },
          },
        },
        position: 'DEFENSE',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = genericDestroyerBug;

      // Invoque 2 monstros no oponente (Kaiba)
      const opponentMonster1: CardInstance = {
        uid: 'opponent_mon_1_uid',
        data: CLASSIC_CARDS.CELTIC_GUARDIAN,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const opponentMonster2: CardInstance = {
        uid: 'opponent_mon_2_uid',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = opponentMonster1;
      kaiba.monsterZones[1] = opponentMonster2;

      // Avança para o turno 3 (Turno de Yugi, MAIN1)
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Mude a posição para ataque com selectedTargetUids: [monstro_2.uid]
      const changePosResult = session.changeMonsterPosition(0, [opponentMonster2.uid]);

      // Assert:
      expect(changePosResult.success).toBe(true);
      expect(changePosResult.flipped).toBe(true);
      expect(changePosResult.flipEffect?.action).toBe('DESTROY_MONSTER');

      // Estritamente o monstro_2 é destruído e enviado ao cemitério
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === opponentMonster2.uid)).toBe(true);

      // Monstro_1 permanece intacto no campo e fora do cemitério
      expect(kaiba.monsterZones[0]).not.toBeNull();
      expect(kaiba.monsterZones[0]?.uid).toBe(opponentMonster1.uid);
      expect(kaiba.graveyard.some((c) => c.uid === opponentMonster1.uid)).toBe(false);

      // O monstro com efeito FLIP agora está com a face para cima em modo de ataque
      expect(yugi.monsterZones[0]?.uid).toBe(genericDestroyerBug.uid);
      expect(yugi.monsterZones[0]?.isFaceDown).toBe(false);
      expect(yugi.monsterZones[0]?.position).toBe('ATTACK');
    });

    it('2. Teste de Efeito FLIP Declarativo Genérico (Múltiplos Alvos / Retorno para Mão): ambos os alvos voltam para a mão', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Carta mock genérica com RETURN_TO_HAND e maxTargets: 2
      const genericBouncer: CardInstance = {
        uid: 'generic_bouncer_uid',
        data: {
          id: 'mock_flip_return_888',
          name: 'Generic Bouncer',
          type: 'Flip Effect Monster',
          level: 2,
          attack: 400,
          defense: 400,
          description: 'FLIP: Target up to 2 monsters on the field; return them to the hand.',
          effectType: 'FLIP',
          effectDefinition: {
            action: 'RETURN_TO_HAND',
            target: {
              scope: 'OPPONENT_MONSTERS',
              maxTargets: 2,
            },
          },
        },
        position: 'DEFENSE',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = genericBouncer;

      // Kaiba possui 3 monstros no campo
      const targetMon1: CardInstance = {
        uid: 'target_mon_1_uid',
        data: CLASSIC_CARDS.BLUE_EYES,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const targetMon2: CardInstance = {
        uid: 'target_mon_2_uid',
        data: CLASSIC_CARDS.VORSE_RAIDER,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const safeMon3: CardInstance = {
        uid: 'safe_mon_3_uid',
        data: CLASSIC_CARDS.BATTLE_OX,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[0] = targetMon1;
      kaiba.monsterZones[1] = targetMon2;
      kaiba.monsterZones[2] = safeMon3;

      const initialKaibaHandCount = kaiba.hand.length;

      // Avança para o turno 3 (Turno de Yugi, MAIN1)
      session.matchState.currentTurn = 3;
      session.matchState.activePlayerId = yugi.id;
      session.matchState.phase = 'MAIN1';

      // Act: Disparar efeito virando a carta com 2 alvos selecionados: [targetMon1.uid, targetMon2.uid]
      const changePosResult = session.changeMonsterPosition(0, [targetMon1.uid, targetMon2.uid]);

      // Assert:
      expect(changePosResult.success).toBe(true);
      expect(changePosResult.flipped).toBe(true);
      expect(changePosResult.flipEffect?.action).toBe('RETURN_TO_HAND');

      // Ambos os alvos selecionados voltam para a mão do oponente
      expect(kaiba.monsterZones[0]).toBeNull();
      expect(kaiba.monsterZones[1]).toBeNull();
      expect(kaiba.hand.some((c) => c.uid === targetMon1.uid)).toBe(true);
      expect(kaiba.hand.some((c) => c.uid === targetMon2.uid)).toBe(true);
      expect(kaiba.hand.length).toBe(initialKaibaHandCount + 2);

      // O terceiro monstro (não selecionado) permanece intacto no campo
      expect(kaiba.monsterZones[2]).not.toBeNull();
      expect(kaiba.monsterZones[2]?.uid).toBe(safeMon3.uid);
      expect(kaiba.hand.some((c) => c.uid === safeMon3.uid)).toBe(false);
    });

    it('3. Teste de Efeito Contínuo Declarativo (Boost de ATK condicional por Raça): adiciona +500 por cada Dragão no campo/cemitério dinamicamente', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      // Carta mock genérica SEM checagem de nome 'Buster Blader'
      const genericDragonSlayer: CardInstance = {
        uid: 'generic_dragon_slayer_uid',
        data: {
          id: 'mock_continuous_boost_777',
          name: 'Generic Dragon Slayer Warrior',
          type: 'Effect Monster',
          level: 7,
          attack: 2000,
          defense: 1500,
          description: 'Gains 500 ATK for each Dragon monster on your opponent field or GY.',
          effectType: 'CONTINUOUS',
          effectDefinition: {
            action: 'BOOST_ATK',
            value: 500,
            condition: {
              target_race: 'Dragon',
            },
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.monsterZones[0] = genericDragonSlayer;

      // Estado 0: Nenhum Dragão no oponente -> ATK base 2000
      expect(session.getEffectiveAttack(genericDragonSlayer, yugi, kaiba)).toBe(2000);

      // Estado 1: 1 Dragão face-up no campo do oponente (Blue-Eyes)
      kaiba.monsterZones[0] = {
        uid: 'kaiba_field_dragon_1',
        data: CLASSIC_CARDS.BLUE_EYES, // race: 'Dragon'
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Act & Assert 1: 2000 + 500 = 2500 ATK
      expect(session.getEffectiveAttack(genericDragonSlayer, yugi, kaiba)).toBe(2500);

      // Estado 2: Adiciona 1 Dragão no cemitério do oponente (Curse of Dragon)
      kaiba.graveyard.push({
        uid: 'kaiba_gy_dragon_2',
        data: CLASSIC_CARDS.CURSE_OF_DRAGON, // race: 'Dragon'
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      });

      // Act & Assert 2: 2000 + (2 * 500) = 3000 ATK
      expect(session.getEffectiveAttack(genericDragonSlayer, yugi, kaiba)).toBe(3000);

      // Estado 3: Adiciona mais 1 Dragão no cemitério (Baby Dragon)
      kaiba.graveyard.push({
        uid: 'kaiba_gy_dragon_3',
        data: CLASSIC_CARDS.BABY_DRAGON, // race: 'Dragon'
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      });

      // Act & Assert 3: 2000 + (3 * 500) = 3500 ATK
      expect(session.getEffectiveAttack(genericDragonSlayer, yugi, kaiba)).toBe(3500);

      // Assegure que monstros virados para baixo ou monstros de outras raças não dão bônus
      kaiba.monsterZones[1] = {
        uid: 'kaiba_field_dragon_facedown',
        data: CLASSIC_CARDS.LUSTER_DRAGON,
        position: 'DEFENSE',
        isFaceDown: true, // Face-down não revela raça
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.monsterZones[2] = {
        uid: 'kaiba_field_non_dragon',
        data: CLASSIC_CARDS.CELTIC_GUARDIAN, // race: 'Warrior'
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      // Mantém os 3500 ATK (3 dragões válidos: 1 no campo revelado + 2 no cemitério)
      expect(session.getEffectiveAttack(genericDragonSlayer, yugi, kaiba)).toBe(3500);
    });

    it('4. Teste de Handler Genérico GAIN_LP: incrementa os Pontos de Vida do jogador declarativamente', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      yugi.lifePoints = 6500;

      const healingSpell: CardInstance = {
        uid: 'generic_healing_spell_uid',
        data: {
          id: 'mock_spell_heal_101',
          name: 'Generic Healing Potion',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Increase your Life Points by 1000.',
          effectDefinition: {
            action: 'GAIN_LP',
            value: 1000,
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.hand.push(healingSpell);

      // Act
      const activated = session.activateSpell('generic_healing_spell_uid');

      // Assert
      expect(activated).toBe(true);
      expect(yugi.lifePoints).toBe(7500);
      expect(yugi.graveyard.some((c) => c.uid === 'generic_healing_spell_uid')).toBe(true);
    });

    it('5. Teste de Handler Genérico INFLICT_DAMAGE: decrementa os Pontos de Vida do oponente declarativamente', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;
      kaiba.lifePoints = 8000;

      const burnSpell: CardInstance = {
        uid: 'generic_burn_spell_uid',
        data: {
          id: 'mock_spell_burn_202',
          name: 'Generic Fireball',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Inflict 800 damage to your opponent.',
          effectDefinition: {
            action: 'INFLICT_DAMAGE',
            value: 800,
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.hand.push(burnSpell);

      // Act
      const activated = session.activateSpell('generic_burn_spell_uid');

      // Assert
      expect(activated).toBe(true);
      expect(kaiba.lifePoints).toBe(7200);
      expect(yugi.graveyard.some((c) => c.uid === 'generic_burn_spell_uid')).toBe(true);
    });

    it('6. Teste de Handler Genérico DESTROY_SPELL_TRAP: destrói carta mágica/armadilha do oponente e envia ao cemitério', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const yugi = session.player1;
      const kaiba = session.player2;

      const opponentSetTrap: CardInstance = {
        uid: 'opponent_set_trap_uid',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      kaiba.spellTrapZones[2] = opponentSetTrap;

      const spellRemovalCard: CardInstance = {
        uid: 'generic_st_destroyer_uid',
        data: {
          id: 'mock_spell_st_destroy_303',
          name: 'Generic Typhoon',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Destroy 1 Spell/Trap Card your opponent controls.',
          effectDefinition: {
            action: 'DESTROY_SPELL_TRAP',
            target: {
              scope: 'OPPONENT_SPELL_TRAPS',
              maxTargets: 1,
            },
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      yugi.hand.push(spellRemovalCard);

      // Act
      const activated = session.activateSpell('generic_st_destroyer_uid', undefined, ['opponent_set_trap_uid']);

      // Assert
      expect(activated).toBe(true);
      expect(kaiba.spellTrapZones[2]).toBeNull();
      expect(kaiba.graveyard.some((c) => c.uid === 'opponent_set_trap_uid')).toBe(true);
      expect(yugi.graveyard.some((c) => c.uid === 'generic_st_destroyer_uid')).toBe(true);
    });
  });

  describe('Sub-Wave 2A Spells Suite: LP Recovery, Direct Damage, and Spell/Trap Removal', () => {
    it('1. Teste de Ativação de Magia com GAIN_LP (Dian Keto the Cure Master): recupera 1000 LP e envia para o cemitério', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;
      player.lifePoints = 7000;

      const dianKeto: CardInstance = {
        uid: 'dian_keto_cure_master_uid',
        data: {
          id: '84257639',
          name: 'Dian Keto the Cure Master',
          namePt: 'Dian Keto, a Mestra da Cura',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Increase your Life Points by 1000.',
          effectDefinition: {
            action: 'GAIN_LP',
            value: 1000,
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(dianKeto);

      // Act
      const activated = session.activateSpell(dianKeto.uid);

      // Assert
      expect(activated).toBe(true);
      expect(player.lifePoints).toBe(8000);
      expect(player.hand.some((c) => c.uid === dianKeto.uid)).toBe(false);
      expect(player.graveyard.some((c) => c.uid === dianKeto.uid)).toBe(true);
    });

    it('2. Teste de Ativação de Magia com INFLICT_DAMAGE (Hinotama / Ookazi): causa dano direto e declara vitória ao zerar LPs', () => {
      // Arrange 1: Dano direto padrão (8000 -> 7500) com Hinotama
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;
      const opponent = session.player2;
      expect(opponent.lifePoints).toBe(8000);

      const hinotama: CardInstance = {
        uid: 'hinotama_burn_500_uid',
        data: {
          id: '46130346',
          name: 'Hinotama',
          namePt: 'Hinotama',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Inflict 500 points of damage to your opponent.',
          effectDefinition: {
            action: 'INFLICT_DAMAGE',
            value: 500,
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(hinotama);

      // Act 1
      const activated1 = session.activateSpell(hinotama.uid);

      // Assert 1: Oponente recebe 500 de dano e a carta vai para o cemitério
      expect(activated1).toBe(true);
      expect(opponent.lifePoints).toBe(7500);
      expect(player.hand.some((c) => c.uid === hinotama.uid)).toBe(false);
      expect(player.graveyard.some((c) => c.uid === hinotama.uid)).toBe(true);
      expect(session.matchState.isGameOver).toBe(false);

      // Arrange 2: Dano fatal com Ookazi quando oponente tem <= 800 LP
      opponent.lifePoints = 400;
      const ookazi: CardInstance = {
        uid: 'ookazi_burn_800_uid',
        data: {
          id: '19523799',
          name: 'Ookazi',
          namePt: 'Ookazi',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Inflict 800 points of damage to your opponent.',
          effectDefinition: {
            action: 'INFLICT_DAMAGE',
            value: 800,
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(ookazi);

      // Act 2
      const activated2 = session.activateSpell(ookazi.uid);

      // Assert 2: LPs do oponente zeram e vitória é declarada para o jogador ativo
      expect(activated2).toBe(true);
      expect(opponent.lifePoints).toBe(0);
      expect(session.matchState.isGameOver).toBe(true);
      expect(session.matchState.winnerPlayerId).toBe(player.id);
      expect(session.matchState.winReason).toContain(opponent.nickname);
      expect(player.graveyard.some((c) => c.uid === ookazi.uid)).toBe(true);
    });

    it('3. Teste de Ativação de Magia com DESTROY_SPELL_TRAP (De-Spell): destrói a carta na zona de M/A do oponente', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;
      const opponent = session.player2;

      // Coloque uma carta na zona de magia/armadilha do oponente (p2.spellTrapZones[0])
      const opponentSetTrap: CardInstance = {
        uid: 'target_opponent_trap_uid',
        data: CLASSIC_CARDS.TRAP_HOLE,
        position: 'ATTACK',
        isFaceDown: true,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 0,
        turnSet: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      opponent.spellTrapZones[0] = opponentSetTrap;

      const deSpell: CardInstance = {
        uid: 'de_spell_remover_uid',
        data: {
          id: '19159413',
          name: 'De-Spell',
          namePt: 'Desfazer Feitiço',
          type: 'Spell Card',
          level: 0,
          attack: 0,
          defense: 0,
          description: 'Target 1 face-up Spell Card or 1 Set Spell/Trap Card on the field; destroy that target.',
          effectDefinition: {
            action: 'DESTROY_SPELL_TRAP',
            target: {
              scope: 'OPPONENT_SPELL_TRAPS',
              maxTargets: 1,
            },
          },
        },
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      player.hand.push(deSpell);

      // Act: Ativar De-Spell fornecendo selectedTargetUids: [opponentSetTrap.uid]
      const activated = session.activateSpell(deSpell.uid, undefined, [opponentSetTrap.uid]);

      // Assert:
      expect(activated).toBe(true);
      // Carta do oponente destruída e removida da zona 0
      expect(opponent.spellTrapZones[0]).toBeNull();
      // Carta do oponente enviada para o cemitério dele (com isFaceDown desmarcado)
      expect(opponent.graveyard.some((c) => c.uid === opponentSetTrap.uid)).toBe(true);
      expect(opponent.graveyard.find((c) => c.uid === opponentSetTrap.uid)?.isFaceDown).toBe(false);
      // De-Spell removido da mão e enviado para o cemitério do jogador
      expect(player.hand.some((c) => c.uid === deSpell.uid)).toBe(false);
      expect(player.graveyard.some((c) => c.uid === deSpell.uid)).toBe(true);
    });

    it('4. Teste de Ativação direta de Magias da Sub-Onda 2A de CLASSIC_CARDS: Sparks (-200), Raimei (-300), Final Flame (-600) e Dian Keto (+1000)', () => {
      // Arrange
      const session = new DuelMatchSession('Yugi', createYugiDeck(), 'Kaiba', createKaibaDeck());
      const player = session.player1;
      const opponent = session.player2;
      player.lifePoints = 5000;
      opponent.lifePoints = 8000;

      const sparks: CardInstance = {
        uid: 'sparks_card_uid',
        data: CLASSIC_CARDS.SPARKS,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const raimei: CardInstance = {
        uid: 'raimei_card_uid',
        data: CLASSIC_CARDS.RAIMEI,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const finalFlame: CardInstance = {
        uid: 'final_flame_card_uid',
        data: CLASSIC_CARDS.FINAL_FLAME,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };
      const dianKeto: CardInstance = {
        uid: 'dian_keto_classic_uid',
        data: CLASSIC_CARDS.DIAN_KETO,
        position: 'ATTACK',
        isFaceDown: false,
        hasAttacked: false,
        hasChangedPositionThisTurn: false,
        turnSummoned: 1,
        monstersDestroyedCount: 0,
        hasAttackedDirectly: false,
      };

      player.hand.push(sparks, raimei, finalFlame, dianKeto);

      // Act & Assert 1: Sparks (-200)
      expect(session.activateSpell(sparks.uid)).toBe(true);
      expect(opponent.lifePoints).toBe(7800);

      // Act & Assert 2: Raimei (-300)
      expect(session.activateSpell(raimei.uid)).toBe(true);
      expect(opponent.lifePoints).toBe(7500);

      // Act & Assert 3: Final Flame (-600)
      expect(session.activateSpell(finalFlame.uid)).toBe(true);
      expect(opponent.lifePoints).toBe(6900);

      // Act & Assert 4: Dian Keto (+1000)
      expect(session.activateSpell(dianKeto.uid)).toBe(true);
      expect(player.lifePoints).toBe(6000);

      // All 4 spells resolved into graveyard
      expect(player.graveyard.some((c) => c.uid === sparks.uid)).toBe(true);
      expect(player.graveyard.some((c) => c.uid === raimei.uid)).toBe(true);
      expect(player.graveyard.some((c) => c.uid === finalFlame.uid)).toBe(true);
      expect(player.graveyard.some((c) => c.uid === dianKeto.uid)).toBe(true);
    });
  });
});


