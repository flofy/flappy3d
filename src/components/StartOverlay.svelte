<script>
  /**
   * @type {{
   *   env: any,
   *   brave: boolean,
   *   status: string,
   *   message: string,
   *   hint: string,
   *   busy: boolean,
   *   onStart: () => void,
   *   onSkip: () => void
   * }}
   */
  let { env, brave, status, message, hint, busy, onStart, onSkip } = $props();

  const statusLabel = $derived(
    {
      idle: 'En attente',
      requesting: 'Demande en cours…',
      active: 'Capteurs actifs',
      denied: 'Accès refusé',
      unsupported: 'API absente',
      silent: 'Aucun relevé',
    }[status] ?? status
  );

  const bad = $derived(status === 'denied' || status === 'unsupported' || status === 'silent');
</script>

<div class="overlay">
  <div class="card">
    <header>
      <div class="badge">PWA · Svelte 5 · three.js</div>
      <h1>Tilt World</h1>
      <p class="lead">
        Pilote ton avatar en <strong>inclinant</strong> le téléphone pour marcher et en le
        <strong>tournant</strong> pour regarder autour de toi.
      </p>
    </header>

    <div class="diag">
      <div class="diag-row">
        <span>Contexte sécurisé (HTTPS)</span>
        <b class:ok={env.secure} class:ko={!env.secure}>{env.secure ? 'oui' : 'non'}</b>
      </div>
      <div class="diag-row">
        <span>Navigateur Brave détecté</span>
        <b class:ok={brave} class:ko={!brave}>{brave ? 'oui' : 'non'}</b>
      </div>
      <div class="diag-row">
        <span>DeviceOrientationEvent</span>
        <b class:ok={env.hasOrientationAPI} class:ko={!env.hasOrientationAPI}>
          {env.hasOrientationAPI ? 'disponible' : 'absent'}
        </b>
      </div>
      <div class="diag-row">
        <span>requestPermission() (iOS 13+)</span>
        <b class:ok={env.hasRequestPermission} class:ko={!env.hasRequestPermission}>
          {env.hasRequestPermission ? 'requise' : 'non requise'}
        </b>
      </div>
      <div class="diag-row">
        <span>Système</span>
        <b>{env.isIOS ? 'iOS / iPadOS' : env.isAndroid ? 'Android' : 'autre'}</b>
      </div>
      <div class="diag-row">
        <span>Installée (mode standalone)</span>
        <b>{env.standalone ? 'oui' : 'non'}</b>
      </div>
      <div class="diag-row">
        <span>État des capteurs</span>
        <b class:ok={status === 'active'} class:ko={bad}>{statusLabel}</b>
      </div>
    </div>

    {#if message}
      <div class="alert" class:bad>
        <strong>{message}</strong>
        {#if hint}<p>{hint}</p>{/if}
      </div>
    {/if}

    {#if brave}
      <div class="alert">
        <strong>Brave : à savoir</strong>
        <p>
          Sur Android, les capteurs de mouvement sont <em>bloqués par défaut</em> sur certaines
          versions : <code>Réglages de Brave → Paramètres des sites → Capteurs de mouvement →
          Autorisé</code>, puis recharge. Désactiver les Boucliers pour ce site peut aussi aider.
        </p>
        <p>
          Sur iOS, Brave s'appuie sur WebKit : la fenêtre d'autorisation n'apparaît pas toujours.
          Si l'état reste sur « Aucun relevé », ouvre l'app dans Safari, ou installe-la d'abord
          sur l'écran d'accueil puis lance-la depuis l'icône.
        </p>
      </div>
    {/if}

    <div class="actions">
      <button class="primary" onclick={onStart} disabled={busy || !env.hasOrientationAPI}>
        {busy ? 'Activation…' : 'Activer les capteurs'}
      </button>
      <button onclick={onSkip}>Jouer sans capteurs</button>
    </div>

    <p class="foot">
      iOS exige un <strong>appui sur un bouton</strong> avant d'autoriser les capteurs : c'est
      exactement le rôle du bouton ci-dessus. Aucune donnée ne quitte l'appareil.
    </p>
  </div>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
    background: radial-gradient(circle at 50% 0%, rgba(55, 224, 200, 0.12), transparent 60%),
      rgba(6, 10, 22, 0.88);
    backdrop-filter: blur(10px);
    overflow-y: auto;
    z-index: 20;
  }

  .card {
    width: min(560px, 100%);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 22px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }

  .badge {
    display: inline-block;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    border: 1px solid rgba(55, 224, 200, 0.4);
    border-radius: 999px;
    padding: 3px 10px;
  }

  h1 {
    margin: 12px 0 6px;
    font-size: 30px;
    letter-spacing: -0.02em;
  }

  .lead {
    margin: 0 0 16px;
    color: var(--muted);
    line-height: 1.5;
  }

  .diag {
    display: grid;
    gap: 2px;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.25);
    margin-bottom: 14px;
  }

  .diag-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    padding: 5px 0;
    border-bottom: 1px dashed rgba(140, 160, 220, 0.12);
  }

  .diag-row:last-child {
    border-bottom: 0;
  }

  .diag-row span {
    color: var(--muted);
  }

  b.ok {
    color: var(--accent);
  }

  b.ko {
    color: var(--warn);
  }

  .alert {
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-2);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 14px;
    font-size: 13px;
    line-height: 1.5;
    background: rgba(124, 140, 255, 0.08);
  }

  .alert.bad {
    border-left-color: var(--warn);
    background: rgba(255, 179, 71, 0.08);
  }

  .alert p {
    margin: 6px 0 0;
    color: var(--muted);
  }

  .alert code {
    font-size: 12px;
    color: var(--fg);
    background: rgba(0, 0, 0, 0.35);
    padding: 1px 5px;
    border-radius: 5px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .actions button {
    flex: 1 1 180px;
  }

  .foot {
    margin: 14px 0 0;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }
</style>
