import { GameRoom, Player, Card, GamePhase, TurnPhase, ClientGameState, ClientPlayer, SpecialActionData, getCardValue, hasSpecialEffect } from './types';
import { createDeck, shuffleDeck, dealCards } from './deck';
import { v4 as uuidv4 } from 'uuid';

const rooms: Map<string, GameRoom> = new Map();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(playerName: string, playerId: string): GameRoom {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) {
    roomCode = generateRoomCode();
  }

  const player: Player = {
    id: playerId,
    name: playerName,
    hand: [],
    cumulativeScore: 0,
    roundScore: 0,
    isHost: true,
    connected: true,
    turnsThisRound: 0,
  };

  const room: GameRoom = {
    roomCode,
    players: [player],
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    phase: 'lobby',
    turnPhase: 'draw',
    drawnCard: null,
    roundNumber: 0,
    minTurnsPerPlayer: 3,
    bangCalledBy: null,
    finalTurnPlayers: [],
    lastDiscardedCard: null,
    matchDiscardPlayerIndex: null,
    specialActionData: null,
    createdAt: Date.now(),
  };

  rooms.set(roomCode, room);
  return room;
}

export function joinRoom(roomCode: string, playerName: string, playerId: string): { room: GameRoom | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.phase !== 'lobby') return { room: null, error: 'Game already in progress' };
  if (room.players.length >= 6) return { room: null, error: 'Room is full' };
  if (room.players.some(p => p.name === playerName)) return { room: null, error: 'Name already taken' };

  const existing = room.players.find(p => p.id === playerId);
  if (existing) {
    existing.connected = true;
    return { room };
  }

  const player: Player = {
    id: playerId,
    name: playerName,
    hand: [],
    cumulativeScore: 0,
    roundScore: 0,
    isHost: false,
    connected: true,
    turnsThisRound: 0,
  };

  room.players.push(player);
  return { room };
}

export function reconnectPlayer(roomCode: string, playerId: string): { room: GameRoom | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { room: null, error: 'Player not in room' };
  player.connected = true;
  return { room };
}

export function disconnectPlayer(roomCode: string, playerId: string): GameRoom | null {
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.connected = false;

  if (room.players.every(p => !p.connected)) {
    rooms.delete(roomCode);
    return null;
  }
  return room;
}

export function startGame(roomCode: string, playerId: string): { room: GameRoom | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };

  const player = room.players.find(p => p.id === playerId);
  if (!player?.isHost) return { room: null, error: 'Only host can start' };
  if (room.players.length < 2) return { room: null, error: 'Need at least 2 players' };

  startNewRound(room);
  return { room };
}

function startNewRound(room: GameRoom): void {
  room.roundNumber++;
  room.phase = 'preview';
  room.turnPhase = 'draw';
  room.currentPlayerIndex = 0;
  room.drawnCard = null;
  room.bangCalledBy = null;
  room.finalTurnPlayers = [];
  room.lastDiscardedCard = null;
  room.matchDiscardPlayerIndex = null;
  room.specialActionData = null;

  const deck = shuffleDeck(createDeck());
  let remaining = deck;

  for (const player of room.players) {
    const result = dealCards(remaining, 4);
    player.hand = result.dealt;
    player.roundScore = 0;
    player.turnsThisRound = 0;
    remaining = result.remaining;
  }

  room.drawPile = remaining;
  room.discardPile = [];

  // Flip top card of draw pile to start discard pile
  if (room.drawPile.length > 0) {
    const topCard = room.drawPile.shift()!;
    room.discardPile.push(topCard);
  }
}

export function endPreview(roomCode: string): GameRoom | null {
  const room = rooms.get(roomCode);
  if (!room || room.phase !== 'preview') return null;
  room.phase = 'playing';
  room.turnPhase = 'draw';
  return room;
}

export function drawCard(roomCode: string, playerId: string): { room: GameRoom | null; card: Card | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, card: null, error: 'Room not found' };
  if (room.phase !== 'playing' && room.phase !== 'bang_called') return { room: null, card: null, error: 'Not in playing phase' };
  if (room.turnPhase !== 'draw') return { room: null, card: null, error: 'Not draw phase' };

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return { room: null, card: null, error: 'Not your turn' };

  if (room.drawPile.length === 0) {
    reshuffleDiscardPile(room);
  }

  if (room.drawPile.length === 0) {
    return { room: null, card: null, error: 'No cards left' };
  }

  const card = room.drawPile.shift()!;
  room.drawnCard = card;
  room.turnPhase = 'decide';
  return { room, card };
}

