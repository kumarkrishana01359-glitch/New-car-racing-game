# TurboRace - 3D Multiplayer Car Racing

A real-time 3D multiplayer car racing game where friends can create rooms, join with a 4-digit code, and race against each other live.

## Features

- **Room System**: Create a room with a unique 4-digit code or join a friend's room
- **Lobby**: See connected players, mark yourself as ready, host starts the race
- **3D Racing**: Three.js-powered 3D track with realistic car physics
- **Real-time Multiplayer**: See other players' cars moving live via Socket.io
- **Lap System**: First to complete 3 laps wins
- **Results Screen**: Podium and full results table

## How to Run

### Development (two terminals)

**Terminal 1 - Start the game server:**
```bash
npm run server
```

**Terminal 2 - Start the Vite dev server:**
```bash
npm run dev
```

Then open the URL shown by Vite (usually http://localhost:5173).

### Production (single command)

```bash
npm run build
npm start
```

This builds the client and serves everything from port 3001. Open http://localhost:3001.

## How to Play

1. Enter your name on the main menu
2. Click "Create Room" to get a 4-digit code, or "Join Room" to enter a friend's code
3. Share the room code with friends so they can join
4. All players mark themselves as ready
5. The host clicks "Start Race"
6. Use **WASD** or **Arrow Keys** to drive
7. Complete 3 laps to finish the race

## Controls

- **W / Up Arrow**: Accelerate
- **S / Down Arrow**: Brake / Reverse
- **A / Left Arrow**: Steer Left
- **D / Right Arrow**: Steer Right
- **Space**: Hard Brake

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **3D Graphics**: Three.js
- **Networking**: Socket.io
- **Server**: Node.js + Express + Socket.io
