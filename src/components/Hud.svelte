<script>
  /**
   * @type {{
   *   hud: {score:number, fps:number, speed:number, tiltX:number, tiltY:number, yaw:number},
   *   status: string,
   *   source: string|null,
   *   showTelemetry: boolean,
   *   onSensors: () => void,
   *   onCalibrate: () => void,
   *   onRecenter: () => void,
   *   onJump: () => void,
   *   onSettings: () => void
   * }}
   */
  let { hud, status, source, showTelemetry, onSensors, onCalibrate, onRecenter, onJump, onSettings } =
    $props();

  const label = $derived(
    {
      active: 'Capteurs actifs',
      requesting: 'Recherche…',
      denied: 'Refusé',
      unsupported: 'Indisponible',
      silent: 'Aucun relevé',
      idle: 'Capteurs inactifs',
    }[status] ?? status
  );

  const tone = $derived(
    status === 'active' ? 'ok' : status === 'requesting' || status === 'idle' ? 'warn' : 'bad'
  );

  const sourceLabel = $derived(
    { absolute: 'boussole absolue', compass: 'boussole iOS', relative: 'orientation relative' }[
      source ?? ''
    ] ?? '—'
  );
</script>

<div class="top">
  <div class="pill">
    <span class="dot" class:ok={tone === 'ok'} class:bad={tone === 'bad'} class:warn={tone === 'warn'}
    ></span>
    <button class="status" onclick={onSensors}>{label}</button>
  </div>

  <div class="score">
    <span class="label">Éclats</span>
    <b>{hud.score}</b>
  </div>

  <button class="icon" onclick={onSettings} aria-label="Réglages">⚙</button>
</div>

{#if showTelemetry}
  <div class="telemetry">
    <div><span>FPS</span><b>{hud.fps}</b></div>
    <div><span>Vitesse</span><b>{hud.speed.toFixed(1)}</b></div>
    <div><span>Source</span><b>{sourceLabel}</b></div>
    <div><span>Lacet</span><b>{hud.yaw.toFixed(0)}°</b></div>
    <div class="joystick-read">
      <span>Entrée</span>
      <div class="cross">
        <i style={`transform: translate(${hud.tiltX * 22}px, ${hud.tiltY * -22}px)`}></i>
      </div>
    </div>
  </div>
{/if}

<div class="bottom-right">
  <button onclick={onRecenter} aria-label="Recentrer la vue">⌖</button>
  <button onclick={onCalibrate} aria-label="Recalibrer l'inclinaison">↺</button>
  <button class="jump" onclick={onJump} aria-label="Sauter">↑</button>
</div>

<style>
  .top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
    z-index: 10;
    pointer-events: none;
  }

  .top > * {
    pointer-events: auto;
  }

  .pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 12px 6px 10px;
    backdrop-filter: blur(8px);
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--muted);
  }

  .dot.ok {
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }

  .dot.warn {
    background: var(--warn);
  }

  .dot.bad {
    background: var(--bad);
  }

  .status {
    border: 0;
    background: none;
    padding: 0;
    font-size: 13px;
    color: var(--fg);
  }

  .status:hover {
    background: none;
    color: var(--accent);
  }

  .score {
    margin-left: auto;
    display: flex;
    align-items: baseline;
    gap: 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 14px;
    backdrop-filter: blur(8px);
  }

  .score .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .score b {
    font-size: 18px;
    color: var(--accent);
  }

  .icon {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 50%;
    font-size: 17px;
    background: var(--panel);
    backdrop-filter: blur(8px);
  }

  .telemetry {
    position: absolute;
    left: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    z-index: 10;
    display: grid;
    gap: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 11px;
    min-width: 130px;
    backdrop-filter: blur(8px);
  }

  .telemetry div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .telemetry span {
    color: var(--muted);
  }

  .joystick-read {
    align-items: center;
  }

  .cross {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
  }

  .cross::before,
  .cross::after {
    content: '';
    position: absolute;
    background: rgba(140, 160, 220, 0.25);
  }

  .cross::before {
    width: 1px;
    height: 100%;
  }

  .cross::after {
    height: 1px;
    width: 100%;
  }

  .cross i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }

  .bottom-right {
    position: absolute;
    right: 12px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }

  .bottom-right button {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    font-size: 20px;
    background: var(--panel);
    backdrop-filter: blur(8px);
  }

  .bottom-right .jump {
    width: 68px;
    height: 68px;
    font-size: 26px;
    background: linear-gradient(135deg, rgba(55, 224, 200, 0.9), rgba(124, 140, 255, 0.9));
    color: #06131a;
    border-color: transparent;
  }
</style>
