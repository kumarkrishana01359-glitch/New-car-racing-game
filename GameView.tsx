import { useRef, useEffect, useState } from 'react';
import { GameEngine } from '@/game/GameEngine';
import { getSocket } from '@/socket';
import type { RaceStartData, PlayerMovedData } from '@/types';
import { Gauge, Flag, Timer, Trophy } from 'lucide-react';

interface GameViewProps {
  raceData: RaceStartData;
  myId: string;
  onFinish: (time: number) => void;
  onExit: () => void;
}

export function GameView({ raceData, myId, onFinish, onExit }: GameViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [lap, setLap] = useState(1);
  const [speed, setSpeed] = useState(0);
  const [timer, setTimer] = useState(0);
  const [finishedPlayers, setFinishedPlayers] = useState<{ id: string; name: string; finishTime: number }[]>([]);
  const [myFinishTime, setMyFinishTime] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new GameEngine(containerRef.current);
    engineRef.current = engine;

    engine.onCountdownUpdate = (count) => {
      setCountdown(count);
    };
    engine.onLapUpdate = (l) => {
      setLap(Math.min(l, 3));
    };
    engine.onSpeedUpdate = (s) => {
      setSpeed(s);
    };
    engine.onRaceFinish = (time) => {
      setMyFinishTime(time);
      onFinish(time);
    };

    engine.initRace(raceData.spawnData, myId, raceData.startTime);
    engine.start();

    // Listen for remote player movements
    const socket = getSocket();
    const onPlayerMoved = (data: PlayerMovedData) => {
      engine.updateRemoteCar(data);
    };
    socket.on('player_moved', onPlayerMoved);

    const onPlayerFinishedUpdate = (data: { id: string; name: string; finishTime: number }) => {
      setFinishedPlayers(prev => {
        if (prev.some(p => p.id === data.id)) return prev;
        return [...prev, data];
      });
    };
    socket.on('player_finished_update', onPlayerFinishedUpdate);

    // Timer tick
    const timerInterval = setInterval(() => {
      if (countdown <= 0) {
        setTimer(engine.getElapsedTime());
      }
    }, 100);

    return () => {
      clearInterval(timerInterval);
      socket.off('player_moved', onPlayerMoved);
      socket.off('player_finished_update', onPlayerFinishedUpdate);
      engine.dispose();
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (ms: number) => {
    const totalSec = ms / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toFixed(2);
    return mins > 0 ? `${mins}:${secs.padStart(5, '0')}` : `${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* 3D Canvas container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD - Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between pointer-events-none z-10">
        {/* Lap counter */}
        <div className="bg-gray-900/70 backdrop-blur-md border border-gray-700/50 rounded-xl px-4 py-2 flex items-center gap-2">
          <Flag className="text-orange-500" size={20} />
          <div>
            <div className="text-xs text-gray-400 font-bold uppercase">Lap</div>
            <div className="text-white font-black text-lg leading-none">
              {Math.min(lap, 3)}<span className="text-gray-500 text-sm">/3</span>
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="bg-gray-900/70 backdrop-blur-md border border-gray-700/50 rounded-xl px-4 py-2 flex items-center gap-2">
          <Timer className="text-cyan-400" size={20} />
          <div>
            <div className="text-xs text-gray-400 font-bold uppercase">Time</div>
            <div className="text-white font-black text-lg leading-none tabular-nums">
              {formatTime(timer * 1000)}
            </div>
          </div>
        </div>

        {/* Exit button */}
        <button
          onClick={onExit}
          className="bg-gray-900/70 backdrop-blur-md border border-gray-700/50 hover:border-red-500/50 text-gray-300 hover:text-red-400 rounded-xl px-3 py-2 text-sm font-medium transition-colors pointer-events-auto"
        >
          Exit
        </button>
      </div>

      {/* HUD - Speedometer (bottom right) */}
      <div className="absolute bottom-6 right-6 pointer-events-none z-10">
        <div className="bg-gray-900/70 backdrop-blur-md border border-gray-700/50 rounded-2xl p-4 w-32">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="text-orange-500" size={18} />
            <span className="text-xs text-gray-400 font-bold uppercase">Speed</span>
          </div>
          <div className="text-white font-black text-3xl leading-none tabular-nums">
            {Math.round(speed)}
          </div>
          <div className="text-gray-500 text-xs">km/h</div>
          {/* Speed bar */}
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-100"
              style={{ width: `${Math.min(speed / 55 * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* HUD - Finished players list (bottom left) */}
      {finishedPlayers.length > 0 && (
        <div className="absolute bottom-6 left-6 pointer-events-none z-10">
          <div className="bg-gray-900/70 backdrop-blur-md border border-gray-700/50 rounded-xl p-3 max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="text-yellow-400" size={16} />
              <span className="text-xs text-gray-400 font-bold uppercase">Finished</span>
            </div>
            <div className="space-y-1">
              {finishedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className={`font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-400'}`}>
                    #{i + 1}
                  </span>
                  <span className="text-white font-medium flex-1 truncate">{p.name}</span>
                  <span className="text-gray-400 tabular-nums text-xs">{formatTime(p.finishTime)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Countdown overlay */}
      {countdown > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div
            key={countdown}
            className="text-9xl font-black text-white drop-shadow-2xl countdown-pop"
            style={{ textShadow: '0 0 40px rgba(255, 100, 0, 0.8)' }}
          >
            {countdown}
          </div>
        </div>
      )}

      {/* GO! overlay */}
      {countdown === 0 && timer < 1.5 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="text-8xl font-black text-green-400 drop-shadow-2xl countdown-pop" style={{ textShadow: '0 0 40px rgba(50, 200, 50, 0.8)' }}>
            GO!
          </div>
        </div>
      )}

      {/* Finished overlay */}
      {myFinishTime !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-gray-900/90 backdrop-blur-xl border border-orange-500/30 rounded-2xl p-8 text-center max-w-sm scale-in">
            <Trophy className="text-yellow-400 mx-auto mb-3" size={48} />
            <div className="text-2xl font-black text-white mb-1">Race Finished!</div>
            <div className="text-gray-400 mb-4">Your time: <span className="text-orange-400 font-bold">{formatTime(myFinishTime)}</span></div>
            <div className="text-sm text-gray-500">Waiting for other players...</div>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-10">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700/30 rounded-lg px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
          <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-bold">W</kbd> Accelerate</span>
          <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-bold">S</kbd> Brake/Reverse</span>
          <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-bold">A/D</kbd> Steer</span>
          <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-bold">Space</kbd> Brake</span>
        </div>
      </div>
    </div>
  );
}
