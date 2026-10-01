import { Trophy, Medal, Home, RotateCcw } from 'lucide-react';
import type { RaceResult } from '@/types';

interface ResultsProps {
  results: RaceResult[];
  myId: string;
  onPlayAgain: () => void;
  onExit: () => void;
}

export function Results({ results, myId, onPlayAgain, onExit }: ResultsProps) {
  const myResult = results.find(r => r.id === myId);
  const myPlacement = results.findIndex(r => r.id === myId) + 1;

  const formatTime = (ms: number) => {
    const totalSec = ms / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toFixed(2);
    return mins > 0 ? `${mins}:${secs.padStart(5, '0')}` : `${secs}s`;
  };

  const podiumColors = [
    'from-yellow-400 to-yellow-600',
    'from-gray-300 to-gray-500',
    'from-orange-400 to-orange-600',
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 racing-grid" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Trophy header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full shadow-2xl shadow-yellow-500/30 mb-4 animate-bounce-slow">
            <Trophy size={48} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-white">Race Results</h1>
          {myResult && (
            <div className="mt-2 text-lg">
              <span className="text-gray-400">You finished </span>
              <span className={`font-black ${myPlacement === 1 ? 'text-yellow-400' : myPlacement === 2 ? 'text-gray-300' : myPlacement === 3 ? 'text-orange-400' : 'text-white'}`}>
                #{myPlacement}
              </span>
              <span className="text-gray-400"> of {results.length}</span>
            </div>
          )}
        </div>

        {/* Podium */}
        {results.length >= 3 && (
          <div className="flex items-end justify-center gap-3 mb-6">
            {/* 2nd place */}
            <PodiumColumn result={results[1]} place={2} colorClass={podiumColors[1]} height={80} delay={0.1} />
            {/* 1st place */}
            <PodiumColumn result={results[0]} place={1} colorClass={podiumColors[0]} height={110} delay={0} />
            {/* 3rd place */}
            <PodiumColumn result={results[2]} place={3} colorClass={podiumColors[2]} height={60} delay={0.2} />
          </div>
        )}

        {/* Full results table */}
        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-4 shadow-2xl mb-6">
          <div className="space-y-2">
            {results.map((result, i) => (
              <div
                key={result.id}
                className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
                  result.id === myId
                    ? 'bg-orange-500/10 border border-orange-500/30'
                    : 'bg-gray-800/40 border border-gray-700/30'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${podiumColors[i] || 'from-gray-600 to-gray-800'} flex items-center justify-center text-white font-black text-sm shadow-lg`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{result.name}</span>
                    {result.id === myId && <span className="text-orange-400 text-xs font-medium">(You)</span>}
                    {result.isHost && <span className="text-yellow-400 text-xs">Host</span>}
                  </div>
                </div>
                <div className="text-white font-bold tabular-nums">{formatTime(result.finishTime)}</div>
                {i < 3 && <Medal className={i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : 'text-orange-400'} size={18} />}
              </div>
            ))}
            {/* DNF players would be listed here if any */}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <RotateCcw size={20} />
            Back to Lobby
          </button>
          <button
            onClick={onExit}
            className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Home size={20} />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function PodiumColumn({
  result,
  place,
  colorClass,
  height,
  delay,
}: {
  result: RaceResult;
  place: number;
  colorClass: string;
  height: number;
  delay: number;
}) {
  const formatTime = (ms: number) => {
    const sec = (ms / 1000).toFixed(2);
    return `${sec}s`;
  };

  const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';

  return (
    <div className="flex flex-col items-center" style={{ animationDelay: `${delay}s` }}>
      <div className="text-3xl mb-1">{medal}</div>
      <div className="text-white font-bold text-sm mb-1 max-w-[80px] truncate">{result.name}</div>
      <div className="text-gray-400 text-xs mb-2 tabular-nums">{formatTime(result.finishTime)}</div>
      <div
        className={`w-20 bg-gradient-to-t ${colorClass} rounded-t-lg flex items-start justify-center pt-2 shadow-lg podium-rise`}
        style={{ height: `${height}px`, animationDelay: `${delay}s` }}
      >
        <span className="text-white font-black text-2xl">{place}</span>
      </div>
    </div>
  );
}
