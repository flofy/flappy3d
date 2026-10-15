/**
 * sensors.js — capteurs d'orientation, pensé pour Brave (Android + iOS).
 *
 * Points durs gérés ici :
 *  - iOS 13+ : `DeviceOrientationEvent.requestPermission()` obligatoire et
 *    UNIQUEMENT depuis un geste utilisateur.
 *  - Brave iOS : navigateur bâti sur WebKit/WKWebView. `requestPermission`
 *    peut être absent, refusé, ou présent mais ne rien donner. On teste donc
 *    la fonctionnalité avant de s'en servir, et on écoute quand même les
 *    évènements au cas où.
 *  - Brave Android : les capteurs de mouvement sont bloqués par défaut sur
 *    certaines versions (réglage « Capteurs de mouvement » dans les paramètres
 *    des sites). Symptôme typique : un unique évènement avec alpha/beta/gamma
 *    à `null`, puis plus rien. On le détecte pour afficher la bonne consigne.
 *  - Contexte sécurisé (HTTPS) obligatoire pour ces API.
 *  - Android/Chromium : `deviceorientationabsolute` (+ `event.absolute`).
 *  - iOS/WebKit : `event.webkitCompassHeading` (pas de deviceorientationabsolute).
 */

export const DEG = Math.PI / 180;
export const TILT_RANGE_DEG = 32; // inclinaison max prise en compte
export const DEADZONE_DEG = 3;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Écart angulaire signé entre 2 caps, dans ]-180, 180]. */
export function angleDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function detectEnvironment() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const hasOrientationAPI =
    typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  const hasRequestPermission =
    hasOrientationAPI &&
    typeof window.DeviceOrientationEvent?.requestPermission === 'function';
  const standalone =
    (typeof window !== 'undefined' &&
      window.matchMedia?.('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true);
  const secure = typeof window !== 'undefined' ? window.isSecureContext !== false : false;

  return { isIOS, isAndroid, hasOrientationAPI, hasRequestPermission, standalone, secure };
}

/** Brave expose `navigator.brave.isBrave()`. On ne suppose rien si absent. */
export async function detectBrave() {
  try {
    if (typeof navigator !== 'undefined' && navigator.brave?.isBrave) {
      return await navigator.brave.isBrave();
    }
  } catch {
    /* ignoré : simple détection d'affichage */
  }
  return false;
}

/** Angle de rotation de l'écran, en degrés (0/90/180/270). */
export function screenAngle() {
  if (typeof window === 'undefined') return 0;
  const a = window.screen?.orientation?.angle;
  if (typeof a === 'number') return a;
  if (typeof window.orientation === 'number') return window.orientation;
  return 0;
}

/**
 * Ramène l'inclinaison de l'appareil dans le repère de l'écran, pour que
 * "vers l'avant" reste "vers le haut de l'écran" en portrait comme en paysage.
 * Les inversions éventuelles se corrigent via les réglages `invert`.
 */
export function tiltToScreenFrame(beta, gamma, angleDeg) {
  const a = angleDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    y: beta * c + gamma * s, // avant / arrière
    x: gamma * c - beta * s, // gauche / droite
  };
}

const STATUS = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  ACTIVE: 'active',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  SILENT: 'silent',
};

export { STATUS };

export class OrientationTracker {
  constructor() {
    this.env = detectEnvironment();
    this.brave = false;

    this.status = STATUS.IDLE;
    this.source = null; // 'absolute' | 'relative' | 'compass'
    this.hasHeading = false;
    this.message = '';
    this.hint = '';

    this.eventCount = 0;
    this.nullEventCount = 0;
    this.motionCount = 0;
    this.lastEventAt = 0;

    // État brut
    this.alpha = 0;
    this.beta = 0;
    this.gamma = 0;
    this.absolute = false;

    // Position neutre (calibrée par l'utilisateur)
    this.neutral = { x: 0, y: 0 };
    this.calibrated = false;

    // Sorties
    this.tilt = { x: 0, y: 0 }; // lissé, -1..1, repère écran
    this.tiltTarget = { x: 0, y: 0 }; // instantané normalisé, -1..1
    this.tiltRaw = { x: 0, y: 0 }; // en degrés, sert à la calibration
    this.headingDelta = 0; // degrés, cap courant - cap de calibration

    this.invertX = false;
    this.invertY = false;
    this.smoothing = 0.18;

    this._headingAtCalibration = null;
    this._attached = false;
    this._watchdog = null;
    this._onOrientation = this._onOrientation.bind(this);
    this._onMotion = this._onMotion.bind(this);
  }

