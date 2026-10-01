import type * as THREE from 'three';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  finished: boolean;
  finishTime: number | null;
  isHost: boolean;
}

export interface LobbyUpdate {
  roomCode: string | null;
  players: PlayerInfo[];
  raceActive: boolean;
}

export interface SpawnInfo {
  id: string;
  name: string;
  position: { x: number; z: number };
  index: number;
}

export interface RaceStartData {
  spawnData: SpawnInfo[];
  startTime: number;
}

export interface PlayerUpdateData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: number;
}

export interface PlayerMovedData extends PlayerUpdateData {
  id: string;
}

export interface RaceResult {
  id: string;
  name: string;
  finishTime: number;
  isHost: boolean;
}

export interface RaceResultsData {
  results: RaceResult[];
}

export interface CarState {
  id: string;
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  mesh: THREE.Group;
  nameSprite?: THREE.Sprite;
  lastUpdate: number;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Euler;
  velocity: number;
  isLocal: boolean;
}

export type Screen = 'menu' | 'lobby' | 'race' | 'results';
