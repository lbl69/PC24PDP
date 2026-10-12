# PC-24 PDP

Web app iPad de **révision personnelle** pour la qualif type Pilatus PC-24, inspirée d'A320PDP.
Elle tourne hors ligne et s'installe sur l'écran d'accueil (Safari → Partager → « Sur l'écran d'accueil »).

> ⚠️ Outil personnel, non approuvé par une autorité. Il ne remplace ni l'AFM, ni la QRH, ni la
> documentation de l'exploitant. Le contenu fourni dans `content/` est un **exemple** : les
> limitations sont volontairement vides.

## Modules

| Module | Ce qu'il fait |
|---|---|
| Normales | Check-list par phase, coche au toucher, **mode révision** (réponses floutées : 1er toucher révèle, 2e coche) |
| Anormales & urgences | Liste type QRH, filtres par catégorie et message CAS, **memory items** encadrés en rouge |
| Systèmes | Fiches par chapitre et quiz QCM par chapitre |
| Cockpit interactif | Vues du poster cockpit : **Explorer** (toucher une commande pour voir son nom et ses positions), **Trouve la commande** (toucher la commande demandée), **Identifie** (nommer la commande encadrée). 105 zones sur 9 vues. |
| Limitations | Tableau avec valeurs masquables et flashcards (méthode Leitner, boîtes 0 à 5) |
| Entraînement | Memory items en flashcards, quiz général, « revoir mes erreurs » |

## Lancer

```bash
npm start          # http://localhost:8124
npm test           # test de fumée Playwright (serveur lancé)
npm run icons      # régénère les PNG depuis icons/icon.svg
```

Aucune dépendance ni étape de build : ce sont des fichiers statiques (HTML/CSS/JS).
Pour l'iPad, tout hébergement statique en HTTPS fonctionne (GitHub Pages, Netlify…).

## Mettre ton propre contenu

Deux options :

1. **Pack perso (recommandé pour les manuels)** : un seul fichier JSON avec les clés
   `normal`, `abnormal`, `systems`, `quiz`, `limitations` (toutes facultatives). Tu l'importes dans
   ⚙︎ Réglages. Il reste **sur l'appareil** et n'est jamais publié. Range-le dans `private/` ou
   nomme-le `*.pack.json` : ces chemins sont ignorés par git.
2. **Modifier `content/*.json`** : à réserver au contenu que tu as le droit de diffuser,
   car il est publié avec l'app.

Le texte de l'AFM, de la QRH et des check-lists Pilatus est protégé par le droit d'auteur : garde-le dans un pack perso.

### Format

`_meta` (dans chaque module) : `{ "sample": false, "source": "AFM rév. X", "revision": "2026-10" }`.
Avec `sample: true`, la bannière « exemple » s'affiche.

**Étapes** (normales, anormales, memory items), sous forme de liste d'objets :

```json
{ "c": "Batteries", "r": "ON" }                      // challenge … réponse
{ "t": "Atterrir dès que possible." }                 // texte libre
{ "if": "Si le feu persiste :", "then": [ … ] }       // branche conditionnelle
{ "note": "…" }  { "caution": "…" }  { "warning": "…" }
```

**normal** : `{ "phases": [ { "id", "title", "intro?", "items": [étapes] } ] }`

**abnormal** :
```json
{ "procedures": [ {
  "id": "engine-fire", "title": "Engine fire in flight", "cas": "L ENG FIRE",
  "type": "emergency | abnormal", "category": "Moteur",
  "condition?": "…", "memory?": [étapes], "steps": [étapes], "ref?": "QRH 1-2"
} ] }
```

**systems** : `{ "chapters": [ { "id", "title", "sections": [ { "title", "body" } ] } ] }`.
`body` accepte un markdown minimal : paragraphes séparés par une ligne vide, listes `- `, `**gras**`.

**quiz** : `{ "questions": [ { "id", "chapter", "q", "choices": [...], "answer": 0, "explain?" } ] }`.
`chapter` = `id` d'un chapitre systèmes, `answer` = index de la bonne réponse (les choix sont mélangés à l'affichage).

**limitations** : `{ "groups": [ { "title", "items": [ { "label", "value", "ref?" } ] } ] }`

## Images du cockpit

Les zones cliquables (`content/cockpit.json`) sont dans le repo. Les images, elles, viennent du poster
FlightSafety (sous copyright) et **n'y sont pas** : elles s'importent sur l'appareil via ⚙︎ Réglages et sont
stockées dans IndexedDB. Sans images, chaque vue s'affiche comme un schéma avec les zones nommées.

Pour fabriquer le pack à partir du PDF (poppler et Pillow nécessaires) :

```bash
python3 tools/build-cockpit-pack.py poster.pdf private/pc24-cockpit.pack.json
```

Si tu changes les découpes dans le script, il faut recaler les zones et `aspect` dans `content/cockpit.json`.

## Progression

Flashcards, meilleurs scores et erreurs de quiz sont stockés localement (localStorage).
Si tu changes de navigateur ou vides les données du site, la progression repart à zéro.
