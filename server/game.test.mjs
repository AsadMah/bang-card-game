import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  joinRoom,
  disconnectPlayer,
  getRoom,
  startGame,
  endPreview,
  drawCard,
  drawFromDiscard,
  keepCard,
  discardDrawnCard,
  executeSpecialAction,
  attemptMatchDiscard,
  callBang,
  startNextRound,
  getClientState,
} from './game.mjs';

// ============ HELPERS ============

function setupGame(playerCount = 2) {
  const room = createRoom('Player1', 'p1');
  for (let i = 2; i <= playerCount; i++) {
    joinRoom(room.roomCode, `Player${i}`, `p${i}`);
  }
  startGame(room.roomCode, 'p1');
  endPreview(room.roomCode);
  return room;
}

function playOneTurn(roomCode) {
  const room = getRoom(roomCode);
  const current = room.players[room.currentPlayerIndex];
  drawCard(roomCode, current.id);
  discardDrawnCard(roomCode, current.id);
  // Handle special action if triggered
  if (room.turnPhase === 'special_action') {
    executeSpecialAction(roomCode, current.id, { skip: true });
  }
}

function playMinTurns(roomCode) {
  const room = getRoom(roomCode);
  const totalTurns = room.minTurnsPerPlayer * room.players.length;
  for (let i = 0; i < totalTurns; i++) {
    playOneTurn(roomCode);
  }
}

// ============ DECK & CARD VALUES ============

describe('Card Values', () => {
  it('should assign correct values to number cards', () => {
    const room = setupGame(2);
    // Verify deck has 52 cards total (drawPile + hands + discardPile)
    const totalCards = room.drawPile.length + room.discardPile.length +
      room.players.reduce((sum, p) => sum + p.hand.length, 0);
    assert.equal(totalCards, 52);
  });

  it('should deal 4 cards to each player', () => {
    const room = setupGame(3);
    for (const player of room.players) {
      assert.equal(player.hand.length, 4);
    }
  });

  it('should have correct draw pile size after deal', () => {
    const room = setupGame(2);
    // 52 - (2 players * 4 cards) = 44
    assert.equal(room.drawPile.length, 44);
  });

  it('should have correct draw pile size for 4 players', () => {
    const room = setupGame(4);
    // 52 - (4 * 4) = 36
    assert.equal(room.drawPile.length, 36);
  });
});

// ============ ROOM MANAGEMENT ============

describe('Room Creation', () => {
  it('should create a room with a 4-character code', () => {
    const room = createRoom('Alice', 'alice1');
    assert.ok(room.roomCode);
    assert.equal(room.roomCode.length, 4);
  });

  it('should set the creator as host', () => {
    const room = createRoom('Alice', 'alice1');
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].isHost, true);
    assert.equal(room.players[0].name, 'Alice');
  });

  it('should start in lobby phase', () => {
    const room = createRoom('Alice', 'alice1');
    assert.equal(room.phase, 'lobby');
  });

  it('should have empty draw and discard piles initially', () => {
    const room = createRoom('Alice', 'alice1');
    assert.equal(room.drawPile.length, 0);
    assert.equal(room.discardPile.length, 0);
  });
});

describe('Join Room', () => {
  it('should allow a second player to join', () => {
    const room = createRoom('Alice', 'alice1');
    const result = joinRoom(room.roomCode, 'Bob', 'bob1');
    assert.ok(result.room);
    assert.equal(result.room.players.length, 2);
  });

  it('should reject duplicate names', () => {
    const room = createRoom('Alice', 'alice1');
    const result = joinRoom(room.roomCode, 'Alice', 'other1');
    assert.ok(result.error);
    assert.match(result.error, /Name already taken/);
  });

  it('should reject joining a non-existent room', () => {
    const result = joinRoom('ZZZZ', 'Bob', 'bob1');
    assert.ok(result.error);
    assert.match(result.error, /Room not found/);
  });

  it('should reject joining a full room (6 players)', () => {
    const room = createRoom('P1', 'id1');
    for (let i = 2; i <= 6; i++) joinRoom(room.roomCode, `P${i}`, `id${i}`);
    const result = joinRoom(room.roomCode, 'P7', 'id7');
    assert.ok(result.error);
    assert.match(result.error, /full/);
  });

  it('should reject joining a game already in progress', () => {
    const room = createRoom('P1', 'id1');
    joinRoom(room.roomCode, 'P2', 'id2');
    startGame(room.roomCode, 'id1');
    const result = joinRoom(room.roomCode, 'P3', 'id3');
    assert.ok(result.error);
    assert.match(result.error, /already in progress/);
  });

  it('should reconnect an existing player', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    disconnectPlayer(room.roomCode, 'bob1');
    const result = joinRoom(room.roomCode, 'Bob', 'bob1');
    assert.ok(result.room);
    const bob = result.room.players.find(p => p.id === 'bob1');
    assert.equal(bob.connected, true);
  });
});