export function drawFromDiscard(roomCode: string, playerId: string): { room: GameRoom | null; card: Card | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, card: null, error: 'Room not found' };
  if (room.phase !== 'playing' && room.phase !== 'bang_called') return { room: null, card: null, error: 'Not in playing phase' };
  if (room.turnPhase !== 'draw') return { room: null, card: null, error: 'Not draw phase' };

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return { room: null, card: null, error: 'Not your turn' };

  if (room.discardPile.length === 0) {
    return { room: null, card: null, error: 'Discard pile empty' };
  }

  const card = room.discardPile.pop()!;
  room.drawnCard = card;
  room.turnPhase = 'decide';
  return { room, card };
}

export function keepCard(roomCode: string, playerId: string, handIndex: number): { room: GameRoom | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.turnPhase !== 'decide') return { room: null, error: 'Not decide phase' };

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return { room: null, error: 'Not your turn' };
  if (!room.drawnCard) return { room: null, error: 'No drawn card' };
  if (handIndex < 0 || handIndex >= currentPlayer.hand.length) return { room: null, error: 'Invalid card index' };

  const replacedCard = currentPlayer.hand[handIndex];
  currentPlayer.hand[handIndex] = room.drawnCard;
  room.discardPile.push(replacedCard);
  room.lastDiscardedCard = replacedCard;
  room.drawnCard = null;

  advanceTurn(room);
  return { room };
}

export function discardDrawnCard(roomCode: string, playerId: string): { room: GameRoom | null; error?: string; specialEffect?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.turnPhase !== 'decide') return { room: null, error: 'Not decide phase' };

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return { room: null, error: 'Not your turn' };
  if (!room.drawnCard) return { room: null, error: 'No drawn card' };

  const card = room.drawnCard;
  room.discardPile.push(card);
  room.lastDiscardedCard = card;
  room.drawnCard = null;

  if (hasSpecialEffect(card.rank)) {
    room.turnPhase = 'special_action';
    const effect = getSpecialEffectType(card.rank);
    room.specialActionData = { type: effect };
    return { room, specialEffect: effect };
  }

  advanceTurn(room);
  return { room };
}

function getSpecialEffectType(rank: string): SpecialActionData['type'] {
  switch (rank) {
    case '7': return 'peek_left';
    case '8': return 'peek_self';
    case '9': return 'peek_right';
    case '10': return 'swap';
    case 'J': return 'prince_discard';
    default: return 'peek_self';
  }
}

