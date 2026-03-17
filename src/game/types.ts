export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
  id: string;
}

export type GamePhase =
  | 'lobby'
  | 'dealing'
  | 'preview'
  | 'playing'
  | 'bang_called'
  | 'round_end'
  | 'game_over';

export type TurnPhase =
  | 'draw'
  | 'decide'
  | 'special_action'
  | 'match_discard'
  | 'turn_end';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  cumulativeScore: number;
  roundScore: number;
  isHost: boolean;
  connected: boolean;
  turnsThisRound: number;
}

export interface GameRoom {
  roomCode: string;
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  phase: GamePhase;
  turnPhase: TurnPhase;
  drawnCard: Card | null;
  roundNumber: number;
  minTurnsPerPlayer: number;
  bangCalledBy: string | null;
  finalTurnPlayers: string[];
  lastDiscardedCard: Card | null;
  matchDiscardPlayerIndex: number | null;
  specialActionData: SpecialActionData | null;
  createdAt: number;
}

export interface SpecialActionData {
  type: 'peek_left' | 'peek_self' | 'peek_right' | 'swap' | 'prince_discard';
  cardIndex?: number;
  targetPlayerId?: string;
  targetCardIndex?: number;
  revealedCard?: Card;
}

export function getCardValue(card: Card): number {
  switch (card.rank) {
    case 'A': return 1;
    case '2': return 2;
    case '3': return 3;
    case '4': return 4;
    case '5': return 5;
    case '6': return 6;
    case '7': return 7;
    case '8': return 8;
    case '9': return 9;
    case '10': return 10;
    case 'J': return 11;
    case 'Q': return -1;
    case 'K':
      return (card.suit === 'hearts' || card.suit === 'diamonds') ? 11 : 0;
    default: return 0;
  }
}

export function getCardDisplay(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function hasSpecialEffect(rank: Rank): boolean {
  return ['7', '8', '9', '10', 'J'].includes(rank);
}

export interface ClientGameState {
  roomCode: string;
  phase: GamePhase;
  turnPhase: TurnPhase;
  players: ClientPlayer[];
  currentPlayerIndex: number;
  myIndex: number;
  drawnCard: Card | null;
  discardPileTop: Card | null;
  drawPileCount: number;
  roundNumber: number;
  bangCalledBy: string | null;
  lastDiscardedCard: Card | null;
  matchDiscardAvailable: boolean;
  specialActionData: SpecialActionData | null;
  canCallBang: boolean;
  message: string;
}

export interface ClientPlayer {
  id: string;
  name: string;
  cardCount: number;
  cumulativeScore: number;
  roundScore: number;
  isHost: boolean;
  connected: boolean;
  turnsThisRound: number;
  hand?: Card[];
}
