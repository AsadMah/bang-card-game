import { randomUUID } from 'crypto';

// ============ DECK ============

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: randomUUID() });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCardValue(card) {
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

function hasSpecialEffect(rank) {
  return ['7', '8', '9', '10', 'J'].includes(rank);
}

function getSpecialEffectType(rank) {
  switch (rank) {
    case '7': return 'peek_left';
    case '8': return 'peek_self';
    case '9': return 'peek_right';
    case '10': return 'swap';
    case 'J': return 'prince_discard';
    default: return 'peek_self';
  }
}

// ============ ROOM MANAGEMENT ============

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(playerName, playerId) {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) roomCode = generateRoomCode();

  const player = {
    id: playerId,
    name: playerName,
    hand: [],
    cumulativeScore: 0,
    roundScore: 0,
    isHost: true,
    connected: true,
    turnsThisRound: 0,
  };

  const room = {
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
    specialActionData: null,
    createdAt: Date.now(),
  };

  rooms.set(roomCode, room);
  return room;
}

export function joinRoom(roomCode, playerName, playerId) {
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

  room.players.push({
    id: playerId,
    name: playerName,
    hand: [],
    cumulativeScore: 0,
    roundScore: 0,
    isHost: false,
    connected: true,
    turnsThisRound: 0,
  });
  return { room };
}

export function disconnectPlayer(roomCode, playerId) {
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

export function getRoom(roomCode) {
  return rooms.get(roomCode);
}

// ============ GAME FLOW ============

function startNewRound(room) {
  room.roundNumber++;
  room.phase = 'preview';
  room.turnPhase = 'draw';
  room.currentPlayerIndex = 0;
  room.drawnCard = null;
  room.bangCalledBy = null;
  room.finalTurnPlayers = [];
  room.lastDiscardedCard = null;
  room.specialActionData = null;

  const deck = shuffleDeck(createDeck());
  let idx = 0;

  for (const player of room.players) {
    player.hand = deck.slice(idx, idx + 4);
    player.roundScore = 0;
    player.turnsThisRound = 0;
    idx += 4;
  }

  room.drawPile = deck.slice(idx);
  room.discardPile = [];
}

export function startGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  const player = room.players.find(p => p.id === playerId);
  if (!player?.isHost) return { room: null, error: 'Only host can start' };
  if (room.players.length < 2) return { room: null, error: 'Need at least 2 players' };

  startNewRound(room);
  return { room };
}

export function endPreview(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.phase !== 'preview') return null;
  room.phase = 'playing';
  room.turnPhase = 'draw';
  return room;
}

function reshuffleDiscardPile(room) {
  if (room.discardPile.length <= 1) return;
  const topCard = room.discardPile.pop();
  const toShuffle = [...room.discardPile];
  room.discardPile = [topCard];
  for (let i = toShuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
  }
  room.drawPile = toShuffle;
}

export function drawCard(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, card: null, error: 'Room not found' };
  if (room.phase !== 'playing' && room.phase !== 'bang_called')
    return { room: null, card: null, error: 'Not in playing phase' };
  if (room.turnPhase !== 'draw')
    return { room: null, card: null, error: 'Not draw phase' };
  const current = room.players[room.currentPlayerIndex];
  if (current.id !== playerId)
    return { room: null, card: null, error: 'Not your turn' };

  if (room.drawPile.length === 0) reshuffleDiscardPile(room);
  if (room.drawPile.length === 0)
    return { room: null, card: null, error: 'No cards left' };

  const card = room.drawPile.shift();
  room.drawnCard = card;
  room.turnPhase = 'decide';
  return { room, card };
}

