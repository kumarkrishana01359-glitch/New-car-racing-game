import type {
  LobbyUpdate,
  RaceStartData,
  PlayerMovedData,
  RaceResultsData,
  PlayerInfo,
  RaceResult,
} from '@/types';

type EventHandler = (data: any) => void;
type ConnectHandler = () => void;

interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  finished: boolean;
  finishTime: number | null;
  isHost: boolean;
}

interface RoomRecord {
  roomCode: string;
  hostId: string;
  players: RoomPlayer[];
  raceActive: boolean;
  createdAt: number;
}

type Message =
  | { type: 'join_request'; id: string; name: string; roomCode: string; ts: number }
  | { type: 'join_response'; ok: boolean; message?: string; roomCode: string; toId: string; ts: number }
  | { type: 'lobby_state'; players: RoomPlayer[]; roomCode: string; raceActive: boolean; ts: number }
  | { type: 'ready_update'; id: string; ready: boolean; roomCode: string; ts: number }
  | { type: 'race_start'; spawnData: RaceStartData['spawnData']; startTime: number; roomCode: string; ts: number }
  | { type: 'player_moved'; id: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; velocity: number; roomCode: string; ts: number }
  | { type: 'player_finished'; id: string; name: string; finishTime: number; roomCode: string; ts: number }
  | { type: 'race_results'; results: RaceResult[]; roomCode: string; ts: number }
  | { type: 'player_left'; id: string; name: string; roomCode: string; ts: number }
  | { type: 'host_takeover'; roomCode: string; newHostId: string; ts: number };

const ROOMS_KEY = 'turborace-rooms';
const MSG_PREFIX = 'turborace-msg-';
const STALE_ROOM_MS = 2 * 60 * 60 * 1000;

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function generateRoomCode(existingCodes: string[]): string {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (existingCodes.includes(code));
  return code;
}

function getSpawnPosition(index: number) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  return { x: -2 + col * 4, z: 20 + row * 6 };
}

function getRooms(): Record<string, RoomRecord> {
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, RoomRecord>;
    const now = Date.now();
    const fresh: Record<string, RoomRecord> = {};
    for (const [code, rec] of Object.entries(parsed)) {
      if (now - rec.createdAt < STALE_ROOM_MS) {
        fresh[code] = rec;
      }
    }
    return fresh;
  } catch {
    return {};
  }
}

function saveRooms(rooms: Record<string, RoomRecord>) {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch {
    // ignore quota errors
  }
}

function getRoom(code: string): RoomRecord | null {
  const rooms = getRooms();
  return rooms[code] ?? null;
}

function putRoom(rec: RoomRecord) {
  const rooms = getRooms();
  rooms[rec.roomCode] = rec;
  saveRooms(rooms);
}

function deleteRoom(code: string) {
  const rooms = getRooms();
  delete rooms[code];
  saveRooms(rooms);
}

class MockSocket {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private connectHandlers: Set<ConnectHandler> = new Set();
  private disconnectHandlers: Set<ConnectHandler> = new Set();
  private channel: BroadcastChannel | null = null;
  private roomCode: string | null = null;
  private myId: string;
  private myName: string = '';
  private isHost: boolean = false;
  private players: Map<string, RoomPlayer> = new Map();
  private raceActive: boolean = false;
  private connected: boolean = false;
  private joinTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private msgCounter: number = 0;

  constructor() {
    this.myId = generateId();
  }

  get id(): string {
    return this.myId;
  }

