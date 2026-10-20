import React, { useState, useEffect, useRef } from 'react';
import { DuelMatchSession } from '@duel/duel-match-session';
import { createKaibaDeck } from '@duel/starter-decks';
import { CardData, CardInstance, BattlePosition } from '@duel/duel-types';
import { DuelBot } from '@duel/duel-bot';
import { soundFX } from '../utils/soundFX';
import { soundtrackManager } from '../utils/SoundtrackManager';
import { getUserSettings, UserSettings } from '../utils/settings';
import { getActiveDeckForDuel } from '../utils/deckStorage';
import { SettingsModal } from './SettingsModal';

export interface PlaymatProps {
  playerNickname?: string;
  playerDeck?: CardData[];
  playerDeckName?: string;
  onExitToMenu?: () => void;
}

export interface PriorityPrompt {
  type: 'TRAP_HOLE' | 'MIRROR_FORCE' | 'KURIBOH' | 'WABOKU';
  badge: string;
  badgeIcon?: string;
  title: string;
  cardName: string;
  cardImage?: string;
  cardType?: string;
  message: React.ReactNode;
  confirmText: string;
  declineText: string;
  accentColor?: 'amber' | 'cyan' | 'purple' | 'sky';
  onConfirm: () => void;
  onDecline: () => void;
}