export function drawFromDiscard(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, card: null, error: 'Room not found' };
  if (room.phase !== 'playing' && room.phase !== 'bang_called')
    return { room: null, card: null, error: 'Not in playing phase' };
  if (room.turnPhase !== 'draw')
    return { room: null, card: null, error: 'Not draw phase' };
  const current = room.players[room.currentPlayerIndex];
  if (current.id !== playerId)
    return { room: null, card: null, error: 'Not your turn' };
  if (room.discardPile.length === 0)
    return { room: null, card: null, error: 'Discard pile empty' };

  const card = room.discardPile.pop();
  room.drawnCard = card;
  room.turnPhase = 'decide';
  return { room, card };
}

export function keepCard(roomCode, playerId, handIndex) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.turnPhase !== 'decide') return { room: null, error: 'Not decide phase' };
  const current = room.players[room.currentPlayerIndex];
  if (current.id !== playerId) return { room: null, error: 'Not your turn' };
  if (!room.drawnCard) return { room: null, error: 'No drawn card' };
  if (handIndex < 0 || handIndex >= current.hand.length)
    return { room: null, error: 'Invalid card index' };

  const replaced = current.hand[handIndex];
  current.hand[handIndex] = room.drawnCard;
  room.discardPile.push(replaced);
  room.lastDiscardedCard = replaced;
  room.drawnCard = null;
  advanceTurn(room);
  return { room };
}

export function discardDrawnCard(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.turnPhase !== 'decide') return { room: null, error: 'Not decide phase' };
  const current = room.players[room.currentPlayerIndex];
  if (current.id !== playerId) return { room: null, error: 'Not your turn' };
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

export function executeSpecialAction(roomCode, playerId, action) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.turnPhase !== 'special_action')
    return { room: null, error: 'Not special action phase' };
  const current = room.players[room.currentPlayerIndex];
  if (current.id !== playerId) return { room: null, error: 'Not your turn' };
  if (!room.specialActionData) return { room: null, error: 'No special action' };

  if (action.skip) {
    room.specialActionData = null;
    advanceTurn(room);
    return { room };
  }

  const actionType = room.specialActionData.type;

  switch (actionType) {
    case 'peek_left': {
      const leftIdx = (room.currentPlayerIndex + room.players.length - 1) % room.players.length;
      const leftPlayer = room.players[leftIdx];
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= leftPlayer.hand.length)
        return { room: null, error: 'Invalid card index' };
      const revealedCard = leftPlayer.hand[ci];
      room.specialActionData = null;
      advanceTurn(room);
      return { room, revealedCard };
    }

    case 'peek_self': {
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= current.hand.length)
        return { room: null, error: 'Invalid card index' };
      const revealedCard = current.hand[ci];
      room.specialActionData = null;
      advanceTurn(room);
      return { room, revealedCard };
    }

    case 'peek_right': {
      const rightIdx = (room.currentPlayerIndex + 1) % room.players.length;
      const rightPlayer = room.players[rightIdx];
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= rightPlayer.hand.length)
        return { room: null, error: 'Invalid card index' };
      const revealedCard = rightPlayer.hand[ci];
      room.specialActionData = null;
      advanceTurn(room);
      return { room, revealedCard };
    }

    case 'swap': {
      if (action.cardIndex === undefined || !action.targetPlayerId || action.targetCardIndex === undefined)
        return { room: null, error: 'Missing swap parameters' };
      const target = room.players.find(p => p.id === action.targetPlayerId);
      if (!target) return { room: null, error: 'Target player not found' };
      if (target.id === current.id) return { room: null, error: 'Cannot swap with yourself' };
      if (action.cardIndex < 0 || action.cardIndex >= current.hand.length)
        return { room: null, error: 'Invalid own card index' };
      if (action.targetCardIndex < 0 || action.targetCardIndex >= target.hand.length)
        return { room: null, error: 'Invalid target card index' };

      const temp = current.hand[action.cardIndex];
      current.hand[action.cardIndex] = target.hand[action.targetCardIndex];
      target.hand[action.targetCardIndex] = temp;
      room.specialActionData = null;
      advanceTurn(room);
      return { room };
    }

    case 'prince_discard': {
      const ci = action.cardIndex ?? 0;
      if (ci < 0 || ci >= current.hand.length)
        return { room: null, error: 'Invalid card index' };
      const discarded = current.hand.splice(ci, 1)[0];
      room.discardPile.push(discarded);
      if (room.drawPile.length === 0) reshuffleDiscardPile(room);
      if (room.drawPile.length > 0) {
        current.hand.splice(ci, 0, room.drawPile.shift());
      }
      room.specialActionData = null;
      advanceTurn(room);
      return { room };
    }
  }

  return { room: null, error: 'Unknown action' };
}

