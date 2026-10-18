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
        effectDefinition: { action: 'DESTROY_MONSTER', target: 'ATTACKER_OR_FIELD' },
      },
      position: 'DEFENSE',
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
        effectDefinition: { action: 'RETURN_TO_HAND', count: 1, target: 'ATTACKER_MONSTER' },
      },
      position: 'DEFENSE',
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

      // Kaiba (p2) tem Man-Eater Bug em DEFENSE (ATK 450, DEF 600)
      p2.monsterZones[0] = {
        uid: 'man_eater_bug_p2',
        data: CLASSIC_CARDS.MAN_EATER_BUG,
        position: 'DEFENSE',
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

      // Kaiba (p2) tem Penguin Soldier em DEFENSE (DEF 500)
      p2.monsterZones[0] = {
        uid: 'penguin_soldier_p2',
        data: CLASSIC_CARDS.PENGUIN_SOLDIER,
        position: 'DEFENSE',
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
      const card = p1.hand.find((c) => c.data.level <= 4)!;
      const summonSuccess = session.normalSummon(card.uid, 0, 'DEFENSE', [], true);

      expect(summonSuccess).toBe(true);
      expect(p1.monsterZones[0]?.isFaceDown).toBe(true);
      expect(p1.monsterZones[0]?.turnSet).toBe(1);

      // Act: Tentar flipar manualmente no mesmo turno (Turno 1)
      const flipOnSameTurn = session.changeMonsterPosition(0);

      // Assert: Deve ser bloqueado
      expect(flipOnSameTurn).toBe(false);
      expect(p1.monsterZones[0]?.isFaceDown).toBe(true);
      expect(p1.monsterZones[0]?.position).toBe('DEFENSE');
    });

    it('Teste 8: Flip manual liberado nos turnos subsequentes disparando o efeito FLIP', () => {
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
      const flipSuccess = session.changeMonsterPosition(0);

      // Assert
      expect(flipSuccess).toBe(true);
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
});