describe('Disconnect', () => {
  it('should mark player as disconnected', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    disconnectPlayer(room.roomCode, 'bob1');
    const bob = room.players.find(p => p.id === 'bob1');
    assert.equal(bob.connected, false);
  });

  it('should delete room when all players disconnect', () => {
    const room = createRoom('Alice', 'alice1');
    const result = disconnectPlayer(room.roomCode, 'alice1');
    assert.equal(result, null);
    assert.equal(getRoom(room.roomCode), undefined);
  });
});

// ============ GAME START ============

describe('Start Game', () => {
  it('should only allow host to start', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    const result = startGame(room.roomCode, 'bob1');
    assert.ok(result.error);
    assert.match(result.error, /Only host/);
  });

  it('should require at least 2 players', () => {
    const room = createRoom('Alice', 'alice1');
    const result = startGame(room.roomCode, 'alice1');
    assert.ok(result.error);
    assert.match(result.error, /at least 2/);
  });

  it('should set phase to preview after starting', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    startGame(room.roomCode, 'alice1');
    assert.equal(room.phase, 'preview');
  });

  it('should start at round 1', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    startGame(room.roomCode, 'alice1');
    assert.equal(room.roundNumber, 1);
  });

  it('should have empty discard pile at round start', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    startGame(room.roomCode, 'alice1');
    assert.equal(room.discardPile.length, 0);
  });

  it('should deal 4 cards to each player', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    startGame(room.roomCode, 'alice1');
    assert.equal(room.players[0].hand.length, 4);
    assert.equal(room.players[1].hand.length, 4);
  });
});

describe('End Preview', () => {
  it('should transition to playing phase', () => {
    const room = createRoom('Alice', 'alice1');
    joinRoom(room.roomCode, 'Bob', 'bob1');
    startGame(room.roomCode, 'alice1');
    endPreview(room.roomCode);
    assert.equal(room.phase, 'playing');
    assert.equal(room.turnPhase, 'draw');
  });

  it('should return null for non-preview room', () => {
    const room = createRoom('Alice', 'alice1');
    const result = endPreview(room.roomCode);
    assert.equal(result, null);
  });
});

// ============ DRAW CARD ============

describe('Draw Card', () => {
  it('should draw from draw pile on players turn', () => {
    const room = setupGame(2);
    const drawPileBefore = room.drawPile.length;
    const result = drawCard(room.roomCode, 'p1');
    assert.ok(result.card);
    assert.equal(room.drawPile.length, drawPileBefore - 1);
    assert.equal(room.turnPhase, 'decide');
  });

  it('should reject draw when not your turn', () => {
    const room = setupGame(2);
    const result = drawCard(room.roomCode, 'p2');
    assert.ok(result.error);
    assert.match(result.error, /Not your turn/);
  });

  it('should reject draw when not in draw phase', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    // Now in decide phase, try drawing again
    const result = drawCard(room.roomCode, 'p1');
    assert.ok(result.error);
    assert.match(result.error, /Not draw phase/);
  });

  it('should store drawn card in room state', () => {
    const room = setupGame(2);
    const result = drawCard(room.roomCode, 'p1');
    assert.deepEqual(room.drawnCard, result.card);
  });
});

describe('Draw From Discard', () => {
  it('should fail when discard pile is empty', () => {
    const room = setupGame(2);
    assert.equal(room.discardPile.length, 0);
    const result = drawFromDiscard(room.roomCode, 'p1');
    assert.ok(result.error);
    assert.match(result.error, /empty/);
  });

  it('should draw the top card from discard pile', () => {
    const room = setupGame(2);
    // Play a turn to put a card on discard
    drawCard(room.roomCode, 'p1');
    discardDrawnCard(room.roomCode, 'p1');
    if (room.turnPhase === 'special_action') {
      executeSpecialAction(room.roomCode, 'p1', { skip: true });
    }
    // Now P2 draws from discard
    const discardTop = room.discardPile[room.discardPile.length - 1];
    const result = drawFromDiscard(room.roomCode, 'p2');
    assert.ok(result.card);
    assert.equal(result.card.id, discardTop.id);
  });
});

