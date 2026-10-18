import { BattlePosition } from './duel-rule-engine.js';
export { BattlePosition };

export type DuelPhase = 'DRAW' | 'STANDBY' | 'MAIN1' | 'BATTLE' | 'MAIN2' | 'END';

export type CardEffectType =
  | 'CONTINUOUS'
  | 'FLIP'
  | 'HAND_TRIGGER'
  | 'IGNITION'
  | 'TRIGGER'
  | 'QUICK';

export interface CardEffectDefinition {
  trigger?: CardEffectType;
  action: string;
  value?: number;
  condition?: Record<string, any> | string;
  cost?: string;
  activation_timing?: string;
  target_count?: number;
  target_max_count?: number;
  target_scope?: string;
  usage_per_turn?: number;
  success_outcome?: Record<string, any>;
  failure_outcome?: Record<string, any>;
  description_pt?: string;
  [key: string]: any;
}

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
  race?: string;
  effectType?: CardEffectType;
  effectDefinition?: CardEffectDefinition;
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
  hasUsedEffectThisTurn?: boolean;
  isFaceDown?: boolean;
  turnSet?: number;
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

export interface FlipEffectResult {
  cardName: string;
  action: string;
  targetCardUid?: string;
  targetName?: string;
  targetCardUids?: string[];
  targetNames?: string[];
}

export interface PositionChangeResult {
  success: boolean;
  flipped: boolean;
  flipEffect?: FlipEffectResult;
}