export function attemptMatchDiscard(roomCode, playerId, cardIndex) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, success: false, error: 'Room not found' };
  if (!room.lastDiscardedCard)
    return { room: null, success: false, error: 'No last discarded card' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { room: null, success: false, error: 'Player not found' };
  if (cardIndex < 0 || cardIndex >= player.hand.length)
    return { room: null, success: false, error: 'Invalid card index' };

  const playerCard = player.hand[cardIndex];
  const lastValue = getCardValue(room.lastDiscardedCard);
  const playerValue = getCardValue(playerCard);

  if (playerValue === lastValue) {
    player.hand.splice(cardIndex, 1);
    room.discardPile.push(playerCard);
    if (room.drawPile.length === 0) reshuffleDiscardPile(room);
    if (room.drawPile.length > 0) {
      player.hand.splice(cardIndex, 0, room.drawPile.shift());
    }
    return { room, success: true };
  } else {
    if (room.drawPile.length === 0) reshuffleDiscardPile(room);
    if (room.drawPile.length > 0) {
      player.hand.push(room.drawPile.shift());
    }
    return { room, success: false };
  }
}

export function callBang(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.phase !== 'playing') return { room: null, error: 'Not in playing phase' };

  const allMin = room.players.every(p => p.turnsThisRound >= room.minTurnsPerPlayer);
  if (!allMin) return { room: null, error: 'Minimum turns not reached' };
  if (room.turnPhase !== 'draw') return { room: null, error: 'Can only call Bang at start of turn' };

  const current = room.players[room.currentPlayerIndex];
  if (current.id !== playerId) return { room: null, error: 'Not your turn' };

  room.bangCalledBy = playerId;
  room.phase = 'bang_called';
  room.finalTurnPlayers = room.players.filter(p => p.id !== playerId).map(p => p.id);
  return { room };
}

function advanceTurn(room) {
  const current = room.players[room.currentPlayerIndex];
  current.turnsThisRound++;

  if (room.phase === 'bang_called') {
    room.finalTurnPlayers = room.finalTurnPlayers.filter(
      id => id !== room.players[room.currentPlayerIndex].id
    );

    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

    // Skip the bang caller
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

function endRound(room) {
  room.phase = 'round_end';
  for (const player of room.players) {
    player.roundScore = player.hand.reduce((sum, card) => sum + getCardValue(card), 0);
    player.cumulativeScore += player.roundScore;
  }
  if (room.players.some(p => p.cumulativeScore <= -60)) {
    room.phase = 'game_over';
  }
}

export function startNextRound(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, error: 'Room not found' };
  if (room.phase !== 'round_end') return { room: null, error: 'Round not ended' };
  const player = room.players.find(p => p.id === playerId);
  if (!player?.isHost) return { room: null, error: 'Only host can start next round' };
  startNewRound(room);
  return { room };
}

// ============ CLIENT STATE ============

export function getClientState(room, playerId) {
  const myIndex = room.players.findIndex(p => p.id === playerId);
  const currentPlayer = room.players[room.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === playerId;

  const allMin = room.players.every(p => p.turnsThisRound >= room.minTurnsPerPlayer);
  const canCallBang = room.phase === 'playing' && isMyTurn && room.turnPhase === 'draw' && allMin;

  const players = room.players.map(p => {
    const cp = {
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