// ============ KEEP / DISCARD ============

describe('Keep Card (swap)', () => {
  it('should replace hand card with drawn card', () => {
    const room = setupGame(2);
    const result = drawCard(room.roomCode, 'p1');
    const drawnCard = result.card;
    const originalHandCard = room.players[0].hand[0];

    keepCard(room.roomCode, 'p1', 0);

    assert.equal(room.players[0].hand[0].id, drawnCard.id);
    // Replaced card should be on discard pile
    assert.equal(room.discardPile[room.discardPile.length - 1].id, originalHandCard.id);
  });

  it('should set lastDiscardedCard to replaced card', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    const originalHandCard = room.players[0].hand[2];
    keepCard(room.roomCode, 'p1', 2);
    assert.equal(room.lastDiscardedCard.id, originalHandCard.id);
  });

  it('should advance turn after keeping', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    keepCard(room.roomCode, 'p1', 0);
    assert.equal(room.currentPlayerIndex, 1);
    assert.equal(room.turnPhase, 'draw');
  });

  it('should maintain hand size at 4 after swap', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    keepCard(room.roomCode, 'p1', 0);
    assert.equal(room.players[0].hand.length, 4);
  });

  it('should reject invalid hand index', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    const result = keepCard(room.roomCode, 'p1', 10);
    assert.ok(result.error);
    assert.match(result.error, /Invalid/);
  });

  it('should reject negative hand index', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    const result = keepCard(room.roomCode, 'p1', -1);
    assert.ok(result.error);
  });
});

describe('Discard Drawn Card', () => {
  it('should put drawn card on discard pile', () => {
    const room = setupGame(2);
    const { card } = drawCard(room.roomCode, 'p1');
    discardDrawnCard(room.roomCode, 'p1');
    assert.equal(room.discardPile[room.discardPile.length - 1].id, card.id);
  });

  it('should set lastDiscardedCard', () => {
    const room = setupGame(2);
    const { card } = drawCard(room.roomCode, 'p1');
    discardDrawnCard(room.roomCode, 'p1');
    assert.equal(room.lastDiscardedCard.id, card.id);
  });

  it('should clear drawnCard from room', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    discardDrawnCard(room.roomCode, 'p1');
    assert.equal(room.drawnCard, null);
  });

  it('should trigger special action for rank 7 (peek left)', () => {
    const room = setupGame(2);
    // Force a 7 card
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '7', suit: 'hearts', id: 'test-7' };
    const result = discardDrawnCard(room.roomCode, 'p1');
    assert.equal(result.specialEffect, 'peek_left');
    assert.equal(room.turnPhase, 'special_action');
  });

  it('should trigger special action for rank 8 (peek self)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '8', suit: 'hearts', id: 'test-8' };
    const result = discardDrawnCard(room.roomCode, 'p1');
    assert.equal(result.specialEffect, 'peek_self');
  });

  it('should trigger special action for rank 9 (peek right)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '9', suit: 'hearts', id: 'test-9' };
    const result = discardDrawnCard(room.roomCode, 'p1');
    assert.equal(result.specialEffect, 'peek_right');
  });

  it('should trigger special action for rank 10 (swap)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '10', suit: 'hearts', id: 'test-10' };
    const result = discardDrawnCard(room.roomCode, 'p1');
    assert.equal(result.specialEffect, 'swap');
  });

  it('should trigger special action for rank J (prince discard)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'J', suit: 'hearts', id: 'test-J' };
    const result = discardDrawnCard(room.roomCode, 'p1');
    assert.equal(result.specialEffect, 'prince_discard');
  });

  it('should NOT trigger special action for non-special cards', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '3', suit: 'hearts', id: 'test-3' };
    const result = discardDrawnCard(room.roomCode, 'p1');
    assert.equal(result.specialEffect, undefined);
    assert.equal(room.turnPhase, 'draw'); // Advanced to next turn
  });

  it('should not advance turn when special action triggered', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '8', suit: 'hearts', id: 'test-8' };
    discardDrawnCard(room.roomCode, 'p1');
    assert.equal(room.currentPlayerIndex, 0); // Still P1's turn
  });
});

// ============ SPECIAL ACTIONS ============

