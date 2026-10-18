import React, { useState, useEffect, useRef } from 'react';
import { DuelMatchSession } from '@duel/duel-match-session';
import { createKaibaDeck, createYugiDeck } from '@duel/starter-decks';
import { CardInstance, BattlePosition } from '@duel/duel-types';
import { DuelBot } from '@duel/duel-bot';
import { soundFX } from '../utils/soundFX';

export interface PlaymatProps {
  playerNickname?: string;
  onExitToMenu?: () => void;
}

export const Playmat: React.FC<PlaymatProps> = ({ playerNickname = 'Yugi Muto', onExitToMenu }) => {
  const [session, setSession] = useState<DuelMatchSession>(() => {
    return new DuelMatchSession(playerNickname, createYugiDeck(), 'Seto Kaiba (Bot)', createKaibaDeck());
  });

  // Referências DOM para cálculo do vetor direcional de ataque (Lunge)
  const playerZoneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const opponentZoneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const playerLpRef = useRef<HTMLDivElement | null>(null);
  const opponentLpRef = useRef<HTMLDivElement | null>(null);

  // Modais e Estados Visuais
  const [countdown, setCountdown] = useState<number | null>(5); // Contagem regressiva inicial de 5s
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedHandCardUid, setSelectedHandCardUid] = useState<string | null>(null);
  const [pendingSummonZone, setPendingSummonZone] = useState<number | null>(null); // Quando clica na zona para escolher ATK/DEF
  const [selectedTributeZones, setSelectedTributeZones] = useState<number[]>([]); // Zonas selecionadas para sacrifício
  const [selectedAttackerZone, setSelectedAttackerZone] = useState<number | null>(null);
  const [inspectedCard, setInspectedCard] = useState<CardInstance | null>(null);
  const [languagePt, setLanguagePt] = useState<boolean>(true);
  const [showSurrenderModal, setShowSurrenderModal] = useState<boolean>(false);
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
  const [isCameraShaking, setIsCameraShaking] = useState<boolean>(false);
  const [recentDrawnUids, setRecentDrawnUids] = useState<string[]>([]);
  const [flippedZones, setFlippedZones] = useState<{ isPlayer: boolean; zoneIndex: number }[]>([]);
  const [flipEffectBanner, setFlipEffectBanner] = useState<{ cardName: string; action: string } | null>(null);

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
    setTimeout(() => {
      const bot = session.getActivePlayer();
      const opponent = session.getOpponentPlayer();
      if (session.matchState.isGameOver) return;

      // 1. Bot Summon com animação de Slam
      if (!bot.hasNormalSummonedThisTurn) {
        const summonResult = DuelBot.evaluateAndSummon(session);
        if (summonResult) {
          soundFX.playPlaceCard();
          setSlamZone({ isPlayer: false, zoneIndex: summonResult.zoneIndex });
          setTimeout(() => setSlamZone(null), 500);
          forceUpdate();
        }
      }

      // 2. Transição para Battle Phase
      setTimeout(() => {
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

          // Animação de investida do Bot (Lunge) com vetor direcional exato
          setLungingZone({ isPlayer: false, zoneIndex: attacker.index, deltaX, deltaY });

          setTimeout(() => {
            soundFX.playAttackStrike();
            setIsCameraShaking(true);
            setTimeout(() => setIsCameraShaking(false), 280);

            if (opponentMonsters.length === 0) {
              // Ataque Direto nos LPs do Jogador!
              setTargetHitZone({ isPlayer: true, zoneIndex: null });
              setTimeout(() => setTargetHitZone(null), 500);
              const dmg = session.getEffectiveAttack(attacker.card, bot, opponent);
              setFloatingDamage({ amount: dmg, isPlayer: true, zoneIndex: null });
              setTimeout(() => setFloatingDamage(null), 1200);

              session.declareAttack(attacker.index, null);
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
              setTimeout(() => setTargetHitZone(null), 500);

              const attackerEffAtk = session.getEffectiveAttack(attacker.card, bot, opponent);
              const defenderEffAtk = session.getEffectiveAttack(target.card, opponent, bot);

              // Checa se o alvo em DEFENSE possui Efeito FLIP
              if (target.card.position === 'DEFENSE' && target.card.data.effectType === 'FLIP') {
                const flipName = (languagePt && target.card.data.namePt) ? target.card.data.namePt : target.card.data.name;
                const action = target.card.data.effectDefinition?.action;
                setFlipEffectBanner({ cardName: flipName, action: action || 'FLIP' });
                setTimeout(() => setFlipEffectBanner(null), 2500);

                if (action === 'DESTROY_MONSTER') {
                  setDestroyedCardUids((prev) => [...prev, attacker.card.uid]);
                  soundFX.playDestruction();
                } else if (action === 'RETURN_TO_HAND') {
                  soundFX.playReturnToHand();
                }
              }

              if (target.card.position === 'ATTACK') {
                if (attackerEffAtk > defenderEffAtk) {
                  const dmg = attackerEffAtk - defenderEffAtk;
                  setDestroyedCardUids((prev) => [...prev, target.card.uid]);
                  soundFX.playDestruction();
                  setFloatingDamage({ amount: dmg, isPlayer: true, zoneIndex: target.index });
                  setTimeout(() => setFloatingDamage(null), 1200);
                } else if (attackerEffAtk < defenderEffAtk) {
                  const dmg = defenderEffAtk - attackerEffAtk;
                  setDestroyedCardUids((prev) => [...prev, attacker.card.uid]);
                  soundFX.playDestruction();
                  setFloatingDamage({ amount: dmg, isPlayer: false, zoneIndex: attacker.index });
                  setTimeout(() => setFloatingDamage(null), 1200);
                } else {
                  // Empate
                  setDestroyedCardUids((prev) => [...prev, attacker.card.uid, target.card.uid]);
                  soundFX.playDestruction();
                }
              } else if (target.card.position === 'DEFENSE') {
                if (attackerEffAtk > target.card.data.defense) {
                  setDestroyedCardUids((prev) => [...prev, target.card.uid]);
                  soundFX.playDestruction();
                } else if (attackerEffAtk < target.card.data.defense) {
                  const dmg = target.card.data.defense - attackerEffAtk;
                  setFloatingDamage({ amount: dmg, isPlayer: false, zoneIndex: attacker.index });
                  setTimeout(() => setFloatingDamage(null), 1200);
                }
              }

              session.declareAttack(attacker.index, target.index);
            }

            forceUpdate();
          }, 280);

          // Finaliza o Lunge do Bot após completar o arco (540ms)
          setTimeout(() => {
            setLungingZone(null);
            forceUpdate();

            // 3. Fim do turno do Bot, retornando ao jogador
            setTimeout(() => {
              session.nextPhase(); // MAIN2
              session.nextPhase(); // END -> Turno do Jogador
              showNotification(`⚔️ É a vez de ${p1.nickname} duelar!`);
              forceUpdate();

              const lastCard = session.player1.hand[session.player1.hand.length - 1];
              if (lastCard) {
                soundFX.playDrawCard();
                setRecentDrawnUids([lastCard.uid]);
                setTimeout(() => setRecentDrawnUids([]), 900);
              }
            }, 600);
          }, 540);
        } else {
          // Sem ataques, passa o turno de volta
          setTimeout(() => {
            session.nextPhase(); // MAIN2
            session.nextPhase(); // END -> Turno do Jogador
            showNotification(`⚔️ É a vez de ${p1.nickname} duelar!`);
            forceUpdate();

            const lastCard = session.player1.hand[session.player1.hand.length - 1];
            if (lastCard) {
              soundFX.playDrawCard();
              setRecentDrawnUids([lastCard.uid]);
              setTimeout(() => setRecentDrawnUids([]), 900);
            }
          }, 600);
        }
      }, 600);
    }, 700);
  };

  const handleSelectHandCard = (card: CardInstance) => {
    setInspectedCard(card);
    if (!isPlayerTurn || match.phase !== 'MAIN1' || p1.hasNormalSummonedThisTurn) return;
    setSelectedHandCardUid(selectedHandCardUid === card.uid ? null : card.uid);
    setPendingSummonZone(null);
    setSelectedTributeZones([]);
  };

  // Clique na Zona de Monstro do Jogador
  const handlePlayerMonsterZoneClick = (zoneIndex: number) => {
    if (!isPlayerTurn || match.isGameOver) return;

    // 1. Invocação: Se há carta da mão selecionada
    if (selectedHandCardUid && match.phase === 'MAIN1') {
      const card = p1.hand.find((c) => c.uid === selectedHandCardUid);
      if (!card) return;

      const requiredTributes = card.data.level <= 4 ? 0 : card.data.level <= 6 ? 1 : 2;
      const targetMonster = p1.monsterZones[zoneIndex];

      // Caso com Sacrifício (Nível 5+)
      if (requiredTributes > 0) {
        // Se já selecionou os sacrifícios necessários:
        // Clicar em qualquer uma das zonas sacrificadas OU em uma zona vazia dispara a invocação imediata!
        if (selectedTributeZones.length === requiredTributes) {
          if (selectedTributeZones.includes(zoneIndex) || targetMonster === null) {
            executeSummon(zoneIndex, selectedTributeZones);
            return;
          }
          showNotification(`⚠️ Você já selecionou os ${requiredTributes} sacrifício(s). Clique em uma das zonas liberadas ou vazias para invocar!`);
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
              showNotification(`✨ ${requiredTributes} sacrifício(s) pronto(s)! Agora clique na zona onde deseja baixar ${card.data.namePt || card.data.name}!`);
            }
          }
          return;
        }

        // Clicou numa zona vazia antes de selecionar os sacrifícios
        showNotification(`⚠️ Monstro Nível ${card.data.level} exige selecionar ${requiredTributes} monstro(s) no seu campo como sacrifício primeiro!`);
        return;
      }

      // Caso sem Sacrifício (Nível 1 a 4) -> Invoca direto em ATTACK na zona vazia
      if (targetMonster === null) {
        executeSummon(zoneIndex, []);
      }
      return;
    }

    const currentMonster = p1.monsterZones[zoneIndex];
    if (!currentMonster) return;

    setInspectedCard(currentMonster);

    // 2. Mudança de Posição Ilimitada ao Clicar na Carta (Apenas na Fase Principal)
    if (match.phase === 'MAIN1' || match.phase === 'MAIN2') {
      if (selectedHandCardUid === null && selectedAttackerZone === null) {
        const success = session.changeMonsterPosition(zoneIndex);
        if (success) {
          soundFX.playPlaceCard();
          setFlippedZones((prev) => [...prev, { isPlayer: true, zoneIndex }]);
          setTimeout(() => {
            setFlippedZones((prev) => prev.filter((z) => !(z.isPlayer && z.zoneIndex === zoneIndex)));
          }, 450);
          forceUpdate();
        }
        return;
      }
    }

    // 3. Seleção de Ataque (BATTLE PHASE)
    if (match.phase === 'BATTLE') {
      if (currentMonster.position === 'ATTACK' && !currentMonster.hasAttacked) {
        if (currentMonster.turnSummoned === match.currentTurn) {
          showNotification('⏳ Este monstro foi invocado neste turno e só poderá atacar no próximo turno!');
          return;
        }
        setSelectedAttackerZone(selectedAttackerZone === zoneIndex ? null : zoneIndex);
      } else if (currentMonster.position === 'DEFENSE') {
        showNotification('🛡️ Monstros em Posição de Defesa não podem atacar!');
      }
    }
  };

  // Executa Invocação Direta em Posição de Ataque (Vertical)
  const executeSummon = (zoneIndex: number, tributeIndices: number[]) => {
    if (selectedHandCardUid === null) return;
    const success = session.normalSummon(selectedHandCardUid, zoneIndex, 'ATTACK', tributeIndices);
    if (success) {
      setSelectedHandCardUid(null);
      setPendingSummonZone(null);
      setSelectedTributeZones([]);

      // 1. VFX de Posicionamento: Card Slam e Som de Impacto
      soundFX.playPlaceCard();
      setSlamZone({ isPlayer: true, zoneIndex });
      setTimeout(() => setSlamZone(null), 500);

      forceUpdate();
    } else {
      showNotification('❌ Falha ao invocar monstro. Verifique as regras.');
    }
  };

  // Clique no Monstro do Oponente (Declaração de Ataque)
  const handleOpponentZoneClick = (targetZoneIndex: number | null) => {
    if (targetZoneIndex !== null) {
      const monster = p2.monsterZones[targetZoneIndex];
      if (monster) setInspectedCard(monster);
    }

    if (!isPlayerTurn || match.phase !== 'BATTLE' || selectedAttackerZone === null) return;

    const attackerZone = selectedAttackerZone;
    const attackingCard = p1.monsterZones[attackerZone];
    const defendingCard = targetZoneIndex !== null ? p2.monsterZones[targetZoneIndex] : null;

    if (!attackingCard) return;

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

      if (targetZoneIndex === null) {
        // Ataque Direto
        const dmg = attackerEffAtk;
        setFloatingDamage({ amount: dmg, isPlayer: false, zoneIndex: null });
        setTimeout(() => setFloatingDamage(null), 1200);
      } else if (defendingCard) {
        // Monstro vs Monstro
        const defenderEffAtk = session.getEffectiveAttack(defendingCard, p2, p1);

        // Checa se o alvo em DEFENSE possui Efeito FLIP
        if (defendingCard.position === 'DEFENSE' && defendingCard.data.effectType === 'FLIP') {
          const flipName = (languagePt && defendingCard.data.namePt) ? defendingCard.data.namePt : defendingCard.data.name;
          const action = defendingCard.data.effectDefinition?.action;
          setFlipEffectBanner({ cardName: flipName, action: action || 'FLIP' });
          setTimeout(() => setFlipEffectBanner(null), 2500);

          if (action === 'DESTROY_MONSTER') {
            setDestroyedCardUids((prev) => [...prev, attackingCard.uid]);
            soundFX.playDestruction();
          } else if (action === 'RETURN_TO_HAND') {
            soundFX.playReturnToHand();
          }
        }

        let dmg = 0;
        if (defendingCard.position === 'ATTACK') {
          if (attackerEffAtk > defenderEffAtk) {
            dmg = attackerEffAtk - defenderEffAtk;
            setDestroyedCardUids((prev) => [...prev, defendingCard.uid]);
            soundFX.playDestruction();
          } else if (attackerEffAtk < defenderEffAtk) {
            dmg = defenderEffAtk - attackerEffAtk;
            setDestroyedCardUids((prev) => [...prev, attackingCard.uid]);
            soundFX.playDestruction();
          } else {
            // Empate
            setDestroyedCardUids((prev) => [...prev, attackingCard.uid, defendingCard.uid]);
            soundFX.playDestruction();
          }
        } else {
          // DEFENSE
          if (attackerEffAtk > defendingCard.data.defense) {
            setDestroyedCardUids((prev) => [...prev, defendingCard.uid]);
            soundFX.playDestruction();
          } else if (attackerEffAtk < defendingCard.data.defense) {
            dmg = defendingCard.data.defense - attackerEffAtk;
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

  // Desistir / Sair da Partida
  const handleConfirmSurrender = () => {
    session.surrender(p1.id);
    setShowSurrenderModal(false);
    forceUpdate();
    if (onExitToMenu) {
      onExitToMenu();
    }
  };

  const handleResetMatch = () => {
    setSession(new DuelMatchSession(playerNickname, createYugiDeck(), 'Seto Kaiba (Bot)', createKaibaDeck()));
    setSelectedHandCardUid(null);
    setSelectedAttackerZone(null);
    setPendingSummonZone(null);
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
                Efeito Especial de Virar
              </div>
              <div className="text-lg font-serif font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                EFEITO FLIP: {flipEffectBanner.cardName} foi ativado!
              </div>
            </div>
            <span className="text-2xl">
              {flipEffectBanner.action === 'DESTROY_MONSTER' ? '🪲' : '🐧'}
            </span>
          </div>
        </div>
      )}

      {/* 🔮 OVERLAY DE CONTAGEM REGRESSIVA INICIAL (5 SEGUNDOS) */}
      {countdown !== null && (
        <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-fadeIn">
          <div className="text-6xl text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.8)] mb-4 animate-pulse">
            𓂀
          </div>
          <h2 className="text-2xl font-serif tracking-widest text-amber-300 font-black mb-6">
            A PARTIDA VAI INICIAR EM
          </h2>
          <div className="text-8xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-yellow-500 shadow-2xl scale-125 transition-transform duration-300">
            {countdown > 0 ? countdown : 'É HORA DO DUELO!'}
          </div>
          <p className="text-xs text-slate-400 mt-8 uppercase tracking-widest font-mono">
            {countdown > 0 ? 'Embaralhando decks clássicos...' : 'Que os Jogos das Sombras comecem!'}
          </p>
        </div>
      )}

      {/* PAINEL LATERAL ESQUERDO: GRIMOIRE & TRADUÇÃO (ESTILO MTG / ANIME) */}
      <aside className="w-80 bg-[#0d0918]/95 border-r-2 border-[#382654] flex flex-col p-3 shadow-[5px_0_30px_rgba(0,0,0,0.85)] z-20 justify-between">
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
                onClick={() => setLanguagePt(!languagePt)}
                className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-purple-950/80 border border-purple-500/50 hover:border-amber-400 text-amber-300 transition-colors"
                title="Alternar idioma das cartas e do chat"
              >
                {languagePt ? '🇧🇷 PT-BR' : '🇺🇸 EN'}
              </button>
              
              <button
                onClick={() => setShowSurrenderModal(true)}
                className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-red-950/80 border border-red-500/50 hover:border-red-400 text-red-300 transition-colors"
                title="Sair ou Render-se do Duelo"
              >
                🏳️ Sair
              </button>
            </div>
          </div>

          {/* Carta Inspecionada em Alta Definição */}
          {inspectedCard ? (
            <div className="flex flex-col items-center w-full animate-fadeIn">
              <div className="relative group w-60 h-84 rounded-lg p-2 bg-gradient-to-br from-[#7a4e23] via-[#472c13] to-[#1a0f05] border-2 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-transform duration-300 hover:scale-105">
                <img
                  src={inspectedCard.data.imageUrl}
                  alt={inspectedCard.data.name}
                  className="w-full h-full object-contain rounded drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]"
                />
              </div>

              {/* Detalhes da Carta Traduzida */}
              <div className="mt-2.5 w-full bg-[#120c22] border-2 border-[#412760] rounded-lg p-2.5 shadow-md">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-extrabold text-amber-300 text-sm tracking-wide">
                    {languagePt && inspectedCard.data.namePt ? inspectedCard.data.namePt : inspectedCard.data.name}
                  </span>
                  <span className="text-[11px] font-serif text-amber-400">
                    {'★'.repeat(inspectedCard.data.level)}
                  </span>
                </div>

                <div className="text-[10px] uppercase font-serif tracking-wider text-purple-300 border-b border-purple-900/60 pb-1 mb-1.5 flex justify-between">
                  <span>{inspectedCard.data.type}</span>
                  <span className="text-slate-400">Nível {inspectedCard.data.level}</span>
                </div>

                <p className="text-[11px] text-amber-100/90 leading-relaxed italic bg-black/40 p-1.5 rounded border border-purple-950/80 min-h-[50px]">
                  "{languagePt && inspectedCard.data.descriptionPt ? inspectedCard.data.descriptionPt : inspectedCard.data.description}"
                </p>

                {(() => {
                  const isPlayerOwned = p1.monsterZones.some((m) => m?.uid === inspectedCard.uid) || p1.hand.some((c) => c.uid === inspectedCard.uid);
                  const effectiveAtk = isPlayerOwned
                    ? session.getEffectiveAttack(inspectedCard, p1, p2)
                    : session.getEffectiveAttack(inspectedCard, p2, p1);
                  const isBuffed = effectiveAtk > inspectedCard.data.attack;

                  return (
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
                        DEF 🛡️ {inspectedCard.data.defense}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
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
      <main className={`flex-1 flex flex-col justify-between p-2.5 relative overflow-hidden transition-transform ${isCameraShaking ? 'anim-camera-shake' : ''}`}>
        
        {/* TOPO: OPONENTE KAIBA (HUD AMPLIADO) */}
        <div className="flex justify-between items-center bg-[#0e0a17]/95 border-2 border-[#412760] rounded-xl px-7 py-2.5 shadow-[0_6px_25px_rgba(0,0,0,0.85)] relative">
          {/* Floating Damage em Ataque Direto */}
          {floatingDamage && !floatingDamage.isPlayer && floatingDamage.zoneIndex === null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none anim-damage-float">
              <span className="text-4xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-t from-red-600 via-rose-500 to-amber-300 drop-shadow-[0_0_15px_rgba(239,68,68,1)]">
                -{floatingDamage.amount}
              </span>
            </div>
          )}

          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-950 border-2 border-blue-400 flex items-center justify-center font-black text-blue-200 text-xl shadow-[0_0_15px_rgba(59,130,246,0.6)]">
              K
            </div>
            <div>
              <h2 className="font-extrabold text-blue-300 tracking-wider text-base flex items-center gap-2 font-serif">
                {p2.nickname}
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-950/90 border border-blue-500/50 text-blue-300 rounded font-sans uppercase">
                  IA Bot
                </span>
              </h2>
              <div className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span>Deck: <strong className="text-amber-400 font-mono">{p2.deck.length}</strong></span>
                <span>•</span>
                <span>Cemitério: <strong className="text-purple-400 font-mono">{p2.graveyard.length}</strong></span>
              </div>
            </div>
          </div>

          <div ref={opponentLpRef} className="flex items-center space-x-4">
            <span className="text-xs uppercase font-serif tracking-widest text-slate-400 font-black">PONTOS DE VIDA</span>
            <div className="bg-black/95 border-2 border-red-600 rounded-lg px-5 py-1 text-3xl font-mono font-black text-red-500 shadow-[0_0_22px_rgba(239,68,68,0.7)] tracking-wider">
              {p2.lifePoints} <span className="text-sm font-sans text-red-400 font-normal">LP</span>
            </div>
          </div>
        </div>

        {/* CAMPO DO OPONENTE */}
        <div className="flex flex-col space-y-2">
          {/* Mão do Oponente (Verso Oficial Yu-Gi-Oh) */}
          <div className="flex justify-center -space-x-5 h-20">
            {p2.hand.map((card, i) => (
              <div
                key={card.uid || i}
                className="w-14 h-20 rounded shadow-2xl transition-all duration-200 hover:-translate-y-2 hover:scale-110 hover:z-20 cursor-default"
              >
                <img
                  src="/card-back.jpg"
                  alt="Verso da Carta"
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] rounded"
                />
              </div>
            ))}
          </div>

          {/* Fileira de Monstros do Oponente (Pura Imagem 3D, sem caixa preta e com detalhes apenas no hover) */}
          <div className="grid grid-cols-5 gap-3 max-w-4xl mx-auto w-full px-2">
            {p2.monsterZones.map((slot, i) => {
              const isTargetable = selectedAttackingMonster !== null && slot !== null;
              const isDefense = slot?.position === 'DEFENSE';
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
                  className={`h-48 rounded-lg flex items-center justify-center p-0.5 transition-all cursor-pointer relative group ${
                    slot
                      ? `${isDefense ? 'card-3d-defense' : 'card-3d'} ${flameClass}`
                      : 'border-2 border-dashed border-[#2d1c47] zone-empty hover:border-purple-500/60'
                  } ${
                    isTargetable
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

                  {/* VFX de Anel de Impacto no Alvo */}
                  {isHitTarget && (
                    <div className="absolute inset-0 rounded-full border-4 border-red-500 pointer-events-none anim-impact-ring z-40"></div>
                  )}

                  {isTargetable && (
                    <div className="absolute -top-3 z-30 bg-red-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-lg border border-white animate-bounce flex items-center gap-1">
                      <span>🎯</span> ALVO
                    </div>
                  )}

                  {slot ? (
                    <div className={`w-full h-full relative rounded-lg flex items-center justify-center ${isDestroyed ? 'anim-card-destroy' : ''} ${isFlipped ? 'anim-card-flip' : ''}`}>
                      {/* Apenas a Imagem Pura da Carta Preenchendo com Fidelidade */}
                      <img
                        src={slot.data.imageUrl}
                        alt={slot.data.name}
                        className={`w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.85)] transition-transform duration-300 ${
                          isDefense ? 'rotate-90 scale-90' : 'group-hover:scale-105'
                        }`}
                      />

                      {/* Informações invisíveis por padrão - reveladas com suavidade apenas ao passar o mouse */}
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
                    </div>
                  ) : (
                    <span className="text-[11px] text-purple-900/60 font-serif tracking-widest uppercase">
                      Vazio
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FAIXA CENTRAL DO DUELO: CONTROLES & AURA DE FASE (HUD CENTRAL AMPLIADO) */}
        <div className="flex items-center justify-between px-7 py-2 bg-[#100a1c]/95 border-y-2 border-[#412760] shadow-[0_0_25px_rgba(65,39,96,0.8)] my-1">
          <div className="flex items-center space-x-3.5">
            <span className="text-xs uppercase font-serif tracking-widest text-amber-400 font-black">FASE:</span>
            <span className="px-3.5 py-1 rounded text-xs font-black tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.5)]">
              {match.phase}
            </span>
            <span className="text-xs text-slate-300 font-mono font-bold">
              Turno {match.currentTurn} • {isPlayerTurn ? `🌟 TURNO DE ${p1.nickname.toUpperCase()}` : `⏳ TURNO DE ${p2.nickname.toUpperCase()}`}
            </span>
          </div>

          {/* Botão de Ataque Direto */}
          {match.phase === 'BATTLE' &&
            selectedAttackingMonster !== null &&
            p2.monsterZones.every((m) => m === null) && (
              <button
                onClick={() => handleOpponentZoneClick(null)}
                className="px-6 py-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-[0_0_25px_rgba(239,68,68,0.9)] border-2 border-yellow-300 animate-bounce flex items-center gap-1.5"
              >
                <span>⚡</span> ATACAR DIRETAMENTE OS LPs!
              </button>
            )}

          {/* Botões de Ação */}
          <div className="flex space-x-2.5">
            <button
              onClick={handleNextPhase}
              disabled={!isPlayerTurn || match.isGameOver || match.phase === 'BATTLE'}
              className="px-5 py-1.5 bg-gradient-to-r from-indigo-700 to-purple-800 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-30 text-xs font-bold rounded-lg border border-indigo-400/50 shadow-md transition-all font-serif"
            >
              Fase de Batalha ⚔️
            </button>
            <button
              onClick={handleEndTurn}
              disabled={!isPlayerTurn || match.isGameOver}
              className="px-5 py-1.5 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-30 text-xs font-black rounded-lg border border-amber-400 shadow-md transition-all text-slate-950 font-serif"
            >
              Encerrar Turno 🛡️
            </button>
          </div>
        </div>

        {/* CAMPO DO JOGADOR (ZONA DE MONSTROS 3D AMPLIADA COM VFX) */}
        <div className="flex flex-col space-y-2">
          <div className="grid grid-cols-5 gap-3 max-w-4xl mx-auto w-full px-2">
            {p1.monsterZones.map((slot, i) => {
              const selectedHandCard = selectedHandCardUid ? p1.hand.find((c) => c.uid === selectedHandCardUid) : null;
              const requiredTributes = selectedHandCard ? (selectedHandCard.data.level <= 4 ? 0 : selectedHandCard.data.level <= 6 ? 1 : 2) : 0;
              const isSelectedTribute = selectedTributeZones.includes(i);
              const isTributeTargetZone = selectedHandCard !== null && requiredTributes > 0 && selectedTributeZones.length === requiredTributes && (slot === null || isSelectedTribute);
              const isValidSummonZone = selectedHandCard !== null && requiredTributes === 0 && slot === null;
              const isSelectedAttacker = selectedAttackerZone === i;
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
                  className={`h-48 rounded-lg flex items-center justify-center p-0.5 transition-all cursor-pointer relative group ${
                    slot
                      ? `${isDefense ? 'card-3d-defense' : 'card-3d'} ${flameClass}`
                      : (isValidSummonZone || isTributeTargetZone)
                      ? 'border-2 border-emerald-400 bg-emerald-950/40 ring-4 ring-emerald-400/80 shadow-[0_0_25px_rgba(16,185,129,0.8)] scale-105 animate-pulse'
                      : 'border-2 border-dashed border-[#2d1c47] zone-empty hover:border-amber-500/50'
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

                  {/* Badge de Sacrifício Selecionado / Zona Pronta para Invocação por Tributo */}
                  {isSelectedTribute ? (
                    <div className="absolute -top-3.5 z-40 bg-gradient-to-r from-red-600 to-rose-700 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.9)] border border-yellow-300 animate-bounce flex items-center gap-1 uppercase tracking-wider">
                      {isTributeTargetZone ? (
                        <>
                          <span>⚡</span> INVOCAR AQUI!
                        </>
                      ) : (
                        <>
                          <span>🔥</span> SACRIFÍCIO
                        </>
                      )}
                    </div>
                  ) : (
                    (isValidSummonZone || isTributeTargetZone) && (
                      <div className="absolute -top-3 z-30 bg-emerald-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-lg border border-white animate-bounce flex items-center gap-1">
                        <span>⬇️</span> INVOCAR
                      </div>
                    )
                  )}

                  {slot ? (
                    <div className={`w-full h-full relative rounded-lg flex items-center justify-center ${isSlamming ? 'anim-card-slam' : ''} ${isDestroyed ? 'anim-card-destroy' : ''} ${isFlipped ? 'anim-card-flip' : ''}`}>
                      {/* Apenas a Imagem Pura da Carta Original em Alta Definição */}
                      <img
                        src={slot.data.imageUrl}
                        alt={slot.data.name}
                        className={`w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.85)] transition-transform duration-300 ${
                          isDefense ? 'rotate-90 scale-90' : 'group-hover:scale-105'
                        }`}
                      />

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
                            <span className="text-red-400 font-sans text-[9px]">Atacou</span>
                          ) : slot.turnSummoned === match.currentTurn ? (
                            <span className="text-yellow-400 font-sans text-[9px]">Invocado ⏳</span>
                          ) : match.phase === 'BATTLE' && !isDefense ? (
                            <span className="text-emerald-400 font-sans text-[9px] animate-pulse">Pronto ⚔️</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-purple-900/60 font-serif tracking-widest uppercase">
                      {isValidSummonZone ? 'Clique p/ Inserir' : 'Zona Monstro'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RODAPÉ DO JOGADOR: MÃO AMPLIADA & STATUS (HUD AMPLIADO) */}
        <div className="bg-[#0b0814]/95 border-2 border-[#412760] rounded-xl p-3 shadow-[0_-6px_30px_rgba(0,0,0,0.85)] flex items-center justify-between">
          
          <div className="flex items-center space-x-4 w-60">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 via-amber-700 to-purple-950 border-2 border-amber-400 flex items-center justify-center font-black text-amber-200 text-2xl shadow-[0_0_15px_rgba(245,158,11,0.6)] uppercase">
              {p1.nickname.charAt(0) || 'D'}
            </div>
            <div>
              <h2 className="font-extrabold text-amber-300 text-base font-serif tracking-wide truncate max-w-[150px]">{p1.nickname}</h2>
              <div ref={playerLpRef} className="bg-black/95 border-2 border-red-600 rounded-lg px-3.5 py-0.5 text-2xl font-mono font-black text-red-400 shadow-[0_0_18px_rgba(239,68,68,0.6)] tracking-wider mt-0.5">
                {p1.lifePoints} <span className="text-xs font-sans text-red-400 font-normal">LP</span>
              </div>
            </div>
          </div>

          {/* Mão do Jogador (Cartas 3D Ampliadas, Layout Dinâmico e Animação de Compra) */}
          <div className="flex-1 flex justify-center -space-x-4 overflow-visible py-1">
            {p1.hand.map((card, idx) => {
              const isSelected = selectedHandCardUid === card.uid;
              const isNewlyDrawn = recentDrawnUids.includes(card.uid);
              return (
                <div
                  key={card.uid}
                  onClick={() => handleSelectHandCard(card)}
                  onMouseEnter={() => setInspectedCard(card)}
                  style={{ animationDelay: isNewlyDrawn ? `${idx * 140}ms` : '0ms' }}
                  className={`card-3d group w-32 h-44 rounded-md cursor-pointer transition-all duration-200 relative flex items-center justify-center ${
                    isNewlyDrawn ? 'anim-draw-card' : ''
                  } ${
                    isSelected
                      ? '-translate-y-6 ring-4 ring-amber-400/90 shadow-[0_0_35px_rgba(245,158,11,1)] scale-110 z-30'
                      : 'hover:-translate-y-5 hover:scale-105 hover:z-20 hover:drop-shadow-[0_15px_25px_rgba(245,158,11,0.5)]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 bg-amber-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow border border-white animate-bounce">
                      ESCOLHIDA
                    </div>
                  )}

                  {/* Arte Pura da Carta */}
                  <img
                    src={card.data.imageUrl}
                    alt={card.data.name}
                    className="w-full h-full object-contain filter drop-shadow-xl select-none"
                  />

                  {/* Informações da Carta Apenas no Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-md flex flex-col justify-between p-1.5 pointer-events-none backdrop-blur-[1px]">
                    <div className="text-[10px] font-bold text-amber-200 text-center truncate bg-black/80 rounded px-1 shadow">
                      {languagePt && card.data.namePt ? card.data.namePt : card.data.name}
                    </div>

                    <div className="flex justify-between text-[9px] font-mono font-black text-amber-300 bg-black/90 px-1.5 py-0.5 rounded shadow">
                      <span>⚔️ {card.data.attack}</span>
                      <span>🛡️ {card.data.defense}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cemitério e Deck do Jogador */}
          <div className="flex items-center space-x-3 pl-4 border-l-2 border-[#2b1c42]">
            <div className="text-center">
              <div className="w-14 h-20 rounded border-2 border-purple-800 bg-purple-950/40 flex items-center justify-center text-xs font-mono font-bold text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.3)]">
                {p1.graveyard.length}
              </div>
              <span className="text-[9px] text-slate-400 uppercase font-serif tracking-wider">Cemitério</span>
            </div>

            <div className="text-center">
              <div className="w-14 h-20 rounded border border-amber-600/50 relative shadow-[0_0_15px_rgba(245,158,11,0.4)] overflow-hidden flex items-center justify-center group">
                <img src="/card-back.jpg" alt="Deck" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-sm font-mono font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    {p1.deck.length}
                  </span>
                </div>
              </div>
              <span className="text-[9px] text-slate-400 uppercase font-serif tracking-wider">Deck</span>
            </div>
          </div>
        </div>



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
            <div className="bg-[#120c22] border-2 border-amber-400 rounded-2xl p-8 text-center max-w-md shadow-[0_0_50px_rgba(245,158,11,0.6)]">
              <div className="text-4xl mb-2 text-amber-400">𓂀</div>
              <h1 className="text-3xl font-black text-amber-400 mb-2 font-serif tracking-widest">
                FIM DO DUELO!
              </h1>
              <p className="text-slate-200 font-semibold mb-6">{match.winReason}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={handleResetMatch}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105 text-xs"
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
      </main>
    </div>
  );
};
