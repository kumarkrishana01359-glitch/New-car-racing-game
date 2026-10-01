import { useState } from 'react';
import { Users, Copy, Check, Crown, Play, LogOut, CheckCircle, Circle } from 'lucide-react';
import type { LobbyUpdate, PlayerInfo } from '@/types';
import { setReady, startRace, leaveRoom } from '@/socket';

interface LobbyProps {
  lobby: LobbyUpdate;
  myId: string;
  onLeave: () => void;
}

export function Lobby({ lobby, myId, onLeave }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const myPlayer = lobby.players.find(p => p.id === myId);
  const isHost = myPlayer?.isHost ?? false;
  const allReady = lobby.players.length >= 2 && lobby.players.every(p => p.ready);

  const handleCopy = () => {
    navigator.clipboard?.writeText(lobby.roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleLeave = () => {
    leaveRoom();
    onLeave();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 racing-grid" />

      <div className="relative z-10 w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-orange-500 text-sm font-bold uppercase tracking-wider mb-2">
            <Users size={18} />
            Waiting Room
          </div>
          <h1 className="text-3xl font-black text-white">Race Lobby</h1>
        </div>

        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
          {/* Room Code */}
          <div className="flex items-center justify-between bg-gray-800/60 rounded-xl p-4 mb-5 border border-gray-700/50">
            <div>
              <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">
                Room Code
              </div>
              <div className="text-3xl font-black text-white tracking-[0.3em]">
                {lobby.roomCode}
              </div>
            </div>
            <button
              onClick={handleCopy}
              className="bg-gray-700 hover:bg-gray-600 text-white p-3 rounded-lg transition-colors"
              title="Copy room code"
            >
              {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
            </button>
          </div>
          {copied && <div className="text-green-400 text-xs text-right -mt-2 mb-3 font-medium">Copied!</div>}

          {/* Players list */}
          <div className="mb-5">
            <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">
              Players ({lobby.players.length}/8)
            </div>
            <div className="space-y-2">
              {lobby.players.map((player, i) => (
                <PlayerRow key={player.id} player={player} index={i} />
              ))}
              {lobby.players.length < 2 && (
                <div className="text-center py-4 text-gray-500 text-sm italic">
                  Waiting for more players to join...
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {isHost ? (
              <button
                onClick={() => startRace()}
                disabled={!allReady}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play size={22} />
                Start Race
              </button>
            ) : (
              <button
                onClick={() => setReady(!myPlayer?.ready)}
                className={`w-full font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  myPlayer?.ready
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {myPlayer?.ready ? <CheckCircle size={22} /> : <Circle size={22} />}
                {myPlayer?.ready ? 'Ready!' : 'Mark as Ready'}
              </button>
            )}

            {isHost && !allReady && lobby.players.length >= 2 && (
              <div className="text-center text-yellow-500/80 text-sm">
                Waiting for all players to be ready...
              </div>
            )}
            {isHost && lobby.players.length < 2 && (
              <div className="text-center text-yellow-500/80 text-sm">
                Need at least 2 players to start
              </div>
            )}

            <button
              onClick={handleLeave}
              className="w-full text-gray-400 hover:text-red-400 font-medium py-2 text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut size={16} />
              Leave Room
            </button>
          </div>
        </div>

        {/* Share hint */}
        <div className="text-center mt-4 text-gray-500 text-xs">
          Share code <span className="text-orange-400 font-bold">{lobby.roomCode}</span> with friends so they can join
        </div>
      </div>
    </div>
  );
}

function PlayerRow({ player, index }: { player: PlayerInfo; index: number }) {
  const colors = [
    'from-red-500 to-red-700',
    'from-blue-500 to-blue-700',
    'from-green-500 to-green-700',
    'from-yellow-500 to-yellow-700',
    'from-pink-500 to-pink-700',
    'from-cyan-500 to-cyan-700',
    'from-gray-300 to-gray-500',
    'from-purple-500 to-purple-700',
  ];
  const colorClass = colors[index % colors.length];

  return (
    <div className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/30 rounded-lg p-3 hover:bg-gray-800/60 transition-colors">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">{player.name}</span>
          {player.isHost && (
            <span className="inline-flex items-center gap-1 text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded-full">
              <Crown size={10} />
              Host
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400">
          {player.ready ? (
            <span className="text-green-400 flex items-center gap-1">
              <CheckCircle size={10} /> Ready
            </span>
          ) : (
            <span className="text-gray-500 flex items-center gap-1">
              <Circle size={10} /> Not Ready
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
