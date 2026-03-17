'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';

export default function LobbyPage() {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'join'>('menu');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Initialize socket connection on mount
  useEffect(() => {
    getSocket();
  }, []);

  const handleCreate = () => {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    setLoading(true);
    setError('');
    const socket = getSocket();

    // Set a timeout in case connection never establishes
    const timeout = setTimeout(() => {
      setLoading(false);
      setError('Could not connect to server. Try refreshing.');
    }, 5000);

    socket.emit('create-room', { playerName: playerName.trim() }, (res: any) => {
      clearTimeout(timeout);
      setLoading(false);
      if (res.success) {
        sessionStorage.setItem('playerName', playerName.trim());
        sessionStorage.setItem('roomCode', res.state.roomCode);
        router.push(`/game/${res.state.roomCode}`);
      } else {
        setError(res.error || 'Failed to create room');
      }
    });
  };

  const handleJoin = () => {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    if (!roomCode.trim()) { setError('Enter room code'); return; }
    setLoading(true);
    setError('');
    const socket = getSocket();

    const timeout = setTimeout(() => {
      setLoading(false);
      setError('Could not connect to server. Try refreshing.');
    }, 5000);

    socket.emit('join-room', { roomCode: roomCode.trim().toUpperCase(), playerName: playerName.trim() }, (res: any) => {
      clearTimeout(timeout);
      setLoading(false);
      if (res.success) {
        sessionStorage.setItem('playerName', playerName.trim());
        sessionStorage.setItem('roomCode', roomCode.trim().toUpperCase());
        router.push(`/game/${roomCode.trim().toUpperCase()}`);
      } else {
        setError(res.error || 'Failed to join room');
      }
    });
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-black tracking-tight text-shadow">
            <span className="text-gold">B</span>ANG<span className="text-gold">!</span>
          </h1>
          <p className="text-white/50 text-sm mt-2">The Card Memory Game</p>
        </div>

        {/* Main Menu */}
        {mode === 'menu' && (
          <div className="space-y-3 animate-slide-up">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20
                text-white placeholder-white/40 text-center text-lg
                focus:outline-none focus:border-gold focus:bg-white/15
                transition-all"
            />
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gold hover:bg-gold-light
                text-felt-dark font-bold text-lg
                transition-all active:scale-[0.98]
                disabled:opacity-50 card-shadow"
            >
              {loading ? 'Creating...' : 'Create Game'}
            </button>
            <button
              onClick={() => { if (!playerName.trim()) { setError('Enter your name'); return; } setError(''); setMode('join'); }}
              className="w-full py-4 rounded-xl glass hover:bg-white/15
                text-white font-semibold text-lg
                transition-all active:scale-[0.98]"
            >
              Join Game
            </button>
          </div>
        )}

        {/* Join Room */}
        {mode === 'join' && (
          <div className="space-y-3 animate-slide-up">
            <p className="text-center text-white/70">
              Playing as <span className="text-gold font-semibold">{playerName}</span>
            </p>
            <input
              type="text"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20
                text-white placeholder-white/40 text-center text-2xl tracking-[0.5em]
                focus:outline-none focus:border-gold focus:bg-white/15
                transition-all uppercase"
            />
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gold hover:bg-gold-light
                text-felt-dark font-bold text-lg
                transition-all active:scale-[0.98]
                disabled:opacity-50 card-shadow"
            >
              {loading ? 'Joining...' : 'Join Room'}
            </button>
            <button
              onClick={() => { setMode('menu'); setError(''); }}
              className="w-full py-3 rounded-xl text-white/60 hover:text-white
                transition-all text-sm"
            >
              ← Back
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-center text-sm animate-bounce-in">
            {error}
          </div>
        )}

        {/* Rules hint */}
        <div className="mt-8 text-center">
          <p className="text-white/30 text-xs">
            2-6 players • Remember your cards • Score lowest • First to -60 wins
          </p>
        </div>
      </div>
    </div>
  );
}