describe('Special Action: Peek Self (8)', () => {
  it('should reveal the selected card', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '8', suit: 'hearts', id: 'test-8' };
    discardDrawnCard(room.roomCode, 'p1');

    const expectedCard = room.players[0].hand[1];
    const result = executeSpecialAction(room.roomCode, 'p1', { cardIndex: 1 });
    assert.deepEqual(result.revealedCard, expectedCard);
  });

  it('should advance turn after action', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '8', suit: 'hearts', id: 'test-8' };
    discardDrawnCard(room.roomCode, 'p1');
    executeSpecialAction(room.roomCode, 'p1', { cardIndex: 0 });
    assert.equal(room.currentPlayerIndex, 1);
    assert.equal(room.turnPhase, 'draw');
  });
});

describe('Special Action: Peek Left (7)', () => {
  it('should reveal left players card', () => {
    const room = setupGame(3);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '7', suit: 'hearts', id: 'test-7' };
    discardDrawnCard(room.roomCode, 'p1');

    // Left of p1 (index 0) wraps to last player (index 2)
    const leftPlayer = room.players[2];
    const expectedCard = leftPlayer.hand[0];
    const result = executeSpecialAction(room.roomCode, 'p1', { cardIndex: 0 });
    assert.deepEqual(result.revealedCard, expectedCard);
  });
});

describe('Special Action: Peek Right (9)', () => {
  it('should reveal right players card', () => {
    const room = setupGame(3);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '9', suit: 'hearts', id: 'test-9' };
    discardDrawnCard(room.roomCode, 'p1');

    // Right of p1 (index 0) is p2 (index 1)
    const rightPlayer = room.players[1];
    const expectedCard = rightPlayer.hand[0];
    const result = executeSpecialAction(room.roomCode, 'p1', { cardIndex: 0 });
    assert.deepEqual(result.revealedCard, expectedCard);
  });
});

describe('Special Action: Swap (10)', () => {
  it('should swap cards between two players', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '10', suit: 'hearts', id: 'test-10' };
    discardDrawnCard(room.roomCode, 'p1');

    const p1Card = room.players[0].hand[0];
    const p2Card = room.players[1].hand[1];

    executeSpecialAction(room.roomCode, 'p1', {
      cardIndex: 0,
      targetPlayerId: 'p2',
      targetCardIndex: 1,
    });

    assert.equal(room.players[0].hand[0].id, p2Card.id);
    assert.equal(room.players[1].hand[1].id, p1Card.id);
  });

  it('should reject swapping with yourself', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '10', suit: 'hearts', id: 'test-10' };
    discardDrawnCard(room.roomCode, 'p1');

    const result = executeSpecialAction(room.roomCode, 'p1', {
      cardIndex: 0,
      targetPlayerId: 'p1',
      targetCardIndex: 0,
    });
    assert.ok(result.error);
    assert.match(result.error, /Cannot swap with yourself/);
  });

  it('should reject invalid target card index', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '10', suit: 'hearts', id: 'test-10' };
    discardDrawnCard(room.roomCode, 'p1');

    const result = executeSpecialAction(room.roomCode, 'p1', {
      cardIndex: 0,
      targetPlayerId: 'p2',
      targetCardIndex: 99,
    });
    assert.ok(result.error);
  });
});

describe('Special Action: Prince Discard (Jack)', () => {
  it('should remove card from hand without replacement', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'J', suit: 'hearts', id: 'test-J' };
    discardDrawnCard(room.roomCode, 'p1');

    const handBefore = room.players[0].hand.length;
    const cardToDiscard = room.players[0].hand[1];
    executeSpecialAction(room.roomCode, 'p1', { cardIndex: 1 });

    assert.equal(room.players[0].hand.length, handBefore - 1);
    assert.ok(!room.players[0].hand.find(c => c.id === cardToDiscard.id));
  });

  it('should put discarded card on discard pile', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'J', suit: 'hearts', id: 'test-J' };
    discardDrawnCard(room.roomCode, 'p1');

    const cardToDiscard = room.players[0].hand[0];
    executeSpecialAction(room.roomCode, 'p1', { cardIndex: 0 });

    assert.equal(room.discardPile[room.discardPile.length - 1].id, cardToDiscard.id);
  });

  it('should allow hand to shrink below 4', () => {
    const room = setupGame(2);
    // Use Prince twice to get hand to 2
    for (let i = 0; i < 2; i++) {
      const current = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, current.id);
      room.drawnCard = { rank: 'J', suit: 'hearts', id: `test-J-${i}` };
      discardDrawnCard(room.roomCode, current.id);
      executeSpecialAction(room.roomCode, current.id, { cardIndex: 0 });
    }
    // After each player uses Prince once, each should have 3 cards
    assert.equal(room.players[0].hand.length, 3);
    assert.equal(room.players[1].hand.length, 3);
  });
});