  get supported() {
    return this.env.hasOrientationAPI;
  }

  /** Réglages modifiables à chaud depuis l'UI. */
  configure({ invertX, invertY, smoothing } = {}) {
    if (typeof invertX === 'boolean') this.invertX = invertX;
    if (typeof invertY === 'boolean') this.invertY = invertY;
    if (typeof smoothing === 'number') this.smoothing = clamp(smoothing, 0.03, 0.6);
  }

  /**
   * Demande l'accès aux capteurs. DOIT être appelée directement depuis un geste
   * utilisateur (clic/tap) : sinon iOS rejette la demande.
   */
  async request() {
    if (!this.supported) {
      this.status = STATUS.UNSUPPORTED;
      this.message = "Ce navigateur n'expose pas l'API DeviceOrientationEvent.";
      this.hint =
        "Utilise les commandes tactiles ou le clavier : l'avatar reste entièrement jouable.";
      return this.status;
    }

    if (!this.env.secure) {
      this.status = STATUS.DENIED;
      this.message = 'Les capteurs exigent un contexte sécurisé (HTTPS).';
      this.hint = 'Ouvre la page en HTTPS (ou sur localhost) puis réessaie.';
      return this.status;
    }

    this.status = STATUS.REQUESTING;
    this.message = 'Demande d’accès aux capteurs…';

    // iOS : la demande doit partir du gestionnaire de clic, avant tout await
    // susceptible de consommer l'activation utilisateur.
    let permission = 'granted';
    try {
      if (this.env.hasRequestPermission) {
        try {
          permission = await window.DeviceOrientationEvent.requestPermission(true);
        } catch {
          // Certaines versions refusent l'argument (demande du magnétomètre).
          permission = await window.DeviceOrientationEvent.requestPermission();
        }
      }
      if (typeof window.DeviceMotionEvent?.requestPermission === 'function') {
        // Ne bloque pas l'orientation si le refus ne concerne que le mouvement.
        await window.DeviceMotionEvent.requestPermission().catch(() => 'denied');
      }
    } catch (err) {
      permission = 'denied';
      this.detail = String(err?.message || err);
    }

    if (permission === 'denied') {
      this.status = STATUS.DENIED;
      this.message = 'Accès aux capteurs refusé.';
      this.hint = this.env.isIOS
        ? 'Vérifie pour ce site l’autorisation « Mouvement et orientation ». Sur iOS, Brave doit relayer la demande ; si aucune fenêtre n’apparaît, ouvre la page dans Safari.'
        : 'Autorise les capteurs pour ce site dans les réglages du navigateur, puis recharge la page.';
      return this.status;
    }

    this.attach();
    return this.status;
  }

