<script>
  import { onMount } from 'svelte';
  import { OrientationTracker, detectBrave, DEG } from './lib/sensors.js';
  import { createWorld } from './lib/world.js';
  import { createKeyboard, createLookControl } from './lib/input.js';
  import StartOverlay from './components/StartOverlay.svelte';
  import Hud from './components/Hud.svelte';
  import Joystick from './components/Joystick.svelte';
  import SettingsSheet from './components/SettingsSheet.svelte';

  const tracker = new OrientationTracker();
  const env = tracker.env;

  /** État non réactif, lu/écrit à 60 fps par la boucle de rendu. */
  const joyStore = { x: 0, y: 0 };
  let world = null;

  let canvas = $state(null);
  let phase = $state('intro');
  let brave = $state(false);
  let busy = $state(false);
  let status = $state('idle');
  let source = $state(null);
  let message = $state('');
  let hint = $state('');
  let hasHeading = $state(false);
  let showSettings = $state(false);
  let hud = $state({ score: 0, fps: 0, speed: 0, tiltX: 0, tiltY: 0, yaw: 0 });

  let settings = $state({
    useSensors: true,
    sensorSteering: true,
    invertX: false,
    invertY: false,
    invertYaw: false,
    smoothing: 0.18,
    showJoystick: true,
    showTelemetry: false,
  });

  $effect(() => {
    tracker.configure({
      invertX: settings.invertX,
      invertY: settings.invertY,
      smoothing: settings.smoothing,
    });
  });

  async function startSensors() {
    if (busy) return;
    busy = true;
    // La demande part directement du clic : requis par iOS.
    await tracker.request();
    busy = false;
    syncDiagnostics();
    if (tracker.status === 'active') {
      phase = 'playing';
      settings.useSensors = true;
      return;
    }
    // Laisse le chien de garde (1,6 s) conclure avant d'afficher le diagnostic.
    setTimeout(() => {
      syncDiagnostics();
      if (tracker.status === 'active') phase = 'playing';
    }, 1900);
  }

  function syncDiagnostics() {
    status = tracker.status;
    source = tracker.source;
    hasHeading = tracker.hasHeading;
    message = tracker.message;
    hint = tracker.hint;
  }

  function playWithoutSensors() {
    settings.useSensors = false;
    phase = 'playing';
  }

  function openSensors() {
    if (tracker.status === 'active') return;
    syncDiagnostics();
    phase = 'intro';
  }

  function calibrate() {
    tracker.calibrate();
  }

  function recenter() {
    tracker.recenterHeading();
    world?.resetAvatar();
  }

  function jump() {
    world?.triggerJump();
  }

  function newGame() {
    world?.resetRun();
    tracker.recenterHeading();
    showSettings = false;
  }

  onMount(() => {
    detectBrave().then((value) => {
      brave = value;
      tracker.brave = value;
    });

    world = createWorld(canvas);
    const keyboard = createKeyboard();
    const look = createLookControl(canvas);

    let manualYaw = Math.PI;

    look.onMove((dx, dy) => {
      manualYaw -= dx * 0.006;
      world.cam.pitch = Math.min(1.15, Math.max(0.05, world.cam.pitch + dy * 0.004));
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      world.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;

      tracker.update(dt);

      const sensorsOn = settings.useSensors && tracker.status === 'active';
      const kb = keyboard.read();

      // Entrées cumulées : capteurs + joystick tactile + clavier (fallback).
      let mx = joyStore.x + kb.x * 0.85;
      let my = joyStore.y + kb.y * 0.85;
      if (sensorsOn) {
        // `tracker.tilt` applique déjà les inversions demandées dans les
        // réglages : ici on ne fait que la conversion vers le repère caméra.
        mx += tracker.tilt.x;
        my += -tracker.tilt.y; // baisser le bord avant (beta qui diminue) = avancer
      }
      let len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
        len = 1;
      }

      // La rotation du téléphone fait tourner la caméra (si boussole dispo).
      const steering = sensorsOn && settings.sensorSteering && tracker.hasHeading;
      const yawSign = settings.invertYaw ? 1 : -1;
      const cameraYaw = steering ? manualYaw + yawSign * tracker.headingDelta * DEG : manualYaw;

      const state = world.update(dt, {
        moveX: mx,
        moveY: my,
        cameraYaw,
        sprint: kb.sprint || len > 0.85,
      });
      world.render();

      if (keyboard.consumeJump()) world.triggerJump();

      status = tracker.status;
      source = tracker.source;
      hasHeading = tracker.hasHeading;
      message = tracker.message;
      hint = tracker.hint;

      frames += 1;
      acc += dt;
      if (acc >= 0.25) {
        hud = {
          score: state.score,
          fps: Math.round(frames / acc),
          speed: state.speed,
          tiltX: mx,
          tiltY: my,
          yaw: ((cameraYaw * 180) / Math.PI) % 360,
        };
        frames = 0;
        acc = 0;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      keyboard.dispose();
      look.dispose();
      tracker.dispose();
      world.dispose();
    };
  });
</script>

<main>
  <canvas bind:this={canvas}></canvas>

  {#if phase === 'playing'}
    <Hud
      {hud}
      {status}
      {source}
      showTelemetry={settings.showTelemetry}
      onSensors={openSensors}
      onCalibrate={calibrate}
      onRecenter={recenter}
      onJump={jump}
      onSettings={() => (showSettings = true)}
    />

    {#if settings.showJoystick}
      <div class="joy-wrap">
        <Joystick store={joyStore} label="Déplacement" />
      </div>
    {/if}
  {:else}
    <StartOverlay
      {env}
      {brave}
      {status}
      {message}
      {hint}
      {busy}
      onStart={startSensors}
      onSkip={playWithoutSensors}
    />
  {/if}

  {#if showSettings}
    <SettingsSheet
      {settings}
      {hasHeading}
      onClose={() => (showSettings = false)}
      onReset={newGame}
    />
  {/if}
</main>

<style>
  main {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--bg);
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .joy-wrap {
    position: absolute;
    left: 16px;
    bottom: calc(154px + env(safe-area-inset-bottom));
    z-index: 10;
  }

  @media (max-height: 560px) {
    .joy-wrap {
      bottom: calc(80px + env(safe-area-inset-bottom));
    }
  }
</style>