export function executeSpecialAction(
  roomCode: string,
  playerId: string,
  action: {
    cardIndex?: number;
    targetPlayerId?: string;
    targetCardIndex?: number;
    skip?: boolean;
  }
): { room: GameRoom | null; revealedCard?: Card; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.turnPhase !== 'special_action') return { room: null, error: 'Not special action phase' };

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return { room: null, error: 'Not your turn' };
  if (!room.specialActionData) return { room: null, error: 'No special action' };

  if (action.skip) {
    room.specialActionData = null;
    advanceTurn(room);
    return { room };
  }

  const actionType = room.specialActionData.type;

  switch (actionType) {
    case 'peek_left': {
      const leftIndex = (room.currentPlayerIndex + room.players.length - 1) % room.players.length;
      const leftPlayer = room.players[leftIndex];
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= leftPlayer.hand.length) return { room: null, error: 'Invalid card index' };
      const revealedCard = leftPlayer.hand[ci];
      room.specialActionData = null;
      advanceTurn(room);
      return { room, revealedCard };
    }

    case 'peek_self': {
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= currentPlayer.hand.length) return { room: null, error: 'Invalid card index' };
      const revealedCard = currentPlayer.hand[ci];
      room.specialActionData = null;
      advanceTurn(room);
      return { room, revealedCard };
    }

    case 'peek_right': {
      const rightIndex = (room.currentPlayerIndex + 1) % room.players.length;
      const rightPlayer = room.players[rightIndex];
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= rightPlayer.hand.length) return { room: null, error: 'Invalid card index' };
      const revealedCard = rightPlayer.hand[ci];
      room.specialActionData = null;
      advanceTurn(room);
      return { room, revealedCard };
    }

    case 'swap': {
      if (!action.targetPlayerId || action.targetCardIndex === undefined || action.cardIndex === undefined) {
        return { room: null, error: 'Missing swap parameters' };
      }
      const targetPlayer = room.players.find(p => p.id === action.targetPlayerId);
      if (!targetPlayer) return { room: null, error: 'Target player not found' };
      if (targetPlayer.id === currentPlayer.id) return { room: null, error: 'Cannot swap with yourself' };
      if (action.cardIndex < 0 || action.cardIndex >= currentPlayer.hand.length) return { room: null, error: 'Invalid own card index' };
      if (action.targetCardIndex < 0 || action.targetCardIndex >= targetPlayer.hand.length) return { room: null, error: 'Invalid target card index' };

      const temp = currentPlayer.hand[action.cardIndex];
      currentPlayer.hand[action.cardIndex] = targetPlayer.hand[action.targetCardIndex];
      targetPlayer.hand[action.targetCardIndex] = temp;

      room.specialActionData = null;
      advanceTurn(room);
      return { room };
    }

    case 'prince_discard': {
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= currentPlayer.hand.length) return { room: null, error: 'Invalid card index' };

      const discardedCard = currentPlayer.hand.splice(ci, 1)[0];
      room.discardPile.push(discardedCard);

      if (room.drawPile.length === 0) reshuffleDiscardPile(room);
      if (room.drawPile.length > 0) {
        const replacement = room.drawPile.shift()!;
        currentPlayer.hand.splice(ci, 0, replacement);
      }

      room.specialActionData = null;
      advanceTurn(room);
      return { room };
    }
  }

  return { room: null, error: 'Unknown action' };
}

export function attemptMatchDiscard(
  roomCode: string,
  playerId: string,
  cardIndex: number
): { room: GameRoom | null; success: boolean; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, success: false, error: 'Room not found' };
  if (!room.lastDiscardedCard) return { room: null, success: false, error: 'No last discarded card' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { room: null, success: false, error: 'Player not found' };
  if (cardIndex < 0 || cardIndex >= player.hand.length) return { room: null, success: false, error: 'Invalid card index' };

  const playerCard = player.hand[cardIndex];
  const lastValue = getCardValue(room.lastDiscardedCard);
  const playerValue = getCardValue(playerCard);

  if (playerValue === lastValue) {
    player.hand.splice(cardIndex, 1);
    room.discardPile.push(playerCard);

    if (room.drawPile.length === 0) reshuffleDiscardPile(room);
    if (room.drawPile.length > 0) {
      const replacement = room.drawPile.shift()!;
      player.hand.splice(cardIndex, 0, replacement);
    }

    return { room, success: true };
  } else {
    if (room.drawPile.length === 0) reshuffleDiscardPile(room);
    if (room.drawPile.length > 0) {
      const penaltyCard = room.drawPile.shift()!;
      player.hand.push(penaltyCard);
    }
    return { room, success: false };
  }
}

export function callBang(roomCode: string, playerId: string): { room: GameRoom | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.phase !== 'playing') return { room: null, error: 'Not in playing phase' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { room: null, error: 'Player not found' };

  const allPlayersHaveMinTurns = room.players.every(p => p.turnsThisRound >= room.minTurnsPerPlayer);
  if (!allPlayersHaveMinTurns) return { room: null, error: 'Minimum turns not reached' };

  if (room.turnPhase !== 'draw') return { room: null, error: 'Can only call Bang at start of your turn' };
  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return { room: null, error: 'Not your turn' };

  room.bangCalledBy = playerId;
  room.phase = 'bang_called';
  room.finalTurnPlayers = room.players
    .filter(p => p.id !== playerId)
    .map(p => p.id);

  return { room };
}