  attach() {
    if (this._attached) return;
    this._attached = true;
    this.eventCount = 0;
    this.nullEventCount = 0;
    this.motionCount = 0;

    window.addEventListener('deviceorientationabsolute', this._onOrientation, true);
    window.addEventListener('deviceorientation', this._onOrientation, true);
    window.addEventListener('devicemotion', this._onMotion, true);

    this.status = STATUS.REQUESTING;
    this.message = 'En attente des premiers relevés…';

    // Chien de garde : si rien n'arrive, on explique pourquoi.
    clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => {
      if (this.eventCount === 0) this._diagnoseSilence();
    }, 1600);
  }

  detach() {
    window.removeEventListener('deviceorientationabsolute', this._onOrientation, true);
    window.removeEventListener('deviceorientation', this._onOrientation, true);
    window.removeEventListener('devicemotion', this._onMotion, true);
    clearTimeout(this._watchdog);
    this._attached = false;
  }

  _onMotion() {
    this.motionCount += 1;
  }

  _onOrientation(event) {
    const { alpha, beta, gamma } = event;
    if (alpha == null && beta == null && gamma == null) {
      // Brave Android (capteurs bloqués) : évènement unique et vide.
      this.nullEventCount += 1;
      return;
    }

    const isAbsolute =
      event.type === 'deviceorientationabsolute' || event.absolute === true;

    // Privilégie la source absolue quand elle existe, sinon un cap boussole.
    const hasCompass = typeof event.webkitCompassHeading === 'number';
    if (this.source === 'absolute' && !isAbsolute && !hasCompass) return;

    this.alpha = alpha ?? this.alpha;
    this.beta = beta ?? this.beta;
    this.gamma = gamma ?? this.gamma;
    this.absolute = isAbsolute;
    this.source = hasCompass ? 'compass' : isAbsolute ? 'absolute' : 'relative';

    // Cap boussole en degrés, sens horaire depuis le nord.
    let heading = null;
    if (hasCompass) heading = event.webkitCompassHeading;
    else if (isAbsolute) heading = (360 - this.alpha) % 360;

    if (heading != null) {
      this.hasHeading = true;
      if (this._headingAtCalibration == null) this._headingAtCalibration = heading;
      this.headingDelta = angleDelta(this._headingAtCalibration, heading);
    }

    // Inclinaison + normalisation dans le repère écran.
    const frame = tiltToScreenFrame(this.beta, this.gamma, screenAngle());
    this.tiltRaw = frame;

    if (!this.calibrated) this.calibrate();

    const dx = clamp((frame.x - this.neutral.x) / TILT_RANGE_DEG, -1, 1);
    const dy = clamp((frame.y - this.neutral.y) / TILT_RANGE_DEG, -1, 1);
    const rawX = (this.invertX ? -1 : 1) * this._deadzone(dx);
    const rawY = (this.invertY ? -1 : 1) * this._deadzone(dy);

    this.eventCount += 1;
    this.lastEventAt = performance.now();
    this.tiltTarget = { x: rawX, y: rawY };

    if (this.status !== STATUS.ACTIVE) {
      clearTimeout(this._watchdog);
      this.status = STATUS.ACTIVE;
      this.message = '';
      this.hint = '';
    }
  }

  _deadzone(v) {
    const dz = DEADZONE_DEG / TILT_RANGE_DEG;
    if (Math.abs(v) <= dz) return 0;
    const sign = Math.sign(v);
    return sign * ((Math.abs(v) - dz) / (1 - dz));
  }

  /**
   * Fixe l'inclinaison actuelle comme position de repos. Volontairement
   * indépendant de `recenterHeading` : recalibrer l'inclinaison ne doit pas
   * retourner la caméra.
   */
  calibrate() {
    this.neutral = { x: this.tiltRaw.x, y: this.tiltRaw.y };
    this.calibrated = true;
    this.tiltTarget = { x: 0, y: 0 };
  }

  /** Recale l'orientation de la caméra sur la direction actuelle. */
  recenterHeading() {
    this._headingAtCalibration = null;
    this.headingDelta = 0;
  }

  _diagnoseSilence() {
    this.status = STATUS.SILENT;
    const motionWorks = this.motionCount > 0;

    if (this.nullEventCount > 0 && !motionWorks) {
      this.message = 'Capteurs bloqués : l’API répond mais renvoie des valeurs nulles.';
      this.hint = this.brave
        ? 'Brave bloque les capteurs par défaut. Réglages de Brave → Paramètres des sites → Capteurs de mouvement → Autorisé, puis recharge la page.'
        : 'Active les capteurs de mouvement pour ce site, puis recharge la page.';
      return;
    }

    if (motionWorks) {
      this.message = 'L’accéléromètre répond, mais pas l’orientation.';
      this.hint = this.brave
        ? 'Sur Brave, autorise « Capteurs de mouvement » puis, si besoin, désactive les Boucliers pour ce site, et recharge.'
        : 'Autorise l’accès à l’orientation pour ce site, puis recharge la page.';
      return;
    }

    if (this.env.isIOS) {
      this.message = 'Aucun relevé reçu sur iOS.';
      this.hint =
        'iOS n’autorise les capteurs que via le bouton « Activer les capteurs ». Si rien ne vient, Brave iOS ne relaie pas toujours la demande : teste dans Safari, puis installe l’app depuis l’écran d’accueil.';
      return;
    }

    this.message = 'Aucun relevé reçu.';
    this.hint = this.brave
      ? 'Vérifie Réglages de Brave → Paramètres des sites → Capteurs de mouvement ; désactive aussi les Boucliers pour ce site, puis recharge.'
      : 'Vérifie que l’appareil possède bien un gyroscope et que le site est autorisé à utiliser les capteurs.';
  }

  /** À appeler à chaque frame : lissage exponentiel des sorties. */
  update(dt = 1 / 60) {
    const target = this.tiltTarget;
    const t = clamp(this.smoothing * (dt * 60), 0, 1);
    this.tilt.x = lerp(this.tilt.x, target.x, t);
    this.tilt.y = lerp(this.tilt.y, target.y, t);
  }

  dispose() {
    this.detach();
  }
}
