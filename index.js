import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Serve the built client in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Room state: roomCode -> { hostId, players: Map<socketId, player>, raceActive, countdownEnd }
const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function playerList(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    ready: p.ready,
    finished: p.finished,
    finishTime: p.finishTime,
    isHost: p.id === room.hostId,
  }));
}

function emitLobbyUpdate(room) {
  const players = playerList(room);
  for (const p of room.players.values()) {
    io.to(p.id).emit('lobby_update', {
      roomCode: room.code,
      players,
      raceActive: room.raceActive,
    });
  }
}

function removePlayerFromRoom(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.has(socketId)) {
      const player = room.players.get(socketId);
      room.players.delete(socketId);

      // If host left, assign new host or delete room
      if (room.hostId === socketId) {
        const remaining = Array.from(room.players.keys());
        if (remaining.length === 0) {
          rooms.delete(code);
        } else {
          room.hostId = remaining[0];
          emitLobbyUpdate(room);
        }
      } else {
        emitLobbyUpdate(room);
      }

      socket.to(code).emit('player_left', { id: socketId, name: player.name });
    }
  }
}

// Spawn positions on the grid
function getSpawnPosition(index) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  return { x: -2 + col * 4, z: 20 + row * 6 };
}

function getSpawnPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push(getSpawnPosition(i));
  }
  return positions;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('create_room', ({ name }) => {
    removePlayerFromRoom(socket.id);

    const code = generateRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: new Map(),
      raceActive: false,
      countdownEnd: null,
      startTime: null,
    };
    rooms.set(code, room);

    const player = {
      id: socket.id,
      name: name || 'Player',
      ready: false,
      finished: false,
      finishTime: null,
    };
    room.players.set(socket.id, player);
    socket.join(code);

    socket.emit('room_created', { roomCode: code });
    emitLobbyUpdate(room);
  });

  socket.on('join_room', ({ name, roomCode }) => {
    removePlayerFromRoom(socket.id);

    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('join_error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.raceActive) {
      socket.emit('join_error', { message: 'Race already in progress. Try again later.' });
      return;
    }

    const player = {
      id: socket.id,
      name: name || 'Player',
      ready: false,
      finished: false,
      finishTime: null,
    };
    room.players.set(socket.id, player);
    socket.join(roomCode);

    socket.emit('room_joined', { roomCode });
    socket.to(roomCode).emit('player_joined', { id: socket.id, name: player.name });
    emitLobbyUpdate(room);
  });

  socket.on('set_ready', ({ ready }) => {
    for (const room of rooms.values()) {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        player.ready = ready;
        emitLobbyUpdate(room);
        break;
      }
    }
  });

  socket.on('start_race', () => {
    for (const room of rooms.values()) {
      if (room.hostId === socket.id && !room.raceActive) {
        const players = Array.from(room.players.values());
        const spawnPositions = getSpawnPositions(players.length);
        const raceStartAt = Date.now() + 4000; // 3s countdown + 1s buffer

        const spawnData = players.map((p, i) => ({
          id: p.id,
          name: p.name,
          position: spawnPositions[i],
          index: i,
        }));

        // Mark race active immediately so no new joins
        room.raceActive = true;
        room.startTime = raceStartAt;

        // Reset finished state
        for (const p of room.players.values()) {
          p.finished = false;
          p.finishTime = null;
        }

        io.to(room.code).emit('race_start', {
          spawnData,
          startTime: raceStartAt,
        });
        break;
      }
    }
  });

  // Real-time position sync
  socket.on('player_update', ({ position, rotation, velocity }) => {
    // Relay to others in the same room
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id) && room.raceActive) {
        socket.to(code).emit('player_moved', {
          id: socket.id,
          position,
          rotation,
          velocity,
        });
        break;
      }
    }
  });

  socket.on('player_finished', ({ finishTime }) => {
    for (const room of rooms.values()) {
      if (room.players.has(socket.id) && room.raceActive) {
        const player = room.players.get(socket.id);
        if (!player.finished) {
          player.finished = true;
          player.finishTime = finishTime;
          io.to(room.code).emit('player_finished_update', {
            id: socket.id,
            name: player.name,
            finishTime,
          });
        }

        // Check if all finished
        const allFinished = Array.from(room.players.values()).every(p => p.finished);
        if (allFinished) {
          room.raceActive = false;
          const results = playerList(room)
            .filter(p => p.finished)
            .sort((a, b) => a.finishTime - b.finishTime);
          io.to(room.code).emit('race_results', { results });
        }
        break;
      }
    }
  });

  socket.on('leave_room', () => {
    removePlayerFromRoom(socket.id);
    socket.emit('lobby_update', { roomCode: null, players: [], raceActive: false });
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    removePlayerFromRoom(socket.id);
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Racing server running on port ${PORT}`);
});
