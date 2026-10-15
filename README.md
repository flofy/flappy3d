# Tilt World

PWA en **Svelte 5 + three.js** : on pilote un avatar dans un monde 3D avec les
capteurs d'orientation du téléphone — conçue pour fonctionner **dans Brave**
(Android et iOS), et de rester jouable quand les capteurs sont bloqués.

- **Incliner** le téléphone → l'avatar marche (le bord avant baissé = avancer).
- **Tourner** le téléphone sur soi → la caméra tourne (boussole).
- **Tactile / clavier** → joystick, glissement pour regarder, `WASD`, `Espace` pour sauter.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # tests de la logique capteurs (Node, sans navigateur)
npm run build    # sortie PWA dans dist/
npm run icons    # régénère les icônes PNG/SVG
```

Les capteurs exigent un **contexte sécurisé** : `https://…` ou `localhost`.
Le serveur de dev écoute sur `0.0.0.0:3000` ; l'hôte autorisé se passe à
l'exécution via `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<hôte>` (rien n'est
codé en dur dans `vite.config.js`).

## Brave : ce qu'il faut savoir

| Cas | Comportement | Ce que fait l'app |
| --- | --- | --- |
| Brave **Android** | Les capteurs de mouvement sont **bloqués par défaut** sur certaines versions : l'API répond, puis un unique évènement avec `alpha/beta/gamma = null`, et plus rien. Désactiver les Boucliers ne suffit pas. | Détecte le relevé nul, affiche la marche à suivre exacte et garde l'avatar jouable au tactile. |
| Brave **iOS** | Navigateur bâti sur WebKit/WKWebView : `DeviceOrientationEvent.requestPermission()` peut être absent, refusé, ou présent sans effet. | Teste la fonctionnalité avant de l'appeler, écoute quand même les évènements, et propose Safari / installation sur l'écran d'accueil si rien n'arrive. |
| Brave **desktop** | Pas de gyroscope : les évènements n'arrivent jamais. | Bascule automatique sur clavier/joystick après le diagnostic. |

### À faire côté utilisateur, si l'état reste sur « Aucun relevé »

- **Android** : `Réglages de Brave → Paramètres des sites → Capteurs de mouvement → Autorisé`,
  puis recharger. Si besoin, désactiver les Boucliers pour le site.
- **iOS** : iOS n'autorise les capteurs que depuis un **geste utilisateur** —
  c'est le rôle du bouton « Activer les capteurs ». Si Brave ne relaie pas la
  demande, ouvrir la page dans Safari, ou l'installer d'abord sur l'écran
  d'accueil puis la lancer depuis l'icône.

## Architecture

```
src/
  main.js                 montage Svelte + enregistrement du service worker
  App.svelte              machine à états intro/jeu, boucle de rendu, fusion des entrées
  lib/sensors.js          capteurs : permission iOS, absolu vs relatif, boussole, diagnostic Brave
  lib/world.js            scène three.js : île, props, avatar animé, caméra tierce personne
  lib/input.js            secours : clavier, joystick tactile, glissement caméra
  components/             StartOverlay (permission + diagnostic), Hud, Joystick, SettingsSheet
scripts/gen-icons.mjs     génération des icônes PNG (encodeur sans dépendance) et SVG
scripts/test-sensors.mjs  tests Node de la logique capteurs
```

### Choix techniques

- **Sources d'orientation** : `deviceorientationabsolute` (+ `event.absolute`)
  sur Android, `event.webkitCompassHeading` sur iOS (WebKit n'implémente pas
  `deviceorientationabsolute`). Une brique absolue verrouille la source ; les
  évènements relatifs ne l'écrasent plus.
- **Cap** : ramené à un écart signé par rapport au cap de calibration, donc la
  caméra ne saute pas au passage du nord, et le magnétomètre n'est pas
  nécessaire au déplacement.
- **Inclinaison** : projetée dans le repère de l'écran (`screen.orientation.angle`)
  pour que « vers l'avant » reste « vers le haut de l'écran » en paysage, puis
  normalisée sur ±32° avec zone morte de 3°, lissée exponentiellement.
- **Repère caméra** : le déplacement est toujours exprimé par rapport à la
  caméra, ce qui rend le pilotage cohérent quel que soit l'angle du téléphone.
- **Correction d'axes** : les conventions `beta`/`gamma` varient selon
  l'appareil et l'orientation d'écran. Les réglages proposent d'inverser les
  axes X, Y et la rotation caméra ; la croix de télémétrie montre la direction
  réellement lue, donc la correction se fait sans reconstruire l'app.
- **PWA** : manifeste (`display: standalone`), icônes 192/512 + maskable,
  service worker via `vite-plugin-pwa` (`autoUpdate`), méta Apple pour l'ajout
  à l'écran d'accueil.