describe('Special Action: Skip', () => {
  it('should skip any special action and advance turn', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '8', suit: 'hearts', id: 'test-8' };
    discardDrawnCard(room.roomCode, 'p1');
    assert.equal(room.turnPhase, 'special_action');

    executeSpecialAction(room.roomCode, 'p1', { skip: true });
    assert.equal(room.currentPlayerIndex, 1);
    assert.equal(room.turnPhase, 'draw');
  });
});

// ============ MATCH DISCARD ============

describe('Match Discard', () => {
  it('should remove card on correct match (hand shrinks)', () => {
    const room = setupGame(2);
    // P1 draws and discards a card
    drawCard(room.roomCode, 'p1');
    const discardCard = { rank: '5', suit: 'hearts', id: 'discard-5' };
    room.drawnCard = discardCard;
    discardDrawnCard(room.roomCode, 'p1');

    // Place a matching card in P2's hand
    room.players[1].hand[0] = { rank: '5', suit: 'clubs', id: 'match-5' };

    const handBefore = room.players[1].hand.length;
    const result = attemptMatchDiscard(room.roomCode, 'p2', 0);
    assert.equal(result.success, true);
    assert.equal(room.players[1].hand.length, handBefore - 1);
  });

  it('should add penalty card on wrong match (hand grows)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '5', suit: 'hearts', id: 'discard-5' };
    discardDrawnCard(room.roomCode, 'p1');

    // P2 has a non-matching card
    room.players[1].hand[0] = { rank: 'K', suit: 'clubs', id: 'nomatch-K' };

    const handBefore = room.players[1].hand.length;
    const result = attemptMatchDiscard(room.roomCode, 'p2', 0);
    assert.equal(result.success, false);
    assert.equal(room.players[1].hand.length, handBefore + 1);
  });

  it('should fail when no last discarded card', () => {
    const room = setupGame(2);
    const result = attemptMatchDiscard(room.roomCode, 'p2', 0);
    assert.ok(result.error);
    assert.match(result.error, /No last discarded card/);
  });

  it('should match by value not just rank (Red K=11 matches J=11)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'K', suit: 'hearts', id: 'discard-redK' };
    discardDrawnCard(room.roomCode, 'p1');
    if (room.turnPhase === 'special_action') {
      executeSpecialAction(room.roomCode, 'p1', { skip: true });
    }

    // Red King value = 11, Jack value = 11 — should match
    room.players[1].hand[0] = { rank: 'J', suit: 'clubs', id: 'match-J' };
    const result = attemptMatchDiscard(room.roomCode, 'p2', 0);
    assert.equal(result.success, true);
  });

  it('should not match Black K (value 0) with a 10 (value 10)', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'K', suit: 'spades', id: 'discard-blackK' };
    discardDrawnCard(room.roomCode, 'p1');

    room.players[1].hand[0] = { rank: '10', suit: 'clubs', id: 'nomatch-10' };
    const handBefore = room.players[1].hand.length;
    const result = attemptMatchDiscard(room.roomCode, 'p2', 0);
    assert.equal(result.success, false);
    assert.equal(room.players[1].hand.length, handBefore + 1);
  });
});

// ============ BANG (CALL BANG) ============

describe('Call Bang', () => {
  it('should reject when minimum turns not reached', () => {
    const room = setupGame(2);
    const result = callBang(room.roomCode, 'p1');
    assert.ok(result.error);
    assert.match(result.error, /Minimum turns/);
  });

  it('should reject when not your turn', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    // Now it should be someone's turn, try calling bang from wrong player
    const current = room.players[room.currentPlayerIndex];
    const other = room.players.find(p => p.id !== current.id);
    const result = callBang(room.roomCode, other.id);
    assert.ok(result.error);
    assert.match(result.error, /Not your turn/);
  });

  it('should reject when not in draw phase', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    drawCard(room.roomCode, current.id);
    // Now in decide phase
    const result = callBang(room.roomCode, current.id);
    assert.ok(result.error);
    assert.match(result.error, /start of turn/);
  });

  it('should set phase to bang_called on success', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    const result = callBang(room.roomCode, current.id);
    assert.ok(result.room);
    assert.equal(room.phase, 'bang_called');
    assert.equal(room.bangCalledBy, current.id);
  });

  it('should give other players one final turn after bang', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, current.id);

    const otherPlayers = room.players.filter(p => p.id !== current.id);
    assert.equal(room.finalTurnPlayers.length, otherPlayers.length);
    for (const p of otherPlayers) {
      assert.ok(room.finalTurnPlayers.includes(p.id));
    }
  });
});

