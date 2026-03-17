import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import * as GM from './server/game.mjs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Track socket -> player mapping
  const socketPlayerMap = new Map(); // socketId -> { roomCode, playerId }

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('create-room', ({ playerName }, callback) => {
      const playerId = socket.id;
      const room = GM.createRoom(playerName, playerId);
      socket.join(room.roomCode);
      socketPlayerMap.set(socket.id, { roomCode: room.roomCode, playerId });

      const state = GM.getClientState(room, playerId);
      callback({ success: true, state });
    });

    socket.on('join-room', ({ roomCode, playerName }, callback) => {
      const playerId = socket.id;
      const { room, error } = GM.joinRoom(roomCode.toUpperCase(), playerName, playerId);

      if (error || !room) {
        callback({ success: false, error: error || 'Failed to join' });
        return;
      }

      socket.join(room.roomCode);
      socketPlayerMap.set(socket.id, { roomCode: room.roomCode, playerId });

      // Send state to all players in room
      broadcastState(io, room);
      const state = GM.getClientState(room, playerId);
      callback({ success: true, state });
    });

    socket.on('get-state', ({ roomCode }, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const room = GM.getRoom(info.roomCode);
      if (!room) { callback({ success: false, error: 'Room not found' }); return; }

      const state = GM.getClientState(room, info.playerId);
      callback({ success: true, state });
    });

    socket.on('start-game', (_, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, error } = GM.startGame(info.roomCode, info.playerId);
      if (error || !room) { callback({ success: false, error: error || 'Failed to start' }); return; }

      broadcastState(io, room);

      // Auto-end preview after 3 seconds
      setTimeout(() => {
        const updatedRoom = GM.endPreview(info.roomCode);
        if (updatedRoom) {
          broadcastState(io, updatedRoom);
        }
      }, 5000);

      callback({ success: true });
    });

    socket.on('draw-card', ({ fromDiscard }, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      let result;
      if (fromDiscard) {
        result = GM.drawFromDiscard(info.roomCode, info.playerId);
      } else {
        result = GM.drawCard(info.roomCode, info.playerId);
      }

      if (result.error || !result.room) {
        callback({ success: false, error: result.error || 'Failed to draw' });
        return;
      }

      broadcastState(io, result.room);
      callback({ success: true, card: result.card });
    });

    socket.on('keep-card', ({ handIndex }, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, error } = GM.keepCard(info.roomCode, info.playerId, handIndex);
      if (error || !room) { callback({ success: false, error: error || 'Failed' }); return; }

      broadcastState(io, room);
      callback({ success: true });
    });

    socket.on('discard-card', (_, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, error, specialEffect } = GM.discardDrawnCard(info.roomCode, info.playerId);
      if (error || !room) { callback({ success: false, error: error || 'Failed' }); return; }

      broadcastState(io, room);
      callback({ success: true, specialEffect });
    });

    socket.on('special-action', (action, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, revealedCard, error } = GM.executeSpecialAction(info.roomCode, info.playerId, action);
      if (error || !room) { callback({ success: false, error: error || 'Failed' }); return; }

      broadcastState(io, room);
      callback({ success: true, revealedCard });
    });

    socket.on('match-discard', ({ cardIndex }, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, success, error } = GM.attemptMatchDiscard(info.roomCode, info.playerId, cardIndex);
      if (error || !room) { callback({ success: false, error: error || 'Failed' }); return; }

      broadcastState(io, room);
      callback({ success: true, matchSuccess: success });
    });

    socket.on('call-bang', (_, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, error } = GM.callBang(info.roomCode, info.playerId);
      if (error || !room) { callback({ success: false, error: error || 'Failed' }); return; }

      broadcastState(io, room);
      callback({ success: true });
    });

    socket.on('next-round', (_, callback) => {
      const info = socketPlayerMap.get(socket.id);
      if (!info) { callback({ success: false, error: 'Not in a room' }); return; }

      const { room, error } = GM.startNextRound(info.roomCode, info.playerId);
      if (error || !room) { callback({ success: false, error: error || 'Failed' }); return; }

      broadcastState(io, room);

      // Auto-end preview after 5 seconds
      setTimeout(() => {
        const updatedRoom = GM.endPreview(info.roomCode);
        if (updatedRoom) {
          broadcastState(io, updatedRoom);
        }
      }, 5000);

      callback({ success: true });
    });

    socket.on('disconnect', () => {
      const info = socketPlayerMap.get(socket.id);
      if (info) {
        GM.disconnectPlayer(info.roomCode, info.playerId);
        const room = GM.getRoom(info.roomCode);
        if (room) {
          broadcastState(io, room);
        }
        socketPlayerMap.delete(socket.id);
      }
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  function broadcastState(io, room) {
    for (const player of room.players) {
      const state = GM.getClientState(room, player.id);
      io.to(player.id).emit('game-state', state);
    }
  }

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
