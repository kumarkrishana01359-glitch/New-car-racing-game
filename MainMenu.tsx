import { useState } from 'react';
import { Car, Users, LogIn, Plus, Trophy } from 'lucide-react';
import { createRoom, joinRoom } from '@/socket';

interface MainMenuProps {
  connected: boolean;
  playerName: string;
  setPlayerName: (name: string) => void;
}

export function MainMenu({ connected, playerName, setPlayerName }: MainMenuProps) {
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'join'>('menu');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }
    if (!connected) {
      setError('Connecting to server... please wait');
      return;
    }
    setError('');
    createRoom(playerName.trim());
  };

  const handleJoin = () => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }
    if (!joinCode.trim() || joinCode.trim().length !== 4) {
      setError('Enter a valid 4-digit room code');
      return;
    }
    if (!connected) {
      setError('Connecting to server... please wait');
      return;
    }
    setError('');
    joinRoom(playerName.trim(), joinCode.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative">
      {/* Animated background grid */}
      <div className="absolute inset-0 racing-grid" />

      {/* Floating car silhouettes */}
      <div className="absolute top-10 left-10 opacity-10 text-white animate-pulse">
        <Car size={120} />
      </div>
      <div className="absolute bottom-10 right-10 opacity-10 text-white animate-pulse" style={{ animationDelay: '1s' }}>
        <Car size={120} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl shadow-2xl shadow-orange-500/30 mb-4 transform hover:scale-105 transition-transform">
            <Car size={48} className="text-white" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tight">
            TURBO<span className="text-orange-500">RACE</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm font-medium tracking-wide">
            3D MULTIPLAYER RACING
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
          {/* Name input */}
          <div className="mb-5">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={16}
              placeholder="Enter your racer name..."
              className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-medium placeholder:text-gray-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 transition-all"
            />
          </div>

          {mode === 'menu' ? (
            <>
              <button
                onClick={handleCreate}
                disabled={!connected}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] mb-3"
              >
                <Plus size={22} />
                Create Room
              </button>
              <button
                onClick={() => { setMode('join'); setError(''); }}
                disabled={!connected}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 hover:border-gray-600 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <LogIn size={22} />
                Join Room
              </button>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                  Room Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white text-3xl font-black text-center tracking-[0.5em] placeholder:text-gray-600 placeholder:tracking-[0.3em] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 transition-all"
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={!connected}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] mb-3"
              >
                <Users size={22} />
                Join Race
              </button>
              <button
                onClick={() => { setMode('menu'); setError(''); setJoinCode(''); }}
                className="w-full text-gray-400 hover:text-white font-medium py-2 text-sm transition-colors"
              >
                Back
              </button>
            </>
          )}

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {!connected && (
            <div className="mt-4 flex items-center justify-center gap-2 text-yellow-500/80 text-xs">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
              Connecting to server...
            </div>
          )}
          {connected && (
            <div className="mt-4 flex items-center justify-center gap-2 text-green-500/80 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              Connected
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="text-center mt-6 flex items-center justify-center gap-2 text-gray-500 text-xs">
          <Trophy size={14} />
          <span>First to complete 3 laps wins</span>
        </div>
      </div>
    </div>
  );
}