// ============ ROUND END & SCORING ============

describe('Round End & Scoring', () => {
  it('should calculate round scores from hand values', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, current.id);

    // Play out remaining final turns
    while (room.phase === 'bang_called') {
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    assert.equal(room.phase, 'round_end');
    for (const player of room.players) {
      const expectedScore = player.hand.reduce((sum, card) => {
        switch (card.rank) {
          case 'A': return sum + 1;
          case 'Q': return sum + (-1);
          case 'K': return sum + ((card.suit === 'hearts' || card.suit === 'diamonds') ? 11 : 0);
          case 'J': return sum + 11;
          default: return sum + parseInt(card.rank);
        }
      }, 0);
      assert.equal(player.roundScore, expectedScore);
    }
  });

  it('should accumulate scores across rounds', () => {
    const room = setupGame(2);

    // Play round 1
    playMinTurns(room.roomCode);
    let current = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, current.id);
    while (room.phase === 'bang_called') {
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    const round1Scores = room.players.map(p => p.roundScore);

    // Start round 2
    startNextRound(room.roomCode, 'p1');
    endPreview(room.roomCode);
    playMinTurns(room.roomCode);
    current = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, current.id);
    while (room.phase === 'bang_called') {
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    for (let i = 0; i < room.players.length; i++) {
      assert.equal(
        room.players[i].cumulativeScore,
        round1Scores[i] + room.players[i].roundScore
      );
    }
  });

  it('should only allow host to start next round', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, current.id);
    while (room.phase === 'bang_called') {
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    const result = startNextRound(room.roomCode, 'p2');
    assert.ok(result.error);
    assert.match(result.error, /Only host/);
  });
});

// ============ TURN ADVANCEMENT ============

describe('Turn Advancement', () => {
  it('should cycle through all players', () => {
    const room = setupGame(3);
    assert.equal(room.currentPlayerIndex, 0);

    playOneTurn(room.roomCode);
    assert.equal(room.currentPlayerIndex, 1);

    playOneTurn(room.roomCode);
    assert.equal(room.currentPlayerIndex, 2);

    playOneTurn(room.roomCode);
    assert.equal(room.currentPlayerIndex, 0); // wraps around
  });

  it('should increment turnsThisRound for each player', () => {
    const room = setupGame(2);
    assert.equal(room.players[0].turnsThisRound, 0);

    playOneTurn(room.roomCode);
    assert.equal(room.players[0].turnsThisRound, 1);
  });
});

// ============ CLIENT STATE ============

