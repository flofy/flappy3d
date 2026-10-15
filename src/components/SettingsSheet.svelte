<script>
  /**
   * @type {{
   *   settings: any,
   *   onClose: () => void,
   *   onReset: () => void,
   *   hasHeading: boolean
   * }}
   */
  let { settings, onClose, onReset, hasHeading } = $props();
</script>

<div class="scrim" onclick={onClose} role="presentation"></div>

<div class="sheet" role="dialog" aria-label="Réglages">
  <div class="grab"></div>
  <h2>Réglages</h2>

  <section>
    <h3>Capteurs</h3>
    <label class="row">
      <span>
        Piloter avec l'inclinaison
        <small>Baisser le bord avant = avancer.</small>
      </span>
      <input type="checkbox" bind:checked={settings.useSensors} />
    </label>

    <label class="row" class:disabled={!hasHeading}>
      <span>
        La rotation du téléphone oriente la caméra
        <small>
          {#if hasHeading}
            Boussole disponible : tourne sur toi-même pour regarder autour.
          {:else}
            Boussole indisponible (données relatives) : utilise le glissement à l'écran.
          {/if}
        </small>
      </span>
      <input type="checkbox" bind:checked={settings.sensorSteering} disabled={!hasHeading} />
    </label>

    <label class="row">
      <span>
        Lissage
        <small>Plus haut = plus réactif, plus bas = plus stable.</small>
      </span>
      <input type="range" min="0.05" max="0.5" step="0.01" bind:value={settings.smoothing} />
    </label>
  </section>

  <section>
    <h3>Correction des axes</h3>
    <p class="note">
      Si l'avatar part du mauvais côté (fréquent en paysage, selon le navigateur), corrige ici :
      la croix de la caméra montre la direction réellement lue.
    </p>
    <label class="row">
      <span>Inverser gauche / droite</span>
      <input type="checkbox" bind:checked={settings.invertX} />
    </label>
    <label class="row">
      <span>Inverser avant / arrière</span>
      <input type="checkbox" bind:checked={settings.invertY} />
    </label>
    <label class="row">
      <span>Inverser la rotation caméra</span>
      <input type="checkbox" bind:checked={settings.invertYaw} />
    </label>
  </section>

  <section>
    <h3>Affichage</h3>
    <label class="row">
      <span>Joystick tactile</span>
      <input type="checkbox" bind:checked={settings.showJoystick} />
    </label>
    <label class="row">
      <span>Afficher la télémétrie</span>
      <input type="checkbox" bind:checked={settings.showTelemetry} />
    </label>
  </section>

  <div class="actions">
    <button onclick={onReset}>Nouvelle partie</button>
    <button class="primary" onclick={onClose}>Fermer</button>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(4, 7, 16, 0.6);
    z-index: 30;
  }

  .sheet {
    position: absolute;
    z-index: 31;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: min(520px, 100%);
    max-height: 82vh;
    overflow-y: auto;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 20px 20px 0 0;
    padding: 14px 20px calc(20px + env(safe-area-inset-bottom));
    box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.5);
  }

  .grab {
    width: 44px;
    height: 4px;
    border-radius: 999px;
    background: rgba(150, 170, 240, 0.35);
    margin: 0 auto 12px;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 20px;
  }

  section {
    margin-bottom: 18px;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .note {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
    margin: 0 0 8px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(140, 160, 220, 0.14);
    font-size: 14px;
  }

  .row:last-child {
    border-bottom: 0;
  }

  .row.disabled {
    opacity: 0.5;
  }

  .row span {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  small {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }

  input[type='checkbox'] {
    appearance: none;
    width: 46px;
    height: 27px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid var(--border);
    position: relative;
    flex: 0 0 auto;
    transition: background 0.18s ease;
  }

  input[type='checkbox']::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: #cdd8ff;
    transition: transform 0.18s ease, background 0.18s ease;
  }

  input[type='checkbox']:checked {
    background: linear-gradient(135deg, #37e0c8, #7c8cff);
  }

  input[type='checkbox']:checked::after {
    transform: translateX(19px);
    background: #06131a;
  }

  input[type='range'] {
    width: 130px;
    accent-color: #37e0c8;
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 6px;
  }

  .actions button {
    flex: 1;
  }
</style>
