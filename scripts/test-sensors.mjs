/**
 * test-sensors.mjs — test de la logique capteurs (Node, sans navigateur).
 *
 * Vérifie ce qui est testable sans matériel : calcul d'inclinaison, zone
 * morte, inversions, conversions de cap (webkitCompassHeading / absolu),
 * priorité brique absolue, et diagnostic « capteurs bloqués » façon Brave.
 */
import assert from 'node:assert/strict';
import { OrientationTracker, angleDelta, tiltToScreenFrame, detectEnvironment } from '../src/lib/sensors.js';

/* ------------------------------------------------------- faux navigateur */
const listeners = new EventTarget();

const stubWindow = {
  isSecureContext: true,
  screen: { orientation: { angle: 0 } },
  matchMedia: () => ({ matches: false }),
  addEventListener: (...args) => listeners.addEventListener(...args),
  removeEventListener: (...args) => listeners.removeEventListener(...args),
  dispatchEvent: (...args) => listeners.dispatchEvent(...args),
};
stubWindow.DeviceOrientationEvent = function DeviceOrientationEvent() {};
stubWindow.DeviceOrientationEvent.requestPermission = async () => 'granted';
stubWindow.DeviceMotionEvent = function DeviceMotionEvent() {};
stubWindow.DeviceMotionEvent.requestPermission = async () => 'granted';

globalThis.window = stubWindow;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile',
    platform: 'Linux',
    maxTouchPoints: 0,
    brave: { isBrave: async () => true },
  },
});

function emit(type, props = {}) {
  const event = new Event(type);
  Object.assign(event, props);
  listeners.dispatchEvent(event);
}

/* ----------------------------------------------------------------- tests */
let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('\nAngle / repère écran');
check('angleDelta couvre le passage par le nord', () => {
  assert.equal(angleDelta(0, 30), 30);
  assert.equal(angleDelta(10, 350), -20);
  assert.equal(angleDelta(350, 10), 20);
});

check('tiltToScreenFrame: portrait inchangé, paysage permuté', () => {
  const p = tiltToScreenFrame(10, 20, 0);
  assert.equal(Math.round(p.y), 10);
  assert.equal(Math.round(p.x), 20);
  const l = tiltToScreenFrame(10, 20, 90);
  assert.equal(Math.round(l.y), 20);
  assert.equal(Math.round(l.x), -10);
});

console.log('\nDétection d’environnement');
check('Android + requestPermission disponible', () => {
  const env = detectEnvironment();
  assert.equal(env.isAndroid, true);
  assert.equal(env.isIOS, false);
  assert.equal(env.hasRequestPermission, true);
  assert.equal(env.secure, true);
});

console.log('\nFlux d’autorisation et priorité des sources');
const tracker = new OrientationTracker();
await tracker.request();
check('request() attache les écouteurs et passe en attente', () => {
  assert.equal(tracker.status, 'requesting');
});

emit('deviceorientationabsolute', { alpha: 0, beta: 0, gamma: 0, absolute: true });
check('un évènement absolu active les capteurs et calibre', () => {
  assert.equal(tracker.status, 'active');
  assert.equal(tracker.source, 'absolute');
  assert.equal(tracker.calibrated, true);
});

emit('deviceorientation', { alpha: 120, beta: 0, gamma: 0, absolute: false });
check('les évènements relatifs n’écrasent pas la brique absolue', () => {
  assert.equal(tracker.source, 'absolute');
  assert.equal(tracker.alpha, 0);
});

console.log('\nInclinaison, zone morte et inversions');
emit('deviceorientationabsolute', { alpha: 0, beta: -32, gamma: 0, absolute: true });
check('inclinaison avant saturée à -1 (bord avant baissé)', () => {
  assert.ok(Math.abs(tracker.tiltTarget.y - -1) < 1e-9, `tiltTarget.y=${tracker.tiltTarget.y}`);
  assert.ok(Math.abs(tracker.tiltTarget.x) < 1e-9);
  // L'app retourne le signe : avancer = +1 côté caméra.
  assert.equal(-tracker.tiltTarget.y, 1);
});

emit('deviceorientationabsolute', { alpha: 0, beta: -1, gamma: 0, absolute: true });
check('la zone morte annule les micro-mouvements', () => {
  assert.equal(tracker.tiltTarget.y, 0);
});

emit('deviceorientationabsolute', { alpha: 0, beta: -32, gamma: 16, absolute: true });
check('axe gauche/droite proportionnel (zone morte rescalee)', () => {
  // 16°/32° = 0.5 brut, puis compression par la zone morte de 3°.
  const expected = (0.5 - 3 / 32) / (1 - 3 / 32);
  assert.ok(
    Math.abs(tracker.tiltTarget.x - expected) < 1e-9,
    `tiltTarget.x=${tracker.tiltTarget.x} attendu=${expected}`
  );
});

tracker.configure({ invertY: true, invertX: true });
emit('deviceorientationabsolute', { alpha: 0, beta: -32, gamma: 16, absolute: true });
check('les inversions changent le signe', () => {
  assert.ok(tracker.tiltTarget.y > 0.9, `y=${tracker.tiltTarget.y}`);
  assert.ok(tracker.tiltTarget.x < -0.4, `x=${tracker.tiltTarget.x}`);
});
tracker.configure({ invertY: false, invertX: false });

console.log('\nLissage');
emit('deviceorientationabsolute', { alpha: 0, beta: -32, gamma: 0, absolute: true });
tracker.tilt = { x: 0, y: 0 };
for (let i = 0; i < 120; i += 1) tracker.update(1 / 60);
check('update() converge vers la valeur brute', () => {
  assert.ok(Math.abs(tracker.tilt.y - -1) < 0.02, `tilt.y=${tracker.tilt.y}`);
});

console.log('\nCap / boussole');
emit('deviceorientation', {
  alpha: 0,
  beta: 0,
  gamma: 0,
  absolute: false,
  webkitCompassHeading: 30,
});
check('webkitCompassHeading pilote le cap (iOS)', () => {
  assert.equal(tracker.source, 'compass');
  assert.equal(tracker.hasHeading, true);
  assert.ok(Math.abs(tracker.headingDelta - 30) < 1e-9, `delta=${tracker.headingDelta}`);
});

tracker.recenterHeading();
check('recenterHeading() remet la caméra dans l’axe', () => {
  assert.equal(tracker.headingDelta, 0);
  assert.equal(tracker.neutral.y !== undefined, true);
});

tracker.calibrate();
check('calibrate() ne touche pas au cap', () => {
  assert.equal(tracker.calibrated, true);
});
tracker.dispose();

console.log('\nDiagnostic « capteurs bloqués » (scénario Brave Android)');
const blocked = new OrientationTracker();
blocked.brave = true;
await blocked.request();
// Brave Android renvoie un unique évènement vide avant de se taire.
emit('deviceorientation', { alpha: null, beta: null, gamma: null, absolute: false });
await new Promise((resolve) => setTimeout(resolve, 1750));
check('un relevé nul unique déclenche le diagnostic Brave', () => {
  assert.equal(blocked.status, 'silent');
  assert.ok(blocked.nullEventCount === 1);
  assert.match(blocked.hint, /Brave/);
  assert.match(blocked.hint, /Capteurs de mouvement/);
});
check('l’app reste jouable sans capteurs', () => {
  assert.equal(blocked.supported, true);
  assert.equal(typeof blocked.tilt.x, 'number');
});
blocked.dispose();

console.log(`\n${passed} vérifications passées.\n`);