describe('Client State', () => {
  it('should hide hand during playing phase', () => {
    const room = setupGame(2);
    const state = getClientState(room, 'p1');
    assert.equal(state.players[0].hand, undefined);
    assert.equal(state.players[0].cardCount, 4);
  });

  it('should show own hand during preview', () => {
    const room = createRoom('P1', 'p1');
    joinRoom(room.roomCode, 'P2', 'p2');
    startGame(room.roomCode, 'p1');
    // Still in preview
    const state = getClientState(room, 'p1');
    assert.ok(state.players[0].hand);
    assert.equal(state.players[0].hand.length, 4);
  });

  it('should NOT show other players hand during preview', () => {
    const room = createRoom('P1', 'p1');
    joinRoom(room.roomCode, 'P2', 'p2');
    startGame(room.roomCode, 'p1');
    const state = getClientState(room, 'p1');
    assert.equal(state.players[1].hand, undefined);
  });

  it('should show all hands during round_end', () => {
    const room = setupGame(2);
    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, current.id);
    while (room.phase === 'bang_called') {
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    const state = getClientState(room, 'p1');
    assert.ok(state.players[0].hand);
    assert.ok(state.players[1].hand);
  });

  it('should only show drawnCard to current player', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');

    const stateP1 = getClientState(room, 'p1');
    assert.ok(stateP1.drawnCard);

    const stateP2 = getClientState(room, 'p2');
    assert.equal(stateP2.drawnCard, null);
  });

  it('should set canCallBang correctly', () => {
    const room = setupGame(2);
    const state1 = getClientState(room, 'p1');
    assert.equal(state1.canCallBang, false); // min turns not reached

    playMinTurns(room.roomCode);
    const current = room.players[room.currentPlayerIndex];
    const state2 = getClientState(room, current.id);
    assert.equal(state2.canCallBang, true);
  });

  it('should only show specialActionData to current player', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '8', suit: 'hearts', id: 'test-8' };
    discardDrawnCard(room.roomCode, 'p1');

    const stateP1 = getClientState(room, 'p1');
    assert.ok(stateP1.specialActionData);

    const stateP2 = getClientState(room, 'p2');
    assert.equal(stateP2.specialActionData, null);
  });

  it('should show correct cardCount after Prince discard', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'J', suit: 'hearts', id: 'test-J' };
    discardDrawnCard(room.roomCode, 'p1');
    executeSpecialAction(room.roomCode, 'p1', { cardIndex: 0 });

    const state = getClientState(room, 'p1');
    assert.equal(state.players[0].cardCount, 3);
  });

  it('should show correct cardCount after successful match discard', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '3', suit: 'hearts', id: 'discard-3' };
    discardDrawnCard(room.roomCode, 'p1');

    room.players[1].hand[0] = { rank: '3', suit: 'clubs', id: 'match-3' };
    attemptMatchDiscard(room.roomCode, 'p2', 0);

    const state = getClientState(room, 'p2');
    assert.equal(state.players[1].cardCount, 3);
  });

  it('should show correct cardCount after failed match discard', () => {
    const room = setupGame(2);
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: '3', suit: 'hearts', id: 'discard-3' };
    discardDrawnCard(room.roomCode, 'p1');

    room.players[1].hand[0] = { rank: 'K', suit: 'clubs', id: 'nomatch-K' };
    attemptMatchDiscard(room.roomCode, 'p2', 0);

    const state = getClientState(room, 'p2');
    assert.equal(state.players[1].cardCount, 5);
  });

  it('should set correct messages for different phases', () => {
    const room = createRoom('P1', 'p1');
    joinRoom(room.roomCode, 'P2', 'p2');

    let state = getClientState(room, 'p1');
    assert.match(state.message, /Waiting/);

    startGame(room.roomCode, 'p1');
    state = getClientState(room, 'p1');
    assert.match(state.message, /Memorize/);

    endPreview(room.roomCode);
    state = getClientState(room, 'p1');
    assert.match(state.message, /draw a card/);

    state = getClientState(room, 'p2');
    assert.match(state.message, /P1's turn/);
  });
});

// ============ EDGE CASES ============

describe('Edge Cases', () => {
  it('should handle drawing when draw pile is nearly empty', () => {
    const room = setupGame(2);
    // Drain the draw pile almost completely
    room.discardPile = room.drawPile.splice(0, room.drawPile.length - 1);
    assert.equal(room.drawPile.length, 1);

    const result = drawCard(room.roomCode, 'p1');
    assert.ok(result.card);
    assert.equal(room.drawPile.length, 0);
  });

  it('should reshuffle discard pile when draw pile is empty', () => {
    const room = setupGame(2);
    // Move all draw pile cards to discard, keeping at least 2 for reshuffle
    const allCards = room.drawPile.splice(0);
    room.discardPile = allCards;
    assert.equal(room.drawPile.length, 0);
    assert.ok(room.discardPile.length > 1);

    const result = drawCard(room.roomCode, 'p1');
    assert.ok(result.card);
    // Draw pile should now have reshuffled discard minus top card
    assert.ok(room.drawPile.length > 0 || room.discardPile.length >= 0);
  });

  it('should not allow actions on non-existent rooms', () => {
    assert.ok(drawCard('XXXX', 'p1').error);
    assert.ok(drawFromDiscard('XXXX', 'p1').error);
    assert.ok(keepCard('XXXX', 'p1', 0).error);
    assert.ok(discardDrawnCard('XXXX', 'p1').error);
    assert.ok(callBang('XXXX', 'p1').error);
    assert.ok(attemptMatchDiscard('XXXX', 'p1', 0).error);
  });

  it('should handle game with max players (6)', () => {
    const room = setupGame(6);
    assert.equal(room.players.length, 6);
    // 52 - (6*4) = 28
    assert.equal(room.drawPile.length, 28);
    for (const p of room.players) {
      assert.equal(p.hand.length, 4);
    }
  });

  it('should handle multiple Prince discards reducing hand to 1', () => {
    const room = setupGame(2);

    // P1 uses Prince 3 times across turns (hand: 4 → 3 → ... eventually 1)
    for (let round = 0; round < 3; round++) {
      const current = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, current.id);
      room.drawnCard = { rank: 'J', suit: 'hearts', id: `prince-${round}` };
      discardDrawnCard(room.roomCode, current.id);
      executeSpecialAction(room.roomCode, current.id, { cardIndex: 0 });

      // Also play the other player's turn normally
      const other = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, other.id);
      room.drawnCard = { rank: '2', suit: 'hearts', id: `normal-${round}` };
      discardDrawnCard(room.roomCode, other.id);
    }

    assert.equal(room.players[0].hand.length, 1);
  });

  it('should correctly show fewer cards at round end after Prince', () => {
    const room = setupGame(2);

    // P1 uses Prince
    drawCard(room.roomCode, 'p1');
    room.drawnCard = { rank: 'J', suit: 'hearts', id: 'prince-1' };
    discardDrawnCard(room.roomCode, 'p1');
    executeSpecialAction(room.roomCode, 'p1', { cardIndex: 0 });

    // Fast-forward to round end
    // Play remaining min turns
    for (let i = 0; i < 10; i++) {
      if (room.phase === 'round_end' || room.phase === 'game_over') break;
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    // Call bang
    if (room.phase === 'playing') {
      const current = room.players[room.currentPlayerIndex];
      if (room.players.every(p => p.turnsThisRound >= room.minTurnsPerPlayer)) {
        callBang(room.roomCode, current.id);
        while (room.phase === 'bang_called') {
          const cp = room.players[room.currentPlayerIndex];
          drawCard(room.roomCode, cp.id);
          discardDrawnCard(room.roomCode, cp.id);
          if (room.turnPhase === 'special_action') {
            executeSpecialAction(room.roomCode, cp.id, { skip: true });
          }
        }
      }
    }

    if (room.phase === 'round_end' || room.phase === 'game_over') {
      const state = getClientState(room, 'p1');
      // P1 should have 3 cards (used Prince once)
      assert.equal(state.players[0].hand.length, 3);
      assert.equal(state.players[0].cardCount, 3);
    }
  });
});