  connect() {
    if (this.connected) return;
    this.connected = true;

    // Listen for cross-tab messages via localStorage storage events
    this.storageListener = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(MSG_PREFIX) || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as Message;
        this.handleMessage(msg);
      } catch {
        // ignore parse errors
      }
    };
    window.addEventListener('storage', this.storageListener);

    setTimeout(() => {
      this.connectHandlers.forEach(h => h());
    }, 0);
  }

  on(event: string, handler: EventHandler | ConnectHandler) {
    if (event === 'connect') {
      this.connectHandlers.add(handler as ConnectHandler);
      if (this.connected) {
        (handler as ConnectHandler)();
      }
    } else if (event === 'disconnect') {
      this.disconnectHandlers.add(handler as ConnectHandler);
    } else {
      if (!this.handlers.has(event)) {
        this.handlers.set(event, new Set());
      }
      this.handlers.get(event)!.add(handler as EventHandler);
    }
  }

  off(event: string, handler?: EventHandler | ConnectHandler) {
    if (event === 'connect') {
      if (handler) this.connectHandlers.delete(handler as ConnectHandler);
      else this.connectHandlers.clear();
    } else if (event === 'disconnect') {
      if (handler) this.disconnectHandlers.delete(handler as ConnectHandler);
      else this.disconnectHandlers.clear();
    } else {
      if (handler) {
        this.handlers.get(event)?.delete(handler as EventHandler);
      } else {
        this.handlers.delete(event);
      }
    }
  }

  private emitEvent(event: string, data?: any) {
    this.handlers.get(event)?.forEach(h => h(data));
  }

  private setupChannel(code: string) {
    this.teardownChannel();
    this.roomCode = code;
    // BroadcastChannel as a fast secondary transport (works in many environments)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(`turborace-${code}`);
        this.channel.onmessage = (e: MessageEvent) => {
          if (e.data) this.handleMessage(e.data as Message);
        };
      } catch {
        this.channel = null;
      }
    }
  }

  private teardownChannel() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.roomCode = null;
  }

  private send(msg: Message) {
    // BroadcastChannel: delivers to OTHER tabs on the same channel
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch {
        // ignore
      }
    }
    // localStorage: the storage event fires in OTHER tabs
    // Use a unique key per message with a timestamp+counter to avoid collisions
    const key = `${MSG_PREFIX}${this.roomCode}-${Date.now()}-${this.msgCounter++}`;
    try {
      localStorage.setItem(key, JSON.stringify(msg));
      // Clean up immediately — the value was already read by the storage event
      setTimeout(() => {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      }, 500);
    } catch {
      // ignore quota errors
    }
  }

  private handleMessage(msg: Message) {
    // Ignore our own messages (localStorage storage events don't fire in the sender's tab,
    // but BroadcastChannel also doesn't deliver to the sender — this is a safety net)
    const senderId = (msg as any).id || (msg as any).toId;
    if (senderId === this.myId && msg.type !== 'join_response' && msg.type !== 'lobby_state' && msg.type !== 'race_start' && msg.type !== 'race_results' && msg.type !== 'host_takeover') {
      return;
    }

    switch (msg.type) {
      case 'join_request':
        if (this.isHost && this.roomCode === msg.roomCode) {
          if (this.players.size >= 8) {
            this.send({
              type: 'join_response',
              ok: false,
              message: 'Room is full (8 players max)',
              roomCode: this.roomCode!,
              toId: msg.id,
              ts: Date.now(),
            });
            return;
          }
          if (this.raceActive) {
            this.send({
              type: 'join_response',
              ok: false,
              message: 'Race already in progress',
              roomCode: this.roomCode!,
              toId: msg.id,
              ts: Date.now(),
            });
            return;
          }
          const newPlayer: RoomPlayer = {
            id: msg.id,
            name: msg.name,
            ready: false,
            finished: false,
            finishTime: null,
            isHost: false,
          };
          this.players.set(msg.id, newPlayer);
          this.persistRoom();
          this.send({
            type: 'join_response',
            ok: true,
            roomCode: this.roomCode!,
            toId: msg.id,
            ts: Date.now(),
          });
          this.broadcastLobbyState();
        }
        break;

      case 'join_response':
        if (msg.toId !== this.myId) return;
        if (this.joinTimeout) {
          clearTimeout(this.joinTimeout);
          this.joinTimeout = null;
        }
        if (msg.ok) {
          this.roomCode = msg.roomCode;
          if (!this.players.has(this.myId)) {
            this.players.set(this.myId, {
              id: this.myId,
              name: this.myName,
              ready: false,
              finished: false,
              finishTime: null,
              isHost: false,
            });
          }
          this.emitEvent('room_joined', { roomCode: msg.roomCode });
        } else {
          this.emitEvent('join_error', { message: msg.message || 'Failed to join' });
          this.teardownChannel();
        }
        break;

      case 'lobby_state':
        if (msg.roomCode === this.roomCode) {
          this.players.clear();
          for (const p of msg.players) {
            this.players.set(p.id, { ...p });
          }
          if (this.players.has(this.myId)) {
            const me = this.players.get(this.myId)!;
            this.isHost = me.isHost;
          }
          this.raceActive = msg.raceActive;
          const lobbyUpdate: LobbyUpdate = {
            roomCode: msg.roomCode,
            players: msg.players,
            raceActive: msg.raceActive,
          };
          this.emitEvent('lobby_update', lobbyUpdate);
        }
        break;

      case 'ready_update':
        if (this.isHost && this.roomCode === msg.roomCode) {
          const p = this.players.get(msg.id);
          if (p) {
            p.ready = msg.ready;
            this.persistRoom();
            this.broadcastLobbyState();
          }
        }
        break;

      case 'race_start':
        if (msg.roomCode === this.roomCode) {
          this.raceActive = true;
          const raceData: RaceStartData = {
            spawnData: msg.spawnData,
            startTime: msg.startTime,
          };
          this.emitEvent('race_start', raceData);
        }
        break;

      case 'player_moved':
        if (msg.roomCode === this.roomCode && msg.id !== this.myId) {
          const data: PlayerMovedData = {
            id: msg.id,
            position: msg.position,
            rotation: msg.rotation,
            velocity: msg.velocity,
          };
          this.emitEvent('player_moved', data);
        }
        break;

      case 'player_finished':
        if (msg.roomCode === this.roomCode) {
          this.emitEvent('player_finished_update', {
            id: msg.id,
            name: msg.name,
            finishTime: msg.finishTime,
          });
          if (this.isHost) {
            const p = this.players.get(msg.id);
            if (p) {
              p.finished = true;
              p.finishTime = msg.finishTime;
            }
            const allFinished = Array.from(this.players.values()).every(p => p.finished);
            if (allFinished) {
              this.raceActive = false;
              this.persistRoom();
              const results: RaceResult[] = Array.from(this.players.values())
                .filter(p => p.finished)
                .sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0))
                .map(p => ({
                  id: p.id,
                  name: p.name,
                  finishTime: p.finishTime!,
                  isHost: p.isHost,
                }));
              this.send({ type: 'race_results', results, roomCode: this.roomCode!, ts: Date.now() });
            }
          }
        }
        break;

      case 'race_results':
        if (msg.roomCode === this.roomCode) {
          this.raceActive = false;
          this.emitEvent('race_results', { results: msg.results });
        }
        break;

      case 'player_left':
        if (this.isHost && this.roomCode === msg.roomCode) {
          this.players.delete(msg.id);
          if (this.players.size === 0) {
            this.persistRoom();
            deleteRoom(this.roomCode);
            this.teardownChannel();
            this.isHost = false;
          } else {
            this.persistRoom();
            this.broadcastLobbyState();
          }
        }
        this.emitEvent('lobby_update', {
          roomCode: this.roomCode,
          players: Array.from(this.players.values()),
          raceActive: this.raceActive,
        });
        break;

      case 'host_takeover':
        if (msg.roomCode === this.roomCode && msg.newHostId === this.myId) {
          this.isHost = true;
          const me = this.players.get(this.myId);
          if (me) me.isHost = true;
          this.persistRoom();
          this.broadcastLobbyState();
        }
        break;
    }
  }

  private persistRoom() {
    if (!this.roomCode) return;
    const rec: RoomRecord = {
      roomCode: this.roomCode,
      hostId: this.myId,
      players: Array.from(this.players.values()),
      raceActive: this.raceActive,
      createdAt: Date.now(),
    };
    putRoom(rec);
  }

  private broadcastLobbyState() {
    if (!this.roomCode) return;
    const players = Array.from(this.players.values());
    this.send({
      type: 'lobby_state',
      players,
      roomCode: this.roomCode,
      raceActive: this.raceActive,
      ts: Date.now(),
    });
    const lobbyUpdate: LobbyUpdate = {
      roomCode: this.roomCode,
      players,
      raceActive: this.raceActive,
    };
    this.emitEvent('lobby_update', lobbyUpdate);
  }

  emit(event: string, data?: any) {
    switch (event) {
      case 'create_room': {
        const { name } = data;
        this.myName = name;
        const existingCodes = Object.keys(getRooms());
        const code = generateRoomCode(existingCodes);
        this.isHost = true;
        this.raceActive = false;
        this.players.clear();
        this.players.set(this.myId, {
          id: this.myId,
          name,
          ready: false,
          finished: false,
          finishTime: null,
          isHost: true,
        });
        this.setupChannel(code);
        this.persistRoom();
        // Heartbeat to keep room alive in localStorage
        this.heartbeatInterval = setInterval(() => {
          if (this.isHost && this.roomCode) {
            this.persistRoom();
          }
        }, 30000);
        this.emitEvent('room_created', { roomCode: code });
        this.broadcastLobbyState();
        break;
      }

      case 'join_room': {
        const { name, roomCode } = data;
        this.myName = name;
        this.isHost = false;

        // First check if the room exists in the localStorage registry
        const room = getRoom(roomCode);
        if (!room) {
          this.emitEvent('join_error', { message: 'Room not found. Check the code and try again.' });
          return;
        }
        if (room.raceActive) {
          this.emitEvent('join_error', { message: 'Race already in progress' });
          return;
        }
        if (room.players.length >= 8) {
          this.emitEvent('join_error', { message: 'Room is full (8 players max)' });
          return;
        }

        // Room exists — set up channel and send join request to host
        this.setupChannel(roomCode);
        this.send({ type: 'join_request', id: this.myId, name, roomCode, ts: Date.now() });

        // Timeout if host doesn't respond
        if (this.joinTimeout) clearTimeout(this.joinTimeout);
        this.joinTimeout = setTimeout(() => {
          if (!this.players.has(this.myId)) {
            this.emitEvent('join_error', { message: 'Could not connect to room host. Please try again.' });
            this.teardownChannel();
          }
        }, 5000);
        break;
      }

      case 'set_ready': {
        const { ready } = data;
        const me = this.players.get(this.myId);
        if (me) me.ready = ready;
        if (this.roomCode) {
          this.send({ type: 'ready_update', id: this.myId, ready, roomCode: this.roomCode, ts: Date.now() });
        }
        if (this.isHost) {
          this.persistRoom();
          this.broadcastLobbyState();
        }
        break;
      }

      case 'start_race': {
        if (this.isHost && this.roomCode) {
          const playerList = Array.from(this.players.values());
          const spawnData = playerList.map((p, i) => ({
            id: p.id,
            name: p.name,
            position: getSpawnPosition(i),
            index: i,
          }));
          const startTime = Date.now() + 4000;
          this.raceActive = true;
          for (const p of this.players.values()) {
            p.finished = false;
            p.finishTime = null;
          }
          this.persistRoom();
          this.send({
            type: 'race_start',
            spawnData,
            startTime,
            roomCode: this.roomCode,
            ts: Date.now(),
          });
          const raceData: RaceStartData = { spawnData, startTime };
          this.emitEvent('race_start', raceData);
        }
        break;
      }

      case 'player_update': {
        const { position, rotation, velocity } = data;
        if (this.roomCode) {
          this.send({
            type: 'player_moved',
            id: this.myId,
            position,
            rotation,
            velocity,
            roomCode: this.roomCode,
            ts: Date.now(),
          });
        }
        break;
      }

      case 'player_finished': {
        const { finishTime } = data;
        if (this.roomCode) {
          this.send({
            type: 'player_finished',
            id: this.myId,
            name: this.myName,
            finishTime,
            roomCode: this.roomCode,
            ts: Date.now(),
          });
        }
        break;
      }

      case 'leave_room': {
        if (this.roomCode) {
          this.send({
            type: 'player_left',
            id: this.myId,
            name: this.myName,
            roomCode: this.roomCode,
            ts: Date.now(),
          });
          if (this.isHost && this.players.size > 0) {
            const remaining = Array.from(this.players.keys()).filter(id => id !== this.myId);
            if (remaining.length > 0) {
              this.send({ type: 'host_takeover', roomCode: this.roomCode, newHostId: remaining[0], ts: Date.now() });
            }
          }
          this.players.delete(this.myId);
          if (this.isHost) {
            deleteRoom(this.roomCode);
          }
        }
        this.isHost = false;
        this.raceActive = false;
        this.teardownChannel();
        this.emitEvent('lobby_update', { roomCode: null, players: [], raceActive: false });
        break;
      }
    }
  }
}

let socket: MockSocket | null = null;

export function getSocket(): MockSocket {
  if (!socket) {
    socket = new MockSocket();
    socket.connect();
  }
  return socket;
}

export function createRoom(name: string) {
  getSocket().emit('create_room', { name });
}

export function joinRoom(name: string, roomCode: string) {
  getSocket().emit('join_room', { name, roomCode });
}

export function setReady(ready: boolean) {
  getSocket().emit('set_ready', { ready });
}

export function startRace() {
  getSocket().emit('start_race');
}

export function sendPlayerUpdate(
  position: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number },
  velocity: number
) {
  getSocket().emit('player_update', { position, rotation, velocity });
}

export function sendPlayerFinished(finishTime: number) {
  getSocket().emit('player_finished', { finishTime });
}

export function leaveRoom() {
  getSocket().emit('leave_room');
}

export type {
  LobbyUpdate,
  RaceStartData,
  PlayerMovedData,
  RaceResultsData,
  PlayerInfo,
};
