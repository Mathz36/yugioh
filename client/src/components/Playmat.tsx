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
import { DuelArena3D } from './duel3d/DuelArena3D';
import { Card3DShowcase } from './duel3d/Card3DShowcase';

export interface PlaymatProps {
  playerNickname?: string;
  playerDeck?: CardData[];
  playerDeckName?: string;
  onExitToMenu?: () => void;
  onHardwareError?: (reason: string) => void;
}

export interface ActionBanner {
  cardName: string;
  cardImage?: string;
  description: string;
  badge?: string;
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
  onHardwareError,
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
  const [actionBanner, setActionBanner] = useState<ActionBanner | null>(null);
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
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState<boolean>(false);
  const [isLogOpen, setIsLogOpen] = useState<boolean>(false);
  const [isFieldInfoOpen, setIsFieldInfoOpen] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => getUserSettings(playerNickname).soundMuted);
  const [, setRefreshKey] = useState(0);

  // Estados de Animação e VFX Dinâmicos
  const [slamZone, setSlamZone] = useState<{ isPlayer: boolean; zoneIndex: number } | null>(null);
  const [lungingZone, setLungingZone] = useState<{
    isPlayer: boolean;
    zoneIndex: number;
    targetIndex?: number | null;
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

  // Dispara o Action Banner de ativação de cartas com miniatura 40x56px e tipografia dourada
  const triggerActionBanner = (
    cardName: string,
    description: string,
    cardImage?: string,
    badge = '[ATIVAÇÃO]',
    durationMs = 3200
  ) => {
    setActionBanner({ cardName, description, cardImage, badge });
    scheduleTimer(() => {
      setActionBanner(null);
    }, durationMs);
  };

  // Metadados visuais e mensagens dinâmicas para ações táticas genéricas com alvo (estilo técnico sem emojis)
  const getTacticalActionMeta = (action: string, isPt: boolean) => {
    switch (action) {
      case 'DESTROY_MONSTER':
        return {
          icon: '[DESTRUIR]',
          badgeSelected: isPt ? 'DESTRUIR' : 'DESTROY',
          confirmVerb: isPt ? 'Destruição' : 'Destruction',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `Escolha até ${maxTargets} monstros do adversário para destruir!`
                : 'Escolha 1 monstro do adversário para destruir!'
              : maxTargets > 1
              ? `Choose up to ${maxTargets} opponent monsters to destroy!`
              : 'Choose 1 opponent monster to destroy!',
        };
      case 'RETURN_TO_HAND':
        return {
          icon: '[RETORNAR]',
          badgeSelected: isPt ? 'RETORNAR' : 'RETURN',
          confirmVerb: isPt ? 'Retorno' : 'Return',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `Escolha até ${maxTargets} monstros do adversário para retornar à mão!`
                : 'Escolha 1 monstro do adversário para retornar à mão!'
              : maxTargets > 1
              ? `Choose up to ${maxTargets} opponent monsters to return to hand!`
              : 'Choose 1 opponent monster to return to hand!',
        };
      case 'DESTROY_SPELL_TRAP':
        return {
          icon: '[DESTRUIR M/A]',
          badgeSelected: isPt ? 'DESTRUIR M/A' : 'DESTROY S/T',
          confirmVerb: isPt ? 'Destruição de Magia/Armadilha' : 'Spell/Trap Destruction',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `Escolha até ${maxTargets} cartas de Magia/Armadilha do adversário para destruir!`
                : 'Escolha 1 carta de Magia/Armadilha do adversário para destruir!'
              : maxTargets > 1
              ? `Choose up to ${maxTargets} opponent Spell/Trap cards to destroy!`
              : 'Choose 1 opponent Spell/Trap card to destroy!',
        };
      default:
        return {
          icon: '[ALVO]',
          badgeSelected: isPt ? 'SELECIONADO' : 'SELECTED',
          confirmVerb: isPt ? 'Alvo' : 'Target',
          promptMessage: (maxTargets: number) =>
            isPt
              ? maxTargets > 1
                ? `Escolha até ${maxTargets} alvos do adversário!`
                : 'Escolha 1 alvo do adversário!'
              : maxTargets > 1
              ? `Choose up to ${maxTargets} opponent targets!`
              : 'Choose 1 opponent target!',
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
    showNotification(`[TURNO] ${p1.nickname} passou o turno para ${p2.nickname}`);
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
            setLungingZone({ isPlayer: false, zoneIndex: attacker.index, targetIndex: targetZoneIdx, deltaX, deltaY });

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
                    showNotification(`[TURNO] É a vez de ${p1.nickname} duelar!`);
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
                      ? '[WABOKU] O poder sagrado de Waboku protegeu seus monstros e anulou todo dano de batalha!'
                      : '[WABOKU] Waboku sacred power protected your monsters and prevented all battle damage!'
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
                    badge: languagePt ? 'EFEITO RÁPIDO' : 'QUICK EFFECT',
                    badgeIcon: '[EFEITO]',
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
                    confirmText: languagePt ? 'Ativar Kuriboh' : 'Activate Kuriboh',
                    declineText: languagePt ? 'Receber Dano' : 'Take Damage',
                    onConfirm: () => {
                      setPriorityPrompt(null);
                      session.activateKuriboh(p1.id);
                      soundFX.playMagicShield();
                      triggerActionBanner(
                        kuribohName,
                        languagePt ? 'Kuriboh foi descartado da mão e absorveu todo o dano de batalha!' : 'Kuriboh was discarded and absorbed all battle damage!',
                        kuribohCard?.data.imageUrl,
                        '[EFEITO]'
                      );
                      showNotification(
                        languagePt
                          ? '[KURIBOH] Kuriboh absorveu todo o dano do ataque!'
                          : '[KURIBOH] Kuriboh absorbed all battle damage!'
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
                        ? `[EFEITO FLIP] ${flipName} destruiu ${attackerName}!`
                        : `[FLIP EFFECT] ${flipName} destroyed ${attackerName}!`
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
                        ? `[EFEITO FLIP] ${flipName} devolveu ${attackerName} para a mão!`
                        : `[FLIP EFFECT] ${flipName} returned ${attackerName} to hand!`
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
                          ? '[WABOKU] O monstro em defesa foi protegido pela aura sagrada de Waboku!'
                          : '[WABOKU] Defense monster was protected by Waboku sacred aura!'
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
              badgeIcon: '[ARMADILHA]',
              title: languagePt ? 'JANELA DE PRIORIDADE' : 'PRIORITY WINDOW',
              cardName: trapName,
              cardImage: trapCard?.data.imageUrl,
              cardType: 'TRAP',
              accentColor: 'cyan',
              message: languagePt
                ? 'Deseja ativar Força Espelho (Mirror Force) em resposta ao ataque declarado?'
                : 'Do you wish to activate Mirror Force in response to the declared attack?',
              confirmText: languagePt ? 'Ativar Força Espelho' : 'Activate Mirror Force',
              declineText: languagePt ? 'Guardar / Passar' : 'Keep / Pass',
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

                triggerActionBanner(
                  trapName,
                  languagePt
                    ? 'O ataque foi refletido e todos os monstros de ataque do adversário foram destruídos!'
                    : 'The attack was reflected and all opponent attack position monsters were destroyed!',
                  trapCard?.data.imageUrl,
                  '[ARMADILHA]'
                );

                showNotification(
                  languagePt
                    ? '[FORÇA ESPELHO] O ataque foi refletido e todos os monstros de ataque do adversário foram destruídos!'
                    : '[MIRROR FORCE] The attack was reflected and all opponent attack monsters were destroyed!'
                );

                setLungingZone(null);
                forceUpdate();

                scheduleTimer(() => {
                  session.nextPhase(); // MAIN2
                  session.nextPhase(); // END -> Turno do Jogador
                  showNotification(`[TURNO] É a vez de ${p1.nickname} duelar!`);
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
            showNotification(`[TURNO] É a vez de ${p1.nickname} duelar!`);
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
              badgeIcon: '[ARMADILHA]',
              title: languagePt ? 'JANELA DE PRIORIDADE' : 'PRIORITY WINDOW',
              cardName: trapName,
              cardImage: trapCard?.data.imageUrl,
              cardType: 'TRAP',
              accentColor: 'purple',
              message: languagePt
                ? `O oponente invocou ${summonedName} (ATK ${summonedAtk}). Deseja ativar sua carta armadilha ${trapName}?`
                : `Opponent summoned ${summonedName} (ATK ${summonedAtk}). Do you wish to activate your trap card ${trapName}?`,
              confirmText: languagePt ? 'Ativar Buraco Armadilha' : 'Activate Trap Hole',
              declineText: languagePt ? 'Guardar / Passar' : 'Keep / Pass',
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
                  triggerActionBanner(
                    trapName,
                    languagePt
                      ? `${summonedName} caiu no Buraco Armadilha e foi destruído!`
                      : `${summonedName} fell into the Trap Hole and was destroyed!`,
                    trapCard?.data.imageUrl,
                    '[ARMADILHA]'
                  );
                  showNotification(
                    languagePt
                      ? `[BURACO ARMADILHA] Buraco Armadilha ativado! ${summonedName} foi destruído!`
                      : `[TRAP HOLE] Trap Hole activated! ${summonedName} was destroyed!`
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
    if (isMonster && p1.hasNormalSummonedThisTurn) {
      showNotification(
        languagePt
          ? '[AVISO] Você já realizou sua Invocação Normal neste turno!'
          : '[WARNING] You already performed your Normal Summon this turn!'
      );
      return;
    }
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
            ? '[AVISO] O adversário não possui Cartas Mágicas ou Armadilhas no campo!'
            : '[WARNING] Opponent has no Spell or Trap cards on the field!'
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
            ? '[AVISO] Cartas Mágicas e Armadilhas só podem ser colocadas nas Zonas de Magia e Armadilha (M/A) abaixo!'
            : '[WARNING] Spell and Trap cards can only be placed in the Spell & Trap Zones (M/A) below!'
        );
        return;
      }

      // Invocação de Monstro permitida na Fase Principal 1 ou 2
      if (match.phase === 'MAIN1' || match.phase === 'MAIN2') {
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
              ? `[AVISO] Você já selecionou os ${requiredTributes} sacrifício(s). Clique em uma das zonas liberadas ou vazias para invocar!`
              : `[WARNING] You already selected ${requiredTributes} tribute(s). Click on one of the vacated or empty zones to summon!`
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
                  ? `[PRONTO] ${requiredTributes} sacrifício(s) pronto(s)! Agora clique na zona onde deseja baixar ${cardName}!`
                  : `[READY] ${requiredTributes} tribute(s) ready! Now click on the zone to summon ${cardName}!`
              );
            }
          }
          return;
        }

        // Clicou numa zona vazia antes de selecionar os sacrifícios
        showNotification(
          languagePt
            ? `[TRIBUTO] Monstro Nível ${card.data.level} exige selecionar ${requiredTributes} monstro(s) no seu campo como sacrifício primeiro!`
            : `[TRIBUTE] Level ${card.data.level} monster requires selecting ${requiredTributes} monster(s) on your field as tribute first!`
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
          return;
        } else {
          showNotification(
            languagePt
              ? '[AVISO] Esta zona já está ocupada por outro monstro!'
              : '[WARNING] This zone is already occupied by another monster!'
          );
          return;
        }
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
              ? '[AVISO] Esta carta foi baixada neste turno e só poderá ser revelada no próximo turno!'
              : '[WARNING] This card was set this turn and can only be flipped next turn!'
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
              ? '[AVISO] Este monstro foi invocado neste turno e só poderá atacar no próximo turno!'
              : '[WARNING] This monster was summoned this turn and cannot attack until next turn!'
          );
          return;
        }
        setSelectedAttackerZone(selectedAttackerZone === zoneIndex ? null : zoneIndex);
      } else if (currentMonster.position === 'DEFENSE') {
        showNotification(
          languagePt
            ? '[AVISO] Monstros em Posição de Defesa não podem atacar!'
            : '[WARNING] Monsters in Defense Position cannot attack!'
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
                ? `[EFEITO FLIP] ${posResult.flipEffect.targetName} do oponente foi destruído!`
                : `[FLIP EFFECT] Opponent's ${posResult.flipEffect.targetName} was destroyed!`
            );
          }
        } else if (posResult.flipEffect.action === 'RETURN_TO_HAND') {
          soundFX.playReturnToHand();
          if (posResult.flipEffect.targetNames && posResult.flipEffect.targetNames.length > 0) {
            showNotification(
              languagePt
                ? `[EFEITO FLIP] ${posResult.flipEffect.targetNames.join(', ')} retornou para a mão do oponente!`
                : `[FLIP EFFECT] ${posResult.flipEffect.targetNames.join(', ')} returned to opponent's hand!`
            );
          } else if (posResult.flipEffect.targetName) {
            showNotification(
              languagePt
                ? `[EFEITO FLIP] ${posResult.flipEffect.targetName} retornou para a mão do oponente!`
                : `[FLIP EFFECT] ${posResult.flipEffect.targetName} returned to opponent's hand!`
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
    const cardUidToSummon = selectedHandCardUid || summonChoiceModal?.card.uid;
    if (!cardUidToSummon) return;
    const success = session.normalSummon(cardUidToSummon, zoneIndex, position, tributeIndices, isFaceDown);
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
            triggerActionBanner(
              languagePt ? 'Buraco Armadilha' : 'Trap Hole',
              languagePt ? `${summonedName} caiu no Buraco Armadilha do oponente!` : `${summonedName} fell into opponent's Trap Hole!`,
              '/cards/trap-hole.jpg',
              '[ARMADILHA]'
            );
            showNotification(
              languagePt
                ? `[ARMADILHA DO OPONENTE] Buraco Armadilha destruiu ${summonedName}!`
                : `[OPPONENT TRAP] Trap Hole destroyed ${summonedName}!`
            );
          }
        }
      }

      forceUpdate();
    } else {
      showNotification(languagePt ? '[FALHA] Falha ao invocar monstro. Verifique as regras.' : '[FAILED] Failed to summon monster. Check the rules.');
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
                badgeIcon: '[ARMADILHA]',
                title: languagePt ? 'ATIVAÇÃO DE ARMADILHA' : 'TRAP ACTIVATION',
                cardName,
                cardImage: currentSlot.data.imageUrl,
                cardType: 'TRAP',
                accentColor: 'sky',
                message: languagePt
                  ? `Deseja ativar ${cardName} agora? Uma aura sagrada envolverá seus monstros, impedindo sua destruição em batalha e reduzindo todo dano de batalha a 0 neste turno.`
                  : `Activate ${cardName} now? A sacred aura will protect your monsters from battle destruction and reduce battle damage to 0 this turn.`,
                confirmText: languagePt ? 'Ativar Waboku' : 'Activate Waboku',
                declineText: languagePt ? 'Guardar / Passar' : 'Keep / Cancel',
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
                  ? '[ARMADILHA] Esta armadilha é de ativação reativa (ex: Força Espelho, Buraco Armadilha) e responderá a ações do oponente!'
                  : '[TRAP] This trap triggers in response to specific opponent actions!'
              );
              return;
            }
          } else {
            showNotification(
              languagePt
                ? '[AVISO] Armadilhas baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.'
                : '[WARNING] Set traps cannot be activated during the same turn they were placed.'
            );
            return;
          }
        } else {
          showNotification(
            languagePt
              ? '[AVISO] Você não pode ativar cartas mágicas normais durante o turno do oponente!'
              : '[WARNING] You cannot activate normal spells during opponent turn!'
          );
          return;
        }
      }
      return;
    }

    if (match.phase !== 'MAIN1' && match.phase !== 'MAIN2') {
      showNotification(
        languagePt
          ? '[AVISO] Cartas Mágicas e Armadilhas só podem ser baixadas ou ativadas nas Fases Principais!'
          : '[WARNING] Spell and Trap cards can only be set or activated during Main Phases!'
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
                ? '[AVISO] Cartas Mágicas baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.'
                : '[WARNING] Set Spell cards cannot be activated during the same turn they were placed on the field.'
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
                badgeIcon: '[ARMADILHA]',
                title: languagePt ? 'ATIVAÇÃO DE ARMADILHA' : 'TRAP ACTIVATION',
                cardName,
                cardImage: currentSlot.data.imageUrl,
                cardType: 'TRAP',
                accentColor: 'sky',
                message: languagePt
                  ? `Deseja ativar ${cardName} agora? Uma aura sagrada envolverá seus monstros, impedindo sua destruição em batalha e reduzindo todo dano de batalha a 0 neste turno.`
                  : `Activate ${cardName} now? A sacred aura will protect your monsters from battle destruction and reduce battle damage to 0 this turn.`,
                confirmText: languagePt ? 'Ativar Waboku' : 'Activate Waboku',
                declineText: languagePt ? 'Guardar / Passar' : 'Keep / Cancel',
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
                  ? '[ARMADILHA] Esta armadilha é de ativação reativa e será disparada em resposta às ações do adversário!'
                  : '[TRAP] This trap is reactive and triggers in response to opponent actions!'
              );
            }
          } else {
            showNotification(
              languagePt
                ? '[AVISO] Cartas Armadilha baixadas não podem ser ativadas no mesmo turno em que foram colocadas no campo.'
                : '[WARNING] Set Trap cards cannot be activated during the same turn they were placed on the field.'
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
          ? '[AVISO] Monstros só podem ser invocados nas Zonas de Monstros!'
          : '[WARNING] Monsters can only be summoned in Monster Zones!'
      );
      return;
    }

    if (!isSpellOrTrapCard(selectedCard)) {
      showNotification(
        languagePt
          ? '[AVISO] Apenas Cartas Mágicas ou Armadilhas podem ser colocadas nestas zonas!'
          : '[WARNING] Only Spell or Trap cards can be placed in these zones!'
      );
      return;
    }

    if (currentSlot !== null) {
      showNotification(
        languagePt
          ? '[AVISO] Esta zona já está ocupada por outra carta!'
          : '[WARNING] This zone is already occupied by another card!'
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
          ? `[BAIXAR] Carta ${cardTypeLabel} baixada virada para baixo na zona!`
          : `[SET] ${cardTypeLabel} card set face-down in the zone!`
      );
      forceUpdate();
    } else {
      showNotification(languagePt ? '[FALHA] Não foi possível baixar a carta.' : '[FAILED] Failed to set card.');
    }
  };

  // Executa a Ativação de Waboku pelo Jogador
  const handleActivateWaboku = (zoneIndex: number) => {
    const success = session.activateWaboku(p1.id, zoneIndex);
    if (success) {
      soundFX.playMagicShield();
      triggerActionBanner(
        languagePt ? 'Waboku' : 'Waboku',
        languagePt
          ? 'Uma aura sagrada protege seus monstros contra destruição e anula todo dano de batalha neste turno!'
          : 'A sacred aura protects your monsters from destruction and prevents battle damage this turn!',
        '/cards/waboku.jpg',
        '[ARMADILHA]'
      );
      showNotification(
        languagePt
          ? '[WABOKU] Waboku ativado! Uma aura sagrada protege seus monstros contra destruição e anula todo dano de batalha!'
          : '[WABOKU] Waboku activated! A sacred aura protects your monsters and prevents battle damage!'
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
        triggerActionBanner(
          cardDisplayName,
          languagePt
            ? 'Relâmpagos celestiais aniquilam todas as forças do adversário!'
            : 'Heavenly lightning annihilates all opponent monsters!',
          card.data.imageUrl,
          '[MAGIA]'
        );
        showNotification(
          languagePt
            ? `[MAGIA] ${cardDisplayName} ativado! Todos os monstros do oponente foram aniquilados!`
            : `[SPELL] ${cardDisplayName} activated! All opponent monsters were destroyed!`
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
        triggerActionBanner(
          cardDisplayName,
          languagePt
            ? 'O vórtice dimensional destruiu todos os monstros no campo!'
            : 'The dimensional vortex destroyed all monsters on the field!',
          card.data.imageUrl,
          '[MAGIA]'
        );
        showNotification(
          languagePt
            ? `[MAGIA] ${cardDisplayName} ativado! O campo foi aniquilado!`
            : `[SPELL] ${cardDisplayName} activated! The entire field was destroyed!`
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

        triggerActionBanner(
          cardDisplayName,
          languagePt ? 'Você comprou 2 cartas do seu deck!' : 'You drew 2 cards from your deck!',
          card.data.imageUrl,
          '[MAGIA]'
        );
        showNotification(
          languagePt
            ? `[MAGIA] ${cardDisplayName} ativado! Você comprou 2 cartas!`
            : `[SPELL] ${cardDisplayName} activated! You drew 2 cards!`
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
        triggerActionBanner(
          cardDisplayName,
          languagePt ? `Você recuperou ${value} Pontos de Vida!` : `You gained ${value} Life Points!`,
          card.data.imageUrl,
          '[MAGIA]'
        );
        showNotification(
          languagePt
            ? `[MAGIA] ${cardDisplayName} ativado! Você recuperou ${value} LP!`
            : `[SPELL] ${cardDisplayName} activated! You gained ${value} LP!`
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
        triggerActionBanner(
          cardDisplayName,
          languagePt ? `Causou ${value} de dano direto aos LPs do adversário!` : `Inflicted ${value} direct damage to opponent's LP!`,
          card.data.imageUrl,
          '[MAGIA]'
        );
        showNotification(
          languagePt
            ? `[MAGIA] ${cardDisplayName} causou ${value} de dano direto aos LPs do oponente!`
            : `[SPELL] ${cardDisplayName} inflicted ${value} direct damage to opponent's LP!`
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
      triggerActionBanner(
        cardDisplayName,
        languagePt ? 'Carta Mágica ativada com sucesso!' : 'Spell card successfully activated!',
        card.data.imageUrl,
        '[MAGIA]'
      );
      showNotification(
        languagePt
          ? `[MAGIA] ${cardDisplayName} ativado!`
          : `[SPELL] ${cardDisplayName} activated!`
      );
      forceUpdate();
    } else {
      showNotification(languagePt ? '[FALHA] Falha ao ativar Carta Mágica.' : '[FAILED] Failed to activate Spell card.');
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

      triggerActionBanner(
        languagePt ? 'Força Espelho' : 'Mirror Force',
        languagePt
          ? 'O oponente ativou Força Espelho! Seus monstros em modo de ataque foram aniquilados!'
          : 'Opponent activated Mirror Force! Your attack position monsters were destroyed!',
        '/cards/mirror-force.jpg',
        '[ARMADILHA]'
      );
      showNotification(
        languagePt
          ? '[FORÇA ESPELHO] O Bot ativou Força Espelho! Seus monstros em modo de ataque foram aniquilados!'
          : '[MIRROR FORCE] Opponent activated Mirror Force! Your attack position monsters were destroyed!'
      );

      setSelectedAttackerZone(null);
      forceUpdate();
      return;
    }

    // 3. Efeitos de Ataque: Animação de Investida (Lunge) com vetor direcional exato
    const { deltaX, deltaY } = calculateLungeDelta(true, attackerZone, targetZoneIndex);
    setLungingZone({ isPlayer: true, zoneIndex: attackerZone, targetIndex: targetZoneIndex, deltaX, deltaY });
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
              ? '[WABOKU] O oponente está protegido pela aura sagrada de Waboku! O dano direto foi anulado!'
              : '[WABOKU] Opponent is protected by Waboku! Direct damage was negated!'
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
                  ? '[WABOKU] O monstro do oponente foi protegido pela aura sagrada de Waboku!'
                  : '[WABOKU] Opponent monster was protected by Waboku!'
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
                  ? '[WABOKU] O monstro em defesa foi protegido pela aura sagrada de Waboku!'
                  : '[WABOKU] Opponent defense monster was protected by Waboku!'
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
      showNotification(languagePt ? '[AVISO] O efeito só pode ser ativado na Fase Principal!' : '[WARNING] Effect can only be activated during Main Phase!');
      return;
    }

    const card = p1.monsterZones[zoneIndex];
    if (!card || card.hasUsedEffectThisTurn) {
      showNotification(languagePt ? '[AVISO] Time Wizard já usou o efeito neste turno!' : '[WARNING] Time Wizard already used its effect this turn!');
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
        showNotification(languagePt ? '[TIME WIZARD] TEMPO ACELERADO! O oponente teve seu campo destruído!' : '[TIME WIZARD] TIME ACCELERATED! Opponent field was destroyed!');
      } else {
        soundFX.playDestruction();
        setIsCameraShaking(true);
        setTimeout(() => setIsCameraShaking(false), 350);

        triggerCardDestruction(result.destroyedUids);
        if (result.burnDamage > 0) {
          setFloatingDamage({ amount: result.burnDamage, isPlayer: true, zoneIndex: null });
          setTimeout(() => setFloatingDamage(null), 1400);
        }
        showNotification(languagePt ? '[TIME WIZARD] FALHA TEMPORAL! Seus monstros foram destruídos!' : '[TIME WIZARD] TIME BACKFIRE! Your monsters were destroyed!');
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

  const currentSelectedHandCard = selectedHandCardUid ? p1.hand.find((c) => c.uid === selectedHandCardUid) : null;
  const isCurrentCardMonster = isMonsterCard(currentSelectedHandCard);
  const tributeCountNeeded = isCurrentCardMonster
    ? (currentSelectedHandCard!.data.level <= 4 ? 0 : currentSelectedHandCard!.data.level <= 6 ? 1 : 2)
    : 0;

  const validSummonZoneIndices: number[] = [];
  if (isCurrentCardMonster) {
    p1.monsterZones.forEach((slot, idx) => {
      const isSelectedTribute = selectedTributeZones.includes(idx);
      const isTributeTargetZone = tributeCountNeeded > 0 && selectedTributeZones.length === tributeCountNeeded && (slot === null || isSelectedTribute);
      const isValidSummonZone = tributeCountNeeded === 0 && slot === null;
      if (isValidSummonZone || isTributeTargetZone) {
        validSummonZoneIndices.push(idx);
      }
    });
  }

  const isCurrentCardSpellOrTrap = isSpellOrTrapCard(currentSelectedHandCard);
  const validSpellTrapZoneIndices: number[] = [];
  if (isCurrentCardSpellOrTrap) {
    p1.spellTrapZones.forEach((slot, idx) => {
      if (slot === null) {
        validSpellTrapZoneIndices.push(idx);
      }
    });
  }

  const handleArena3DZoneClick = (isPlayer: boolean, zoneType: 'MONSTER' | 'SPELL_TRAP', index: number) => {
    if (isPlayer) {
      if (zoneType === 'MONSTER') {
        handlePlayerMonsterZoneClick(index);
      } else {
        handlePlayerSpellTrapZoneClick(index);
      }
    } else {
      if (zoneType === 'MONSTER') {
        if (selectedAttackerZone !== null && p2.monsterZones.every((m) => m === null)) {
          handleOpponentZoneClick(null);
        } else {
          handleOpponentZoneClick(index);
        }
      } else {
        handleOpponentSpellTrapZoneClick(index);
      }
    }
  };

  const handleArena3DCardHover = (card: CardInstance | null) => {
    if (card) {
      setInspectedCard(card);
    }
  };

  return (
    <div className="flex h-screen w-screen max-h-screen bg-[#0c0a09] select-none text-stone-100 overflow-hidden font-sans relative">
      
      {/* ACTION BANNER DE ATIVAÇÃO DE CARTAS (MINIATURA 40x56px, BORDA METÁLICA, NOME DOURADO) */}
      {actionBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-slideInRight">
          <div className="bg-[#141210]/95 border-2 border-amber-700/80 rounded-2xl px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.92)] backdrop-blur-md flex items-center gap-3.5 max-w-lg">
            {actionBanner.cardImage && (
              <div className="w-[40px] h-[56px] min-w-[40px] rounded border border-amber-500/80 overflow-hidden shadow-md bg-black">
                <img
                  src={actionBanner.cardImage}
                  alt={actionBanner.cardName}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-2">
                {actionBanner.badge && (
                  <span className="text-[10px] font-mono font-black text-amber-300 bg-amber-950/90 px-2 py-0.5 rounded border border-amber-700/60 uppercase tracking-wider">
                    {actionBanner.badge}
                  </span>
                )}
                <span className="font-serif font-black text-amber-200 text-sm tracking-wide drop-shadow">
                  {actionBanner.cardName}
                </span>
              </div>
              <p className="text-xs text-stone-200 font-sans mt-0.5 leading-snug line-clamp-2">
                {actionBanner.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ALERTA VISUAL DO SISTEMA (QUANDO NÃO HOUVER ACTION BANNER) */}
      {toastMessage && !actionBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className="bg-[#141210]/95 border-2 border-amber-600/80 text-amber-200 px-6 py-2.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.92)] backdrop-blur-md font-serif font-black text-sm tracking-wide flex items-center gap-2.5">
            <span className="text-[10px] font-mono font-black text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-700/60">[SISTEMA]</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}



      {/* MODAL / ROLETA DO TEMPO DE TIME WIZARD */}
      {timeWizardRoulette && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#141210] border-2 border-amber-600 p-8 rounded-3xl max-w-sm w-full text-center shadow-[0_10px_40px_rgba(0,0,0,0.95)] flex flex-col items-center">
            <h3 className="font-serif font-black text-amber-300 text-xl tracking-widest uppercase mb-4 drop-shadow">
              {languagePt ? 'Roleta do Tempo' : 'Time Roulette'}
            </h3>

            {/* Moeda 3D Girando */}
            <div className="w-28 h-28 my-4 rounded-full border-4 border-amber-400 bg-gradient-to-tr from-amber-700 via-amber-400 to-amber-600 flex items-center justify-center shadow-lg relative overflow-hidden">
              <div className={`text-5xl ${timeWizardRoulette.isSpinning ? 'anim-coin-spin' : ''}`}>
                <span className="text-xl font-mono font-black text-stone-950">{timeWizardRoulette.isSpinning ? '[ROLANDO]' : timeWizardRoulette.outcome === 'HEADS' ? '[CARA]' : '[COROA]'}</span>
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
                    [SUCESSO] {languagePt ? 'CARA (HEADS)!' : 'HEADS!'}
                  </span>
                  <span className="text-xs text-emerald-200/90 font-sans mt-1 block">
                    {languagePt ? 'O campo do adversário desintegrou-se!' : 'Opponent field disintegrated!'}
                  </span>
                </div>
              ) : (
                <div className="animate-bounce">
                  <span className="text-lg font-black text-red-500 font-serif tracking-wide block">
                    [FALHA] {languagePt ? 'COROA (TAILS)!' : 'TAILS!'}
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

      {/* ANIMAÇÃO LENDÁRIA DE RAIGEKI: RELÂMPAGOS E DESTRUIÇÃO TOTAL */}
      {raigekiActive && (
        <div className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center animate-fadeIn bg-gradient-to-b from-amber-500/30 via-yellow-200/40 to-amber-700/30 backdrop-blur-[2px]">
          <div className="absolute inset-0 bg-white/30 animate-ping"></div>
          <div className="relative text-center p-6 rounded-3xl bg-[#141210]/95 border-4 border-amber-400 shadow-2xl">
            <div className="text-3xl sm:text-4xl font-mono font-black text-amber-300 tracking-widest mb-2 animate-bounce">[RAIGEKI]</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-black tracking-widest text-amber-200 uppercase">
              {languagePt ? 'RAIGEKI !' : 'RAIGEKI !'}
            </h2>
            <p className="text-sm font-sans font-bold text-amber-100 tracking-wider mt-2">
              {languagePt
                ? 'Relâmpagos celestiais aniquilam todas as forças do adversário!'
                : 'Heavenly lightning annihilates all opponent monsters!'}
            </p>
          </div>
        </div>
      )}

      {/* BANNER COMEMORATIVO DE FORÇA ESPELHO / CARTAS LENDÁRIAS */}
      {celebratoryBanner && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90%] pointer-events-none animate-fadeIn">
          <div className="bg-[#141210]/95 border-2 border-amber-600 rounded-2xl p-4 sm:p-5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.92)] flex items-center justify-center gap-3">
            <span className="text-xs font-mono font-black bg-amber-950 text-amber-200 border border-amber-600 px-2 py-1 rounded">[ATIVADO]</span>
            <div className="text-sm sm:text-base font-serif font-black text-amber-200 tracking-wide leading-snug">
              {celebratoryBanner.title}
            </div>
            <span className="text-xs font-mono font-black bg-amber-950 text-amber-200 border border-amber-600 px-2 py-1 rounded">[ATIVADO]</span>
          </div>
        </div>
      )}

      {/* JANELA DE PRIORIDADE E RESPOSTA TÁTICA (RIGHT-DOCKED TACTICAL HUD) */}
      {priorityPrompt && (
        <div className="fixed right-4 sm:right-6 top-24 z-50 w-72 sm:w-84 max-h-[80vh] flex flex-col animate-slideInRight bg-[#141210]/95 border-2 border-amber-800/80 rounded-2xl p-4 shadow-[0_8px_35px_rgba(0,0,0,0.92)] backdrop-blur-md overflow-y-auto text-center">
          {/* Header Badge */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-black tracking-widest uppercase border bg-[#1c1917] shadow-inner text-amber-300 border-amber-700/60">
              {priorityPrompt.badgeIcon && <span className="font-bold">{priorityPrompt.badgeIcon}</span>}
              <span>{priorityPrompt.badge}</span>
            </span>
            <button
              onClick={priorityPrompt.onDecline}
              className="text-stone-400 hover:text-stone-100 text-xs font-mono px-1.5 py-0.5 rounded hover:bg-white/10"
              title={languagePt ? 'Fechar / Passar' : 'Close / Pass'}
            >
              [X]
            </button>
          </div>

          {/* Window Title */}
          <h3 className="text-sm font-serif font-black tracking-wider mb-2 uppercase drop-shadow text-amber-300">
            {priorityPrompt.title}
          </h3>

          {/* Card Preview */}
          {priorityPrompt.cardImage && (
            <div className="relative w-20 h-28 mx-auto mb-2 rounded-lg overflow-hidden border border-amber-700/70 shadow-lg">
              <img
                src={priorityPrompt.cardImage}
                alt={priorityPrompt.cardName}
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Card Name */}
          <div className="text-xs font-serif font-black text-amber-200 mb-1 drop-shadow-sm">
            {priorityPrompt.cardName}
          </div>

          {/* Message Body */}
          <div className="text-[11px] text-stone-200 mb-4 leading-relaxed font-sans px-1">
            {priorityPrompt.message}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={priorityPrompt.onConfirm}
              className="w-full py-2.5 px-3 rounded-xl font-serif font-black text-xs uppercase tracking-wider text-stone-950 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-lg border border-amber-300 transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span className="font-mono text-[10px] bg-black/30 text-stone-950 px-1 rounded font-black">[ATIVAR]</span>
              <span>{priorityPrompt.confirmText}</span>
            </button>

            <button
              onClick={priorityPrompt.onDecline}
              className="w-full py-2 px-3 rounded-xl font-serif font-bold text-xs uppercase tracking-wider bg-[#292524] hover:bg-[#38322e] text-stone-200 hover:text-white border border-stone-700 transition-all shadow-md active:scale-95"
            >
              {priorityPrompt.declineText}
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY DE CONTAGEM REGRESSIVA INICIAL (5 SEGUNDOS) */}
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
          <div className="text-3xl sm:text-4xl font-serif font-black tracking-widest text-amber-400 mb-4 animate-pulse">[DUEL]</div>
          <h2 className="text-2xl font-serif tracking-widest text-amber-300 font-black mb-6">
            A PARTIDA VAI INICIAR EM
          </h2>
          <div className="text-8xl font-black font-mono text-amber-400 shadow-2xl scale-125 transition-transform duration-300">
            {countdown > 0 ? countdown : 'É HORA DO DUELO!'}
          </div>
          <p className="text-xs text-amber-300/80 mt-8 uppercase tracking-widest font-mono">
            {countdown > 0 ? 'Toque na tela para ativar o som • Embaralhando decks clássicos...' : 'Que os Jogos das Sombras comecem!'}
          </p>
        </div>
      )}

      {/* 1. ARENA DE DUELO 3D EM TELA CHEIA (100VW x 100VH MASTER DUEL VIEWPORT) */}
      <div
        className={`absolute inset-0 w-full h-full z-0 overflow-hidden transition-transform ${
          isCameraShaking ? 'anim-camera-shake' : ''
        }`}
      >
        <DuelArena3D
          playerMonsters={[...p1.monsterZones]}
          playerSpellTraps={[...p1.spellTrapZones]}
          opponentMonsters={[...p2.monsterZones]}
          opponentSpellTraps={[...p2.spellTrapZones]}
          playerHand={[...p1.hand]}
          opponentHandCount={p2.hand.length}
          selectedHandCardUid={selectedHandCardUid}
          onHandCardClick={handleSelectHandCard}
          playerDeckCount={p1.deck.length}
          playerGraveyardCount={p1.graveyard.length}
          opponentDeckCount={p2.deck.length}
          opponentGraveyardCount={p2.graveyard.length}
          languagePt={languagePt}
          activeFieldVfx={raigekiActive ? 'RAIGEKI' : session.isWabokuActiveForPlayerId ? 'WABOKU' : null}
          inspectedCardUid={inspectedCard?.uid}
          selectedAttackerZone={selectedAttackerZone}
          validSummonZones={validSummonZoneIndices}
          validSpellTrapZones={validSpellTrapZoneIndices}
          tacticalTargetUids={tacticalTargetSelection?.selectedUids || []}
          lungingZone={lungingZone}
          slamZone={slamZone}
          targetHitZone={targetHitZone}
          destroyedCardUids={destroyedCardUids}
          flippedZones={flippedZones}
          onZoneClick={handleArena3DZoneClick}
          onCardHover={handleArena3DCardHover}
          onError={(err) => {
            onHardwareError?.(
              err.message || 'Falha ao inicializar o acelerador gráfico 3D.'
            );
          }}
          isCameraShaking={isCameraShaking}
        />
      </div>

      {/* 2. TOPO DIREITO: PLACA DE LP DO OPONENTE (DARK STONE & CRIMSON IRON PLATE) */}
      <div
        ref={opponentLpRef}
        className="fixed top-3 right-3 z-30 bg-[#161212]/95 border-2 border-red-900/75 rounded-bl-2xl rounded-tr-lg px-3.5 py-1.5 shadow-[0_4px_25px_rgba(0,0,0,0.9)] flex items-center gap-3 backdrop-blur-md"
      >
        {/* Floating Damage em Ataque Direto contra o Oponente */}
        {floatingDamage && !floatingDamage.isPlayer && floatingDamage.zoneIndex === null && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none anim-damage-float whitespace-nowrap">
            <span className="text-3xl sm:text-4xl font-mono font-black text-red-500 drop-shadow-[0_2px_10px_rgba(0,0,0,1)]">
              -{floatingDamage.amount}
            </span>
          </div>
        )}

        <div className="flex flex-col items-end text-right">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-black px-1.5 py-0.2 bg-[#291d1d] border border-red-800/80 text-red-200 rounded uppercase">
              [BOT]
            </span>
            <span className="text-xs font-bold text-stone-200 tracking-wide truncate max-w-[140px]">
              {p2.nickname}
            </span>
          </div>
          <div className="flex items-baseline mt-0.5">
            <span className="text-xs font-black text-red-400/90 mr-1.5 font-mono">LP</span>
            <span className="text-2xl sm:text-3xl font-black font-mono text-stone-100 tracking-tight tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,1)]">
              {p2.lifePoints}
            </span>
          </div>
        </div>

        <div className="w-11 h-11 rounded-lg bg-[#291d1d] border border-red-800/80 text-red-200 flex items-center justify-center font-black text-base shadow-inner shrink-0">
          {p2.nickname.charAt(0) || 'K'}
        </div>
      </div>

      {/* 4. RODAPÉ ESQUERDO: PLACA DE LP DO JOGADOR (DARK STONE & AGED GOLD PLATE) */}
      <div
        ref={playerLpRef}
        className="fixed bottom-3 left-3 z-30 bg-[#141210]/95 border-2 border-amber-800/80 rounded-tr-2xl rounded-bl-lg px-3.5 py-1.5 shadow-[0_4px_25px_rgba(0,0,0,0.9)] flex items-center gap-3 backdrop-blur-md"
      >
        {/* Floating Heal no Jogador */}
        {floatingHeal && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none anim-damage-float whitespace-nowrap">
            <span className="text-2xl sm:text-3xl font-mono font-black text-emerald-400 drop-shadow-[0_2px_10px_rgba(0,0,0,1)]">
              +{floatingHeal.amount} LP
            </span>
          </div>
        )}

        {/* Floating Damage em Ataque Direto contra o Jogador */}
        {floatingDamage && floatingDamage.isPlayer && floatingDamage.zoneIndex === null && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none anim-damage-float whitespace-nowrap">
            <span className="text-3xl sm:text-4xl font-mono font-black text-red-500 drop-shadow-[0_2px_10px_rgba(0,0,0,1)]">
              -{floatingDamage.amount}
            </span>
          </div>
        )}

        <div className="w-11 h-11 rounded-lg bg-[#292524] border border-amber-600/80 text-amber-200 flex items-center justify-center font-black text-base shadow-inner uppercase shrink-0">
          {p1.nickname.charAt(0) || 'D'}
        </div>

        <div className="flex flex-col items-start text-left">
          <span className="text-xs font-bold text-stone-200 tracking-wide truncate max-w-[140px]">
            {p1.nickname}
          </span>
          <div className="flex items-baseline mt-0.5">
            <span className="text-xs font-black text-amber-400 mr-1.5 font-mono">LP</span>
            <span className="text-2xl sm:text-3xl font-black font-mono text-stone-100 tracking-tight tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,1)]">
              {p1.lifePoints}
            </span>
          </div>
        </div>
      </div>

      {/* 4. PAINEL FLUTUANTE ESQUERDO: INSPETOR DE CARTAS (DARK STONE & AGED GOLD) */}
      {isInspectorCollapsed ? (
        <div className="fixed left-3 top-3 z-30">
          <button
            onClick={() => setIsInspectorCollapsed(false)}
            className="bg-[#141210]/95 border border-amber-800/75 hover:border-amber-600 text-amber-200/90 px-3 py-2 rounded-xl shadow-lg font-mono text-[10px] font-black tracking-wider cursor-pointer transition-colors backdrop-blur-md"
            title={languagePt ? 'Expandir Inspetor de Cartas' : 'Expand Card Inspector'}
          >
            {languagePt ? '[+ INSPETOR]' : '[+ INSPECTOR]'}
          </button>
        </div>
      ) : (
        <aside className="fixed left-3 top-3 bottom-28 sm:bottom-32 w-80 sm:w-88 md:w-92 z-30 flex flex-col bg-[#141210]/95 border border-amber-900/75 text-stone-200 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.92)] backdrop-blur-md overflow-hidden">
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
              const cardTypeLower = inspectedCard.data.type.toLowerCase();
              const isSpell =
                cardTypeLower.includes('spell') || cardTypeLower.includes('mágic');
              const isTrap =
                cardTypeLower.includes('trap') || cardTypeLower.includes('armadilha');
              const isSpellOrTrap = isSpell || isTrap;

              // Caso 1: Carta virada para baixo do oponente (segredo preservado)
              if (isOpponentOwned && isFaceDown) {
                const titleText = isSpellOrTrap
                  ? languagePt
                    ? 'Magia/Armadilha Oculta'
                    : 'Hidden Spell/Trap'
                  : languagePt
                  ? 'Carta Oculta do Oponente'
                  : 'Opponent Hidden Card';
                const descText = isSpellOrTrap
                  ? languagePt
                    ? 'Esta carta mágica ou armadilha está virada para baixo no campo do oponente. Seu efeito será ativado no momento oportuno!'
                    : 'This spell or trap card is set face-down on the opponent field. Its effect will activate at the right moment!'
                  : languagePt
                  ? 'Esta carta está virada para baixo no campo do oponente. Seus segredos só serão revelados quando for atacada ou virada!'
                  : 'This card is set face-down on the opponent field. Its secrets will remain hidden until attacked or flipped!';

                return (
                  <>
                    {/* Top Header Bar */}
                    <div className="bg-[#1c1917] border-b border-amber-900/50 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
                      <span className="text-xs font-black text-amber-300 truncate">
                        {titleText}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-[#292524] border border-amber-800/60 text-amber-200">
                          [OCULTA]
                        </span>
                        <button
                          onClick={() => setIsInspectorCollapsed(true)}
                          className="text-[10px] font-mono font-bold text-stone-400 hover:text-stone-100 px-1 cursor-pointer"
                          title={languagePt ? 'Recolher Painel' : 'Collapse Panel'}
                        >
                          [-]
                        </button>
                      </div>
                    </div>

                    {/* Conteúdo Vertical Unificado */}
                    <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                      {/* 1. Foto da Carta Ampliada */}
                      <div className="w-56 sm:w-64 md:w-72 h-80 sm:h-92 md:h-[390px] mx-auto shrink-0 rounded-lg overflow-hidden border border-amber-800/60 bg-black/70 p-1 shadow-2xl">
                        <img
                          src="/card-back.jpg"
                          alt={titleText}
                          className="w-full h-full object-contain rounded"
                        />
                      </div>

                      {/* 2. Status Oculto */}
                      <div className="py-1 px-3 rounded-lg bg-[#292524] border border-amber-800/50 text-amber-200 font-mono text-[11px] font-black text-center shrink-0">
                        [STATUS: SECRETO]
                      </div>

                      {/* 3. Informações de ATK e Defesa */}
                      {!isSpellOrTrap && (
                        <div className="grid grid-cols-2 gap-2 shrink-0">
                          <div className="px-3 py-1.5 rounded-lg bg-[#1c1917] border border-stone-700 text-stone-400 font-mono text-xs font-black flex items-center justify-between">
                            <span className="text-[10px]">[ATK]</span>
                            <span>???</span>
                          </div>
                          <div className="px-3 py-1.5 rounded-lg bg-[#1c1917] border border-stone-700 text-stone-400 font-mono text-xs font-black flex items-center justify-between">
                            <span className="text-[10px]">[DEF]</span>
                            <span>???</span>
                          </div>
                        </div>
                      )}

                      {/* 4. Descrição */}
                      <div className="bg-[#0f0d0b]/95 p-3 rounded-lg border border-amber-950/80 text-left shadow-inner">
                        <div className="text-xs font-bold text-amber-300 mb-1.5 font-mono">
                          [{languagePt ? 'Carta Oculta' : 'Face-Down Card'}]
                        </div>
                        <p className="text-xs text-stone-200 leading-relaxed font-sans">{descText}</p>
                      </div>
                    </div>
                  </>
                );
              }

              // Caso 2: Carta do jogador ou carta revelada do oponente
              const displayCardName =
                languagePt && inspectedCard.data.namePt
                  ? inspectedCard.data.namePt
                  : inspectedCard.data.name;
              const displayCardDesc =
                languagePt && inspectedCard.data.descriptionPt
                  ? inspectedCard.data.descriptionPt
                  : inspectedCard.data.description;
              const attributeLabel = isSpell
                ? languagePt
                  ? 'MAGIA'
                  : 'SPELL'
                : isTrap
                ? languagePt
                  ? 'ARMADILHA'
                  : 'TRAP'
                : inspectedCard.data.attribute || 'MONSTER';

              const effectiveAtk = !isSpellOrTrap
                ? isPlayerOwned
                  ? session.getEffectiveAttack(inspectedCard, p1, p2)
                  : session.getEffectiveAttack(inspectedCard, p2, p1)
                : 0;
              const isBuffed = !isSpellOrTrap && effectiveAtk > inspectedCard.data.attack;

              const playerZoneIdx = p1.monsterZones.findIndex(
                (m) => m?.uid === inspectedCard.uid
              );
              const isPlayerTimeWizardOnField =
                playerZoneIdx !== -1 &&
                (inspectedCard.data.id === '71625222' ||
                  inspectedCard.data.name.toLowerCase().includes('time wizard'));
              const canUseTimeWizard =
                isPlayerTimeWizardOnField &&
                isPlayerTurn &&
                (match.phase === 'MAIN1' || match.phase === 'MAIN2') &&
                !inspectedCard.hasUsedEffectThisTurn;

              return (
                <>
                  {/* Top Header Bar */}
                  <div className="bg-[#1c1917] border-b border-amber-900/50 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
                    <span
                      className="text-xs font-black text-amber-300 truncate"
                      title={displayCardName}
                    >
                      {displayCardName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-[#292524] border border-amber-700/60 text-amber-200 uppercase">
                        [{attributeLabel}]
                      </span>
                      <button
                        onClick={() => setIsInspectorCollapsed(true)}
                        className="text-[10px] font-mono font-bold text-stone-400 hover:text-stone-100 px-1 cursor-pointer"
                        title={languagePt ? 'Recolher Painel' : 'Collapse Panel'}
                      >
                        [-]
                      </button>
                    </div>
                  </div>

                  {/* Conteúdo Vertical Unificado */}
                  <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                    {/* 1. Foto da Carta Ampliada (Card3DShowcase) */}
                    <div className="w-56 sm:w-64 md:w-72 h-80 sm:h-92 md:h-[390px] mx-auto shrink-0 rounded-lg overflow-hidden border border-amber-700/70 bg-black/70 shadow-2xl relative">
                      <Card3DShowcase
                        card={inspectedCard.data}
                        languagePt={languagePt}
                        className="w-full h-full"
                      />
                      {isPlayerOwned && isFaceDown && (
                        <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 bg-[#292524]/95 border border-amber-600/80 text-amber-200 text-[9px] font-mono font-black py-0.5 px-1 rounded text-center">
                          [OCULTA]
                        </div>
                      )}
                    </div>

                    {/* 2. Logo abaixo: Estrelas de Nível do Monstro */}
                    {!isSpellOrTrap ? (
                      <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-[#1c1917] border border-amber-900/60 shadow-inner shrink-0">
                        <span className="text-[11px] font-mono font-black text-amber-300 uppercase tracking-wider mr-1">
                          {languagePt ? 'NÍVEL' : 'LEVEL'} {inspectedCard.data.level}
                        </span>
                        <div className="flex items-center gap-0.5 text-amber-400 text-sm drop-shadow-[0_1px_3px_rgba(245,158,11,0.6)]">
                          {Array.from({ length: Math.min(12, inspectedCard.data.level || 0) }).map((_, i) => (
                            <span key={i}>★</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`py-1 px-3 rounded-lg border font-mono text-xs font-black text-center shrink-0 ${
                          isSpell
                            ? 'bg-emerald-950/85 border-emerald-700/60 text-emerald-300'
                            : 'bg-red-950/85 border-red-800/60 text-red-200'
                        }`}
                      >
                        {isSpell
                          ? languagePt
                            ? '[CARTA MÁGICA]'
                            : '[SPELL CARD]'
                          : languagePt
                          ? '[CARTA ARMADILHA]'
                          : '[TRAP CARD]'}
                      </div>
                    )}

                    {/* 3. Depois: Informações de ATK e Defesa */}
                    {!isSpellOrTrap && (
                      <div className="grid grid-cols-2 gap-2 shrink-0">
                        <div
                          className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-black flex items-center justify-between transition-all ${
                            isBuffed
                              ? 'bg-emerald-950/90 border-emerald-600 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                              : 'bg-[#1c1917] border-amber-800/60 text-amber-200'
                          }`}
                        >
                          <span className="text-amber-400 font-bold text-[10px]">[ATK]</span>
                          <span className="text-sm font-black tracking-wide">
                            {effectiveAtk}
                            {isBuffed ? ' ▲' : ''}
                          </span>
                        </div>
                        <div className="px-3 py-1.5 rounded-lg bg-[#1c1917] border border-stone-700 text-stone-200 font-mono text-xs font-black flex items-center justify-between">
                          <span className="text-stone-400 font-bold text-[10px]">[DEF]</span>
                          <span className="text-sm font-black tracking-wide">
                            {inspectedCard.data.defense ?? 0}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 4. Depois: Efeito ou Descrição */}
                    <div className="bg-[#0f0d0b]/95 p-3 rounded-lg border border-amber-950/80 text-left flex flex-col justify-between gap-2 shadow-inner">
                      <div>
                        <div className="text-xs font-bold text-amber-300 mb-1.5 font-mono">
                          [{inspectedCard.data.race || formatCardType(inspectedCard.data.type)}]
                        </div>
                        <p className="text-xs text-stone-200 leading-relaxed font-sans">
                          {displayCardDesc}
                        </p>
                      </div>

                      {/* Botão de Ativação do Efeito de Time Wizard no Campo */}
                      {isPlayerTimeWizardOnField && (
                        <div className="pt-2 border-t border-stone-800 shrink-0">
                          <button
                            onClick={() => handleActivateTimeWizard(playerZoneIdx)}
                            disabled={!canUseTimeWizard}
                            className={`w-full py-1.5 px-3 rounded-lg font-serif font-black text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
                              canUseTimeWizard
                                ? 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 border border-amber-300 cursor-pointer'
                                : 'bg-[#292524] text-stone-500 border border-stone-700 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <span className="font-mono text-[10px] font-bold">[TEMPO]</span>
                            <span>
                              {inspectedCard.hasUsedEffectThisTurn
                                ? 'Roleta Já Utilizada'
                                : 'Girar Roleta do Tempo'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            <>
              {/* Estado Inicial Sem Carta Selecionada */}
              <div className="bg-[#1c1917] border-b border-amber-900/50 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
                <span className="text-xs font-black text-amber-300 truncate">
                  {languagePt ? 'Inspetor de Cartas' : 'Card Inspector'}
                </span>
                <button
                  onClick={() => setIsInspectorCollapsed(true)}
                  className="text-[10px] font-mono font-bold text-stone-400 hover:text-stone-100 px-1 cursor-pointer"
                  title={languagePt ? 'Recolher Painel' : 'Collapse Panel'}
                >
                  [-]
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                <div className="w-56 sm:w-64 md:w-72 h-80 sm:h-92 md:h-[390px] mx-auto shrink-0 rounded-lg overflow-hidden border border-amber-800/50 bg-black/60 p-1 shadow-2xl">
                  <img
                    src="/card-back.jpg"
                    alt="Verso da Carta"
                    className="w-full h-full object-contain rounded"
                  />
                </div>
                <div className="py-1 px-3 rounded-lg bg-[#292524] border border-amber-800/50 text-amber-300 font-mono text-xs font-black text-center shrink-0">
                  [GRIMOIRE TÁTICO]
                </div>
                <div className="bg-[#0f0d0b]/95 p-3 rounded-lg border border-amber-950/80 text-left space-y-2 shadow-inner">
                  <p className="text-xs text-stone-300 leading-relaxed font-sans">
                    {languagePt
                      ? 'Passe o cursor ou clique em qualquer carta 3D na mão ou no campo para inspecionar seus atributos e efeitos.'
                      : 'Hover or click any 3D card in your hand or on the field to inspect its stats and effects.'}
                  </p>
                  <div className="pt-2 border-t border-stone-800/80 text-[11px] text-stone-300 space-y-1 font-mono">
                    <div className="font-bold text-amber-400/90 mb-1">
                      [{languagePt ? 'Resumo do Campo' : 'Field Summary'}]
                    </div>
                    <div>
                      {p1.nickname}: {languagePt ? 'Mão' : 'Hand'} {p1.hand.length} • Deck{' '}
                      {p1.deck.length} • {languagePt ? 'Cem.' : 'GY'} {p1.graveyard.length}
                    </div>
                    <div>
                      {p2.nickname}: {languagePt ? 'Mão' : 'Hand'} {p2.hand.length} • Deck{' '}
                      {p2.deck.length} • {languagePt ? 'Cem.' : 'GY'} {p2.graveyard.length}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </aside>
      )}

      {/* 6. DIREITA-CENTRO: PAINEL DE CONTROLE DE TURNO E FASE UNIFICADO (DARK STONE & AGED GOLD) */}
      <div className="fixed right-4 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-44 sm:w-48 bg-[#141210]/95 border-2 border-amber-800/80 rounded-xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.92)] flex flex-col gap-2.5 backdrop-blur-md">
        {/* Top Row: Turn & Active Player Badge */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-1.5">
          <span className="text-[11px] font-mono font-bold text-amber-400 tracking-wider">
            {languagePt ? 'TURNO' : 'TURN'} {match.currentTurn}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
              isPlayerTurn
                ? 'bg-amber-950/90 text-amber-200 border border-amber-700/60'
                : 'bg-red-950/90 text-red-200 border border-red-800/60'
            }`}
          >
            {isPlayerTurn
              ? languagePt
                ? 'SEU TURNO'
                : 'YOUR TURN'
              : languagePt
              ? 'OPONENTE'
              : 'OPPONENT'}
          </span>
        </div>

        {/* Middle Box: Current Phase Display (Clean, Single-Line, Never Overflows) */}
        <div className="py-2 px-2.5 rounded-lg bg-[#1c1917] border border-amber-900/50 text-center">
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 block mb-0.5">
            {languagePt ? 'FASE ATUAL' : 'CURRENT PHASE'}
          </span>
          <span className="text-xs sm:text-sm font-serif font-black uppercase tracking-wider text-amber-200 whitespace-nowrap block">
            {formatPhaseName(match.phase)}
          </span>
        </div>

        {/* Bottom Stack: Action Buttons Aligned to Exact Same Width w-full */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNextPhase}
            disabled={!isPlayerTurn || match.isGameOver || match.phase === 'BATTLE'}
            className="w-full py-2 px-3 rounded-lg bg-[#292524] hover:bg-[#38322e] disabled:opacity-35 text-stone-100 font-serif font-bold text-xs uppercase tracking-wider border border-amber-800/70 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {languagePt ? 'Fase de Batalha' : 'Battle Phase'}
          </button>

          <button
            onClick={handleEndTurn}
            disabled={!isPlayerTurn || match.isGameOver}
            className="w-full py-2 px-3 rounded-lg bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-35 text-stone-950 font-serif font-black text-xs uppercase tracking-wider border border-amber-400/80 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {languagePt ? 'Encerrar Turno' : 'End Turn'}
          </button>
        </div>
      </div>

      {/* PÍLULA TÁTICA FLUTUANTE CENTRAL (CONFIRMAÇÃO DE MIRA OU ATAQUE DIRETO) */}
      {(tacticalTargetSelection ||
        (match.phase === 'BATTLE' &&
          selectedAttackingMonster !== null &&
          p2.monsterZones.every((m) => m === null))) && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 animate-fadeIn">
          {tacticalTargetSelection &&
            (() => {
              const actionMeta = getTacticalActionMeta(
                tacticalTargetSelection.action,
                languagePt
              );
              return (
                <div className="flex items-center gap-2 bg-[#141210]/95 border border-amber-800/80 rounded-full px-3 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.92)] backdrop-blur-md">
                  <button
                    disabled={tacticalTargetSelection.selectedUids.length === 0}
                    onClick={() => {
                      if (tacticalTargetSelection.selectedUids.length === 0) {
                        showNotification(
                          languagePt
                            ? '[AVISO] Clique em um alvo no campo 3D para selecionar!'
                            : '[WARNING] Click a target on the 3D field to select!'
                        );
                        return;
                      }

                      if (
                        tacticalTargetSelection.isSpell &&
                        tacticalTargetSelection.cardUid
                      ) {
                        if (
                          tacticalTargetSelection.action === 'DESTROY_MONSTER' ||
                          tacticalTargetSelection.action === 'DESTROY_SPELL_TRAP'
                        ) {
                          triggerCardDestruction(tacticalTargetSelection.selectedUids);
                          soundFX.playDestruction();
                        } else if (
                          tacticalTargetSelection.action === 'RETURN_TO_HAND'
                        ) {
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
                    className={`px-4 py-1 text-xs font-black uppercase tracking-wider rounded-full shadow-lg transition-all flex items-center gap-1.5 border ${
                      tacticalTargetSelection.selectedUids.length > 0
                        ? 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 border-amber-300 cursor-pointer'
                        : 'bg-[#1c1917] text-amber-200/60 border-amber-900/40 cursor-not-allowed opacity-75'
                    }`}
                  >
                    <span>{actionMeta.icon}</span>
                    <span>
                      {tacticalTargetSelection.selectedUids.length > 0
                        ? languagePt
                          ? `Confirmar ${actionMeta.confirmVerb} (${tacticalTargetSelection.selectedUids.length})`
                          : `Confirm ${actionMeta.confirmVerb} (${tacticalTargetSelection.selectedUids.length})`
                        : languagePt
                        ? 'Escolha o Alvo no Campo 3D'
                        : 'Select Target on 3D Field'}
                    </span>
                  </button>

                  <button
                    onClick={() => setTacticalTargetSelection(null)}
                    className="px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-stone-300 hover:text-white bg-[#292524] rounded-full border border-stone-700 uppercase transition-colors cursor-pointer"
                  >
                    {languagePt ? 'Cancelar' : 'Cancel'}
                  </button>
                </div>
              );
            })()}

          {match.phase === 'BATTLE' &&
            selectedAttackingMonster !== null &&
            p2.monsterZones.every((m) => m === null) && (
              <button
                onClick={() => handleOpponentZoneClick(null)}
                className="px-5 py-1.5 bg-gradient-to-b from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-stone-100 font-black text-xs uppercase tracking-widest rounded-full shadow-2xl border-2 border-amber-400 animate-bounce flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-mono text-xs font-black mr-1">[ATAQUE]</span>{' '}
                {languagePt
                  ? 'ATACAR DIRETAMENTE OS LPs!'
                  : 'DIRECT ATTACK LIFE POINTS!'}
              </button>
            )}
        </div>
      )}

      {/* 6. RODAPÉ DIREITO: CONTROLES TÁTICOS ([CFG], [RENDER-SE], [INFO], [LOG]) */}
      <div className="fixed bottom-3 right-3 z-30 flex items-center gap-2">
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="w-10 h-10 rounded-full bg-[#141210]/95 border border-amber-800/75 hover:border-amber-600 text-amber-200/90 font-mono text-[10px] font-black flex items-center justify-center shadow-lg cursor-pointer transition-colors backdrop-blur-md"
          title={languagePt ? 'Configurações de Áudio e Idioma' : 'Audio and Language Settings'}
          aria-label={languagePt ? 'Abrir Configurações' : 'Open Settings'}
        >
          [CFG]
        </button>

        <button
          onClick={() => setShowSurrenderModal(true)}
          className="px-3 py-2 rounded-full bg-[#141210]/95 border border-amber-800/75 hover:border-red-800/80 text-amber-200/90 hover:text-red-300 font-mono text-[10px] font-black tracking-wider shadow-lg flex items-center justify-center cursor-pointer transition-colors backdrop-blur-md"
          title={languagePt ? 'Sair ou Render-se do Duelo' : 'Surrender or Exit Duel'}
        >
          {languagePt ? '[RENDER-SE]' : '[SURRENDER]'}
        </button>

        <button
          onClick={() => setIsFieldInfoOpen((prev) => !prev)}
          className={`w-10 h-10 rounded-full bg-[#141210]/95 border font-mono text-[10px] font-black shadow-lg flex items-center justify-center cursor-pointer transition-colors backdrop-blur-md ${
            isFieldInfoOpen
              ? 'border-amber-400 text-amber-300'
              : 'border-amber-800/75 hover:border-amber-600 text-amber-200/90'
          }`}
          title={languagePt ? 'Resumo de Cartas no Campo' : 'Field Cards Summary'}
        >
          [INFO]
        </button>

        <button
          onClick={() => setIsLogOpen((prev) => !prev)}
          className={`w-10 h-10 rounded-full bg-[#141210]/95 border font-mono text-[10px] font-black shadow-lg flex items-center justify-center cursor-pointer transition-colors backdrop-blur-md ${
            isLogOpen
              ? 'border-amber-400 text-amber-300'
              : 'border-amber-800/75 hover:border-amber-600 text-amber-200/90'
          }`}
          title={languagePt ? 'Histórico de Ações do Duelo' : 'Duel Action Log'}
        >
          [LOG]
        </button>
      </div>

      {/* DRAWER FLUTUANTE DE RESUMO DO CAMPO ([INFO]) */}
      {isFieldInfoOpen && (
        <div className="fixed bottom-16 right-3 z-40 w-72 bg-[#141210]/95 border border-amber-800/75 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-mono text-stone-200 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2">
            <span className="font-black text-amber-400">[STATUS DO CAMPO 3D]</span>
            <button
              onClick={() => setIsFieldInfoOpen(false)}
              className="text-stone-400 hover:text-stone-100 text-[10px] cursor-pointer"
            >
              [X]
            </button>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-amber-300 font-bold">{p1.nickname}:</span>
              <span>
                {languagePt ? 'Mão' : 'Hand'} {p1.hand.length} | Deck {p1.deck.length} |{' '}
                {languagePt ? 'Cem.' : 'GY'} {p1.graveyard.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-300 font-bold">{p2.nickname}:</span>
              <span>
                {languagePt ? 'Mão' : 'Hand'} {p2.hand.length} | Deck {p2.deck.length} |{' '}
                {languagePt ? 'Cem.' : 'GY'} {p2.graveyard.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER FLUTUANTE DO HISTÓRICO DO DUELO ([LOG]) */}
      {isLogOpen && (
        <div className="fixed bottom-16 right-3 z-40 w-80 max-h-56 bg-[#141210]/95 border border-amber-800/75 rounded-xl p-3 overflow-y-auto shadow-2xl backdrop-blur-md text-[10px] font-mono text-stone-300 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 sticky top-0 bg-[#141210]/95">
            <span className="font-black text-amber-400">
              {languagePt ? '[HISTÓRICO DO DUELO]' : '[DUEL LOG]'}
            </span>
            <button
              onClick={() => setIsLogOpen(false)}
              className="text-stone-400 hover:text-stone-100 text-[10px] cursor-pointer"
            >
              [X]
            </button>
          </div>
          <div className="space-y-1">
            {match.log.slice(-12).map((line, idx) => (
              <div key={idx} className="leading-snug border-b border-stone-800/70 py-0.5">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DE ESCOLHA DE POSIÇÃO DE INVOCAÇÃO (RIGHT-DOCKED TACTICAL HUD) */}
      {summonChoiceModal && (
        <div className="fixed right-4 sm:right-6 top-24 z-50 w-72 sm:w-84 max-h-[80vh] flex flex-col animate-slideInRight bg-[#141210]/95 border-2 border-amber-800/80 rounded-2xl p-4 shadow-[0_8px_35px_rgba(0,0,0,0.92)] backdrop-blur-md overflow-y-auto text-center">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800">
            <span className="text-[10px] font-mono font-black text-amber-300 bg-amber-950/90 px-2 py-0.5 rounded border border-amber-700/60 uppercase tracking-wider">
              [INVOCAÇÃO]
            </span>
            <button
              onClick={() => setSummonChoiceModal(null)}
              className="text-stone-400 hover:text-stone-100 text-xs font-mono px-1.5 py-0.5 rounded hover:bg-white/10"
            >
              [X]
            </button>
          </div>

          <h3 className="text-base font-serif font-black text-amber-300 mb-1">
            {languagePt ? 'POSIÇÃO DE BATALHA' : 'BATTLE POSITION'}
          </h3>
          <p className="text-[11px] text-stone-300 mb-3">
            {languagePt ? 'Escolha a postura do monstro no campo:' : 'Choose how to place this monster:'}
          </p>

          <div className="flex justify-center mb-3">
            <div className="w-20 h-28 rounded-lg p-0.5 bg-gradient-to-br from-[#7a4e23] to-[#1a0f05] border border-amber-600/80 shadow-md">
              <img
                src={summonChoiceModal.card.data.imageUrl}
                alt={summonChoiceModal.card.data.name}
                className="w-full h-full object-contain rounded"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() =>
                executeSummon(
                  summonChoiceModal.zoneIndex,
                  summonChoiceModal.tributeIndices,
                  'ATTACK',
                  false
                )
              }
              className="w-full py-2 px-3 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <span className="font-mono text-[10px] bg-black/30 text-stone-950 px-1 rounded font-black">[ATK]</span>
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
              className="w-full py-2 px-3 bg-[#292524] hover:bg-[#38322e] text-stone-100 border border-amber-800/70 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <span className="font-mono text-[10px] bg-black/40 text-amber-300 px-1 rounded font-black">[DEF]</span>
              <span>{languagePt ? 'Baixar Virado para Baixo' : 'Set Face-Down (Defense)'}</span>
            </button>

            <button
              onClick={() => setSummonChoiceModal(null)}
              className="w-full py-1 text-stone-400 hover:text-stone-200 text-[11px] font-bold uppercase transition-colors"
            >
              {languagePt ? 'Cancelar' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE ESCOLHA DE CARTA MÁGICA (RIGHT-DOCKED TACTICAL HUD) */}
      {spellChoiceModal && (
        <div className="fixed right-4 sm:right-6 top-24 z-50 w-72 sm:w-84 max-h-[80vh] flex flex-col animate-slideInRight bg-[#141210]/95 border-2 border-amber-800/80 rounded-2xl p-4 shadow-[0_8px_35px_rgba(0,0,0,0.92)] backdrop-blur-md overflow-y-auto text-center">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800">
            <span className="text-[10px] font-mono font-black text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-700/60 uppercase tracking-wider">
              [MAGIA]
            </span>
            <button
              onClick={() => setSpellChoiceModal(null)}
              className="text-stone-400 hover:text-stone-100 text-xs font-mono px-1.5 py-0.5 rounded hover:bg-white/10"
            >
              [X]
            </button>
          </div>

          <div className="w-20 h-28 mx-auto mb-2 rounded-lg overflow-hidden border border-emerald-700/80 shadow-lg">
            <img
              src={spellChoiceModal.card.data.imageUrl}
              alt={spellChoiceModal.card.data.name}
              className="w-full h-full object-contain"
            />
          </div>

          <h3 className="text-sm font-serif font-black text-amber-300 mb-1">
            {languagePt && spellChoiceModal.card.data.namePt
              ? spellChoiceModal.card.data.namePt
              : spellChoiceModal.card.data.name}
          </h3>
          <p className="text-[11px] text-stone-300 mb-4">
            {spellChoiceModal.isFromField
              ? languagePt
                ? 'Deseja ativar esta Carta Mágica virada para baixo?'
                : 'Do you want to activate this face-down Spell card?'
              : languagePt
              ? 'Como deseja utilizar esta Carta Mágica?'
              : 'How would you like to play this Spell card?'}
          </p>

          <div className="flex flex-col space-y-2">
            <button
              onClick={() =>
                handleActivateSpell(
                  spellChoiceModal.card,
                  spellChoiceModal.zoneIndex
                )
              }
              className="w-full py-2 px-3 bg-gradient-to-b from-emerald-700 to-emerald-800 hover:from-emerald-600 hover:to-emerald-700 text-stone-100 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <span className="font-mono text-[10px] bg-black/40 text-emerald-300 px-1 rounded font-black">[ATIVAR]</span>
              <span>
                {spellChoiceModal.isFromField
                  ? languagePt
                    ? 'Ativar Magia'
                    : 'Activate Spell'
                  : languagePt
                  ? 'Ativar Imediatamente'
                  : 'Activate Immediately'}
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
                className="w-full py-2 px-3 bg-[#292524] hover:bg-[#38322e] text-stone-200 border border-amber-800/70 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                <span className="font-mono text-[10px] bg-black/40 text-amber-300 px-1 rounded font-black">[BAIXAR]</span>
                <span>{languagePt ? 'Baixar na Zona (Virada para Baixo)' : 'Set in Zone (Face-Down)'}</span>
              </button>
            )}

            <button
              onClick={() => setSpellChoiceModal(null)}
              className="w-full py-1 text-stone-400 hover:text-stone-200 text-[11px] font-bold uppercase transition-colors"
            >
              {languagePt ? 'Cancelar' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE SAIR / RENDER-SE */}
      {showSurrenderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-[#141210] border-2 border-red-800 rounded-xl p-6 text-center max-w-sm shadow-2xl">
            <h3 className="text-xl font-serif font-black text-red-400 mb-2">
              DESEJA SAIR DO DUELO?
            </h3>
            <p className="text-xs text-stone-300 mb-5">
              Ao sair agora, você concederá a vitória a Seto Kaiba por rendição.
            </p>

            <div className="flex space-x-3 justify-center">
              <button
                onClick={handleConfirmSurrender}
                className="flex-1 py-2 bg-red-800 hover:bg-red-700 text-stone-100 font-bold rounded-lg text-xs uppercase shadow"
              >
                Sim, Desistir
              </button>
              <button
                onClick={() => setShowSurrenderModal(false)}
                className="flex-1 py-2 bg-[#292524] hover:bg-[#38322e] text-stone-200 border border-stone-700 font-bold rounded-lg text-xs uppercase shadow"
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
                ? 'bg-[#141210] border-amber-500'
                : 'bg-[#161212] border-red-800'
            }`}
          >
            <div
              className={`text-5xl mb-2 ${
                match.winnerPlayerId === p1.id ? 'text-amber-400 animate-bounce' : 'text-red-400 animate-pulse'
              }`}
            >
              {match.winnerPlayerId === p1.id ? '[VITÓRIA]' : '[DERROTA]'}
            </div>
            <h1
              className={`text-3xl font-black mb-2 font-serif tracking-widest ${
                match.winnerPlayerId === p1.id
                  ? 'text-amber-300'
                  : 'text-red-500'
              }`}
            >
              {match.winnerPlayerId === p1.id ? 'VITÓRIA!' : 'DERROTA!'}
            </h1>
            <p className="text-stone-200 font-semibold mb-6 text-sm">{match.winReason}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={handleResetMatch}
                className={`w-full sm:w-auto px-6 py-2.5 font-black uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 text-xs ${
                  match.winnerPlayerId === p1.id
                    ? 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950'
                    : 'bg-gradient-to-b from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-white'
                }`}
              >
                Novo Duelo
              </button>
              {onExitToMenu && (
                <button
                  onClick={onExitToMenu}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#292524] hover:bg-[#38322e] text-stone-200 border border-amber-800/60 font-bold uppercase tracking-wider rounded-xl shadow transition-transform hover:scale-105 text-xs"
                >
                  Menu Principal
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
    </div>
  );
};