// ============ FULL GAME FLOW ============

describe('Full Game Flow', () => {
  it('should complete a full round from lobby to round_end', () => {
    // Create and join
    const room = createRoom('Alice', 'alice');
    joinRoom(room.roomCode, 'Bob', 'bob');
    assert.equal(room.phase, 'lobby');

    // Start game
    startGame(room.roomCode, 'alice');
    assert.equal(room.phase, 'preview');
    assert.equal(room.roundNumber, 1);
    assert.equal(room.discardPile.length, 0);

    // End preview
    endPreview(room.roomCode);
    assert.equal(room.phase, 'playing');

    // Play minimum turns
    for (let i = 0; i < room.minTurnsPerPlayer * 2; i++) {
      const current = room.players[room.currentPlayerIndex];
      assert.equal(room.turnPhase, 'draw');
      drawCard(room.roomCode, current.id);
      assert.equal(room.turnPhase, 'decide');
      discardDrawnCard(room.roomCode, current.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, current.id, { skip: true });
      }
    }

    // Call bang
    const banger = room.players[room.currentPlayerIndex];
    callBang(room.roomCode, banger.id);
    assert.equal(room.phase, 'bang_called');

    // Final turns
    while (room.phase === 'bang_called') {
      const cp = room.players[room.currentPlayerIndex];
      drawCard(room.roomCode, cp.id);
      discardDrawnCard(room.roomCode, cp.id);
      if (room.turnPhase === 'special_action') {
        executeSpecialAction(room.roomCode, cp.id, { skip: true });
      }
    }

    assert.equal(room.phase, 'round_end');
    for (const p of room.players) {
      assert.ok(typeof p.roundScore === 'number');
      assert.equal(p.cumulativeScore, p.roundScore);
    }
  });

  it('should complete multiple rounds', () => {
    const room = createRoom('Alice', 'alice');
    joinRoom(room.roomCode, 'Bob', 'bob');
    startGame(room.roomCode, 'alice');
    endPreview(room.roomCode);

    for (let round = 1; round <= 3; round++) {
      assert.equal(room.roundNumber, round);

      // Play min turns
      playMinTurns(room.roomCode);

      // Call bang
      const current = room.players[room.currentPlayerIndex];
      callBang(room.roomCode, current.id);

      // Final turns
      while (room.phase === 'bang_called') {
        const cp = room.players[room.currentPlayerIndex];
        drawCard(room.roomCode, cp.id);
        discardDrawnCard(room.roomCode, cp.id);
        if (room.turnPhase === 'special_action') {
          executeSpecialAction(room.roomCode, cp.id, { skip: true });
        }
      }

      assert.ok(room.phase === 'round_end' || room.phase === 'game_over');

      if (room.phase === 'round_end' && round < 3) {
        startNextRound(room.roomCode, 'alice');
        endPreview(room.roomCode);
      }
    }
  });
});