export const Playmat: React.FC<PlaymatProps> = ({
  playerNickname = 'Yugi Muto',
  playerDeck,
  onExitToMenu,
}) => {
  const resolvePlayerDeck = (): CardData[] => {
    if (playerDeck && playerDeck.length >= 5) {
      return playerDeck;
    }
    return getActiveDeckForDuel(playerNickname).cards;
  };

  const [session, setSession] = useState<DuelMatchSession>(() => {
    return new DuelMatchSession(
      playerNickname,
      resolvePlayerDeck(),
      'Seto Kaiba (Bot)',
      createKaibaDeck()
    );
  });

  // Referências DOM para cálculo do vetor direcional de ataque (Lunge)
  const playerZoneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const opponentZoneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const playerLpRef = useRef<HTMLDivElement | null>(null);
  const opponentLpRef = useRef<HTMLDivElement | null>(null);
  const activeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scheduleTimer = (callback: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      activeTimersRef.current = activeTimersRef.current.filter((t) => t !== id);
      callback();
    }, delayMs);
    activeTimersRef.current.push(id);
    return id;
  };

  const clearAllTimers = () => {
    activeTimersRef.current.forEach((id) => clearTimeout(id));
    activeTimersRef.current = [];
  };

  // Modais e Estados Visuais
  const [countdown, setCountdown] = useState<number | null>(5); // Contagem regressiva inicial de 5s
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedHandCardUid, setSelectedHandCardUid] = useState<string | null>(null);
  const [pendingSummonZone, setPendingSummonZone] = useState<number | null>(null); // Quando clica na zona para escolher ATK/DEF
  const [selectedTributeZones, setSelectedTributeZones] = useState<number[]>([]); // Zonas selecionadas para sacrifício
  const [summonChoiceModal, setSummonChoiceModal] = useState<{
    zoneIndex: number;
    tributeIndices: number[];
    card: CardInstance;
  } | null>(null);
  const [spellChoiceModal, setSpellChoiceModal] = useState<{
    zoneIndex: number;
    card: CardInstance;
    isFromField?: boolean;
  } | null>(null);
  const [selectedAttackerZone, setSelectedAttackerZone] = useState<number | null>(null);
  const [inspectedCard, setInspectedCard] = useState<CardInstance | null>(null);
  const [languagePt, setLanguagePt] = useState<boolean>(() => getUserSettings(playerNickname).language === 'pt');
  const [showSurrenderModal, setShowSurrenderModal] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => getUserSettings(playerNickname).soundMuted);
  const [, setRefreshKey] = useState(0);

  // Estados de Animação e VFX Dinâmicos
  const [slamZone, setSlamZone] = useState<{ isPlayer: boolean; zoneIndex: number } | null>(null);
  const [lungingZone, setLungingZone] = useState<{
    isPlayer: boolean;
    zoneIndex: number;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const [targetHitZone, setTargetHitZone] = useState<{ isPlayer: boolean; zoneIndex: number | null } | null>(null);
  const [destroyedCardUids, setDestroyedCardUids] = useState<string[]>([]);
  const [floatingDamage, setFloatingDamage] = useState<{ amount: number; isPlayer: boolean; zoneIndex: number | null } | null>(null);
  const [floatingHeal, setFloatingHeal] = useState<{ amount: number } | null>(null);

  // Dispara a animação visual de destruição de cartas e limpa automaticamente após 600ms,
  // garantindo que nenhuma carta fique presa invisível (opacity: 0) no tabuleiro
  const triggerCardDestruction = (uids: string | string[]) => {
    const list = Array.isArray(uids) ? uids : [uids];
    if (list.length === 0) return;
    setDestroyedCardUids((prev) => [...prev, ...list]);
    setTimeout(() => {
      setDestroyedCardUids((prev) => prev.filter((id) => !list.includes(id)));
    }, 600);
  };
  const [isCameraShaking, setIsCameraShaking] = useState<boolean>(false);
  const [recentDrawnUids, setRecentDrawnUids] = useState<string[]>([]);
  const [flippedZones, setFlippedZones] = useState<{ isPlayer: boolean; zoneIndex: number }[]>([]);
  const [flipEffectBanner, setFlipEffectBanner] = useState<{ cardName: string; action: string } | null>(null);
  const [tacticalTargetSelection, setTacticalTargetSelection] = useState<{
    zoneIndex: number;
    cardName: string;
    action: string;
    maxTargets: number;
    selectedUids: string[];
    cardUid?: string;
    isSpell?: boolean;
  } | null>(null);
  const [priorityPrompt, setPriorityPrompt] = useState<PriorityPrompt | null>(null);
  const [timeWizardRoulette, setTimeWizardRoulette] = useState<{
    isSpinning: boolean;
    outcome?: 'HEADS' | 'TAILS';
  } | null>(null);
  const [raigekiActive, setRaigekiActive] = useState<boolean>(false);
  const [celebratoryBanner, setCelebratoryBanner] = useState<{
    title: string;
    icon?: string;
  } | null>(null);

  // Metadados visuais e mensagens dinâmicas para ações táticas genéricas com alvo
  const getTacticalActionMeta = (action: string, isPt: boolean) => {
    switch (action) {
      case 'DESTROY_MONSTER':
        return {
          icon: '🪲',
          badgeSelected: isPt ? 'DESTRUIR' : 'DESTROY',
          confirmVerb: isPt ? 'Destruição' : 'Destruction',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `🎯 Escolha até ${maxTargets} monstros do adversário para destruir!`
                : '🎯 Escolha 1 monstro do adversário para destruir!'
              : maxTargets > 1
              ? `🎯 Choose up to ${maxTargets} opponent monsters to destroy!`
              : '🎯 Choose 1 opponent monster to destroy!',
        };
      case 'RETURN_TO_HAND':
        return {
          icon: '🐧',
          badgeSelected: isPt ? 'RETORNAR' : 'RETURN',
          confirmVerb: isPt ? 'Retorno' : 'Return',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `🎯 Escolha até ${maxTargets} monstros do adversário para retornar à mão!`
                : '🎯 Escolha 1 monstro do adversário para retornar à mão!'
              : maxTargets > 1
              ? `🎯 Choose up to ${maxTargets} opponent monsters to return to hand!`
              : '🎯 Choose 1 opponent monster to return to hand!',
        };
      case 'DESTROY_SPELL_TRAP':
        return {
          icon: '🌪️',
          badgeSelected: isPt ? 'DESTRUIR M/A' : 'DESTROY S/T',
          confirmVerb: isPt ? 'Destruição de Magia/Armadilha' : 'Spell/Trap Destruction',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `🎯 Escolha até ${maxTargets} cartas de Magia/Armadilha do adversário para destruir!`
                : '🎯 Escolha 1 carta de Magia/Armadilha do adversário para destruir!'
              : maxTargets > 1
              ? `🎯 Choose up to ${maxTargets} opponent Spell/Trap cards to destroy!`
              : '🎯 Choose 1 opponent Spell/Trap card to destroy!',
        };
      default:
        return {
          icon: '🎯',
          badgeSelected: isPt ? 'SELECIONADO' : 'SELECTED',
          confirmVerb: isPt ? 'Alvo' : 'Target',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `🎯 Escolha até ${maxTargets} alvos do adversário!`
                : '🎯 Escolha 1 alvo do adversário!'
              : maxTargets > 1
              ? `🎯 Choose up to ${maxTargets} opponent targets!`
              : '🎯 Choose 1 opponent target!',
        };
    }
  };

  // Auxiliares de Tradução Dinâmica PT-BR / EN
  const formatPhaseName = (phase: string): string => {
    if (!languagePt) return phase;
    switch (phase) {
      case 'DRAW':
        return 'COMPRA';
      case 'STANDBY':
        return 'ESPERA';
      case 'MAIN1':
        return 'PRINCIPAL 1';
      case 'BATTLE':
        return 'BATALHA';
      case 'MAIN2':
        return 'PRINCIPAL 2';
      case 'END':
        return 'FIM DE TURNO';
      default:
        return phase;
    }
  };

  const formatCardType = (type: string): string => {
    if (!languagePt) return type;
    const lower = type.toLowerCase();
    if (lower.includes('flip')) {
      return 'Monstro de Efeito de Virar';
    }
    if (lower.includes('effect')) {
      return 'Monstro de Efeito';
    }
    if (lower.includes('normal')) {
      return 'Monstro Normal';
    }
    if (lower.includes('spell')) {
      return 'Carta Mágica';
    }
    if (lower.includes('trap')) {
      return 'Carta Armadilha';
    }
    if (lower.includes('fusion')) {
      return 'Monstro de Fusão';
    }
    if (lower.includes('ritual')) {
      return 'Monstro de Ritual';
    }
    return type;
  };

  // Funções Auxiliares de Tipagem Estrita de Cartas
  const isSpellCard = (card: CardInstance | null | undefined): boolean => {
    if (!card) return false;
    const typeLower = (card.data.type || '').toLowerCase();
    return (
      typeLower.includes('spell') ||
      typeLower.includes('mágica') ||
      typeLower.includes('magic')
    );
  };

  const isTrapCard = (card: CardInstance | null | undefined): boolean => {
    if (!card) return false;
    const typeLower = (card.data.type || '').toLowerCase();
    return (
      typeLower.includes('trap') ||
      typeLower.includes('armadilha')
    );
  };

  const isSpellOrTrapCard = (card: CardInstance | null | undefined): boolean => {
    return isSpellCard(card) || isTrapCard(card);
  };

  const isMonsterCard = (card: CardInstance | null | undefined): boolean => {
    if (!card) return false;
    if (isSpellOrTrapCard(card)) return false;
    const typeLower = (card.data.type || '').toLowerCase();
    return (
      typeLower.includes('monster') ||
      typeLower.includes('monstro') ||
      card.data.level >= 1
    );
  };

  // Retorna a classe de chama da carta baseado em destruições e ataque direto
  const getCardFlameClass = (card: CardInstance | null): string => {
    if (!card) return '';
    if (card.hasAttackedDirectly) {
      return 'flame-blue'; // Fogo azul ao atacar a vida diretamente
    }
    const kills = card.monstersDestroyedCount || 0;
    if (kills >= 5) {
      return 'flame-heavy'; // 5+ monstros: fogo intenso
    }
    if (kills >= 3) {
      return 'flame-light'; // 3 a 4 monstros: fogo leve
    }
    return '';
  };

  // Calcula com precisão o deslocamento (deltaX, deltaY) entre a carta atacante e a carta alvo (ou barra de LP)
  const calculateLungeDelta = (isPlayerAttacker: boolean, attackerIndex: number, targetIndex: number | null) => {
    try {
      const fromEl = isPlayerAttacker ? playerZoneRefs.current[attackerIndex] : opponentZoneRefs.current[attackerIndex];
      let toEl: HTMLElement | null = null;

      if (targetIndex !== null) {
        toEl = isPlayerAttacker ? opponentZoneRefs.current[targetIndex] : playerZoneRefs.current[targetIndex];
      } else {
        // Ataque direto aos LPs
        toEl = isPlayerAttacker ? opponentLpRef.current : playerLpRef.current;
      }

      if (fromEl && toEl) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const deltaX = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
        const deltaY = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
        return { deltaX, deltaY };
      }
    } catch {
      // Fallback para aproximação de grid
    }

    // Fallback matemático caso o rect do elemento ainda não esteja disponível
    const fallbackY = isPlayerAttacker ? -240 : 240;
    const fallbackX = targetIndex !== null ? (targetIndex - attackerIndex) * 110 : 0;
    return { deltaX: fallbackX, deltaY: fallbackY };
  };

  const showNotification = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const forceUpdate = () => setRefreshKey((k) => k + 1);

  const p1 = session.player1;
  const p2 = session.player2; // Bot
  const match = session.matchState;
  const isPlayerTurn = match.activePlayerId === p1.id && countdown === null;

  // Inicialização e Ciclo de Vida da Trilha Sonora da Partida
  useEffect(() => {
    soundtrackManager.playMatchMusic();

    return () => {
      clearAllTimers();
      soundtrackManager.stopCurrentMusic();
    };
  }, []);

  // Disparo de Vitória / Derrota quando o duelo finaliza (exibição do modal)
  useEffect(() => {
    if (match.isGameOver) {
      if (match.winnerPlayerId === p1.id) {
        soundtrackManager.playVictory();
      } else {
        soundtrackManager.playDefeat();
      }
    }
  }, [match.isGameOver, match.winnerPlayerId, p1.id]);

  // Carrega e sincroniza preferências persistentes do usuário
  useEffect(() => {
    const persisted = getUserSettings(playerNickname);
    setSoundMuted(persisted.soundMuted);
    setLanguagePt(persisted.language === 'pt');
    soundtrackManager.setMuted(persisted.soundMuted);
  }, [playerNickname]);

  // Controle de Mute
  useEffect(() => {
    soundtrackManager.setMuted(soundMuted);
  }, [soundMuted]);

  const handleSettingsChangedInPlaymat = (newSettings: UserSettings) => {
    setSoundMuted(newSettings.soundMuted);
    setLanguagePt(newSettings.language === 'pt');
    soundtrackManager.setMuted(newSettings.soundMuted);
  };

  // Efeito da Contagem Regressiva de 5 segundos
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setCountdown(null), 800); // Exibe "É HORA DO DUELO!" por 800ms
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Auxiliares de seleção
  const selectedAttackingMonster = selectedAttackerZone !== null ? p1.monsterZones[selectedAttackerZone] : null;

  // --- Handlers de Ações ---
  const handleNextPhase = () => {
    if (!isPlayerTurn || match.isGameOver) return;
    session.nextPhase();
    setSelectedHandCardUid(null);
    setSelectedAttackerZone(null);
    setPendingSummonZone(null);
    setSelectedTributeZones([]);
    forceUpdate();
  };

  const handleEndTurn = () => {
    if (!isPlayerTurn || match.isGameOver) return;
    
    // Anuncia a passagem do turno
    showNotification(`⏳ ${p1.nickname} passou o turno para ${p2.nickname}`);
    session.endTurn();
    setSelectedHandCardUid(null);
    setSelectedAttackerZone(null);
    setPendingSummonZone(null);
    setSelectedTributeZones([]);
    forceUpdate();

    // Executa a IA do Bot com feedback visual e tempos reais
    scheduleTimer(() => {
      const bot = session.getActivePlayer();
      const opponent = session.getOpponentPlayer();
      if (session.matchState.isGameOver) return;

      // 1a. Bot avalia e ativa Magias / posiciona Armadilhas antes de invocar
      DuelBot.evaluateAndPlaySpellsAndTraps(session);
      forceUpdate();
      if (session.matchState.isGameOver) return;

      // Helper para prosseguir com a Main Phase pós-invocação e transição para Battle Phase
      const proceedWithBotTurnAfterSummon = () => {
        if (session.matchState.isGameOver) return;

        // 1c. Reavalia Magias/Armadilhas pós-invocação
        DuelBot.evaluateAndPlaySpellsAndTraps(session);
        forceUpdate();
        if (session.matchState.isGameOver) return;

        // 2. Transição para Battle Phase
        scheduleTimer(() => {
        session.nextPhase(); // Move to BATTLE
        forceUpdate();

        // Encontra atacantes elegíveis do bot (que não tenham sido invocados no turno atual)
        const botAttackers = bot.monsterZones
          .map((m, idx) => ({ card: m, index: idx }))
          .filter((item): item is { card: CardInstance; index: number } =>
            item.card !== null &&
            item.card.position === 'ATTACK' &&
            !item.card.hasAttacked &&
            item.card.turnSummoned !== session.matchState.currentTurn
          )
          .sort((a, b) => b.card.data.attack - a.card.data.attack);

        if (botAttackers.length > 0) {
          const attacker = botAttackers[0];
          const opponentMonsters = opponent.monsterZones
            .map((m, idx) => ({ card: m, index: idx }))
            .filter((item): item is { card: CardInstance; index: number } => item.card !== null);

          // Determina alvo para calcular vetor direcional (deltaX, deltaY)
          const target =
            opponentMonsters.length === 0
              ? null
              : opponentMonsters.find(
                  (t) =>
                    (t.card.position === 'ATTACK' && attacker.card.data.attack > t.card.data.attack) ||
                    (t.card.position === 'DEFENSE' && attacker.card.data.attack > t.card.data.defense)
                ) || opponentMonsters[0];

          const targetZoneIdx = target ? target.index : null;
          const { deltaX, deltaY } = calculateLungeDelta(false, attacker.index, targetZoneIdx);

          const proceedWithBotAttack = () => {
            // Animação de investida do Bot (Lunge) com vetor direcional exato
            setLungingZone({ isPlayer: false, zoneIndex: attacker.index, deltaX, deltaY });

            scheduleTimer(() => {
              soundFX.playAttackStrike();
              setIsCameraShaking(true);
              scheduleTimer(() => setIsCameraShaking(false), 280);

              const finishBotTurn = () => {
                scheduleTimer(() => {
                  setLungingZone(null);
                  forceUpdate();

                  // 3. Fim do turno do Bot, retornando ao jogador
                  scheduleTimer(() => {
                    session.nextPhase(); // MAIN2
                    session.nextPhase(); // END -> Turno do Jogador
                    showNotification(`⚔️ É a vez de ${p1.nickname} duelar!`);
                    forceUpdate();

                    const lastCard = session.player1.hand[session.player1.hand.length - 1];
                    if (lastCard) {
                      soundFX.playDrawCard();
                      setRecentDrawnUids([lastCard.uid]);
                      scheduleTimer(() => setRecentDrawnUids([]), 900);
                    }
                  }, 600);
                }, 540);
              };

              const executePlayerDamageOrKuriboh = (
                dmgAmount: number,
                onDamageConfirmed: () => void,
                onShieldedAttack: () => void
              ) => {
                // Checa se Waboku está ativo para o jogador
                if (session.isWabokuActiveForPlayerId === p1.id) {
                  showNotification(
                    languagePt
                      ? '🕊️ O poder sagrado de Waboku protegeu seus monstros e anulou todo dano de batalha!'
                      : '🕊️ Waboku sacred power protected your monsters and prevented all battle damage!'
                  );
                  onShieldedAttack();
                  finishBotTurn();
                  return;
                }

                if (dmgAmount > 0 && session.canActivateKuriboh(p1.id)) {
                  const kuribohCard = p1.hand.find(
                    (c) =>
                      c.data.id === '40640057' ||
                      c.data.name.toLowerCase() === 'kuriboh' ||
                      c.data.effectDefinition?.action === 'PREVENT_BATTLE_DAMAGE' ||
                      c.data.effectDefinition?.action === 'KURIBOH_DISCARD'
                  );
                  const kuribohName =
                    languagePt && kuribohCard?.data.namePt ? kuribohCard.data.namePt : 'Kuriboh';

                  setPriorityPrompt({
                    type: 'KURIBOH',
                    badge: languagePt ? 'EFEITO RÁPIDO DA MÃO' : 'HAND QUICK EFFECT',
                    badgeIcon: '🤎',
                    title: languagePt ? 'JANELA DE PRIORIDADE' : 'PRIORITY WINDOW',
                    cardName: kuribohName,
                    cardImage: kuribohCard?.data.imageUrl,
                    cardType: 'MONSTER',
                    accentColor: 'amber',
                    message: languagePt ? (
                      <>
                        Você está prestes a receber <strong className="text-red-400 font-mono font-black text-sm">{dmgAmount}</strong> de dano de batalha! Deseja descartar <strong className="text-amber-300">{kuribohName}</strong> da sua mão para absorver todo o dano?
                      </>
                    ) : (
                      <>
                        You are about to take <strong className="text-red-400 font-mono font-black text-sm">{dmgAmount}</strong> battle damage! Discard <strong className="text-amber-300">{kuribohName}</strong> from your hand to prevent all damage?
                      </>
                    ),
                    confirmText: languagePt ? 'Ativar Kuriboh ⚡' : 'Activate Kuriboh ⚡',
                    declineText: languagePt ? 'Receber Dano ❌' : 'Take Damage ❌',
                    onConfirm: () => {
                      setPriorityPrompt(null);
                      session.activateKuriboh(p1.id);
                      soundFX.playMagicShield();
                      showNotification(
                        languagePt
                          ? '🛡️ Kuriboh absorveu todo o dano do ataque!'
                          : '🛡️ Kuriboh absorbed all battle damage!'
                      );
                      onShieldedAttack();
                      finishBotTurn();
                    },
                    onDecline: () => {
                      setPriorityPrompt(null);
                      onDamageConfirmed();
                      finishBotTurn();
                    },
                  });
                } else {
                  onDamageConfirmed();
                  finishBotTurn();
                }
              };

              if (opponentMonsters.length === 0) {
                // Ataque Direto nos LPs do Jogador!
                setTargetHitZone({ isPlayer: true, zoneIndex: null });
                scheduleTimer(() => setTargetHitZone(null), 500);
                const dmg = session.getEffectiveAttack(attacker.card, bot, opponent);

                executePlayerDamageOrKuriboh(
                  dmg,
                  () => {
                    setFloatingDamage({ amount: dmg, isPlayer: true, zoneIndex: null });
                    scheduleTimer(() => setFloatingDamage(null), 1200);
                    session.declareAttack(attacker.index, null);
                  },
                  () => {
                    session.declareAttack(attacker.index, null);
                  }
                );
              } else {
                // Encontra melhor alvo vulnerável considerando ATK efetivo
                const target =
                  opponentMonsters.find((t) => {
                    const atkEff = session.getEffectiveAttack(attacker.card, bot, opponent);
                    const defEff = session.getEffectiveAttack(t.card, opponent, bot);
                    return (
                      (t.card.position === 'ATTACK' && atkEff > defEff) ||
                      (t.card.position === 'DEFENSE' && atkEff > t.card.data.defense)
                    );
                  }) || opponentMonsters[0];

                setTargetHitZone({ isPlayer: true, zoneIndex: target.index });
                scheduleTimer(() => setTargetHitZone(null), 500);

                const attackerEffAtk = session.getEffectiveAttack(attacker.card, bot, opponent);
                const defenderEffAtk = session.getEffectiveAttack(target.card, opponent, bot);

                // Checa se a carta do jogador estava virada para baixo antes de revelar
                const wasFaceDown = Boolean(target.card.isFaceDown);
                if (wasFaceDown) {
                  setFlippedZones((prev) => [...prev, { isPlayer: true, zoneIndex: target.index }]);
                  scheduleTimer(() => {
                    setFlippedZones((prev) => prev.filter((z) => !(z.isPlayer && z.zoneIndex === target.index)));
                  }, 450);
                }

                const isTargetFlipDefense = wasFaceDown && target.card.position === 'DEFENSE' && target.card.data.effectType === 'FLIP';

                // Checa se o alvo em DEFENSE possui Efeito FLIP (apenas se estava virado para baixo)
                if (isTargetFlipDefense) {
                  const flipName = (languagePt && target.card.data.namePt) ? target.card.data.namePt : target.card.data.name;
                  const attackerName = (languagePt && attacker.card.data.namePt) ? attacker.card.data.namePt : attacker.card.data.name;
                  const action = target.card.data.effectDefinition?.action;
                  setFlipEffectBanner({ cardName: flipName, action: action || 'FLIP' });
                  scheduleTimer(() => setFlipEffectBanner(null), 2500);

                  if (action === 'DESTROY_MONSTER') {
                    showNotification(
                      languagePt
                        ? `🪲 CONTRA-ATAQUE FLIP! ${flipName} destruiu ${attackerName}!`
                        : `🪲 FLIP COUNTER-ATTACK! ${flipName} destroyed ${attackerName}!`
                    );
                    soundFX.playDestruction();
                    setIsCameraShaking(true);
                    scheduleTimer(() => setIsCameraShaking(false), 400);
                    triggerCardDestruction(attacker.card.uid);

                    scheduleTimer(() => {
                      session.declareAttack(attacker.index, target.index);
                      finishBotTurn();
                      forceUpdate();
                    }, 650);
                    return;
                  } else if (action === 'RETURN_TO_HAND') {
                    showNotification(
                      languagePt
                        ? `🐧 CONTRA-ATAQUE FLIP! ${flipName} devolveu ${attackerName} para a mão!`
                        : `🐧 FLIP COUNTER-ATTACK! ${flipName} returned ${attackerName} to hand!`
                    );
                    soundFX.playReturnToHand();
                    scheduleTimer(() => {
                      session.declareAttack(attacker.index, target.index);
                      finishBotTurn();
                      forceUpdate();
                    }, 650);
                    return;
                  }

                  // O efeito FLIP interrompe o ataque antes do cálculo de dano/destruição:
                  // O monstro do jogador NÃO morre!
                  session.declareAttack(attacker.index, target.index);
                  finishBotTurn();
                  forceUpdate();
                  return;
                }

                const isPlayerWaboku = session.isWabokuActiveForPlayerId === p1.id;

                if (target.card.position === 'ATTACK') {
                  if (attackerEffAtk > defenderEffAtk) {
                    const dmg = isPlayerWaboku ? 0 : attackerEffAtk - defenderEffAtk;
                    if (!isPlayerWaboku) {
                      triggerCardDestruction(target.card.uid);
                      soundFX.playDestruction();
                    } else {
                      soundFX.playMagicShield();
                    }

                    executePlayerDamageOrKuriboh(
                      dmg,
                      () => {
                        if (dmg > 0) {
                          setFloatingDamage({ amount: dmg, isPlayer: true, zoneIndex: target.index });
                          scheduleTimer(() => setFloatingDamage(null), 1200);
                        }
                        session.declareAttack(attacker.index, target.index);
                      },
                      () => {
                        session.declareAttack(attacker.index, target.index);
                      }
                    );
                  } else if (attackerEffAtk < defenderEffAtk) {
                    const dmg = defenderEffAtk - attackerEffAtk;
                    triggerCardDestruction(attacker.card.uid);
                    soundFX.playDestruction();
                    setFloatingDamage({ amount: dmg, isPlayer: false, zoneIndex: attacker.index });
                    scheduleTimer(() => setFloatingDamage(null), 1200);
                    session.declareAttack(attacker.index, target.index);
                    finishBotTurn();
                  } else {
                    // Empate
                    if (!isPlayerWaboku) {
                      triggerCardDestruction([attacker.card.uid, target.card.uid]);
                    } else {
                      triggerCardDestruction(attacker.card.uid);
                    }
                    soundFX.playDestruction();
                    session.declareAttack(attacker.index, target.index);
                    finishBotTurn();
                  }
                } else if (target.card.position === 'DEFENSE') {
                  if (attackerEffAtk > target.card.data.defense) {
                    if (!isPlayerWaboku) {
                      triggerCardDestruction(target.card.uid);
                      soundFX.playDestruction();
                    } else {
                      soundFX.playMagicShield();
                      showNotification(
                        languagePt
                          ? '🕊️ O monstro em defesa foi protegido pela aura sagrada de Waboku!'
                          : '🕊️ Defense monster was protected by Waboku sacred aura!'
                      );
                    }
                  } else if (attackerEffAtk < target.card.data.defense) {
                    const dmg = target.card.data.defense - attackerEffAtk;
                    setFloatingDamage({ amount: dmg, isPlayer: false, zoneIndex: attacker.index });
                    scheduleTimer(() => setFloatingDamage(null), 1200);
                  }
                  session.declareAttack(attacker.index, target.index);
                  finishBotTurn();
                }
              }

              forceUpdate();
            }, 280);
          };

          // Reação de Armadilha do Jogador: Checa se o jogador possui Mirror Force baixada com turnSet < currentTurn
          const playerMirrorCheck = session.canActivateMirrorForce(p1.id);
          if (playerMirrorCheck.canActivate) {
            const trapCard = p1.spellTrapZones[playerMirrorCheck.trapZoneIndex];
            const trapName =
              languagePt && trapCard?.data.namePt
                ? trapCard.data.namePt
                : (trapCard?.data.name || 'Força Espelho');

            setPriorityPrompt({
              type: 'MIRROR_FORCE',
              badge: languagePt ? 'RESPOSTA DE ATAQUE' : 'ATTACK REACTION',
              badgeIcon: '🪞',
              title: languagePt ? 'JANELA DE PRIORIDADE' : 'PRIORITY WINDOW',
              cardName: trapName,
              cardImage: trapCard?.data.imageUrl,
              cardType: 'TRAP',
              accentColor: 'cyan',
              message: languagePt
                ? '⚡ Deseja ativar Força Espelho (Mirror Force) em resposta ao ataque?'
                : '⚡ Do you wish to activate Mirror Force in response to the attack?',
              confirmText: languagePt ? 'Ativar Força Espelho ⚡' : 'Activate Mirror Force ⚡',
              declineText: languagePt ? 'Guardar / Passar ❌' : 'Keep / Pass ❌',
              onConfirm: () => {
                setPriorityPrompt(null);
                const botAttackersUids = bot.monsterZones
                  .filter((m): m is CardInstance => m !== null && m.position === 'ATTACK')
                  .map((m) => m.uid);

                session.activateMirrorForce(p1.id, playerMirrorCheck.trapZoneIndex);
                soundFX.playDestruction();
                setIsCameraShaking(true);
                scheduleTimer(() => setIsCameraShaking(false), 500);

                if (botAttackersUids.length > 0) {
                  triggerCardDestruction(botAttackersUids);
                }

                setCelebratoryBanner({
                  title: languagePt
                    ? '🪞 FORÇA ESPELHO ATIVADA! O ataque foi refletido e todos os monstros de ataque do adversário foram destruídos!'
                    : '🪞 MIRROR FORCE ACTIVATED! The attack was reflected and all opponent attack position monsters were destroyed!',
                  icon: '🪞',
                });
                scheduleTimer(() => setCelebratoryBanner(null), 3500);

                showNotification(
                  languagePt
                    ? '🪞 FORÇA ESPELHO ATIVADA! O ataque foi refletido e todos os monstros de ataque do adversário foram destruídos!'
                    : '🪞 MIRROR FORCE ACTIVATED!'
                );

                setLungingZone(null);
                forceUpdate();

                scheduleTimer(() => {
                  session.nextPhase(); // MAIN2
                  session.nextPhase(); // END -> Turno do Jogador
                  showNotification(`⚔️ É a vez de ${p1.nickname} duelar!`);
                  forceUpdate();

                  const lastCard = session.player1.hand[session.player1.hand.length - 1];
                  if (lastCard) {
                    soundFX.playDrawCard();
                    setRecentDrawnUids([lastCard.uid]);
                    scheduleTimer(() => setRecentDrawnUids([]), 900);
                  }
                }, 1000);
              },
              onDecline: () => {
                setPriorityPrompt(null);
                proceedWithBotAttack();
              },
            });
          } else {
            proceedWithBotAttack();
          }
        } else {
          // Sem ataques, passa o turno de volta
          scheduleTimer(() => {
            session.nextPhase(); // MAIN2
            session.nextPhase(); // END -> Turno do Jogador
            showNotification(`⚔️ É a vez de ${p1.nickname} duelar!`);
            forceUpdate();

            const lastCard = session.player1.hand[session.player1.hand.length - 1];
            if (lastCard) {
              soundFX.playDrawCard();
              setRecentDrawnUids([lastCard.uid]);
              scheduleTimer(() => setRecentDrawnUids([]), 900);
            }
          }, 600);
        }
      }, 950);
    };

    let hasPausedForReaction = false;

    // 1b. Bot Summon com animação de Slam e Janela de Prioridade para Trap Hole
    if (!bot.hasNormalSummonedThisTurn) {
      const summonResult = DuelBot.evaluateAndSummon(session);
      if (summonResult) {
        soundFX.playPlaceCard();
        setSlamZone({ isPlayer: false, zoneIndex: summonResult.zoneIndex });
        scheduleTimer(() => setSlamZone(null), 500);

        // Verifica se o Jogador possui Trap Hole (Buraco Armadilha) armada contra a invocação do Bot
        if (!summonResult.summonedCard.isFaceDown) {
          const summonedMonster = summonResult.summonedCard;
          const summonedUid = summonedMonster.uid;
          const summonedName =
            languagePt && summonedMonster.data.namePt
              ? summonedMonster.data.namePt
              : summonedMonster.data.name;
          const summonedAtk = summonedMonster.data.attack;

          const reaction = DuelBot.checkPlayerReactionOnSummon(
            session,
            p1.id,
            summonResult.zoneIndex
          );

          if (reaction.canActivate && reaction.trapZoneIndex !== -1) {
            hasPausedForReaction = true;
            const trapCard = reaction.card || p1.spellTrapZones[reaction.trapZoneIndex];
            const trapName =
              languagePt && trapCard?.data.namePt
                ? trapCard.data.namePt
                : (trapCard?.data.name || 'Buraco Armadilha');

            setPriorityPrompt({
              type: 'TRAP_HOLE',
              badge: languagePt ? 'RESPOSTA DE INVOCAÇÃO' : 'SUMMON REACTION',
              badgeIcon: '🕳️',
              title: languagePt ? 'JANELA DE PRIORIDADE' : 'PRIORITY WINDOW',
              cardName: trapName,
              cardImage: trapCard?.data.imageUrl,
              cardType: 'TRAP',
              accentColor: 'purple',
              message: languagePt
                ? `🕳️ O oponente invocou ${summonedName} (ATK ${summonedAtk}). Deseja ativar sua carta armadilha ${trapName}?`
                : `🕳️ Opponent summoned ${summonedName} (ATK ${summonedAtk}). Do you wish to activate your trap card ${trapName}?`,
              confirmText: languagePt ? 'Ativar Armadilha ⚡' : 'Activate Trap ⚡',
              declineText: languagePt ? 'Guardar / Passar ❌' : 'Keep / Pass ❌',
              onConfirm: () => {
                setPriorityPrompt(null);
                const success = session.activateTrapHole(
                  p1.id,
                  reaction.trapZoneIndex,
                  summonResult.zoneIndex
                );
                if (success) {
                  soundFX.playDestruction();
                  setIsCameraShaking(true);
                  scheduleTimer(() => setIsCameraShaking(false), 400);
                  triggerCardDestruction(summonedUid);
                  showNotification(
                    languagePt
                      ? `🕳️ Buraco Armadilha ativado! ${summonedName} foi destruído e enviado ao cemitério!`
                      : `🕳️ Trap Hole activated! ${summonedName} was destroyed and sent to the graveyard!`
                  );
                  forceUpdate();
                }
                scheduleTimer(() => {
                  proceedWithBotTurnAfterSummon();
                }, 700);
              },
              onDecline: () => {
                setPriorityPrompt(null);
                proceedWithBotTurnAfterSummon();
              },
            });
          }
        }
        forceUpdate();
      }
    }

    if (!hasPausedForReaction) {
      scheduleTimer(() => {
        proceedWithBotTurnAfterSummon();
      }, 400);
    }
  }, 950);
};

  const handleSelectHandCard = (card: CardInstance) => {
    setInspectedCard(card);
    if (!isPlayerTurn || (match.phase !== 'MAIN1' && match.phase !== 'MAIN2')) return;
    const isMonster = !card.data.type.toLowerCase().includes('spell') &&
                      !card.data.type.toLowerCase().includes('mágica') &&
                      !card.data.type.toLowerCase().includes('trap') &&
                      !card.data.type.toLowerCase().includes('armadilha');
    if (isMonster && p1.hasNormalSummonedThisTurn) return;
    setSelectedHandCardUid(selectedHandCardUid === card.uid ? null : card.uid);
    setPendingSummonZone(null);
    setSelectedTributeZones([]);
  };

  /**
   * Verifica de forma 100% genérica e orientada a metadados se a carta exige seleção tática de alvos.
   * Qualquer monstro de virar (FLIP) ou magia com `effectDefinition.target` utiliza a mesma interface de mira.
   */
  const checkCardRequiresTargeting = (
    card: CardInstance,
    zoneIndex: number = 0,
    options?: { isSpell?: boolean; cardUid?: string }
  ): boolean => {
    const effectDef = card.data.effectDefinition;
    const target = effectDef?.target;
    if (!effectDef || !target || typeof target !== 'object') {
      return false;
    }

    if (target.scope === 'OPPONENT_MONSTERS') {
      const opponentMonsterCount = p2.monsterZones.filter((m) => m !== null).length;
      if (opponentMonsterCount < 1) {
        return false;
      }

      const maxTargets = target.maxTargets || 1;
      const actionMeta = getTacticalActionMeta(effectDef.action, languagePt);

      setTacticalTargetSelection({
        zoneIndex,
        cardName: card.data.namePt || card.data.name,
        action: effectDef.action,
        maxTargets,
        selectedUids: [],
        cardUid: options?.cardUid ?? card.uid,
        isSpell: options?.isSpell ?? false,
      });

      showNotification(actionMeta.promptMessage(Math.min(maxTargets, opponentMonsterCount)));
      return true;
    }

    if (
      effectDef.action === 'DESTROY_SPELL_TRAP' ||
      target?.scope === 'OPPONENT_SPELL_TRAP' ||
      target?.scope === 'OPPONENT_SPELL_TRAPS'
    ) {
      const opponentSpellTrapCount = p2.spellTrapZones.filter((st) => st !== null).length;
      if (opponentSpellTrapCount < 1) {
        showNotification(
          languagePt
            ? '⚠️ O adversário não possui Cartas Mágicas ou Armadilhas no campo!'
            : '⚠️ Opponent has no Spell or Trap cards on the field!'
        );
        return false;
      }

      const maxTargets = target?.maxTargets || 1;
      const actionMeta = getTacticalActionMeta('DESTROY_SPELL_TRAP', languagePt);

      setTacticalTargetSelection({
        zoneIndex,
        cardName: card.data.namePt || card.data.name,
        action: 'DESTROY_SPELL_TRAP',
        maxTargets,
        selectedUids: [],
        cardUid: options?.cardUid ?? card.uid,
        isSpell: options?.isSpell ?? false,
      });

      showNotification(actionMeta.promptMessage(Math.min(maxTargets, opponentSpellTrapCount)));
      return true;
    }

    return false;
  };

  // Clique na Zona de Magia/Armadilha do Oponente (Seleção Tática de Alvo com Mira)
  const handleOpponentSpellTrapZoneClick = (zoneIndex: number) => {
    const card = p2.spellTrapZones[zoneIndex];
    if (card) setInspectedCard(card);

    if (tacticalTargetSelection && tacticalTargetSelection.action === 'DESTROY_SPELL_TRAP' && card) {
      const isAlreadySelected = tacticalTargetSelection.selectedUids.includes(card.uid);
      let nextSelectedUids: string[];

      if (isAlreadySelected) {
        nextSelectedUids = tacticalTargetSelection.selectedUids.filter((uid) => uid !== card.uid);
      } else {
        if (tacticalTargetSelection.selectedUids.length >= tacticalTargetSelection.maxTargets) {
          if (tacticalTargetSelection.maxTargets === 1) {
            nextSelectedUids = [card.uid];
          } else {
            nextSelectedUids = [
              ...tacticalTargetSelection.selectedUids.slice(0, tacticalTargetSelection.maxTargets - 1),
              card.uid,
            ];
          }
        } else {
          nextSelectedUids = [...tacticalTargetSelection.selectedUids, card.uid];
        }
      }

      setTacticalTargetSelection({
        ...tacticalTargetSelection,
        selectedUids: nextSelectedUids,
      });
    }
  };

  // Clique na Zona de Monstro do Jogador
  const handlePlayerMonsterZoneClick = (zoneIndex: number) => {
    if (!isPlayerTurn || match.isGameOver) return;

    // Se há carta da mão selecionada
    if (selectedHandCardUid) {
      const card = p1.hand.find((c) => c.uid === selectedHandCardUid);
      if (!card) return;

      // Blindagem: Cartas Mágicas e Armadilhas NÃO podem ser colocadas nas Zonas de Monstro
      if (isSpellOrTrapCard(card)) {
        showNotification(
          languagePt
            ? '⚠️ Cartas Mágicas e Armadilhas só podem ser colocadas nas Zonas de Magia e Armadilha (M/A) abaixo!'
            : '⚠️ Spell and Trap cards can only be placed in the Spell & Trap Zones (M/A) below!'
        );
        return;
      }

      // Invocação de Monstro permitida na Fase Principal 1
      if (match.phase === 'MAIN1') {
        const requiredTributes = card.data.level <= 4 ? 0 : card.data.level <= 6 ? 1 : 2;
        const targetMonster = p1.monsterZones[zoneIndex];

        // Caso com Sacrifício (Nível 5+)
      if (requiredTributes > 0) {
        // Se já selecionou os sacrifícios necessários:
        // Clicar em qualquer uma das zonas sacrificadas OU em uma zona vazia dispara a invocação imediata!
        if (selectedTributeZones.length === requiredTributes) {
          if (selectedTributeZones.includes(zoneIndex) || targetMonster === null) {
            setSummonChoiceModal({
              zoneIndex,
              tributeIndices: selectedTributeZones,
              card,
            });
            return;
          }
          showNotification(
            languagePt
              ? `⚠️ Você já selecionou os ${requiredTributes} sacrifício(s). Clique em uma das zonas liberadas ou vazias para invocar!`
              : `⚠️ You already selected ${requiredTributes} tribute(s). Click on one of the vacated or empty zones to summon!`
          );
          return;
        }

        // Se ainda não completou a seleção de sacrifícios:
        if (targetMonster !== null) {
          if (selectedTributeZones.includes(zoneIndex)) {
            // Desmarca o tributo
            setSelectedTributeZones(selectedTributeZones.filter((z) => z !== zoneIndex));
          } else {
            // Adiciona como tributo
            const nextTributes = [...selectedTributeZones, zoneIndex];
            setSelectedTributeZones(nextTributes);

            if (nextTributes.length === requiredTributes) {
              const cardName = (languagePt && card.data.namePt) ? card.data.namePt : card.data.name;
              showNotification(
                languagePt
                  ? `✨ ${requiredTributes} sacrifício(s) pronto(s)! Agora clique na zona onde deseja baixar ${cardName}!`
                  : `✨ ${requiredTributes} tribute(s) ready! Now click on the zone to summon ${cardName}!`
              );
            }
          }
          return;
        }

        // Clicou numa zona vazia antes de selecionar os sacrifícios
        showNotification(
          languagePt
            ? `⚠️ Monstro Nível ${card.data.level} exige selecionar ${requiredTributes} monstro(s) no seu campo como sacrifício primeiro!`
            : `⚠️ Level ${card.data.level} monster requires selecting ${requiredTributes} monster(s) on your field as tribute first!`
        );
        return;
      }

      // Caso sem Sacrifício (Nível 1 a 4) -> Pergunta ao jogador se deseja invocar em Ataque ou Baixar virado para baixo
        if (targetMonster === null) {
          setSummonChoiceModal({
            zoneIndex,
            tributeIndices: [],
            card,
          });
        }
        return;
      }
      return;
    }

    const currentMonster = p1.monsterZones[zoneIndex];
    if (!currentMonster) return;

    setInspectedCard(currentMonster);

    // 2. Mudança de Posição Ilimitada ao Clicar na Carta (Apenas na Fase Principal)
    if (match.phase === 'MAIN1' || match.phase === 'MAIN2') {
      if (selectedHandCardUid === null && selectedAttackerZone === null) {
        // Trava de Flip: Um monstro baixado virado para baixo não pode ser virado no mesmo turno
        if (
          currentMonster.isFaceDown &&
          currentMonster.turnSet !== undefined &&
          currentMonster.turnSet === match.currentTurn
        ) {
          showNotification(
            languagePt
              ? '⏳ Esta carta foi baixada neste turno e só poderá ser revelada no próximo turno!'
              : '⏳ This card was set this turn and can only be flipped next turn!'
          );
          return;
        }

        // Verifica de forma 100% genérica se a carta virada para baixo requer mira tática via metadados
        if (currentMonster.isFaceDown && checkCardRequiresTargeting(currentMonster, zoneIndex)) {
          return;
        }

        executeFlipPositionChange(zoneIndex);
        return;
      }
    }

    // 3. Seleção de Ataque (BATTLE PHASE)
    if (match.phase === 'BATTLE') {
      if (currentMonster.position === 'ATTACK' && !currentMonster.hasAttacked) {
        if (currentMonster.turnSummoned === match.currentTurn) {
          showNotification(
            languagePt
              ? '⏳ Este monstro foi invocado neste turno e só poderá atacar no próximo turno!'
              : '⏳ This monster was summoned this turn and cannot attack until next turn!'
          );
          return;
        }
        setSelectedAttackerZone(selectedAttackerZone === zoneIndex ? null : zoneIndex);
      } else if (currentMonster.position === 'DEFENSE') {
        showNotification(
          languagePt
            ? '🛡️ Monstros em Posição de Defesa não podem atacar!'
            : '🛡️ Monsters in Defense Position cannot attack!'
        );
      }
    }
  };

  // Executa a mudança de posição e resolução de efeito FLIP com ou sem alvos selecionados
  const executeFlipPositionChange = (zoneIndex: number, selectedTargetUids?: string[]) => {
    const posResult = session.changeMonsterPosition(zoneIndex, selectedTargetUids);
    if (posResult.success) {
      soundFX.playPlaceCard();
      setFlippedZones((prev) => [...prev, { isPlayer: true, zoneIndex }]);
      setTimeout(() => {
        setFlippedZones((prev) => prev.filter((z) => !(z.isPlayer && z.zoneIndex === zoneIndex)));
      }, 450);

      if (posResult.flipped && posResult.flipEffect) {
        setFlipEffectBanner(posResult.flipEffect);
        setTimeout(() => setFlipEffectBanner(null), 3000);

        if (posResult.flipEffect.action === 'DESTROY_MONSTER') {
          soundFX.playDestruction();
          const targetUids = posResult.flipEffect.targetCardUids || (posResult.flipEffect.targetCardUid ? [posResult.flipEffect.targetCardUid] : []);
          if (targetUids.length > 0) {
            triggerCardDestruction(targetUids);
          }
          if (posResult.flipEffect.targetName) {
            showNotification(
              languagePt
                ? `🪲 Efeito FLIP: ${posResult.flipEffect.targetName} do oponente foi destruído!`
                : `🪲 FLIP Effect: Opponent's ${posResult.flipEffect.targetName} was destroyed!`
            );
          }
        } else if (posResult.flipEffect.action === 'RETURN_TO_HAND') {
          soundFX.playReturnToHand();
          if (posResult.flipEffect.targetNames && posResult.flipEffect.targetNames.length > 0) {
            showNotification(
              languagePt
                ? `🐧 Efeito FLIP: ${posResult.flipEffect.targetNames.join(', ')} retornou para a mão do oponente!`
                : `🐧 FLIP Effect: ${posResult.flipEffect.targetNames.join(', ')} returned to opponent's hand!`
            );
          } else if (posResult.flipEffect.targetName) {
            showNotification(
              languagePt
                ? `🐧 Efeito FLIP: ${posResult.flipEffect.targetName} retornou para a mão do oponente!`
                : `🐧 FLIP Effect: ${posResult.flipEffect.targetName} returned to opponent's hand!`
            );
          }
        }
      }

      setTacticalTargetSelection(null);
      forceUpdate();
    }
  };

  // Executa Invocação Direta ou Baixar virado para baixo
  const executeSummon = (
    zoneIndex: number,
    tributeIndices: number[],
    position: BattlePosition = 'ATTACK',
    isFaceDown: boolean = false
  ) => {
    if (selectedHandCardUid === null) return;
    const success = session.normalSummon(selectedHandCardUid, zoneIndex, position, tributeIndices, isFaceDown);
    if (success) {
      setSelectedHandCardUid(null);
      setPendingSummonZone(null);
      setSelectedTributeZones([]);
      setSummonChoiceModal(null);

      // 1. VFX de Posicionamento: Card Slam e Som de Impacto
      soundFX.playPlaceCard();
      setSlamZone({ isPlayer: true, zoneIndex });
      scheduleTimer(() => setSlamZone(null), 500);

      // 2. Verifica se o Bot possui Trap Hole (Buraco Armadilha) armada contra a Invocação Normal aberta do Jogador
      if (!isFaceDown) {
        const summonedCard = p1.monsterZones[zoneIndex];
        if (summonedCard) {
          const summonedUid = summonedCard.uid;
          const summonedName =
            languagePt && summonedCard.data.namePt
              ? summonedCard.data.namePt
              : summonedCard.data.name;
          const trapTriggered = DuelBot.tryActivateTrapHoleOnSummon(session, p2.id, zoneIndex);
          if (trapTriggered) {
            soundFX.playDestruction();
            setIsCameraShaking(true);
            scheduleTimer(() => setIsCameraShaking(false), 400);
            triggerCardDestruction(summonedUid);
            showNotification(
              languagePt
                ? `🕳️ ARMADILHA DO OPONENTE! Buraco Armadilha destruiu ${summonedName}!`
                : `🕳️ OPPONENT TRAP! Trap Hole destroyed ${summonedName}!`
            );
          }
        }
      }

      forceUpdate();
    } else {
      showNotification(languagePt ? '❌ Falha ao invocar monstro. Verifique as regras.' : '❌ Failed to summon monster. Check the rules.');
    }
  };

  // Clique na Zona de Magias e Armadilhas do Jogador
  const handlePlayerSpellTrapZoneClick = (zoneIndex: number) => {
    if (match.isGameOver) return;

    const currentSlot = p1.spellTrapZones[zoneIndex];

    // Se estiver no turno do oponente: permite inspecionar e ativar armadilhas livres (ex: Waboku)
    if (!isPlayerTurn) {
      if (currentSlot) {
        setInspectedCard(currentSlot);

        if (isTrapCard(currentSlot) && currentSlot.isFaceDown) {
          if (typeof currentSlot.turnSet === 'number' && currentSlot.turnSet < match.currentTurn) {
            const action = currentSlot.data.effectDefinition?.action;
            const isWaboku =
              action === 'WABOKU_SHIELD' ||
              action === 'PREVENT_BATTLE_DAMAGE_TURN' ||
              action === 'PREVENT_BATTLE_DAMAGE_AND_DESTRUCTION' ||
              action === 'PREVENT_BATTLE_DAMAGE' ||
              action === 'WABOKU' ||
              currentSlot.data.id === '12607053' ||
              currentSlot.data.name.toLowerCase() === 'waboku';

            if (isWaboku) {
              const cardName =
                languagePt && currentSlot.data.namePt ? currentSlot.data.namePt : currentSlot.data.name;
              setPriorityPrompt({
                type: 'WABOKU',
                badge: languagePt ? 'ARMADILHA NORMAL' : 'NORMAL TRAP',
                badgeIcon: '🕊️',
                title: languagePt ? '⚡ ATIVAÇÃO DE ARMADILHA' : '⚡ TRAP ACTIVATION',
                cardName,
                cardImage: currentSlot.data.imageUrl,
                cardType: 'TRAP',
                accentColor: 'sky',
                message: languagePt
                  ? `⚡ Ativar ${cardName} agora? Uma aura sagrada envolverá seus monstros, impedindo sua destruição em batalha e reduzindo todo dano de batalha a 0 neste turno.`
                  : `⚡ Activate ${cardName} now? A sacred aura will protect your monsters from battle destruction and reduce battle damage to 0 this turn.`,
                confirmText: languagePt ? 'Ativar Armadilha ⚡' : 'Activate Trap ⚡',
                declineText: languagePt ? 'Guardar / Passar ❌' : 'Keep / Cancel ❌',
                onConfirm: () => {
                  setPriorityPrompt(null);
                  handleActivateWaboku(zoneIndex);
                },
                onDecline: () => {
                  setPriorityPrompt(null);
                },
              });
              return;
            } else {
              showNotification(
                languagePt
                  ? '🪤 Esta armadilha é de ativação reativa (ex: Força Espelho, Buraco Armadilha) e responderá a ações específicas do oponente!'
                  : '🪤 This trap triggers in response to specific opponent actions!'
              );
              return;
            }
          } else {
            showNotification(
              languagePt
                ? '⏳ Armadilhas baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.'
                : '⏳ Set traps cannot be activated during the same turn they were placed.'
            );
            return;
          }
        } else {
          showNotification(
            languagePt
              ? '⚠️ Você não pode ativar cartas mágicas normais durante o turno do oponente!'
              : '⚠️ You cannot activate normal spells during opponent turn!'
          );
          return;
        }
      }
      return;
    }

    if (match.phase !== 'MAIN1' && match.phase !== 'MAIN2') {
      showNotification(
        languagePt
          ? '⚠️ Cartas Mágicas e Armadilhas só podem ser baixadas ou ativadas nas Fases Principais!'
          : '⚠️ Spell and Trap cards can only be set or activated during Main Phases!'
      );
      return;
    }

    // Se nenhuma carta da mão estiver selecionada e a zona tiver carta
    if (!selectedHandCardUid) {
      if (currentSlot) {
        setInspectedCard(currentSlot);

        // Se for Carta Mágica virada para baixo e foi colocada em turno anterior (turnSet < currentTurn):
        if (isSpellCard(currentSlot) && currentSlot.isFaceDown) {
          if (typeof currentSlot.turnSet === 'number' && currentSlot.turnSet < match.currentTurn) {
            setSpellChoiceModal({
              zoneIndex,
              card: currentSlot,
              isFromField: true,
            });
          } else {
            showNotification(
              languagePt
                ? '⏳ Cartas Mágicas baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.'
                : '⏳ Set Spell cards cannot be activated during the same turn they were placed on the field.'
            );
          }
        }

        // Se for Carta Armadilha virada para baixo:
        if (isTrapCard(currentSlot) && currentSlot.isFaceDown) {
          if (typeof currentSlot.turnSet === 'number' && currentSlot.turnSet < match.currentTurn) {
            const action = currentSlot.data.effectDefinition?.action;
            const isWaboku =
              action === 'WABOKU_SHIELD' ||
              action === 'PREVENT_BATTLE_DAMAGE_TURN' ||
              action === 'PREVENT_BATTLE_DAMAGE_AND_DESTRUCTION' ||
              action === 'PREVENT_BATTLE_DAMAGE' ||
              action === 'WABOKU' ||
              currentSlot.data.id === '12607053' ||
              currentSlot.data.name.toLowerCase() === 'waboku';

            if (isWaboku) {
              const cardName =
                languagePt && currentSlot.data.namePt ? currentSlot.data.namePt : currentSlot.data.name;
              setPriorityPrompt({
                type: 'WABOKU',
                badge: languagePt ? 'ARMADILHA NORMAL' : 'NORMAL TRAP',
                badgeIcon: '🕊️',
                title: languagePt ? '⚡ ATIVAÇÃO DE ARMADILHA' : '⚡ TRAP ACTIVATION',
                cardName,
                cardImage: currentSlot.data.imageUrl,
                cardType: 'TRAP',
                accentColor: 'sky',
                message: languagePt
                  ? `⚡ Ativar ${cardName} agora? Uma aura sagrada envolverá seus monstros, impedindo sua destruição em batalha e reduzindo todo dano de batalha a 0 neste turno.`
                  : `⚡ Activate ${cardName} now? A sacred aura will protect your monsters from battle destruction and reduce battle damage to 0 this turn.`,
                confirmText: languagePt ? 'Ativar Armadilha ⚡' : 'Activate Trap ⚡',
                declineText: languagePt ? 'Guardar / Passar ❌' : 'Keep / Cancel ❌',
                onConfirm: () => {
                  setPriorityPrompt(null);
                  handleActivateWaboku(zoneIndex);
                },
                onDecline: () => {
                  setPriorityPrompt(null);
                },
              });
              return;
            } else {
              showNotification(
                languagePt
                  ? '🪤 Esta armadilha é de ativação reativa e será disparada automaticamente em resposta às ações do adversário!'
                  : '🪤 This trap is reactive and triggers automatically in response to opponent actions!'
              );
            }
          } else {
            showNotification(
              languagePt
                ? '⏳ Cartas Armadilha baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.'
                : '⏳ Set Trap cards cannot be activated during the same turn they were placed on the field.'
            );
          }
        }
      }
      return;
    }

    const selectedCard = p1.hand.find((c) => c.uid === selectedHandCardUid);
    if (!selectedCard) return;

    // Blindagem: Monstros NÃO podem ser colocados nas Zonas de Magia e Armadilha
    if (isMonsterCard(selectedCard)) {
      showNotification(
        languagePt
          ? '⚠️ Monstros só podem ser invocados nas Zonas de Monstros!'
          : '⚠️ Monsters can only be summoned in Monster Zones!'
      );
      return;
    }

    if (!isSpellOrTrapCard(selectedCard)) {
      showNotification(
        languagePt
          ? '⚠️ Apenas Cartas Mágicas ou Armadilhas podem ser colocadas nestas zonas!'
          : '⚠️ Only Spell or Trap cards can be placed in these zones!'
      );
      return;
    }

    if (currentSlot !== null) {
      showNotification(
        languagePt
          ? '⚠️ Esta zona já está ocupada por outra carta!'
          : '⚠️ This zone is already occupied by another card!'
      );
      return;
    }

    const isSpell = isSpellCard(selectedCard);
    const isTrap = isTrapCard(selectedCard);

    // Se for Carta Mágica: exibe modal de escolha (Ativar Imediatamente ou Baixar Virada para Baixo)
    if (isSpell) {
      setSpellChoiceModal({
        zoneIndex,
        card: selectedCard,
      });
      return;
    }

    // Se for Carta Armadilha: baixa virada para baixo diretamente
    if (isTrap) {
      handleSetSpellTrap(selectedCard, zoneIndex);
      return;
    }
  };

  // Executa o Baixar de Magia ou Armadilha virada para baixo
  const handleSetSpellTrap = (card: CardInstance, zoneIndex: number) => {
    const success = session.setSpellTrap(card.uid, zoneIndex);
    if (success) {
      setSelectedHandCardUid(null);
      setSpellChoiceModal(null);
      soundFX.playPlaceCard();

      const typeLower = card.data.type.toLowerCase();
      const isTrap = typeLower.includes('trap') || typeLower.includes('armadilha');
      const cardTypeLabel = isTrap ? (languagePt ? 'Armadilha' : 'Trap') : (languagePt ? 'Mágica' : 'Spell');

      showNotification(
        languagePt
          ? `🎴 Carta ${cardTypeLabel} baixada virada para baixo na zona!`
          : `🎴 ${cardTypeLabel} card set face-down in the zone!`
      );
      forceUpdate();
    } else {
      showNotification(languagePt ? '❌ Não foi possível baixar a carta.' : '❌ Failed to set card.');
    }
  };

  // Executa a Ativação de Waboku pelo Jogador
  const handleActivateWaboku = (zoneIndex: number) => {
    const success = session.activateWaboku(p1.id, zoneIndex);
    if (success) {
      soundFX.playMagicShield();
      showNotification(
        languagePt
          ? '🕊️ Waboku ativado! Uma aura sagrada azul e branca protege seus monstros contra destruição e anula todo dano de batalha neste turno!'
          : '🕊️ Waboku activated! A sacred blue and white aura protects your monsters from destruction and prevents battle damage this turn!'
      );
      setPriorityPrompt(null);
      forceUpdate();
    }
  };

  // Executa a Ativação de Carta Mágica com VFX cinematográficos
  const handleActivateSpell = (card: CardInstance, zoneIndex?: number) => {
    const action = card.data.effectDefinition?.action;
    const cardDisplayName = languagePt && card.data.namePt ? card.data.namePt : card.data.name;

    // Efeito Raigeki: Destrói todos os monstros do oponente com animação de relâmpago e explosão
    if (
      action === 'DESTROY_ALL_OPPONENT_MONSTERS' ||
      action === 'DESTROY_OPPONENT_MONSTERS' ||
      action === 'RAIGEKI' ||
      card.data.id === '12580477'
    ) {
      const oppMonsterUids: string[] = [];
      p2.monsterZones.forEach((m) => m && oppMonsterUids.push(m.uid));

      soundFX.playAttackStrike();
      setIsCameraShaking(true);
      setTimeout(() => setIsCameraShaking(false), 800);

      setRaigekiActive(true);
      setTimeout(() => setRaigekiActive(false), 900);

      if (oppMonsterUids.length > 0) {
        triggerCardDestruction(oppMonsterUids);
        soundFX.playDestruction();
      }

      const success = session.activateSpell(card.uid, zoneIndex);
      if (success) {
        setSelectedHandCardUid(null);
        setSpellChoiceModal(null);
        showNotification(
          languagePt
            ? `⚡ ${cardDisplayName} ativado! Todos os monstros do oponente foram aniquilados pelo relâmpago!`
            : `⚡ ${cardDisplayName} activated! All opponent monsters were destroyed by lightning!`
        );
        forceUpdate();
      }
      return;
    }

    // Efeito Dark Hole (Buraco Negro): Destrói todos os monstros em ambos os campos
    if (action === 'DESTROY_ALL_MONSTERS') {
      const allMonsterUids: string[] = [];
      p1.monsterZones.forEach((m) => m && allMonsterUids.push(m.uid));
      p2.monsterZones.forEach((m) => m && allMonsterUids.push(m.uid));

      if (allMonsterUids.length > 0) {
        triggerCardDestruction(allMonsterUids);
      }
      soundFX.playDestruction();
      setIsCameraShaking(true);
      setTimeout(() => setIsCameraShaking(false), 800);

      const success = session.activateSpell(card.uid, zoneIndex);
      if (success) {
        setSelectedHandCardUid(null);
        setSpellChoiceModal(null);
        showNotification(
          languagePt
            ? `🕳️ ${cardDisplayName} ativado! O campo foi aniquilado!`
            : `🕳️ ${cardDisplayName} activated! The entire field was destroyed!`
        );
        forceUpdate();
      }
      return;
    }

    // Efeito Pot of Greed (Pote da Ganância): Compra 2 cartas
    if (action === 'DRAW_CARDS') {
      const currentHandUids = new Set(p1.hand.map((c) => c.uid));
      const success = session.activateSpell(card.uid, zoneIndex);
      if (success) {
        setSelectedHandCardUid(null);
        setSpellChoiceModal(null);
        soundFX.playDrawCard();

        const newlyDrawn = p1.hand.filter((c) => !currentHandUids.has(c.uid)).map((c) => c.uid);
        if (newlyDrawn.length > 0) {
          setRecentDrawnUids(newlyDrawn);
          setTimeout(() => setRecentDrawnUids([]), 1200);
        }

        showNotification(
          languagePt
            ? `🏺 ${cardDisplayName} ativado! Você comprou 2 cartas!`
            : `🏺 ${cardDisplayName} activated! You drew 2 cards!`
        );
        forceUpdate();
      }
      return;
    }

    // Efeito de Recuperação de Vida (Cura): GAIN_LP
    if (action === 'GAIN_LP') {
      const value = Number(card.data.effectDefinition?.value || 1000);
      soundFX.playDrawCard();
      setFloatingHeal({ amount: value });
      setTimeout(() => setFloatingHeal(null), 1400);

      const success = session.activateSpell(card.uid, zoneIndex);
      if (success) {
        setSelectedHandCardUid(null);
        setSpellChoiceModal(null);
        showNotification(
          languagePt
            ? `💚 ${cardDisplayName} ativado! Você recuperou ${value} Pontos de Vida!`
            : `💚 ${cardDisplayName} activated! You gained ${value} Life Points!`
        );
        forceUpdate();
      }
      return;
    }

    // Efeito de Dano Direto: INFLICT_DAMAGE
    if (action === 'INFLICT_DAMAGE') {
      const value = Number(card.data.effectDefinition?.value || 800);
      soundFX.playAttackStrike();
      setIsCameraShaking(true);
      setTimeout(() => setIsCameraShaking(false), 350);
      setFloatingDamage({ amount: value, isPlayer: false, zoneIndex: null });
      setTimeout(() => setFloatingDamage(null), 1400);

      const success = session.activateSpell(card.uid, zoneIndex);
      if (success) {
        setSelectedHandCardUid(null);
        setSpellChoiceModal(null);
        showNotification(
          languagePt
            ? `🔥 ${cardDisplayName} causou ${value} de dano direto aos LPs do adversário!`
            : `🔥 ${cardDisplayName} inflicted ${value} direct damage to opponent's LP!`
        );
        forceUpdate();
      }
      return;
    }

    // Efeito de Destruição de Magia/Armadilha: DESTROY_SPELL_TRAP
    if (action === 'DESTROY_SPELL_TRAP') {
      if (checkCardRequiresTargeting(card, zoneIndex ?? 0, { isSpell: true, cardUid: card.uid })) {
        setSelectedHandCardUid(null);
        setSpellChoiceModal(null);
        return;
      }
      return;
    }

    // Outras cartas mágicas (verifica antes se requerem mira tática via metadados)
    if (checkCardRequiresTargeting(card, zoneIndex ?? 0, { isSpell: true, cardUid: card.uid })) {
      setSelectedHandCardUid(null);
      setSpellChoiceModal(null);
      return;
    }

    const success = session.activateSpell(card.uid, zoneIndex);
    if (success) {
      setSelectedHandCardUid(null);
      setSpellChoiceModal(null);
      soundFX.playPlaceCard();
      showNotification(
        languagePt
          ? `✨ ${cardDisplayName} ativado!`
          : `✨ ${cardDisplayName} activated!`
      );
      forceUpdate();
    } else {
      showNotification(languagePt ? '❌ Falha ao ativar Carta Mágica.' : '❌ Failed to activate Spell card.');
    }
  };

  // Clique no Monstro do Oponente (Declaração de Ataque ou Seleção Tática de Alvo)
  const handleOpponentZoneClick = (targetZoneIndex: number | null) => {
    if (targetZoneIndex !== null) {
      const monster = p2.monsterZones[targetZoneIndex];
      if (monster) setInspectedCard(monster);

      // Se a seleção tática genérica de alvos (monstro FLIP ou magia com alvo) estiver ativa:
      if (tacticalTargetSelection && monster) {
        const isAlreadySelected = tacticalTargetSelection.selectedUids.includes(monster.uid);
        let nextSelectedUids: string[];

        if (isAlreadySelected) {
          nextSelectedUids = tacticalTargetSelection.selectedUids.filter((uid) => uid !== monster.uid);
        } else {
          if (tacticalTargetSelection.selectedUids.length >= tacticalTargetSelection.maxTargets) {
            // Se atingiu o limite maxTargets: se maxTargets === 1, substitui; se > 1, substitui o último
            if (tacticalTargetSelection.maxTargets === 1) {
              nextSelectedUids = [monster.uid];
            } else {
              nextSelectedUids = [...tacticalTargetSelection.selectedUids.slice(0, tacticalTargetSelection.maxTargets - 1), monster.uid];
            }
          } else {
            nextSelectedUids = [...tacticalTargetSelection.selectedUids, monster.uid];
          }
        }

        setTacticalTargetSelection({
          ...tacticalTargetSelection,
          selectedUids: nextSelectedUids,
        });
        return;
      }
    }

    if (!isPlayerTurn || match.phase !== 'BATTLE' || selectedAttackerZone === null) return;

    const attackerZone = selectedAttackerZone;
    const attackingCard = p1.monsterZones[attackerZone];
    const defendingCard = targetZoneIndex !== null ? p2.monsterZones[targetZoneIndex] : null;

    if (!attackingCard) return;

    // Checa se o Bot possui Mirror Force baixada com turnSet < currentTurn
    const botMirrorResult = DuelBot.tryActivateMirrorForceOnAttack(session, p2.id);
    if (botMirrorResult.activated) {
      soundFX.playDestruction();
      setIsCameraShaking(true);
      setTimeout(() => setIsCameraShaking(false), 500);

      if (botMirrorResult.destroyedUids.length > 0) {
        triggerCardDestruction(botMirrorResult.destroyedUids);
      }

      setCelebratoryBanner({
        title: languagePt
          ? '🪞 O ADVERSÁRIO ATIVOU FORÇA ESPELHO! Seu ataque foi refletido e todos os seus monstros de ataque foram destruídos!'
          : '🪞 OPPONENT ACTIVATED MIRROR FORCE! Your attack was reflected and all your attack position monsters were destroyed!',
        icon: '🪞',
      });
      setTimeout(() => setCelebratoryBanner(null), 3500);

      showNotification(
        languagePt
          ? '🪞 O Bot ativou Força Espelho! Seus monstros em modo de ataque foram aniquilados!'
          : '🪞 Opponent activated Mirror Force! Your attack position monsters were destroyed!'
      );

      setSelectedAttackerZone(null);
      forceUpdate();
      return;
    }

    // 3. Efeitos de Ataque: Animação de Investida (Lunge) com vetor direcional exato
    const { deltaX, deltaY } = calculateLungeDelta(true, attackerZone, targetZoneIndex);
    setLungingZone({ isPlayer: true, zoneIndex: attackerZone, deltaX, deltaY });
    setSelectedAttackerZone(null);

    // Timing do Impacto: Dispara exatamente no clímax do Lunge (280ms)
    setTimeout(() => {
      // Disparo do Efeito Sonoro e Camera Shake
      soundFX.playAttackStrike();
      setIsCameraShaking(true);
      setTimeout(() => setIsCameraShaking(false), 280);

      // VFX no Destino (Anel de impacto / Explosão)
      setTargetHitZone({ isPlayer: false, zoneIndex: targetZoneIndex });
      setTimeout(() => setTargetHitZone(null), 500);

      // Calcular Dano e Destruição para Feedback Visual com ATK Efetivo
      const attackerEffAtk = session.getEffectiveAttack(attackingCard, p1, p2);
      const isBotWaboku = session.isWabokuActiveForPlayerId === p2.id;
      const isPlayerWaboku = session.isWabokuActiveForPlayerId === p1.id;

      if (targetZoneIndex === null) {
        // Ataque Direto
        const dmg = isBotWaboku ? 0 : attackerEffAtk;
        if (isBotWaboku) {
          soundFX.playMagicShield();
          showNotification(
            languagePt
              ? '🕊️ O oponente está protegido pela aura sagrada de Waboku! O dano direto foi anulado!'
              : '🕊️ Opponent is protected by Waboku! Direct damage was negated!'
          );
        } else {
          setFloatingDamage({ amount: dmg, isPlayer: false, zoneIndex: null });
          setTimeout(() => setFloatingDamage(null), 1200);
        }
      } else if (defendingCard) {
        // Monstro vs Monstro
        const defenderEffAtk = session.getEffectiveAttack(defendingCard, p2, p1);

        // Se a carta defensora estava virada para baixo, revela e aciona animação 3D de flip
        const wasFaceDown = Boolean(defendingCard.isFaceDown);
        if (wasFaceDown) {
          defendingCard.isFaceDown = false;
          setFlippedZones((prev) => [...prev, { isPlayer: false, zoneIndex: targetZoneIndex! }]);
          setTimeout(() => {
            setFlippedZones((prev) => prev.filter((z) => !(!z.isPlayer && z.zoneIndex === targetZoneIndex)));
          }, 450);
        }

        const isDefendingFlipDefense = wasFaceDown && defendingCard.position === 'DEFENSE' && defendingCard.data.effectType === 'FLIP';

        // Checa se o alvo em DEFENSE possui Efeito FLIP (apenas se estava virado para baixo)
        if (isDefendingFlipDefense) {
          const flipName = (languagePt && defendingCard.data.namePt) ? defendingCard.data.namePt : defendingCard.data.name;
          const action = defendingCard.data.effectDefinition?.action;
          setFlipEffectBanner({ cardName: flipName, action: action || 'FLIP' });
          setTimeout(() => setFlipEffectBanner(null), 2500);

          if (action === 'DESTROY_MONSTER') {
            triggerCardDestruction(attackingCard.uid);
            soundFX.playDestruction();
          } else if (action === 'RETURN_TO_HAND') {
            soundFX.playReturnToHand();
          }

          // Interrompe o ataque: defensor não é destruído e não há dano
          session.declareAttack(attackerZone, targetZoneIndex);
          forceUpdate();
          return;
        }

        let dmg = 0;
        if (defendingCard.position === 'ATTACK') {
          if (attackerEffAtk > defenderEffAtk) {
            dmg = isBotWaboku ? 0 : attackerEffAtk - defenderEffAtk;
            if (!isBotWaboku) {
              triggerCardDestruction(defendingCard.uid);
              soundFX.playDestruction();
            } else {
              soundFX.playMagicShield();
              showNotification(
                languagePt
                  ? '🕊️ O monstro do oponente foi protegido pela aura sagrada de Waboku!'
                  : '🕊️ Opponent monster was protected by Waboku!'
              );
            }
          } else if (attackerEffAtk < defenderEffAtk) {
            dmg = isPlayerWaboku ? 0 : defenderEffAtk - attackerEffAtk;
            if (!isPlayerWaboku) {
              triggerCardDestruction(attackingCard.uid);
              soundFX.playDestruction();
            } else {
              soundFX.playMagicShield();
            }
          } else {
            // Empate
            if (!isBotWaboku && !isPlayerWaboku) {
              triggerCardDestruction([attackingCard.uid, defendingCard.uid]);
            } else if (!isBotWaboku) {
              triggerCardDestruction(defendingCard.uid);
            } else if (!isPlayerWaboku) {
              triggerCardDestruction(attackingCard.uid);
            }
            soundFX.playDestruction();
          }
        } else {
          // DEFENSE
          if (attackerEffAtk > defendingCard.data.defense) {
            if (!isBotWaboku) {
              triggerCardDestruction(defendingCard.uid);
              soundFX.playDestruction();
            } else {
              soundFX.playMagicShield();
              showNotification(
                languagePt
                  ? '🕊️ O monstro em defesa foi protegido pela aura sagrada de Waboku!'
                  : '🕊️ Opponent defense monster was protected by Waboku!'
              );
            }
          } else if (attackerEffAtk < defendingCard.data.defense) {
            dmg = isPlayerWaboku ? 0 : defendingCard.data.defense - attackerEffAtk;
          }
        }

        if (dmg > 0) {
          setFloatingDamage({ amount: dmg, isPlayer: attackerEffAtk < defenderEffAtk, zoneIndex: targetZoneIndex });
          setTimeout(() => setFloatingDamage(null), 1200);
        }
      }

      // Executa no motor de regras após impacto
      session.declareAttack(attackerZone, targetZoneIndex);
      forceUpdate();
    }, 280);

    // Finaliza o Lunge apenas após o ciclo completo da animação (540ms)
    setTimeout(() => {
      setLungingZone(null);
      forceUpdate();
    }, 540);
  };

  // Ativação da Roleta do Tempo de Time Wizard
  const handleActivateTimeWizard = (zoneIndex: number) => {
    if (!isPlayerTurn || (match.phase !== 'MAIN1' && match.phase !== 'MAIN2')) {
      showNotification(languagePt ? '⏳ O efeito só pode ser ativado na Fase Principal!' : '⏳ Effect can only be activated during Main Phase!');
      return;
    }

    const card = p1.monsterZones[zoneIndex];
    if (!card || card.hasUsedEffectThisTurn) {
      showNotification(languagePt ? '⚠️ Time Wizard já usou o efeito neste turno!' : '⚠️ Time Wizard already used its effect this turn!');
      return;
    }

    // 1. Som de roleta girando e modal animado
    soundFX.playRouletteSpin();
    setTimeWizardRoulette({ isSpinning: true });

    setTimeout(() => {
      // 2. Executa a lógica de 50/50 do Time Wizard
      const result = session.activateTimeWizard(zoneIndex);
      setTimeWizardRoulette({ isSpinning: false, outcome: result.outcome });

      if (result.outcome === 'HEADS') {
        soundFX.playDestruction();
        setIsCameraShaking(true);
        setTimeout(() => setIsCameraShaking(false), 350);

        triggerCardDestruction(result.destroyedUids);
        showNotification(languagePt ? '⚡ TEMPO ACELERADO! O oponente teve seu campo destruído!' : '⚡ TIME ACCELERATED! Opponent field was destroyed!');
      } else {
        soundFX.playDestruction();
        setIsCameraShaking(true);
        setTimeout(() => setIsCameraShaking(false), 350);

        triggerCardDestruction(result.destroyedUids);
        if (result.burnDamage > 0) {
          setFloatingDamage({ amount: result.burnDamage, isPlayer: true, zoneIndex: null });
          setTimeout(() => setFloatingDamage(null), 1400);
        }
        showNotification(languagePt ? '💥 FALHA TEMPORAL! Seus monstros foram destruídos!' : '💥 TIME BACKFIRE! Your monsters were destroyed!');
      }

      forceUpdate();

      // Fecha o modal da roleta após 1.4s
      setTimeout(() => {
        setTimeWizardRoulette(null);
      }, 1400);
    }, 850);
  };

  // Desistir / Sair da Partida
  const handleConfirmSurrender = () => {
    clearAllTimers();
    session.surrender(p1.id);
    setShowSurrenderModal(false);
    forceUpdate();
    if (onExitToMenu) {
      onExitToMenu();
    }
  };

  const handleResetMatch = () => {
    clearAllTimers();
    soundtrackManager.playMatchMusic();
    setSession(
      new DuelMatchSession(
        playerNickname,
        resolvePlayerDeck(),
        'Seto Kaiba (Bot)',
        createKaibaDeck()
      )
    );
    setSelectedHandCardUid(null);
    setSelectedAttackerZone(null);
    setPendingSummonZone(null);
    setSelectedTributeZones([]);
    setSummonChoiceModal(null);
    setSpellChoiceModal(null);
    setPriorityPrompt(null);
    setLungingZone(null);
    setSlamZone(null);
    setTargetHitZone(null);
    setFloatingDamage(null);
    setFloatingHeal(null);
    setRaigekiActive(false);
    setCelebratoryBanner(null);
    setCountdown(5);
    forceUpdate();
  };

  return (
    <div className="flex h-screen w-screen max-h-screen bg-[#07050d] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#180e2d] via-[#090614] to-[#030206] select-none text-slate-100 overflow-hidden font-sans relative">
      
      {/* 🔮 ALERTA VISUAL INTEGRADO NA TELA (SUBSTITUINDO ALERT NATIVO) */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-[#180e2d]/95 border-2 border-amber-400 text-amber-200 px-6 py-2.5 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.9)] backdrop-blur-md font-serif font-black text-sm tracking-wide flex items-center gap-2.5">
            <span className="text-lg text-amber-400">𓂀</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 💥 BANNER DE EFEITO FLIP ATIVADO */}
      {flipEffectBanner && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-bounce">
          <div className="bg-gradient-to-r from-purple-950 via-amber-900 to-purple-950 border-2 border-amber-300 text-amber-200 px-8 py-3 rounded-2xl shadow-[0_0_50px_rgba(245,158,11,1)] backdrop-blur-md flex items-center gap-3">
            <span className="text-3xl animate-spin">💥</span>
            <div>
              <div className="text-[10px] tracking-widest text-amber-300 font-mono uppercase font-black">
                {languagePt ? 'Efeito Especial de Virar' : 'Flip Special Effect'}
              </div>
              <div className="text-lg font-serif font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                {languagePt
                  ? `EFEITO FLIP: ${flipEffectBanner.cardName} foi ativado!`
                  : `FLIP EFFECT: ${flipEffectBanner.cardName} was activated!`}
              </div>
            </div>
            <span className="text-2xl">
              {flipEffectBanner.action === 'DESTROY_MONSTER' ? '🪲' : '🐧'}
            </span>
          </div>
        </div>
      )}



      {/* ⏳ MODAL / ROLETA DO TEMPO DE TIME WIZARD */}
      {timeWizardRoulette && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gradient-to-b from-[#1a102a] to-[#0a0512] border-2 border-yellow-400 p-8 rounded-3xl max-w-sm w-full text-center shadow-[0_0_60px_rgba(234,179,8,0.9)] flex flex-col items-center">
            <h3 className="font-serif font-black text-yellow-300 text-xl tracking-widest uppercase mb-4 drop-shadow">
              {languagePt ? 'Roleta do Tempo' : 'Time Roulette'}
            </h3>

            {/* Moeda 3D Girando */}
            <div className="w-28 h-28 my-4 rounded-full border-4 border-yellow-300 bg-gradient-to-tr from-yellow-600 via-amber-300 to-yellow-500 flex items-center justify-center shadow-[0_0_35px_rgba(250,204,21,1)] relative overflow-hidden">
              <div className={`text-5xl ${timeWizardRoulette.isSpinning ? 'anim-coin-spin' : ''}`}>
                {timeWizardRoulette.isSpinning ? '🪙' : timeWizardRoulette.outcome === 'HEADS' ? '👑' : '💀'}
              </div>
            </div>

            <div className="mt-3">
              {timeWizardRoulette.isSpinning ? (
                <p className="text-sm font-mono text-amber-200 tracking-wider animate-pulse">
                  {languagePt ? 'GIRANDO O FLUXO TEMPORAL...' : 'SPINNING TIME FLOW...'}
                </p>
              ) : timeWizardRoulette.outcome === 'HEADS' ? (
                <div className="animate-bounce">
                  <span className="text-lg font-black text-emerald-400 font-serif tracking-wide block">
                    ⚡ {languagePt ? 'CARA (HEADS)!' : 'HEADS!'}
                  </span>
                  <span className="text-xs text-emerald-200/90 font-sans mt-1 block">
                    {languagePt ? 'O campo do adversário desintegrou-se!' : 'Opponent field disintegrated!'}
                  </span>
                </div>
              ) : (
                <div className="animate-bounce">
                  <span className="text-lg font-black text-red-500 font-serif tracking-wide block">
                    💥 {languagePt ? 'COROA (TAILS)!' : 'TAILS!'}
                  </span>
                  <span className="text-xs text-red-300/90 font-sans mt-1 block">
                    {languagePt ? 'A magia temporal explodiu contra você!' : 'Time magic backfired against you!'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ⚡ ANIMAÇÃO LENDÁRIA DE RAIGEKI: RELÂMPAGOS E DESTRUIÇÃO TOTAL */}
      {raigekiActive && (
        <div className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center animate-fadeIn bg-gradient-to-b from-sky-400/40 via-yellow-200/50 to-amber-500/30 backdrop-blur-[2px]">
          <div className="absolute inset-0 bg-white/40 animate-ping"></div>
          <div className="relative text-center p-6 rounded-3xl bg-black/85 border-4 border-yellow-300 shadow-[0_0_80px_rgba(250,204,21,1)]">
            <div className="text-6xl sm:text-7xl mb-2 animate-bounce">⚡ 🌩️ ⚡</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-500 drop-shadow-[0_0_20px_rgba(250,204,21,0.9)] uppercase">
              {languagePt ? 'RAIGEKI !' : 'RAIGEKI !'}
            </h2>
            <p className="text-sm font-sans font-bold text-yellow-100 tracking-wider mt-2">
              {languagePt
                ? 'Relâmpagos celestiais aniquilam todas as forças do adversário!'
                : 'Heavenly lightning annihilates all opponent monsters!'}
            </p>
          </div>
        </div>
      )}

      {/* 🪞 BANNER COMEMORATIVO DE FORÇA ESPELHO / CARTAS LENDÁRIAS */}
      {celebratoryBanner && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90%] pointer-events-none animate-fadeIn">
          <div className="bg-gradient-to-r from-purple-950/95 via-[#1a0e2e]/95 to-purple-950/95 border-2 border-cyan-400 rounded-2xl p-4 sm:p-5 text-center shadow-[0_0_50px_rgba(34,211,238,0.85)] flex items-center justify-center gap-3">
            <span className="text-3xl sm:text-4xl animate-spin">{celebratoryBanner.icon || '🪞'}</span>
            <div className="text-sm sm:text-base font-serif font-black text-cyan-200 tracking-wide drop-shadow-[0_0_12px_rgba(34,211,238,0.9)] leading-snug">
              {celebratoryBanner.title}
            </div>
            <span className="text-3xl sm:text-4xl animate-spin">{celebratoryBanner.icon || '🪞'}</span>
          </div>
        </div>
      )}

      {/* ⚔️ JANELA DE PRIORIDADE E RESPOSTA MASTER DUEL (UNIFIED PRIORITY PROMPT) */}
      {priorityPrompt && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div
            className={`bg-gradient-to-b from-[#150f2e] via-[#090616] to-[#040209] rounded-3xl p-6 sm:p-7 max-w-sm w-full relative overflow-hidden border-2 text-center transition-all ${
              priorityPrompt.accentColor === 'cyan'
                ? 'border-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.7)]'
                : priorityPrompt.accentColor === 'amber'
                ? 'border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.7)]'
                : priorityPrompt.accentColor === 'sky'
                ? 'border-sky-400 shadow-[0_0_50px_rgba(56,189,248,0.7)]'
                : 'border-fuchsia-500 shadow-[0_0_50px_rgba(217,70,239,0.7)]'
            }`}
          >
            {/* Header Badge */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-black tracking-widest uppercase border bg-black/60 shadow-inner text-slate-200 border-slate-700">
                <span className="animate-pulse">{priorityPrompt.badgeIcon || '⚡'}</span>
                <span>{priorityPrompt.badge}</span>
              </span>
            </div>

            {/* Window Title */}
            <h3
              className={`text-lg sm:text-xl font-serif font-black tracking-widest mb-3 uppercase drop-shadow-md ${
                priorityPrompt.accentColor === 'cyan'
                  ? 'text-cyan-300'
                  : priorityPrompt.accentColor === 'amber'
                  ? 'text-amber-300'
                  : priorityPrompt.accentColor === 'sky'
                  ? 'text-sky-300'
                  : 'text-fuchsia-300'
              }`}
            >
              {priorityPrompt.title}
            </h3>

            {/* Card Preview */}
            {priorityPrompt.cardImage && (
              <div className="relative w-24 h-36 sm:w-28 sm:h-40 mx-auto mb-3 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl group">
                <img
                  src={priorityPrompt.cardImage}
                  alt={priorityPrompt.cardName}
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              </div>
            )}

            {/* Card Name */}
            <div className="text-sm sm:text-base font-serif font-black text-amber-200 mb-2 drop-shadow-sm">
              {priorityPrompt.cardName}
            </div>

            {/* Message Body */}
            <div className="text-xs sm:text-sm text-slate-200 mb-6 leading-relaxed font-sans px-1">
              {priorityPrompt.message}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={priorityPrompt.onDecline}
                className="flex-1 py-3 px-4 rounded-xl font-serif font-bold text-xs uppercase tracking-wider bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 transition-all shadow-md active:scale-95"
              >
                {priorityPrompt.declineText}
              </button>

              <button
                onClick={priorityPrompt.onConfirm}
                className={`flex-1 py-3 px-4 rounded-xl font-serif font-black text-xs uppercase tracking-wider text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-1.5 animate-pulse ${
                  priorityPrompt.accentColor === 'cyan'
                    ? 'bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_25px_rgba(34,211,238,0.8)] border border-cyan-200'
                    : priorityPrompt.accentColor === 'amber'
                    ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.8)] border border-yellow-200'
                    : priorityPrompt.accentColor === 'sky'
                    ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 hover:from-sky-300 hover:to-blue-400 shadow-[0_0_25px_rgba(56,189,248,0.8)] border border-sky-200'
                    : 'bg-gradient-to-r from-fuchsia-600 via-purple-500 to-indigo-600 hover:from-fuchsia-500 hover:to-purple-400 shadow-[0_0_25px_rgba(217,70,239,0.8)] border border-fuchsia-200'
                }`}
              >
                {priorityPrompt.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔮 OVERLAY DE CONTAGEM REGRESSIVA INICIAL (5 SEGUNDOS) */}
      {countdown !== null && (
        <div
          onClick={() => {
            soundtrackManager.unlockAudioContext();
            if (soundtrackManager.getCurrentTrack() === 'NONE') {
              soundtrackManager.playMatchMusic();
            }
          }}
          className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-fadeIn cursor-pointer"
        >
          <div className="text-6xl text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.8)] mb-4 animate-pulse">
            𓂀
          </div>
          <h2 className="text-2xl font-serif tracking-widest text-amber-300 font-black mb-6">
            A PARTIDA VAI INICIAR EM
          </h2>
          <div className="text-8xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-yellow-500 shadow-2xl scale-125 transition-transform duration-300">
            {countdown > 0 ? countdown : 'É HORA DO DUELO!'}
          </div>
          <p className="text-xs text-amber-300/80 mt-8 uppercase tracking-widest font-mono">
            {countdown > 0 ? 'Toque na tela para ativar o som • Embaralhando decks clássicos...' : 'Que os Jogos das Sombras comecem!'}
          </p>
        </div>
      )}

      {/* PAINEL LATERAL ESQUERDO: GRIMOIRE & TRADUÇÃO (ESTILO MTG / ANIME) */}
      <aside className="w-80 bg-[#0d0918]/95 border-r-2 border-[#382654] flex flex-col p-3 shadow-[5px_0_30px_rgba(0,0,0,0.85)] z-20 justify-between overflow-y-auto">
        <div className="flex flex-col items-center">
          
          {/* Topo do Grimoire com Tradução e Botão de Sair */}
          <div className="w-full flex justify-between items-center pb-2 mb-2 border-b border-[#311f49]">
            <div className="flex items-center space-x-1.5">
              <span className="text-xl text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">𓂀</span>
              <h1 className="text-xs font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-600 font-serif">
                GRIMOIRE
              </h1>
            </div>
            
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="w-7 h-7 rounded-lg bg-purple-950/80 border border-purple-500/50 hover:border-amber-400 text-amber-300 hover:text-amber-200 flex items-center justify-center text-xs transition-colors shadow-sm cursor-pointer"
                title={languagePt ? 'Configurações de Áudio e Idioma' : 'Audio and Language Settings'}
                aria-label={languagePt ? 'Abrir Configurações' : 'Open Settings'}
              >
                ⚙️
              </button>

              <button
                onClick={() => setShowSurrenderModal(true)}
                className="px-2.5 py-1 rounded text-[10px] font-bold tracking-wider bg-red-950/80 border border-red-500/50 hover:border-red-400 text-red-300 transition-colors cursor-pointer"
                title={languagePt ? 'Sair ou Render-se do Duelo' : 'Surrender or Exit Duel'}
              >
                🏳️ {languagePt ? 'Sair' : 'Exit'}
              </button>
            </div>
          </div>

          {/* Carta Inspecionada em Alta Definição */}
          {inspectedCard ? (
            (() => {
              const isPlayerOwned =
                p1.monsterZones.some((m) => m?.uid === inspectedCard.uid) ||
                p1.spellTrapZones.some((st) => st?.uid === inspectedCard.uid) ||
                p1.hand.some((c) => c.uid === inspectedCard.uid);
              const isOpponentOwned =
                p2.monsterZones.some((m) => m?.uid === inspectedCard.uid) ||
                p2.spellTrapZones.some((st) => st?.uid === inspectedCard.uid);
              const isFaceDown = inspectedCard.isFaceDown;

              // Se for carta virada para baixo do oponente, mantém o segredo
              if (isOpponentOwned && isFaceDown) {
                const isSpellOrTrap = inspectedCard.data.type.toLowerCase().includes('spell') || inspectedCard.data.type.toLowerCase().includes('trap') || inspectedCard.data.type.toLowerCase().includes('mágic') || inspectedCard.data.type.toLowerCase().includes('armadilha');
                const titleText = isSpellOrTrap
                  ? (languagePt ? 'Carta Mágica/Armadilha Oculta 𓂀' : 'Hidden Spell/Trap Card 𓂀')
                  : (languagePt ? 'Carta Oculta do Adversário 𓂀' : 'Opponent Hidden Card 𓂀');
                const descText = isSpellOrTrap
                  ? (languagePt
                      ? 'Esta carta mágica ou armadilha está virada para baixo no campo do oponente. Seu efeito será ativado no momento oportuno!'
                      : 'This spell or trap card is set face-down on the opponent field. Its effect will activate at the right moment!')
                  : (languagePt
                      ? 'Esta carta está virada para baixo no campo do oponente. Seus segredos só serão revelados quando for atacada ou virada!'
                      : 'This card is set face-down on the opponent field. Its secrets will remain hidden until attacked or flipped!');

                return (
                  <div className="flex flex-col items-center w-full animate-fadeIn">
                    <div className="relative group w-60 h-84 rounded-lg p-2 bg-gradient-to-br from-[#7a4e23] via-[#472c13] to-[#1a0f05] border-2 border-purple-500/80 shadow-[0_0_25px_rgba(147,51,234,0.4)]">
                      <img
                        src="/card-back.jpg"
                        alt={titleText}
                        className="w-full h-full object-contain rounded drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]"
                      />
                    </div>
                    <div className="mt-2.5 w-full bg-[#120c22] border-2 border-purple-900/60 rounded-lg p-3 text-center shadow-md">
                      <div className="text-amber-400 font-serif font-black text-sm mb-1 tracking-wider">
                        {titleText}
                      </div>
                      <p className="text-[11px] text-purple-200/80 italic leading-relaxed">
                        {descText}
                      </p>
                      {!isSpellOrTrap && (
                        <div className="mt-2 text-xs font-mono font-bold text-slate-400 bg-black/40 py-1 rounded border border-purple-950">
                          ATK ??? / DEF ???
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Se for carta do jogador ou já revelada
              return (
                <div className="flex flex-col items-center w-full animate-fadeIn">
                  <div className="relative group w-60 h-84 rounded-lg p-2 bg-gradient-to-br from-[#7a4e23] via-[#472c13] to-[#1a0f05] border-2 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-transform duration-300 hover:scale-105">
                    <img
                      src={inspectedCard.data.imageUrl}
                      alt={inspectedCard.data.name}
                      className="w-full h-full object-contain rounded drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]"
                    />
                    {isPlayerOwned && isFaceDown && (
                      <div className="absolute top-3 left-3 right-3 bg-purple-950/90 border border-purple-400 text-purple-200 text-[10px] font-black py-1 px-2 rounded shadow-lg text-center backdrop-blur-sm">
                        👁️ {languagePt ? 'Carta Oculta (Apenas você pode ver)' : 'Face-Down Card (Only you can see)'}
                      </div>
                    )}
                  </div>

                  {/* Detalhes da Carta Traduzida */}
                  <div className="mt-2.5 w-full bg-[#120c22] border-2 border-[#412760] rounded-lg p-2.5 shadow-md">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-extrabold text-amber-300 text-sm tracking-wide">
                        {languagePt && inspectedCard.data.namePt ? inspectedCard.data.namePt : inspectedCard.data.name}
                      </span>
                      {inspectedCard.data.level > 0 && (
                        <span className="text-[11px] font-serif text-amber-400">
                          {'★'.repeat(Math.max(0, inspectedCard.data.level))}
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] uppercase font-serif tracking-wider text-purple-300 border-b border-purple-900/60 pb-1 mb-1.5 flex justify-between">
                      <span>{formatCardType(inspectedCard.data.type)}</span>
                      {inspectedCard.data.level > 0 && (
                        <span className="text-slate-400">
                          {languagePt ? 'Nível' : 'Level'} {inspectedCard.data.level}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-amber-100/90 leading-relaxed italic bg-black/40 p-1.5 rounded border border-purple-950/80 min-h-[50px]">
                      "{languagePt && inspectedCard.data.descriptionPt ? inspectedCard.data.descriptionPt : inspectedCard.data.description}"
                    </p>

                    {(() => {
                      const cardTypeLower = inspectedCard.data.type.toLowerCase();
                      const isSpellOrTrap = cardTypeLower.includes('spell') || cardTypeLower.includes('mágica') || cardTypeLower.includes('trap') || cardTypeLower.includes('armadilha');
                      if (isSpellOrTrap) return null;

                      const effectiveAtk = isPlayerOwned
                        ? session.getEffectiveAttack(inspectedCard, p1, p2)
                        : session.getEffectiveAttack(inspectedCard, p2, p1);
                      const isBuffed = effectiveAtk > inspectedCard.data.attack;

                      // Verifica se é o Time Wizard no campo do jogador pronto para usar efeito
                      const playerZoneIdx = p1.monsterZones.findIndex((m) => m?.uid === inspectedCard.uid);
                      const isPlayerTimeWizardOnField =
                        playerZoneIdx !== -1 &&
                        (inspectedCard.data.id === '71625222' || inspectedCard.data.name.toLowerCase().includes('time wizard'));
                      const canUseTimeWizard =
                        isPlayerTimeWizardOnField &&
                        isPlayerTurn &&
                        (match.phase === 'MAIN1' || match.phase === 'MAIN2') &&
                        !inspectedCard.hasUsedEffectThisTurn;

                      return (
                        <>
                          <div className="flex justify-between font-mono font-black text-xs pt-1.5 mt-1 text-slate-200">
                            <div
                              className={`px-2 py-0.5 rounded border flex items-center gap-1 transition-all ${
                                isBuffed
                                  ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.7)] animate-pulse'
                                  : 'bg-amber-950/80 border-amber-600/60 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                              }`}
                            >
                              ATK ⚔️ {effectiveAtk} {isBuffed && <span className="text-[10px] font-sans text-yellow-300">▲</span>}
                            </div>
                            <div className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-600/60 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.2)]">
                              DEF 🛡️ {inspectedCard.data.defense ?? 0}
                            </div>
                          </div>

                          {/* Botão de Ativação do Efeito de Time Wizard */}
                          {isPlayerTimeWizardOnField && (
                            <div className="mt-2.5 pt-2 border-t border-purple-900/60">
                              <button
                                onClick={() => handleActivateTimeWizard(playerZoneIdx)}
                                disabled={!canUseTimeWizard}
                                className={`w-full py-1.5 px-3 rounded-lg font-serif font-black text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
                                  canUseTimeWizard
                                    ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.8)] border border-yellow-200 animate-pulse'
                                    : 'bg-slate-800/80 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                                }`}
                              >
                                <span>⏳</span>
                                <span>
                                  {inspectedCard.hasUsedEffectThisTurn
                                    ? 'Roleta Já Utilizada'
                                    : 'Girar Roleta do Tempo'}
                                </span>
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="w-60 h-84 rounded-lg border-2 border-amber-900/60 shadow-[0_0_25px_rgba(245,158,11,0.2)] flex flex-col items-center justify-between p-3 bg-black/40">
              <div className="w-full h-64 rounded overflow-hidden shadow-2xl flex items-center justify-center">
                <img
                  src="/card-back.jpg"
                  alt="Verso da Carta"
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]"
                />
              </div>
              <p className="font-serif text-[11px] text-amber-200/70 text-center mt-2 italic">
                Aponte ou selecione qualquer carta no campo ou na mão para inspecionar seus segredos.
              </p>
            </div>
          )}
        </div>

        {/* Histórico do Duelo (Chat Traduzido) */}
        <div className="bg-[#050308]/90 border border-purple-950 rounded p-2 text-[10px] text-slate-300 font-mono h-28 overflow-y-auto flex flex-col-reverse shadow-inner">
          <div>
            {match.log.slice(-6).map((line, idx) => (
              <div key={idx} className="leading-snug border-b border-purple-950/40 py-0.5">
                {line}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ÁREA DA MESA / PLAYMAT INTERATIVO COM CAMERA SHAKE */}
      <main className={`flex-1 flex flex-col justify-between p-1.5 relative overflow-hidden transition-transform ${isCameraShaking ? 'anim-camera-shake' : ''}`}>
        
        {/* TOPO: OPONENTE KAIBA (HUD AMPLIADO E COMPACTO) */}
        <div className="flex justify-between items-center bg-[#0e0a17]/95 border-2 border-[#412760] rounded-xl px-4 sm:px-6 py-1.5 sm:py-2 shadow-[0_6px_25px_rgba(0,0,0,0.85)] relative">
          {/* Floating Damage em Ataque Direto */}
          {floatingDamage && !floatingDamage.isPlayer && floatingDamage.zoneIndex === null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none anim-damage-float">
              <span className="text-3xl sm:text-4xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-t from-red-600 via-rose-500 to-amber-300 drop-shadow-[0_0_15px_rgba(239,68,68,1)]">
                -{floatingDamage.amount}
              </span>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-blue-600 to-indigo-950 border-2 border-blue-400 flex items-center justify-center font-black text-blue-200 text-lg sm:text-xl shadow-[0_0_15px_rgba(59,130,246,0.6)]">
              K
            </div>
            <div>
              <h2 className="font-extrabold text-blue-300 tracking-wider text-sm sm:text-base flex items-center gap-2 font-serif">
                {p2.nickname}
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-950/90 border border-blue-500/50 text-blue-300 rounded font-sans uppercase">
                  IA Bot
                </span>
              </h2>
              <div className="text-[11px] text-slate-300 flex items-center gap-2 mt-0.5">
                <span>Deck: <strong className="text-amber-400 font-mono">{p2.deck.length}</strong></span>
                <span>•</span>
                <span>{languagePt ? 'Cemitério:' : 'Graveyard:'} <strong className="text-purple-400 font-mono">{p2.graveyard.length}</strong></span>
              </div>
            </div>
          </div>

          <div ref={opponentLpRef} className="flex items-center space-x-3">
            <span className="text-[11px] uppercase font-serif tracking-widest text-slate-400 font-black">
              {languagePt ? 'PONTOS DE VIDA' : 'LIFE POINTS'}
            </span>
            <div className="bg-black/95 border-2 border-red-600 rounded-lg px-4 py-0.5 sm:py-1 text-2xl sm:text-3xl font-mono font-black text-red-500 shadow-[0_0_22px_rgba(239,68,68,0.7)] tracking-wider">
              {p2.lifePoints} <span className="text-xs sm:text-sm font-sans text-red-400 font-normal">LP</span>
            </div>
          </div>
        </div>

        {/* CAMPO DO OPONENTE */}
        <div className="flex flex-col space-y-1">
          {/* Mão do Oponente (Verso Oficial Yu-Gi-Oh) */}
          <div className="flex justify-center -space-x-4 h-11 sm:h-12">
            {p2.hand.map((card, i) => (
              <div
                key={card.uid || i}
                className="w-8 sm:w-9 h-11 sm:h-12 rounded shadow-2xl transition-all duration-200 hover:-translate-y-2 hover:scale-110 hover:z-20 cursor-default"
              >
                <img
                  src="/card-back.jpg"
                  alt="Verso da Carta"
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] rounded"
                />
              </div>
            ))}
          </div>

          {/* 5 Zonas de Magias e Armadilhas do Oponente */}
          <div className="grid grid-cols-5 gap-2 sm:gap-2.5 md:gap-3 max-w-4xl mx-auto w-full px-2">
            {p2.spellTrapZones.map((slot, i) => {
              const isTacticalTargeting = Boolean(
                tacticalTargetSelection &&
                tacticalTargetSelection.action === 'DESTROY_SPELL_TRAP' &&
                slot !== null
              );
              const isTacticalSelected = Boolean(
                tacticalTargetSelection &&
                slot &&
                tacticalTargetSelection.selectedUids.includes(slot.uid)
              );

              return (
                <div
                  key={`p2-st-${i}`}
                  onClick={() => handleOpponentSpellTrapZoneClick(i)}
                  onMouseEnter={() => slot && setInspectedCard(slot)}
                  className={`h-16 sm:h-18 lg:h-20 rounded-lg border-2 border-dashed flex items-center justify-center relative p-0.5 transition-all ${
                    slot ? 'cursor-pointer' : ''
                  } ${
                    isTacticalSelected
                      ? 'ring-4 ring-cyan-400 bg-cyan-950/40 scale-105 shadow-[0_0_30px_rgba(34,211,238,0.9)] animate-pulse border-cyan-300'
                      : isTacticalTargeting
                      ? 'ring-2 ring-cyan-500/80 hover:ring-4 hover:ring-cyan-300 scale-102 hover:scale-105 shadow-[0_0_20px_rgba(6,182,212,0.6)] animate-pulse border-cyan-400'
                      : slot
                      ? 'border-emerald-600/70 bg-emerald-950/25 shadow-[0_0_12px_rgba(16,185,129,0.25)] hover:border-emerald-400'
                      : 'border-emerald-950/70 bg-emerald-950/15 hover:border-emerald-700/40'
                  }`}
                >
                  {/* Indicador de Mira Tática em Magia/Armadilha */}
                  {isTacticalTargeting && (
                    <div
                      className={`absolute -top-3.5 z-40 text-white font-black text-[9px] px-2 py-0.5 rounded-full shadow-lg border animate-bounce flex items-center gap-1 uppercase tracking-wider ${
                        isTacticalSelected
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 border-yellow-300 shadow-[0_0_15px_rgba(34,211,238,0.9)]'
                          : 'bg-cyan-900/90 border-cyan-400 text-cyan-200'
                      }`}
                    >
                      <span>🌪️</span>
                      <span>
                        {isTacticalSelected
                          ? languagePt ? 'DESTRUIR' : 'DESTROY'
                          : languagePt ? 'ALVO M/A' : 'TARGET S/T'}
                      </span>
                    </div>
                  )}

                  {slot ? (
                    <div className="w-full h-full relative rounded-lg flex items-center justify-center group overflow-hidden">
                      <img
                        src={slot.isFaceDown ? '/card-back.jpg' : slot.data.imageUrl}
                        alt={slot.isFaceDown ? 'Carta Oculta' : slot.data.name}
                        className="max-h-full max-w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] transition-transform duration-200 group-hover:scale-105"
                      />
                      {!slot.isFaceDown && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-1.5 pointer-events-none rounded-lg">
                          <div className="text-[10px] font-black text-emerald-200 truncate drop-shadow text-center">
                            {languagePt && slot.data.namePt ? slot.data.namePt : slot.data.name}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-emerald-900/60 font-serif tracking-widest uppercase select-none">
                      M / A
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Fileira de Monstros do Oponente - Prioridade e Destaque para Monstros */}
          <div className="grid grid-cols-5 gap-2 sm:gap-2.5 md:gap-3 max-w-4xl mx-auto w-full px-2">
            {p2.monsterZones.map((slot, i) => {
              const isTargetable = selectedAttackingMonster !== null && slot !== null;
              const isTacticalTargeting = Boolean(tacticalTargetSelection && slot !== null);
              const isTacticalSelected = Boolean(tacticalTargetSelection && slot && tacticalTargetSelection.selectedUids.includes(slot.uid));
              const isWabokuProtected = Boolean(session.isWabokuActiveForPlayerId === p2.id && slot !== null);
              const isDefense = slot?.position === 'DEFENSE';
              const isSlamming = slamZone && !slamZone.isPlayer && slamZone.zoneIndex === i;
              const isHitTarget = targetHitZone && !targetHitZone.isPlayer && targetHitZone.zoneIndex === i;
              const isLunging = lungingZone && !lungingZone.isPlayer && lungingZone.zoneIndex === i;
              const isDestroyed = slot && destroyedCardUids.includes(slot.uid);
              const showDmg = floatingDamage && !floatingDamage.isPlayer && floatingDamage.zoneIndex === i;
              
              const flameClass = getCardFlameClass(slot);
              const isFlipped = flippedZones.some((z) => !z.isPlayer && z.zoneIndex === i);
              
              return (
                <div
                  key={`p2-m-${i}`}
                  ref={(el) => (opponentZoneRefs.current[i] = el)}
                  onClick={() => handleOpponentZoneClick(i)}
                  onMouseEnter={() => slot && setInspectedCard(slot)}
                  style={
                    isLunging
                      ? ({
                          '--lunge-x': `${lungingZone.deltaX}px`,
                          '--lunge-y': `${lungingZone.deltaY}px`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  className={`h-24 sm:h-26 lg:h-28 rounded-lg border-2 border-dashed flex items-center justify-center p-0.5 transition-all cursor-pointer relative group ${
                    isWabokuProtected
                      ? 'ring-4 ring-sky-300 shadow-[0_0_30px_rgba(186,230,254,0.9),inset_0_0_15px_rgba(255,255,255,0.8)] border-sky-300'
                      : slot
                      ? 'border-purple-600/60 bg-purple-950/25 shadow-[0_0_15px_rgba(147,51,234,0.25)]'
                      : 'border-purple-950/70 bg-purple-950/15 hover:border-purple-600/50'
                  } ${
                    isTacticalSelected
                      ? 'ring-4 ring-cyan-400 bg-cyan-950/40 scale-105 shadow-[0_0_30px_rgba(34,211,238,0.9)] animate-pulse'
                      : isTacticalTargeting
                      ? 'ring-2 ring-cyan-500/80 hover:ring-4 hover:ring-cyan-300 scale-102 hover:scale-105 shadow-[0_0_20px_rgba(6,182,212,0.6)] animate-pulse'
                      : isTargetable
                      ? 'ring-4 ring-red-500 ring-offset-2 ring-offset-black scale-105 shadow-[0_0_30px_rgba(239,68,68,0.9)] animate-pulse'
                      : ''
                  } ${
                    isLunging ? 'anim-attack-lunge-opponent z-40' : ''
                  }`}
                >
                  {/* Floating Damage Text */}
                  {showDmg && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none anim-damage-float">
                      <span className="text-3xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-t from-red-600 to-amber-300 drop-shadow-[0_0_12px_rgba(239,68,68,1)]">
                        -{floatingDamage.amount}
                      </span>
                    </div>
                  )}

                  {/* Anel de Poeira / Impacto na Invocação do Bot */}
                  {isSlamming && (
                    <div className="absolute inset-0 rounded-full border-4 border-amber-400 pointer-events-none anim-impact-ring z-40"></div>
                  )}

                  {/* VFX de Anel de Impacto no Alvo */}
                  {isHitTarget && (
                    <div className="absolute inset-0 rounded-full border-4 border-red-500 pointer-events-none anim-impact-ring z-40"></div>
                  )}

                  {/* Badge de Aura Sagrada de Waboku */}
                  {isWabokuProtected && (
                    <div className="absolute -top-3.5 z-40 bg-gradient-to-r from-sky-400 via-white to-blue-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow-[0_0_15px_rgba(186,230,254,0.9)] border border-white flex items-center gap-1 uppercase tracking-wider animate-pulse pointer-events-none">
                      <span>🕊️</span>
                      <span>{languagePt ? 'AURA SAGRADA' : 'SACRED AURA'}</span>
                    </div>
                  )}

                  {/* Indicador de Alvo de Ataque */}
                  {!isTacticalTargeting && isTargetable && (
                    <div className="absolute -top-3 z-30 bg-red-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-lg border border-white animate-bounce flex items-center gap-1">
                      <span>🎯</span> {languagePt ? 'ALVO' : 'TARGET'}
                    </div>
                  )}

                  {/* Indicador Genérico de Seleção Tática de Efeito com Alvo */}
                  {isTacticalTargeting && tacticalTargetSelection && (() => {
                    const actionMeta = getTacticalActionMeta(tacticalTargetSelection.action, languagePt);
                    return (
                      <div
                        className={`absolute -top-3.5 z-40 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-lg border animate-bounce flex items-center gap-1 uppercase tracking-wider ${
                          isTacticalSelected
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 border-yellow-300 shadow-[0_0_15px_rgba(34,211,238,0.9)]'
                            : 'bg-cyan-900/90 border-cyan-400 text-cyan-200'
                        }`}
                      >
                        <span>{actionMeta.icon}</span>{' '}
                        {isTacticalSelected
                          ? actionMeta.badgeSelected
                          : languagePt
                          ? 'ESCOLHER ALVO'
                          : 'SELECT TARGET'}
                      </div>
                    );
                  })()}

                  {slot ? (
                    <div className={`w-full h-full relative rounded-lg flex items-center justify-center ${isDefense ? 'card-defense-wrapper' : 'overflow-hidden'} ${isDefense ? 'card-3d-defense' : 'card-3d'} ${flameClass} ${isSlamming ? 'anim-card-slam' : ''} ${isDestroyed ? 'anim-card-destroy' : ''} ${isFlipped ? 'anim-card-flip' : ''}`}>
                      {/* Brilho Eéreo de Proteção de Waboku */}
                      {isWabokuProtected && (
                        <div className="absolute inset-0 bg-gradient-to-t from-sky-400/25 via-white/20 to-sky-300/30 rounded-lg pointer-events-none animate-pulse z-20 shadow-[inset_0_0_20px_rgba(255,255,255,0.6)]" />
                      )}

                      {/* Imagem da Carta: Se virada para baixo, exibe verso */}
                      <img
                        src={slot.isFaceDown ? '/card-back.jpg' : slot.data.imageUrl}
                        alt={slot.isFaceDown ? 'Carta Oculta' : slot.data.name}
                        className={isDefense ? 'card-defense-img' : 'card-attack-img'}
                      />

                      {/* Informações reveladas suavemente apenas se não for oculta */}
                      {!slot.isFaceDown && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2 pointer-events-none rounded-lg">
                          <div className="text-[11px] font-black text-amber-200 truncate drop-shadow text-center">
                            {languagePt && slot.data.namePt ? slot.data.namePt : slot.data.name}
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-mono font-black bg-black/80 px-2 py-1 rounded border border-purple-500/50">
                            {(() => {
                              const effectiveAtk = session.getEffectiveAttack(slot, p2, p1);
                              const isBuffed = effectiveAtk > slot.data.attack;
                              return (
                                <span
                                  className={`flex items-center gap-0.5 ${
                                    isBuffed
                                      ? 'text-emerald-300 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                                      : 'text-amber-400'
                                  }`}
                                >
                                  ⚔️ {effectiveAtk} {isBuffed && <span className="text-[9px] text-yellow-300 font-sans">▲</span>}
                                </span>
                              );
                            })()}
                            <span className="text-blue-400">🛡️ {slot.data.defense}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-purple-900/60 font-serif tracking-widest uppercase select-none">
                      {languagePt ? 'MONSTRO' : 'MONSTER'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FAIXA CENTRAL DO DUELO: CONTROLES & AURA DE FASE (HUD CENTRAL AMPLIADO E COMPACTO) */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-1 bg-[#100a1c]/95 border-y-2 border-[#412760] shadow-[0_0_25px_rgba(65,39,96,0.8)] my-0.5">
          <div className="flex items-center space-x-3">
            <span className="text-[11px] sm:text-xs uppercase font-serif tracking-widest text-amber-400 font-black">
              {languagePt ? 'FASE:' : 'PHASE:'}
            </span>
            <span className="px-2.5 sm:px-3 py-0.5 rounded text-[11px] sm:text-xs font-black tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.5)]">
              {formatPhaseName(match.phase)}
            </span>
            <span className="text-[11px] sm:text-xs text-slate-300 font-mono font-bold">
              {languagePt ? 'Turno' : 'Turn'} {match.currentTurn} • {isPlayerTurn ? `🌟 ${languagePt ? 'TURNO DE' : "TURN OF"} ${p1.nickname.toUpperCase()}` : `⏳ ${languagePt ? 'TURNO DE' : "TURN OF"} ${p2.nickname.toUpperCase()}`}
            </span>
          </div>

          {/* Botão Genérico de Confirmação de Mira Tática (Monstros FLIP e Magias com Alvo) */}
          {tacticalTargetSelection && (() => {
            const actionMeta = getTacticalActionMeta(tacticalTargetSelection.action, languagePt);
            return (
              <div className="flex items-center gap-2 animate-fadeIn">
                <button
                  disabled={tacticalTargetSelection.selectedUids.length === 0}
                  onClick={() => {
                    if (tacticalTargetSelection.selectedUids.length === 0) {
                      showNotification(
                        languagePt
                          ? '⚠️ Clique em um alvo com o selo "ESCOLHER ALVO" para selecionar!'
                          : '⚠️ Click a target with the "SELECT TARGET" badge!'
                      );
                      return;
                    }

                    if (tacticalTargetSelection.isSpell && tacticalTargetSelection.cardUid) {
                      if (tacticalTargetSelection.action === 'DESTROY_MONSTER' || tacticalTargetSelection.action === 'DESTROY_SPELL_TRAP') {
                        triggerCardDestruction(tacticalTargetSelection.selectedUids);
                        soundFX.playDestruction();
                      } else if (tacticalTargetSelection.action === 'RETURN_TO_HAND') {
                        soundFX.playReturnToHand();
                      } else {
                        soundFX.playPlaceCard();
                      }

                      const success = session.activateSpell(
                        tacticalTargetSelection.cardUid,
                        tacticalTargetSelection.zoneIndex,
                        tacticalTargetSelection.selectedUids
                      );
                      setTacticalTargetSelection(null);
                      if (success) {
                        forceUpdate();
                      }
                      return;
                    }

                    executeFlipPositionChange(
                      tacticalTargetSelection.zoneIndex,
                      tacticalTargetSelection.selectedUids
                    );
                  }}
                  className={`px-4 sm:px-5 py-1 text-xs font-black uppercase tracking-wider rounded-full shadow-lg transition-all flex items-center gap-1.5 border ${
                    tacticalTargetSelection.selectedUids.length > 0
                      ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-600 hover:from-cyan-400 hover:to-blue-400 text-slate-950 border-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.8)] animate-pulse cursor-pointer'
                      : 'bg-slate-900/90 text-cyan-400/60 border-cyan-500/30 cursor-not-allowed opacity-75'
                  }`}
                >
                  <span>{actionMeta.icon}</span>
                  <span>
                    {tacticalTargetSelection.selectedUids.length > 0
                      ? languagePt
                        ? `Confirmar ${actionMeta.confirmVerb} (${tacticalTargetSelection.selectedUids.length})`
                        : `Confirm ${actionMeta.confirmVerb} (${tacticalTargetSelection.selectedUids.length})`
                      : languagePt
                      ? 'Escolha o Alvo Acima'
                      : 'Select Target Above'}
                  </span>
                </button>

                <button
                  onClick={() => setTacticalTargetSelection(null)}
                  className="px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-slate-400 hover:text-slate-200 bg-slate-900/80 rounded-full border border-slate-700 uppercase transition-colors"
                >
                  {languagePt ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            );
          })()}

          {/* Botão de Ataque Direto */}
          {match.phase === 'BATTLE' &&
            selectedAttackingMonster !== null &&
            p2.monsterZones.every((m) => m === null) && (
              <button
                onClick={() => handleOpponentZoneClick(null)}
                className="px-5 py-1 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-[0_0_25px_rgba(239,68,68,0.9)] border-2 border-yellow-300 animate-bounce flex items-center gap-1.5"
              >
                <span>⚡</span> {languagePt ? 'ATACAR DIRETAMENTE OS LPs!' : 'DIRECT ATTACK LIFE POINTS!'}
              </button>
            )}

          {/* Botões de Ação */}
          <div className="flex space-x-2">
            <button
              onClick={handleNextPhase}
              disabled={!isPlayerTurn || match.isGameOver || match.phase === 'BATTLE'}
              className="px-3.5 sm:px-4 py-1 bg-gradient-to-r from-indigo-700 to-purple-800 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-30 text-xs font-bold rounded-lg border border-indigo-400/50 shadow-md transition-all font-serif"
            >
              {languagePt ? 'Fase de Batalha ⚔️' : 'Battle Phase ⚔️'}
            </button>
            <button
              onClick={handleEndTurn}
              disabled={!isPlayerTurn || match.isGameOver}
              className="px-3.5 sm:px-4 py-1 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-30 text-xs font-black rounded-lg border border-amber-400 shadow-md transition-all text-slate-950 font-serif"
            >
              {languagePt ? 'Encerrar Turno 🛡️' : 'End Turn 🛡️'}
            </button>
          </div>
        </div>

        {/* CAMPO DO JOGADOR (ZONA DE MONSTROS 3D E ZONAS DE MAGIAS/ARMADILHAS) */}
        <div className="flex flex-col space-y-1">
          {/* Fileira de Monstros do Jogador - Prioridade e Destaque para Monstros */}
          <div className="grid grid-cols-5 gap-2 sm:gap-2.5 md:gap-3 max-w-4xl mx-auto w-full px-2">
            {p1.monsterZones.map((slot, i) => {
              const selectedHandCard = selectedHandCardUid ? p1.hand.find((c) => c.uid === selectedHandCardUid) : null;
              const isSelectedCardMonster = isMonsterCard(selectedHandCard);
              const requiredTributes = isSelectedCardMonster
                ? (selectedHandCard!.data.level <= 4 ? 0 : selectedHandCard!.data.level <= 6 ? 1 : 2)
                : 0;
              const isSelectedTribute = selectedTributeZones.includes(i);
              const isTributeTargetZone = isSelectedCardMonster && requiredTributes > 0 && selectedTributeZones.length === requiredTributes && (slot === null || isSelectedTribute);
              const isValidSummonZone = isSelectedCardMonster && requiredTributes === 0 && slot === null;
              const isSelectedAttacker = selectedAttackerZone === i;
              const isWabokuProtected = Boolean(session.isWabokuActiveForPlayerId === p1.id && slot !== null);
              const isDefense = slot?.position === 'DEFENSE';
              const isSlamming = slamZone && slamZone.isPlayer && slamZone.zoneIndex === i;
              const isLunging = lungingZone && lungingZone.isPlayer && lungingZone.zoneIndex === i;
              const isHitTarget = targetHitZone && targetHitZone.isPlayer && targetHitZone.zoneIndex === i;
              const isDestroyed = slot && destroyedCardUids.includes(slot.uid);
              const showDmg = floatingDamage && floatingDamage.isPlayer && floatingDamage.zoneIndex === i;
              const flameClass = getCardFlameClass(slot);
              const isFlipped = flippedZones.some((z) => z.isPlayer && z.zoneIndex === i);

              return (
                <div
                  key={`p1-m-${i}`}
                  ref={(el) => (playerZoneRefs.current[i] = el)}
                  onClick={() => handlePlayerMonsterZoneClick(i)}
                  onMouseEnter={() => slot && setInspectedCard(slot)}
                  style={
                    isLunging
                      ? ({
                          '--lunge-x': `${lungingZone.deltaX}px`,
                          '--lunge-y': `${lungingZone.deltaY}px`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  className={`h-24 sm:h-26 lg:h-28 rounded-lg border-2 border-dashed flex items-center justify-center p-0.5 transition-all cursor-pointer relative group ${
                    isWabokuProtected
                      ? 'ring-4 ring-sky-300 shadow-[0_0_30px_rgba(186,230,254,0.9),inset_0_0_15px_rgba(255,255,255,0.8)] border-sky-300'
                      : (isValidSummonZone || isTributeTargetZone)
                      ? 'border-emerald-400 bg-emerald-950/40 ring-4 ring-emerald-400/80 shadow-[0_0_25px_rgba(16,185,129,0.8)] scale-102 animate-pulse'
                      : slot
                      ? 'border-purple-600/60 bg-purple-950/25 shadow-[0_0_15px_rgba(147,51,234,0.25)]'
                      : 'border-purple-950/70 bg-purple-950/15 hover:border-amber-500/50'
                  } ${
                    isSelectedAttacker
                      ? 'ring-4 ring-amber-400 scale-105 shadow-[0_0_30px_rgba(245,158,11,0.9)]'
                      : ''
                  } ${
                    isSelectedTribute
                      ? 'ring-4 ring-red-500 border-2 border-red-400 scale-105 shadow-[0_0_30px_rgba(239,68,68,0.9)] animate-pulse'
                      : ''
                  } ${
                    isLunging ? 'anim-attack-lunge-player z-40' : ''
                  }`}
                >
                  {/* Floating Damage Text */}
                  {showDmg && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none anim-damage-float">
                      <span className="text-3xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-t from-red-600 to-amber-300 drop-shadow-[0_0_12px_rgba(239,68,68,1)]">
                        -{floatingDamage.amount}
                      </span>
                    </div>
                  )}

                  {/* Anel de Poeira / Impacto na Invocação */}
                  {isSlamming && (
                    <div className="absolute inset-0 rounded-full border-4 border-amber-400 pointer-events-none anim-impact-ring z-40"></div>
                  )}

                  {/* Anel de Impacto ao Ser Atingido */}
                  {isHitTarget && (
                    <div className="absolute inset-0 rounded-full border-4 border-red-500 pointer-events-none anim-impact-ring z-40"></div>
                  )}

                  {/* Badge de Aura Sagrada de Waboku */}
                  {isWabokuProtected && (
                    <div className="absolute -top-3.5 z-40 bg-gradient-to-r from-sky-400 via-white to-blue-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow-[0_0_15px_rgba(186,230,254,0.9)] border border-white flex items-center gap-1 uppercase tracking-wider animate-pulse pointer-events-none">
                      <span>🕊️</span>
                      <span>{languagePt ? 'AURA SAGRADA' : 'SACRED AURA'}</span>
                    </div>
                  )}

                  {/* Badge de Sacrifício Selecionado / Zona Pronta para Invocação por Tributo */}
                  {isSelectedTribute ? (
                    <div className="absolute -top-3.5 z-40 bg-gradient-to-r from-red-600 to-rose-700 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.9)] border border-yellow-300 animate-bounce flex items-center gap-1 uppercase tracking-wider">
                      {isTributeTargetZone ? (
                        <>
                          <span>⚡</span> {languagePt ? 'INVOCAR AQUI!' : 'SUMMON HERE!'}
                        </>
                      ) : (
                        <>
                          <span>🔥</span> {languagePt ? 'SACRIFÍCIO' : 'TRIBUTE'}
                        </>
                      )}
                    </div>
                  ) : (
                    (isValidSummonZone || isTributeTargetZone) && (
                      <div className="absolute -top-3 z-30 bg-emerald-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-lg border border-white animate-bounce flex items-center gap-1">
                        <span>⬇️</span> {languagePt ? 'INVOCAR' : 'SUMMON'}
                      </div>
                    )
                  )}

                  {slot ? (
                    <div className={`w-full h-full relative rounded-lg flex items-center justify-center ${isDefense ? 'card-defense-wrapper' : 'overflow-hidden'} ${isDefense ? 'card-3d-defense' : 'card-3d'} ${flameClass} ${isSlamming ? 'anim-card-slam' : ''} ${isDestroyed ? 'anim-card-destroy' : ''} ${isFlipped ? 'anim-card-flip' : ''}`}>
                      {/* Brilho Eéreo de Proteção de Waboku */}
                      {isWabokuProtected && (
                        <div className="absolute inset-0 bg-gradient-to-t from-sky-400/25 via-white/20 to-sky-300/30 rounded-lg pointer-events-none animate-pulse z-20 shadow-[inset_0_0_20px_rgba(255,255,255,0.6)]" />
                      )}

                      {/* Imagem da Carta Original ou Verso se estiver Virada para Baixo */}
                      <img
                        src={slot.isFaceDown ? '/card-back.jpg' : slot.data.imageUrl}
                        alt={slot.isFaceDown ? 'Carta Oculta' : slot.data.name}
                        className={isDefense ? 'card-defense-img' : 'card-attack-img'}
                      />

                      {/* Indicador de Carta Oculta do Jogador (visível permanentemente em tamanho sutil) */}
                      {slot.isFaceDown && (
                        <div className="absolute top-1 right-1 bg-purple-950/80 border border-purple-400 text-purple-200 text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none">
                          👁️
                        </div>
                      )}

                      {/* Informações ocultas por padrão - reveladas suavemente apenas em hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2 pointer-events-none rounded-lg">
                        <div className="text-[11px] font-black text-amber-200 truncate drop-shadow text-center">
                          {languagePt && slot.data.namePt ? slot.data.namePt : slot.data.name}
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-mono font-black bg-black/85 px-2 py-1 rounded border border-amber-500/50">
                          {(() => {
                            const effectiveAtk = session.getEffectiveAttack(slot, p1, p2);
                            const isBuffed = effectiveAtk > slot.data.attack;
                            return (
                              <span
                                className={`flex items-center gap-0.5 ${
                                  isBuffed
                                    ? 'text-emerald-300 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                                    : 'text-amber-400'
                                }`}
                              >
                                ⚔️ {effectiveAtk} {isBuffed && <span className="text-[9px] text-yellow-300 font-sans">▲</span>}
                              </span>
                            );
                          })()}
                          <span className="text-blue-400">🛡️ {slot.data.defense}</span>
                          {slot.hasAttacked ? (
                            <span className="text-red-400 font-sans text-[9px]">{languagePt ? 'Atacou' : 'Attacked'}</span>
                          ) : slot.turnSummoned === match.currentTurn ? (
                            <span className="text-yellow-400 font-sans text-[9px]">{languagePt ? 'Invocado ⏳' : 'Summoned ⏳'}</span>
                          ) : isDefense ? (
                            <span className="text-blue-400 font-sans text-[9px]">{languagePt ? 'Defesa 🛡️' : 'Defense 🛡️'}</span>
                          ) : match.phase === 'BATTLE' && !isDefense ? (
                            <span className="text-emerald-400 font-sans text-[9px] animate-pulse">{languagePt ? 'Pronto ⚔️' : 'Ready ⚔️'}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-purple-900/60 font-serif tracking-widest uppercase select-none">
                      {isValidSummonZone ? (languagePt ? 'INVOCAR' : 'SUMMON') : (languagePt ? 'MONSTRO' : 'MONSTER')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 5 Zonas de Magias e Armadilhas do Jogador */}
          <div className="grid grid-cols-5 gap-2 sm:gap-2.5 md:gap-3 max-w-4xl mx-auto w-full px-2">
            {p1.spellTrapZones.map((slot, i) => {
              const selectedHandCard = selectedHandCardUid ? p1.hand.find((c) => c.uid === selectedHandCardUid) : null;
              const isSelectedSpell = isSpellCard(selectedHandCard);
              const isSelectedTrap = isTrapCard(selectedHandCard);
              const isTargetableSpellZone = isSelectedSpell && slot === null;
              const isTargetableTrapZone = isSelectedTrap && slot === null;

              return (
                <div
                  key={`p1-st-${i}`}
                  onClick={() => handlePlayerSpellTrapZoneClick(i)}
                  onMouseEnter={() => slot && setInspectedCard(slot)}
                  className={`h-16 sm:h-18 lg:h-20 rounded-lg border-2 border-dashed flex items-center justify-center relative cursor-pointer p-0.5 transition-all ${
                    isTargetableSpellZone
                      ? 'border-emerald-400 bg-emerald-950/40 ring-4 ring-emerald-400/90 shadow-[0_0_25px_rgba(52,211,153,0.8)] scale-102 animate-pulse'
                      : isTargetableTrapZone
                      ? 'border-fuchsia-400 bg-fuchsia-950/40 ring-4 ring-fuchsia-500/90 shadow-[0_0_25px_rgba(217,70,239,0.8)] scale-102 animate-pulse'
                      : slot
                      ? 'border-emerald-600/70 bg-emerald-950/25 shadow-[0_0_12px_rgba(16,185,129,0.25)] hover:border-emerald-400'
                      : 'border-emerald-950/70 bg-emerald-950/15 hover:border-emerald-500/50'
                  }`}
                >
                  {slot ? (
                    <div className="w-full h-full relative rounded-lg flex items-center justify-center group overflow-hidden">
                      <img
                        src={slot.isFaceDown ? '/card-back.jpg' : slot.data.imageUrl}
                        alt={slot.data.name}
                        className="max-h-full max-w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] transition-transform duration-200 group-hover:scale-105"
                      />
                      {slot.isFaceDown && (
                        <div className="absolute top-1 right-1 bg-purple-950/80 border border-purple-400 text-purple-200 text-[8px] px-1 rounded pointer-events-none">
                          👁️
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-1.5 pointer-events-none rounded-lg">
                        <div className="text-[10px] font-black text-emerald-200 truncate drop-shadow text-center">
                          {languagePt && slot.data.namePt ? slot.data.namePt : slot.data.name}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className={`text-[10px] font-serif tracking-widest uppercase select-none ${
                      isTargetableSpellZone ? 'text-emerald-300 font-bold' : isTargetableTrapZone ? 'text-fuchsia-300 font-bold' : 'text-emerald-900/60'
                    }`}>
                      {isTargetableSpellZone ? (languagePt ? 'Colocar Magia' : 'Place Spell') : isTargetableTrapZone ? (languagePt ? 'Baixar Armadilha' : 'Set Trap') : 'M / A'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RODAPÉ DO JOGADOR: MÃO AMPLIADA & STATUS (HUD COMPACTO E 100% RESPONSIVO) */}
        <div className="bg-[#0b0814]/95 border-2 border-[#412760] rounded-xl px-3 sm:px-4 py-1 sm:py-1.5 shadow-[0_-6px_30px_rgba(0,0,0,0.85)] flex items-center justify-between">
          
          <div className="flex items-center space-x-3 w-44 sm:w-52">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-amber-500 via-amber-700 to-purple-950 border-2 border-amber-400 flex items-center justify-center font-black text-amber-200 text-lg sm:text-xl shadow-[0_0_15px_rgba(245,158,11,0.6)] uppercase">
              {p1.nickname.charAt(0) || 'D'}
            </div>
            <div>
              <h2 className="font-extrabold text-amber-300 text-xs sm:text-sm font-serif tracking-wide truncate max-w-[120px] sm:max-w-[140px]">{p1.nickname}</h2>
              <div ref={playerLpRef} className="bg-black/95 border-2 border-red-600 rounded-lg px-2.5 py-0.5 text-lg sm:text-xl font-mono font-black text-red-400 shadow-[0_0_18px_rgba(239,68,68,0.6)] tracking-wider mt-0.5 relative">
                {/* Texto Flutuante de Recuperação de Vida (Cura) */}
                {floatingHeal && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-50 pointer-events-none anim-damage-float whitespace-nowrap">
                    <span className="text-xl sm:text-2xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-t from-emerald-500 via-green-400 to-teal-200 drop-shadow-[0_0_15px_rgba(52,211,153,1)]">
                      +{floatingHeal.amount} LP
                    </span>
                  </div>
                )}
                {p1.lifePoints} <span className="text-xs font-sans text-red-400 font-normal">LP</span>
              </div>
            </div>
          </div>

          {/* Mão do Jogador (Cartas 3D, Layout Dinâmico e Animação de Compra) */}
          <div className="flex-1 flex justify-center -space-x-3 sm:-space-x-4 overflow-visible py-0.5">
            {p1.hand.map((card, idx) => {
              const isSelected = selectedHandCardUid === card.uid;
              const isNewlyDrawn = recentDrawnUids.includes(card.uid);
              return (
                <div
                  key={card.uid}
                  onClick={() => handleSelectHandCard(card)}
                  onMouseEnter={() => setInspectedCard(card)}
                  style={{ animationDelay: isNewlyDrawn ? `${idx * 140}ms` : '0ms' }}
                  className={`card-3d group w-16 sm:w-18 md:w-20 h-22 sm:h-24 md:h-26 rounded-md cursor-pointer transition-all duration-200 relative flex items-center justify-center ${
                    isNewlyDrawn ? 'anim-draw-card' : ''
                  } ${
                    isSelected
                      ? '-translate-y-4 ring-4 ring-amber-400/90 shadow-[0_0_35px_rgba(245,158,11,1)] scale-110 z-30'
                      : 'hover:-translate-y-3 hover:scale-105 hover:z-20 hover:drop-shadow-[0_15px_25px_rgba(245,158,11,0.5)]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 bg-amber-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow border border-white animate-bounce">
                      {languagePt ? 'ESCOLHIDA' : 'SELECTED'}
                    </div>
                  )}

                  {/* Arte Pura da Carta */}
                  <img
                    src={card.data.imageUrl}
                    alt={card.data.name}
                    className="w-full h-full object-contain filter drop-shadow-xl select-none"
                  />

                  {/* Informações da Carta Apenas no Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-md flex flex-col justify-between p-1 pointer-events-none backdrop-blur-[1px]">
                    <div className="text-[9px] sm:text-[10px] font-bold text-amber-200 text-center truncate bg-black/80 rounded px-1 shadow">
                      {languagePt && card.data.namePt ? card.data.namePt : card.data.name}
                    </div>

                    <div className="flex justify-between text-[8px] sm:text-[9px] font-mono font-black text-amber-300 bg-black/90 px-1 py-0.5 rounded shadow">
                      <span>⚔️ {card.data.attack}</span>
                      <span>🛡️ {card.data.defense}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cemitério e Deck do Jogador */}
          <div className="flex items-center space-x-2 sm:space-x-3 pl-3 sm:pl-4 border-l-2 border-[#2b1c42]">
            <div className="text-center">
              <div className="w-11 sm:w-12 md:w-13 h-15 sm:h-16 md:h-17 rounded border-2 border-purple-800 bg-purple-950/40 flex items-center justify-center text-xs font-mono font-bold text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.3)]">
                {p1.graveyard.length}
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-400 uppercase font-serif tracking-wider">
                {languagePt ? 'Cemitério' : 'Graveyard'}
              </span>
            </div>

            <div className="text-center">
              <div className="w-11 sm:w-12 md:w-13 h-15 sm:h-16 md:h-17 rounded border border-amber-600/50 relative shadow-[0_0_15px_rgba(245,158,11,0.4)] overflow-hidden flex items-center justify-center group">
                <img src="/card-back.jpg" alt="Deck" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-mono font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    {p1.deck.length}
                  </span>
                </div>
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-400 uppercase font-serif tracking-wider">Deck</span>
            </div>
          </div>
        </div>



        {/* 🎴 MODAL DE ESCOLHA DE POSIÇÃO DE INVOCAÇÃO (FACE-UP OU VIRADO PARA BAIXO) */}
        {summonChoiceModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-[#120c22] border-2 border-amber-400 rounded-2xl p-6 text-center max-w-sm shadow-[0_0_40px_rgba(245,158,11,0.5)]">
              <h3 className="text-lg font-serif font-black text-amber-300 mb-1">
                {languagePt ? 'COMO DESEJA BAIXAR?' : 'SUMMON POSITION'}
              </h3>
              <p className="text-xs text-slate-300 mb-4">
                {languagePt ? 'Escolha a postura do monstro no campo:' : 'Choose how to place this monster:'}
              </p>

              <div className="flex justify-center mb-4">
                <div className="w-28 h-40 rounded-lg p-1 bg-gradient-to-br from-[#7a4e23] to-[#1a0f05] border border-amber-400/80 shadow-md">
                  <img
                    src={summonChoiceModal.card.data.imageUrl}
                    alt={summonChoiceModal.card.data.name}
                    className="w-full h-full object-contain rounded"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() =>
                    executeSummon(
                      summonChoiceModal.zoneIndex,
                      summonChoiceModal.tributeIndices,
                      'ATTACK',
                      false
                    )
                  }
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <span>⚔️</span>
                  <span>{languagePt ? 'Invocar em Modo de Ataque' : 'Summon in Attack Mode'}</span>
                </button>

                <button
                  onClick={() =>
                    executeSummon(
                      summonChoiceModal.zoneIndex,
                      summonChoiceModal.tributeIndices,
                      'DEFENSE',
                      true
                    )
                  }
                  className="w-full py-2.5 px-4 bg-purple-900 hover:bg-purple-800 text-purple-100 border border-purple-400/60 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <span>👁️</span>
                  <span>{languagePt ? 'Baixar de Cabeça para Baixo' : 'Set Face-Down (Defense)'}</span>
                </button>

                <button
                  onClick={() => setSummonChoiceModal(null)}
                  className="w-full py-1.5 text-slate-400 hover:text-slate-200 text-[11px] font-bold uppercase transition-colors"
                >
                  {languagePt ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ⚡ MODAL DE ESCOLHA DE CARTA MÁGICA: ATIVAR OU BAIXAR */}
        {spellChoiceModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-[#0e1a14] border-2 border-emerald-500 rounded-2xl p-6 text-center max-w-sm w-full mx-4 shadow-[0_0_40px_rgba(16,185,129,0.5)]">
              <div className="w-24 h-34 mx-auto mb-3 rounded-lg overflow-hidden border-2 border-emerald-400 shadow-lg">
                <img
                  src={spellChoiceModal.card.data.imageUrl}
                  alt={spellChoiceModal.card.data.name}
                  className="w-full h-full object-contain"
                />
              </div>

              <h3 className="text-base font-serif font-black text-emerald-300 mb-1">
                {languagePt && spellChoiceModal.card.data.namePt
                  ? spellChoiceModal.card.data.namePt
                  : spellChoiceModal.card.data.name}
              </h3>
              <p className="text-xs text-emerald-100/80 mb-5">
                {spellChoiceModal.isFromField
                  ? (languagePt
                      ? 'Deseja ativar esta Carta Mágica virada para baixo?'
                      : 'Do you want to activate this face-down Spell card?')
                  : (languagePt
                      ? 'Como deseja utilizar esta Carta Mágica?'
                      : 'How would you like to play this Spell card?')}
              </p>

              <div className="flex flex-col space-y-2.5">
                <button
                  onClick={() =>
                    handleActivateSpell(
                      spellChoiceModal.card,
                      spellChoiceModal.zoneIndex
                    )
                  }
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <span>⚡</span>
                  <span>
                    {spellChoiceModal.isFromField
                      ? (languagePt ? 'Ativar Magia' : 'Activate Spell')
                      : (languagePt ? 'Ativar Magia Imediatamente' : 'Activate Spell Immediately')}
                  </span>
                </button>

                {!spellChoiceModal.isFromField && (
                  <button
                    onClick={() =>
                      handleSetSpellTrap(
                        spellChoiceModal.card,
                        spellChoiceModal.zoneIndex
                      )
                    }
                    className="w-full py-2.5 px-4 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/60 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <span>👁️</span>
                    <span>{languagePt ? 'Baixar na Zona (Virada para Baixo)' : 'Set in Zone (Face-Down)'}</span>
                  </button>
                )}

                <button
                  onClick={() => setSpellChoiceModal(null)}
                  className="w-full py-1.5 text-slate-400 hover:text-slate-200 text-[11px] font-bold uppercase transition-colors"
                >
                  {languagePt ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 🏳️ MODAL DE CONFIRMAÇÃO DE SAIR / RENDER-SE */}
        {showSurrenderModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-[#160c1d] border-2 border-red-500 rounded-xl p-6 text-center max-w-sm shadow-[0_0_35px_rgba(239,68,68,0.5)]">
              <h3 className="text-xl font-serif font-black text-red-400 mb-2">
                DESEJA SAIR DO DUELO?
              </h3>
              <p className="text-xs text-slate-300 mb-5">
                Ao sair agora, você concederá a vitória a Seto Kaiba por rendição.
              </p>
              
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={handleConfirmSurrender}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs uppercase shadow"
                >
                  Sim, Desistir
                </button>
                <button
                  onClick={() => setShowSurrenderModal(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs uppercase shadow"
                >
                  Continuar Jogando
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE FIM DE PARTIDA */}
        {match.isGameOver && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
            <div
              className={`border-2 rounded-2xl p-8 text-center max-w-md shadow-2xl ${
                match.winnerPlayerId === p1.id
                  ? 'bg-[#140e26] border-amber-400 shadow-[0_0_60px_rgba(245,158,11,0.7)]'
                  : 'bg-[#180a14] border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.7)]'
              }`}
            >
              <div
                className={`text-5xl mb-2 ${
                  match.winnerPlayerId === p1.id ? 'text-amber-400 animate-bounce' : 'text-red-400 animate-pulse'
                }`}
              >
                {match.winnerPlayerId === p1.id ? '👑 𓂀' : '💀 𓂀'}
              </div>
              <h1
                className={`text-3xl font-black mb-2 font-serif tracking-widest ${
                  match.winnerPlayerId === p1.id
                    ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500'
                    : 'text-red-500'
                }`}
              >
                {match.winnerPlayerId === p1.id ? 'VITÓRIA!' : 'DERROTA!'}
              </h1>
              <p className="text-slate-200 font-semibold mb-6 text-sm">{match.winReason}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={handleResetMatch}
                  className={`w-full sm:w-auto px-6 py-2.5 font-black uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 text-xs ${
                    match.winnerPlayerId === p1.id
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950'
                      : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white'
                  }`}
                >
                  ⚔️ Novo Duelo
                </button>
                {onExitToMenu && (
                  <button
                    onClick={onExitToMenu}
                    className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-purple-500/50 font-bold uppercase tracking-wider rounded-xl shadow transition-transform hover:scale-105 text-xs"
                  >
                    🏠 Menu Principal
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Configurações Persistentes da Mesa de Duelo */}
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          userNickname={playerNickname}
          onSettingsChanged={handleSettingsChangedInPlaymat}
        />
      </main>
    </div>
  );
};
