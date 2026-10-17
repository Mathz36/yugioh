import { BattlePosition } from './duel-rule-engine.js';
export { BattlePosition };

export type DuelPhase = 'DRAW' | 'STANDBY' | 'MAIN1' | 'BATTLE' | 'MAIN2' | 'END';

export interface CardData {
  id: string;
  name: string;
  type: string;
  level: number;
  attack: number;
  defense: number;
  description: string;
  namePt?: string;
  descriptionPt?: string;
  imageUrl?: string;
}

export interface CardInstance {
  uid: string; // Unique instance identifier in match
  data: CardData;
  position: BattlePosition;
  hasAttacked: boolean;
  hasChangedPositionThisTurn: boolean;
  turnSummoned: number;
  monstersDestroyedCount: number;
  hasAttackedDirectly: boolean;
}

export interface PlayerDuelState {
  id: string;
  nickname: string;
  lifePoints: number;
  deck: CardInstance[];
  hand: CardInstance[];
  monsterZones: (CardInstance | null)[]; // 5 zones
  spellTrapZones: (CardInstance | null)[]; // 5 zones
  graveyard: CardInstance[];
  hasNormalSummonedThisTurn: boolean;
}

export interface MatchTurnState {
  matchId: string;
  currentTurn: number;
  activePlayerId: string;
  phase: DuelPhase;
  isGameOver: boolean;
  winnerPlayerId: string | null;
  winReason: string | null;
  log: string[];
}

