/**
 * world.js — monde 3D + avatar piloté, construit avec three.js (aucun wrapper).
 *
 * Le module ne connaît ni les capteurs ni Svelte : il expose une petite API
 * (`update`, `resize`, `setCamera`, `reset`) alimentée par l'appelant.
 */
import * as THREE from 'three';

const ISLAND_RADIUS = 46;
const WALK_SPEED = 6.2;
const SPRINT_SPEED = 11.5;
const ACCEL = 14;
const TURN_SMOOTH = 12;
const COIN_COUNT = 18;

/** PRNG déterministe : la carte est identique à chaque chargement. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#141c33';
  ctx.fillRect(0, 0, size, size);

  // Dégradé doux pour éviter un aplat trop plat.
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, 'rgba(55,224,200,0.10)');
  grad.addColorStop(0.5, 'rgba(124,140,255,0.06)');
  grad.addColorStop(1, 'rgba(55,224,200,0.10)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(146,170,255,0.30)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    const p = (i / 8) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#070b18') },
      bottomColor: { value: new THREE.Color('#3a2a6b') },
      offset: { value: 60 },
      exponent: { value: 0.8 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function makeTree(rng) {
  const group = new THREE.Group();
  const h = 2.4 + rng() * 2.6;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.2, h, 6),
    new THREE.MeshStandardMaterial({ color: '#4a3a5e', roughness: 0.95, flatShading: true })
  );
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageColor = new THREE.Color().setHSL(0.48 + rng() * 0.12, 0.5, 0.42);
  for (let i = 0; i < 3; i += 1) {
    const r = 1.35 - i * 0.32;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, 1.7 - i * 0.18, 7),
      new THREE.MeshStandardMaterial({ color: foliageColor, roughness: 0.85, flatShading: true })
    );
    cone.position.y = h + 0.35 + i * 0.85;
    cone.rotation.y = rng() * Math.PI;
    cone.castShadow = true;
    group.add(cone);
  }
  const scale = 0.75 + rng() * 0.7;
  group.scale.setScalar(scale);
  return group;
}

function makeRock(rng) {
  const s = 0.5 + rng() * 1.4;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(s, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.62, 0.15, 0.28 + rng() * 0.12),
      roughness: 0.9,
      flatShading: true,
    })
  );
  mesh.position.y = s * 0.55;
  mesh.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCrystal(rng) {
  const group = new THREE.Group();
  const h = 1.6 + rng() * 2.4;
  const mat = new THREE.MeshStandardMaterial({
    color: '#37e0c8',
    emissive: new THREE.Color('#1c8f80'),
    emissiveIntensity: 0.8,
    roughness: 0.25,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.42, h, 5), mat);
  crystal.position.y = h / 2;
  crystal.castShadow = true;
  group.add(crystal);

  const light = new THREE.PointLight('#4ff0d8', 6, 12, 2);
  light.position.y = h * 0.7;
  group.add(light);
  return group;
}

function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.12, 10, 20),
    new THREE.MeshStandardMaterial({
      color: '#ffd76a',
      emissive: new THREE.Color('#8a6a12'),
      emissiveIntensity: 0.7,
      metalness: 0.6,
      roughness: 0.3,
    })
  );
  mesh.castShadow = true;
  return mesh;
}

function makeAvatar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({ color: '#f2f4ff', roughness: 0.55, flatShading: true });
  const suit = new THREE.MeshStandardMaterial({
    color: '#7c8cff',
    roughness: 0.4,
    metalness: 0.15,
    flatShading: true,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: '#37e0c8',
    emissive: new THREE.Color('#177f72'),
    emissiveIntensity: 1.1,
    roughness: 0.3,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), suit);
  torso.position.y = 1.02;
  torso.castShadow = true;
  body.add(torso);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.24), suit);
  pack.position.set(0, 1.06, -0.3);
  pack.castShadow = true;
  body.add(pack);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  body.add(head);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.265, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), accent);
  visor.position.y = 1.64;
  visor.rotation.x = -0.25;
  visor.scale.set(1, 0.55, 1);
  body.add(visor);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), accent);
  antenna.position.y = 1.94;
  body.add(antenna);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), accent);
  bulb.position.y = 2.1;
  body.add(bulb);

  const limb = (x, y, color, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, len, 4, 8), color);
    mesh.position.y = -(len / 2 + 0.085);
    mesh.castShadow = true;
    pivot.add(mesh);
    body.add(pivot);
    return pivot;
  };

  const armL = limb(-0.36, 1.26, suit, 0.42);
  const armR = limb(0.36, 1.26, suit, 0.42);
  const legL = limb(-0.15, 0.62, skin, 0.44);
  const legR = limb(0.15, 0.62, skin, 0.44);

  // Ombre de contact, plus lisible qu'une ombre portée sur un sol lointain.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  return { root, body, armL, armR, legL, legR, bulb, visor };
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#26305a', 34, 96);
  scene.add(makeSky());

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);

  scene.add(new THREE.HemisphereLight('#9fb4ff', '#20233a', 0.85));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.1);
  sun.position.set(-16, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  const sc = 42;
  sun.shadow.camera.left = -sc;
  sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc;
  sun.shadow.camera.bottom = -sc;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.86, 3.2, 72),
    new THREE.MeshStandardMaterial({ color: '#1a2340', roughness: 0.95, metalness: 0.05 })
  );
  island.position.y = -1.6;
  island.receiveShadow = true;
  scene.add(island);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_RADIUS, 72),
    new THREE.MeshStandardMaterial({
      map: makeGroundTexture(),
      color: '#aab6ff',
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(ISLAND_RADIUS, 0.16, 8, 96),
    new THREE.MeshStandardMaterial({
      color: '#37e0c8',
      emissive: new THREE.Color('#1c8f80'),
      emissiveIntensity: 1.4,
      roughness: 0.3,
    })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.02;
  scene.add(rim);

  const rng = mulberry32(20261014);
  const obstacles = [];
  const scatter = (count, factory, minR, maxR) => {
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = minR + Math.sqrt(rng()) * (maxR - minR);
      const obj = factory(rng);
      obj.position.x = Math.cos(angle) * radius;
      obj.position.z = Math.sin(angle) * radius;
      obj.rotation.y = rng() * Math.PI * 2;
      scene.add(obj);
      obstacles.push(obj);
    }
  };

  scatter(46, makeTree, 6, ISLAND_RADIUS - 4);
  scatter(34, makeRock, 3, ISLAND_RADIUS - 3);
  scatter(10, makeCrystal, 8, ISLAND_RADIUS - 6);

  // Poussière flottante pour donner de la profondeur.
  const dustCount = 320;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = (rng() - 0.5) * ISLAND_RADIUS * 2;
    dustPos[i * 3 + 1] = rng() * 16 + 0.5;
    dustPos[i * 3 + 2] = (rng() - 0.5) * ISLAND_RADIUS * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: '#9fd8ff',
      size: 0.12,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  scene.add(dust);

  // Pièces à ramasser
  const coins = [];
  const placeCoin = (coin) => {
    const angle = rng() * Math.PI * 2;
    const radius = 6 + Math.sqrt(rng()) * (ISLAND_RADIUS - 9);
    coin.position.set(Math.cos(angle) * radius, 1.1, Math.sin(angle) * radius);
    coin.visible = true;
    coin.userData.takenAt = 0;
  };
  for (let i = 0; i < COIN_COUNT; i += 1) {
    const coin = makeCoin();
    placeCoin(coin);
    scene.add(coin);
    coins.push(coin);
  }

  const avatar = makeAvatar();
  scene.add(avatar.root);

  // État
  const velocity = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let avatarYaw = 0;
  let walkPhase = 0;
  let score = 0;
  let jumpVelocity = 0;
  let airborne = false;
  let elapsed = 0;

  const cam = {
    yaw: Math.PI,
    pitch: 0.34,
    distance: 6.6,
    height: 1.35,
  };

  const tmpVec = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();

  function triggerJump() {
    if (airborne) return;
    jumpVelocity = 7.4;
    airborne = true;
  }

  function resetAvatar() {
    avatar.root.position.set(0, 0, 0);
    velocity.set(0, 0, 0);
    avatarYaw = 0;
    avatar.root.rotation.y = 0;
    jumpVelocity = 0;
    airborne = false;
  }

  function resetRun() {
    resetAvatar();
    score = 0;
    for (const coin of coins) placeCoin(coin);
  }

  /**
   * @param {number} dt secondes
   * @param {{moveX:number, moveY:number, yawDelta:number, invertYaw:boolean, sprint:boolean}} input
   */
  function update(dt, input) {
    elapsed += dt;
    const moveX = input?.moveX ?? 0;
    const moveY = input?.moveY ?? 0;

    // La caméra peut être tournée avec le téléphone (yawDelta) — la marche est
    // toujours exprimée dans le repère de la caméra.
    cam.yaw = input.cameraYaw ?? cam.yaw;

    // Direction désirée en repère caméra -> monde
    const sin = Math.sin(cam.yaw);
    const cos = Math.cos(cam.yaw);
    // caméra "derrière" l'avatar : forward = -z du repère caméra
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    desired.set(
      forwardX * moveY + rightX * moveX,
      0,
      forwardZ * moveY + rightZ * moveX
    );

    const magnitude = Math.min(1, desired.length());
    const speed = (input?.sprint ? SPRINT_SPEED : WALK_SPEED) * magnitude;
    if (magnitude > 0.001) desired.normalize().multiplyScalar(speed);

    velocity.x += (desired.x - velocity.x) * Math.min(1, ACCEL * dt);
    velocity.z += (desired.z - velocity.z) * Math.min(1, ACCEL * dt);

    avatar.root.position.addScaledVector(velocity, dt);

    // Saut
    if (airborne) {
      jumpVelocity -= 22 * dt;
      avatar.root.position.y += jumpVelocity * dt;
      if (avatar.root.position.y <= 0) {
        avatar.root.position.y = 0;
        jumpVelocity = 0;
        airborne = false;
      }
    }

    // Contour de l'île
    const dist = Math.hypot(avatar.root.position.x, avatar.root.position.z);
    if (dist > ISLAND_RADIUS - 1.2) {
      const k = (ISLAND_RADIUS - 1.2) / dist;
      avatar.root.position.x *= k;
      avatar.root.position.z *= k;
      velocity.multiplyScalar(0.4);
    }

    // Orientation de l'avatar
    const planarSpeed = Math.hypot(velocity.x, velocity.z);
    if (planarSpeed > 0.35) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      const delta = ((targetYaw - avatarYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      avatarYaw += delta * Math.min(1, TURN_SMOOTH * dt);
    }
    avatar.root.rotation.y = avatarYaw;

    // Animation de marche
    walkPhase += planarSpeed * dt * 2.1;
    const swing = Math.min(1, planarSpeed / WALK_SPEED);
    avatar.legL.rotation.x = Math.sin(walkPhase) * 0.75 * swing;
    avatar.legR.rotation.x = -Math.sin(walkPhase) * 0.75 * swing;
    avatar.armL.rotation.x = -Math.sin(walkPhase) * 0.6 * swing;
    avatar.armR.rotation.x = Math.sin(walkPhase) * 0.6 * swing;
    avatar.body.position.y = Math.abs(Math.sin(walkPhase)) * 0.07 * swing;
    avatar.body.rotation.z = Math.sin(walkPhase) * 0.05 * swing;
    avatar.bulb.material.emissiveIntensity = 1 + Math.sin(elapsed * 6) * 0.35;

    // Pièces
    for (const coin of coins) {
      coin.rotation.y += dt * 2.2;
      // Le tore est déjà dans le plan XY (pièce debout) : on ne fait que l'osciller.
      coin.rotation.x = Math.sin(elapsed * 1.6 + coin.position.x) * 0.35;
      if (!coin.visible) {
        if (elapsed - coin.userData.takenAt > 9) placeCoin(coin);
        continue;
      }
      tmpVec.subVectors(coin.position, avatar.root.position);
      tmpVec.y = 0;
      if (tmpVec.length() < 1.15) {
        coin.visible = false;
        coin.userData.takenAt = elapsed;
        score += 1;
      }
    }

    // Caméra tierce personne
    camTarget.copy(avatar.root.position);
    camTarget.y += cam.height;
    const heightOffset = Math.sin(cam.pitch) * cam.distance;
    const backOffset = Math.cos(cam.pitch) * cam.distance;
    camDesired.set(
      camTarget.x + Math.sin(cam.yaw) * backOffset,
      camTarget.y + heightOffset,
      camTarget.z + Math.cos(cam.yaw) * backOffset
    );
    camDesired.y = Math.max(camDesired.y, 0.7);
    const camLerp = 1 - Math.exp(-9 * dt);
    camera.position.lerp(camDesired, camLerp);
    camera.lookAt(camTarget);

    // Le soleil suit l'avatar pour garder des ombres nettes.
    sun.position.set(avatar.root.position.x - 16, 26, avatar.root.position.z + 14);
    sun.target.position.copy(avatar.root.position);
    sun.target.updateMatrixWorld();

    return { score, speed: planarSpeed, x: avatar.root.position.x, z: avatar.root.position.z };
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          mat.map?.dispose?.();
          mat.dispose?.();
        }
      }
    });
  }

  return {
    scene,
    camera,
    renderer,
    update,
    render,
    resize,
    dispose,
    resetAvatar,
    resetRun,
    triggerJump,
    cam,
    getScore: () => score,
  };
}
