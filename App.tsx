import { useState, useEffect } from 'react';
import { MainMenu } from '@/components/MainMenu';
import { Lobby } from '@/components/Lobby';
import { GameView } from '@/components/GameView';
import { Results } from '@/components/Results';
import { getSocket } from '@/socket';
import type { Screen, LobbyUpdate, RaceStartData, RaceResult } from '@/types';

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [lobby, setLobby] = useState<LobbyUpdate>({ roomCode: null, players: [], raceActive: false });
  const [raceData, setRaceData] = useState<RaceStartData | null>(null);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [myId, setMyId] = useState('');

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      setConnected(true);
      setMyId(socket.id || '');
    });
    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('lobby_update', (data: LobbyUpdate) => {
      setLobby(data);
    });

    socket.on('room_created', () => {
      setScreen('lobby');
    });

    socket.on('room_joined', () => {
      setScreen('lobby');
    });

    socket.on('join_error', (data: { message: string }) => {
      alert(data.message);
    });

    socket.on('race_start', (data: RaceStartData) => {
      setRaceData(data);
      setResults([]);
      setScreen('race');
    });

    socket.on('race_results', (data: { results: RaceResult[] }) => {
      setResults(data.results);
      setScreen('results');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('lobby_update');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('join_error');
      socket.off('race_start');
      socket.off('race_results');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeaveLobby = () => {
    setScreen('menu');
    setLobby({ roomCode: null, players: [], raceActive: false });
  };

  const handleExitRace = () => {
    setScreen('menu');
    setRaceData(null);
  };

  const handlePlayAgain = () => {
    setScreen('lobby');
    setResults([]);
  };

  const handleExitResults = () => {
    setScreen('menu');
    setResults([]);
    setLobby({ roomCode: null, players: [], raceActive: false });
  };

  if (screen === 'race' && raceData) {
    return (
      <GameView
        raceData={raceData}
        myId={myId}
        onFinish={() => {}}
        onExit={handleExitRace}
      />
    );
  }

  if (screen === 'results') {
    return (
      <Results
        results={results}
        myId={myId}
        onPlayAgain={handlePlayAgain}
        onExit={handleExitResults}
      />
    );
  }

  if (screen === 'lobby') {
    return <Lobby lobby={lobby} myId={myId} onLeave={handleLeaveLobby} />;
  }

  return (
    <MainMenu
      connected={connected}
      playerName={playerName}
      setPlayerName={setPlayerName}
    />
  );
}

export default App;