function advanceTurn(room: GameRoom): void {
  const currentPlayer = room.players[room.currentPlayerIndex];
  currentPlayer.turnsThisRound++;

  if (room.phase === 'bang_called') {
    const idx = room.finalTurnPlayers.indexOf(currentPlayer.id);
    if (idx === -1) {
      // Bang caller's turn - skip, they already called bang
    }
    room.finalTurnPlayers = room.finalTurnPlayers.filter(id => id !== room.players[room.currentPlayerIndex].id);

    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

    // Skip the bang caller if they come up
    if (room.players[room.currentPlayerIndex].id === room.bangCalledBy) {
      if (room.finalTurnPlayers.length === 0) {
        endRound(room);
        return;
      }
      room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    }

    if (room.finalTurnPlayers.length === 0) {
      endRound(room);
      return;
    }
  } else {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  }

  room.turnPhase = 'draw';
  room.drawnCard = null;
}

function endRound(room: GameRoom): void {
  room.phase = 'round_end';

  for (const player of room.players) {
    player.roundScore = player.hand.reduce((sum, card) => sum + getCardValue(card), 0);
    player.cumulativeScore += player.roundScore;
  }

  const winner = room.players.find(p => p.cumulativeScore <= -60);
  if (winner) {
    room.phase = 'game_over';
  }
}

export function startNextRound(roomCode: string, playerId: string): { room: GameRoom | null; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.phase !== 'round_end') return { room: null, error: 'Round not ended' };

  const player = room.players.find(p => p.id === playerId);
  if (!player?.isHost) return { room: null, error: 'Only host can start next round' };

  startNewRound(room);
  return { room };
}

function reshuffleDiscardPile(room: GameRoom): void {
  if (room.discardPile.length <= 1) return;
  const topCard = room.discardPile.pop()!;
  const cardsToShuffle = [...room.discardPile];
  room.discardPile = [topCard];

  for (let i = cardsToShuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardsToShuffle[i], cardsToShuffle[j]] = [cardsToShuffle[j], cardsToShuffle[i]];
  }
  room.drawPile = cardsToShuffle;
}

export function getClientState(room: GameRoom, playerId: string): ClientGameState {
  const myIndex = room.players.findIndex(p => p.id === playerId);
  const currentPlayer = room.players[room.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === playerId;

  const allPlayersHaveMinTurns = room.players.every(p => p.turnsThisRound >= room.minTurnsPerPlayer);
  const canCallBang = room.phase === 'playing' && isMyTurn && room.turnPhase === 'draw' && allPlayersHaveMinTurns;

  const players: ClientPlayer[] = room.players.map((p, idx) => {
    const cp: ClientPlayer = {
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      cumulativeScore: p.cumulativeScore,
      roundScore: p.roundScore,
      isHost: p.isHost,
      connected: p.connected,
      turnsThisRound: p.turnsThisRound,
    };

    if (room.phase === 'round_end' || room.phase === 'game_over') {
      cp.hand = p.hand;
    }
    if (room.phase === 'preview' && p.id === playerId) {
      cp.hand = p.hand;
    }

    return cp;
  });

  let message = '';
  if (room.phase === 'lobby') message = 'Waiting for players...';
  else if (room.phase === 'preview') message = 'Memorize your cards!';
  else if (room.phase === 'playing' || room.phase === 'bang_called') {
    if (isMyTurn) {
      if (room.turnPhase === 'draw') message = 'Your turn — draw a card';
      else if (room.turnPhase === 'decide') message = 'Keep or discard?';
      else if (room.turnPhase === 'special_action') message = 'Use special ability!';
    } else {
      message = `${currentPlayer.name}'s turn`;
    }
    if (room.phase === 'bang_called') message += ' (BANG called!)';
  } else if (room.phase === 'round_end') message = 'Round over!';
  else if (room.phase === 'game_over') message = 'Game over!';

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    turnPhase: room.turnPhase,
    players,
    currentPlayerIndex: room.currentPlayerIndex,
    myIndex,
    drawnCard: isMyTurn ? room.drawnCard : null,
    discardPileTop: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
    drawPileCount: room.drawPile.length,
    roundNumber: room.roundNumber,
    bangCalledBy: room.bangCalledBy,
    lastDiscardedCard: room.lastDiscardedCard,
    matchDiscardAvailable: !isMyTurn && room.lastDiscardedCard !== null && room.turnPhase === 'draw',
    specialActionData: isMyTurn ? room.specialActionData : null,
    canCallBang,
    message,
  };
}

export function getRoom(roomCode: string): GameRoom | undefined {
  return rooms.get(roomCode);
}

export function removeRoom(roomCode: string): void {
  rooms.delete(roomCode);
}
