import * as THREE from 'three';
import type { CarState, RaceStartData, PlayerMovedData } from '@/types';
import { sendPlayerUpdate, sendPlayerFinished } from '@/socket';

const CAR_COLORS = [
  0xff4444, 0x4488ff, 0x44ff44, 0xffaa00,
  0xff44ff, 0x44ffff, 0xffffff, 0x8844ff,
];

// Track constants
const TRACK_WIDTH = 10;
const TRACK_LENGTH = 200;
const LAP_COUNT = 3;

interface Controls {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
}

export class GameEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private animationId: number | null = null;

  private localCar: THREE.Group | null = null;
  private remoteCars: Map<string, CarState> = new Map();
  private myId: string = '';
  private spawnData: RaceStartData['spawnData'] = [];
  private startTime: number = 0;

  // Physics
  private speed = 0;
  private maxSpeed = 0.55;
  private acceleration = 0.018;
  private reverseMaxSpeed = 0.22;
  private friction = 0.025;
  private turnSpeed = 0.035;
  private carAngle = 0;

  // Lap tracking
  private currentLap = 0;
  private lapCheckpoints: boolean[] = [false, false, false];
  private raceFinished = false;
  private finishedTime = 0;

  // Controls
  private controls: Controls = {
    forward: false, backward: false, left: false, right: false, brake: false,
  };

  // Callbacks
  public onLapUpdate: (lap: number) => void = () => {};
  public onSpeedUpdate: (speed: number) => void = () => {};
  public onRaceFinish: (time: number) => void = () => {};
  public onCountdownUpdate: (count: number) => void = () => {};
  public onRemotePlayerUpdate: (players: { id: string; name: string; x: number; z: number }[]) => void = () => {};

  // Timing
  private lastSendTime = 0;
  private countdownActive = true;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 60, 180);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      500
    );
    this.camera.position.set(0, 8, -12);
    this.camera.lookAt(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.buildScene();
    this.setupControls();
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  private buildScene() {
    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 1.2);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.5);
    directional.position.set(30, 50, 20);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 200;
    directional.shadow.camera.left = -80;
    directional.shadow.camera.right = 80;
    directional.shadow.camera.top = 80;
    directional.shadow.camera.bottom = -80;
    this.scene.add(directional);

    // Ground (grass)
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5016 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Track surface (oval-ish straight track with curves)
    this.buildTrack();

    // Decorative elements
    this.buildDecorations();
  }

  private buildTrack() {
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 });
    const curbMat1 = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const curbMat2 = new THREE.MeshStandardMaterial({ color: 0xffffff });

    // Main straight track
    const trackGeo = new THREE.PlaneGeometry(TRACK_WIDTH, TRACK_LENGTH * 2);
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.02, 0);
    track.receiveShadow = true;
    this.scene.add(track);

    // Lane markings (dashed center line)
    for (let z = -TRACK_LENGTH + 5; z < TRACK_LENGTH - 5; z += 8) {
      const dashGeo = new THREE.PlaneGeometry(0.3, 3);
      const dashMat = new THREE.MeshStandardMaterial({ color: 0xffff00 });
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.03, z);
      this.scene.add(dash);
    }

    // Curbs on edges
    for (let z = -TRACK_LENGTH; z < TRACK_LENGTH; z += 4) {
      const isRed = Math.floor(z / 4) % 2 === 0;
      const mat = isRed ? curbMat1 : curbMat2;

      const curbLeftGeo = new THREE.BoxGeometry(0.5, 0.15, 4);
      const curbLeft = new THREE.Mesh(curbLeftGeo, mat);
      curbLeft.position.set(-TRACK_WIDTH / 2 - 0.25, 0.08, z);
      curbLeft.castShadow = true;
      this.scene.add(curbLeft);

      const curbRight = curbLeft.clone();
      curbRight.position.set(TRACK_WIDTH / 2 + 0.25, 0.08, z);
      this.scene.add(curbRight);
    }

    // Start/finish line (checkered)
    const startLineGroup = new THREE.Group();
    const tileSize = 0.6;
    for (let x = -TRACK_WIDTH / 2; x < TRACK_WIDTH / 2; x += tileSize) {
      for (let dz = 0; dz < 3; dz++) {
        const isBlack = (Math.floor((x + TRACK_WIDTH / 2) / tileSize) + dz) % 2 === 0;
        const tileGeo = new THREE.PlaneGeometry(tileSize, 1);
        const tileMat = new THREE.MeshStandardMaterial({
          color: isBlack ? 0x111111 : 0xeeeeee,
        });
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(x + tileSize / 2, 0.04, -1.5 + dz);
        startLineGroup.add(tile);
      }
    }
    this.scene.add(startLineGroup);

    // Finish line gate (arch)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const leftPole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6), poleMat);
    leftPole.position.set(-TRACK_WIDTH / 2 - 0.5, 3, -1.5);
    leftPole.castShadow = true;
    this.scene.add(leftPole);

    const rightPole = leftPole.clone();
    rightPole.position.x = TRACK_WIDTH / 2 + 0.5;
    this.scene.add(rightPole);

    const archGeo = new THREE.BoxGeometry(TRACK_WIDTH + 1.5, 0.5, 0.5);
    const arch = new THREE.Mesh(archGeo, poleMat);
    arch.position.set(0, 6, -1.5);
    arch.castShadow = true;
    this.scene.add(arch);

    // Banner on arch
    const bannerGeo = new THREE.PlaneGeometry(TRACK_WIDTH, 1);
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 64;
    const ctx = bannerCanvas.getContext('2d')!;
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', 256, 44);
    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    const banner = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ map: bannerTex }));
    banner.position.set(0, 6, -1.2);
    this.scene.add(banner);

    // Track border walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (const side of [-1, 1]) {
      const wallGeo = new THREE.BoxGeometry(0.3, 0.6, TRACK_LENGTH * 2);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(side * (TRACK_WIDTH / 2 + 1), 0.3, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }

    // Checkpoints (invisible)
    // We'll use z-position thresholds: -50 (far end), 0 (start line), +50 (near end)
  }

  private buildDecorations() {
    // Trees
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1a });
    const treeLeafMat = new THREE.MeshStandardMaterial({ color: 0x1a5e1a });

    for (let i = 0; i < 40; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -TRACK_LENGTH + Math.random() * TRACK_LENGTH * 2;
      const x = side * (TRACK_WIDTH / 2 + 8 + Math.random() * 30);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 2),
        treeTrunkMat
      );
      trunk.position.set(x, 1, z);
      trunk.castShadow = true;
      this.scene.add(trunk);

      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 3.5, 8),
        treeLeafMat
      );
      leaves.position.set(x, 3.5, z);
      leaves.castShadow = true;
      this.scene.add(leaves);
    }

    // Grandstands
    const standMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    for (const side of [-1, 1]) {
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(4, 3, 20),
        standMat
      );
      stand.position.set(side * (TRACK_WIDTH / 2 + 5), 1.5, 0);
      stand.castShadow = true;
      stand.receiveShadow = true;
      this.scene.add(stand);
    }

    // Sky gradient effect with hemisphere light
    const hemi = new THREE.HemisphereLight(0x6688ff, 0x224422, 0.6);
    this.scene.add(hemi);
  }

  private createCarMesh(color: number): THREE.Group {
    const car = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.6,
      roughness: 0.3,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 4), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    car.add(body);

    // Cabin
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x222233,
      metalness: 0.8,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.8), cabinMat);
    cabin.position.set(0, 1.1, -0.2);
    cabin.castShadow = true;
    car.add(cabin);

    // Spoiler
    const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.5), spoilerMat);
    spoiler.position.set(0, 1.2, 2);
    spoiler.castShadow = true;
    car.add(spoiler);

    // Spoiler supports
    for (const sx of [-0.7, 0.7]) {
      const support = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.4, 0.1),
        spoilerMat
      );
      support.position.set(sx, 0.95, 2);
      car.add(support);
    }

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const wheelPositions = [
      { x: -1.1, z: 1.3 },
      { x: 1.1, z: 1.3 },
      { x: -1.1, z: -1.3 },
      { x: 1.1, z: -1.3 },
    ];
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, 0.4, pos.z);
      wheel.castShadow = true;
      car.add(wheel);
    }

    // Headlights
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffaa,
      emissive: 0xffff66,
      emissiveIntensity: 0.5,
    });
    for (const lx of [-0.6, 0.6]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
      light.position.set(lx, 0.6, -2);
      car.add(light);
    }

    return car;
  }

  private createNameSprite(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 12), 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    sprite.position.set(0, 3, 0);
    return sprite;
  }

  private setupControls() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW':
        this.controls.forward = true; e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS':
        this.controls.backward = true; e.preventDefault(); break;
      case 'ArrowLeft': case 'KeyA':
        this.controls.left = true; e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD':
        this.controls.right = true; e.preventDefault(); break;
      case 'Space':
        this.controls.brake = true; e.preventDefault(); break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this.controls.forward = false; break;
      case 'ArrowDown': case 'KeyS': this.controls.backward = false; break;
      case 'ArrowLeft': case 'KeyA': this.controls.left = false; break;
      case 'ArrowRight': case 'KeyD': this.controls.right = false; break;
      case 'Space': this.controls.brake = false; break;
    }
  };

  public initRace(spawnData: RaceStartData['spawnData'], myId: string, startTime: number) {
    this.spawnData = spawnData;
    this.myId = myId;
    this.startTime = startTime;
    this.speed = 0;
    this.carAngle = 0;
    this.currentLap = 0;
    this.lapCheckpoints = [false, false, false];
    this.raceFinished = false;
    this.countdownActive = true;

    // Clear old cars
    if (this.localCar) {
      this.scene.remove(this.localCar);
      this.localCar = null;
    }
    this.remoteCars.clear();

    // Create all cars
    const localCarRef: { mesh: THREE.Group | null } = { mesh: null };
    spawnData.forEach((info, index) => {
      const color = CAR_COLORS[index % CAR_COLORS.length];
      const car = this.createCarMesh(color);

      // Spawn position
      car.position.set(info.position.x, 0, info.position.z);

      if (info.id === myId) {
        localCarRef.mesh = car;
        this.carAngle = Math.PI; // facing forward (+z direction)
        car.rotation.y = this.carAngle;
      } else {
        car.rotation.y = Math.PI;
        const state: CarState = {
          id: info.id,
          name: info.name,
          position: car.position.clone(),
          rotation: car.rotation.clone(),
          mesh: car,
          lastUpdate: Date.now(),
          targetPosition: car.position.clone(),
          targetRotation: car.rotation.clone(),
          velocity: 0,
          isLocal: false,
        };
        const sprite = this.createNameSprite(info.name);
        car.add(sprite);
        state.nameSprite = sprite;
        this.remoteCars.set(info.id, state);
      }

      this.scene.add(car);
    });

    this.localCar = localCarRef.mesh;

    // Add name sprite to local car too
    if (localCarRef.mesh) {
      const myInfo = spawnData.find(s => s.id === myId);
      if (myInfo) {
        const sprite = this.createNameSprite(myInfo.name);
        localCarRef.mesh!.add(sprite);
      }
    }

    // Setup camera behind local car
    this.updateCamera();

    // Start countdown
    this.startCountdown();
  }

  private startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const updateCountdown = () => {
      const remaining = this.startTime - Date.now();
      if (remaining <= 0) {
        this.countdownActive = false;
        this.onCountdownUpdate(0);
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
      } else {
        const seconds = Math.ceil(remaining / 1000);
        this.onCountdownUpdate(seconds);
      }
    };

    updateCountdown();
    this.countdownInterval = setInterval(updateCountdown, 200);
  }

  private updateCamera() {
    if (!this.localCar) return;
    const carPos = this.localCar.position;
    const angle = this.localCar.rotation.y;

    // Camera follows behind car
    const camDist = 12;
    const camHeight = 7;
    const offsetX = Math.sin(angle) * camDist;
    const offsetZ = Math.cos(angle) * camDist;

    this.camera.position.lerp(
      new THREE.Vector3(carPos.x + offsetX, camHeight, carPos.z + offsetZ),
      0.1
    );
    this.camera.lookAt(carPos.x, 1, carPos.z);
  }

  private updatePhysics() {
    if (!this.localCar || this.raceFinished) return;

    if (this.countdownActive) {
      // Can't move during countdown
      return;
    }

    // Acceleration
    if (this.controls.forward) {
      this.speed += this.acceleration;
    } else if (this.controls.backward) {
      this.speed -= this.acceleration;
    } else {
      // Natural friction
      if (this.speed > 0) {
        this.speed -= this.friction;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < 0) {
        this.speed += this.friction;
        if (this.speed > 0) this.speed = 0;
      }
    }

    // Brake
    if (this.controls.brake) {
      if (this.speed > 0) {
        this.speed -= 0.04;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < 0) {
        this.speed += 0.04;
        if (this.speed > 0) this.speed = 0;
      }
    }

    // Clamp speed
    this.speed = Math.max(-this.reverseMaxSpeed, Math.min(this.maxSpeed, this.speed));

    // Steering (more effective at speed)
    const steerFactor = Math.min(1, Math.abs(this.speed) / 0.15);
    if (this.controls.left) {
      this.carAngle += this.turnSpeed * steerFactor * Math.sign(this.speed || 1);
    }
    if (this.controls.right) {
      this.carAngle -= this.turnSpeed * steerFactor * Math.sign(this.speed || 1);
    }

    // Apply movement
    const moveX = Math.sin(this.carAngle) * this.speed;
    const moveZ = Math.cos(this.carAngle) * this.speed;

    this.localCar.position.x += moveX;
    this.localCar.position.z += moveZ;
    this.localCar.rotation.y = this.carAngle;

    // Track boundaries
    const halfWidth = TRACK_WIDTH / 2 - 1;
    if (this.localCar.position.x > halfWidth) {
      this.localCar.position.x = halfWidth;
      this.speed *= 0.7;
    }
    if (this.localCar.position.x < -halfWidth) {
      this.localCar.position.x = -halfWidth;
      this.speed *= 0.7;
    }
    if (this.localCar.position.z > TRACK_LENGTH - 5) {
      this.localCar.position.z = TRACK_LENGTH - 5;
      this.speed *= 0.5;
    }
    if (this.localCar.position.z < -TRACK_LENGTH + 5) {
      this.localCar.position.z = -TRACK_LENGTH + 5;
      this.speed *= 0.5;
    }

    // Lap tracking: start line at z = -1.5
    // Checkpoints: z > 50 (far north), z < -50 (far south), z near -1.5 (start)
    const z = this.localCar.position.z;

    // Checkpoint 1: reach far end
    if (!this.lapCheckpoints[0] && z > 50) {
      this.lapCheckpoints[0] = true;
    }
    // Checkpoint 2: come back past center
    if (this.lapCheckpoints[0] && !this.lapCheckpoints[1] && z < -50) {
      this.lapCheckpoints[1] = true;
    }
    // Checkpoint 3: cross start line (z near -1.5 going north)
    if (this.lapCheckpoints[1] && !this.lapCheckpoints[2] && z > -3 && z < 3 && this.speed > 0) {
      this.lapCheckpoints[2] = true;
      this.currentLap++;
      this.onLapUpdate(this.currentLap + 1);

      if (this.currentLap >= LAP_COUNT) {
        this.finishRace();
      }

      // Reset checkpoints for next lap
      this.lapCheckpoints = [false, false, false];
    }

    // Speed display
    this.onSpeedUpdate(Math.abs(this.speed * 100));
  }

  private finishRace() {
    if (this.raceFinished) return;
    this.raceFinished = true;
    this.finishedTime = Date.now() - this.startTime;
    sendPlayerFinished(this.finishedTime);
    this.onRaceFinish(this.finishedTime);
  }

  public updateRemoteCar(data: PlayerMovedData) {
    const car = this.remoteCars.get(data.id);
    if (!car) return;
    car.targetPosition.set(data.position.x, data.position.y, data.position.z);
    car.targetRotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    car.velocity = data.velocity;
    car.lastUpdate = Date.now();
  }

  private interpolateRemoteCars() {
    const now = Date.now();
    for (const car of this.remoteCars.values()) {
      // Lerp position
      car.mesh.position.lerp(car.targetPosition, 0.2);

      // Lerp rotation (Y only for simplicity)
      const targetY = car.targetRotation.y;
      let diff = targetY - car.mesh.rotation.y;
      // Normalize angle difference
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.mesh.rotation.y += diff * 0.2;

      // Name sprite always faces camera
      if (car.nameSprite) {
        car.nameSprite.lookAt(this.camera.position);
      }
    }
  }

  private sendUpdate() {
    if (!this.localCar || this.raceFinished || this.countdownActive) return;
    const now = Date.now();
    if (now - this.lastSendTime < 50) return; // 20 updates/sec
    this.lastSendTime = now;

    sendPlayerUpdate(
      {
        x: this.localCar.position.x,
        y: this.localCar.position.y,
        z: this.localCar.position.z,
      },
      {
        x: this.localCar.rotation.x,
        y: this.localCar.rotation.y,
        z: this.localCar.rotation.z,
      },
      this.speed
    );
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    this.updatePhysics();
    this.interpolateRemoteCars();
    this.updateCamera();
    this.sendUpdate();

    this.renderer.render(this.scene, this.camera);
  };

  public start() {
    if (this.animationId === null) {
      this.animate();
    }
  }

  public stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public dispose() {
    this.stop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.handleResize);
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private handleResize() {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public getElapsedTime(): number {
    if (this.countdownActive || this.raceFinished) return 0;
    return (Date.now() - this.startTime) / 1000;
  }
}
