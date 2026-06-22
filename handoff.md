# BMT — Plan de construction (20 juin → 20 juillet 2026)

> Objectif final : présenter BMT au ministère des Transports avec un backend réel,
> un filtrage des utilisateurs par code postal, une numérotation fiable des dessins,
> et un "cerveau IA" capable de produire une étude de transit planning complète
> (analyse + budgétisation + rapport) à partir des dessins citoyens synthétisés.

Démarrage : 20 juin 2026, au réveil.
Échéance : 20 juillet 2026.

---

## État actuel — mise à jour 22 juin 2026

- React 19 + TypeScript + Vite, deux points d'entrée (`index.html` user, `admin.html` admin).
- **Backend Supabase en production** : Postgres + RLS + auth anonyme. `src/lib/storage.ts`
  parle directement à Supabase (`saveSubmission`, `getRoutes`, `getStops`) — plus aucune
  écriture dans `localStorage` pour les données citoyennes. Un citoyen sur un appareil
  voit sa soumission apparaître côté admin sur n'importe quel autre appareil.
- Auth Supabase anonyme active (`getOrCreateUserId()` dans `src/lib/auth.ts`), filtrage
  géographique par préfixe FSA en place (client **et** serveur, voir semaine 2 ci-dessous).
- **Auth admin réelle** (`src/lib/auth.ts::signInAdmin`) : compte Supabase Auth email/mot
  de passe, appartenance vérifiée via une ligne dans la table `admins` (pas juste "connecté
  = admin"). Remplace l'ancien mot de passe codé en dur côté client — l'écart de sécurité
  noté plus bas (semaine 2) est résolu.
- **Formulaire citoyen persisté** (`Page4Form.tsx` → `saveForm()`) : les réponses sont
  maintenant écrites dans la table `forms`, rattachées à la même soumission que le tracé —
  l'écart noté plus bas est résolu.
- Agrégation des dessins codée et fonctionnelle (`src/lib/aggregation/`), grille spatiale,
  corridors, zones d'équité (`src/lib/equity/`), matrice OD (`src/lib/od/`). L'algorithme
  d'ordonnancement des corridors (`corridors.ts`) a été corrigé (bug de zigzag, voir notes
  plus bas).
- Carte admin (`AdminMapPage.tsx`) sur Mapbox GL JS, lit les vraies soumissions Supabase
  et se met à jour **en direct** via Supabase Realtime (`postgres_changes` sur
  `routes`/`stops`, debounce 500ms). Grille d'agrégation affinée (111m → 44m) + seuil de
  bruit abaissé + couche "Tracés bruts" de vérification ajoutés le 22 juin (voir notes
  plus bas) pour resserrer la correspondance entre le dessin citoyen et le rendu admin.
- Pas de stockage de documents de référence, pas de RAG, pas d'IA assistante, pas de
  module budgétaire — c'est l'objet des semaines 3-4, pas commencé.

---

## Sécurité (transversal — s'applique dès la semaine 1, pas juste à la fin)

**Gestion des secrets**
- [ ] Clé Supabase *service_role* (accès complet) **jamais** dans le client — utilisée
  uniquement côté Edge Function/serveur. Le client web n'utilise que la clé publique
  *anon*, contrainte par RLS.
- [ ] Clé API Claude (pour le cerveau IA) stockée en variable d'env côté Edge Function
  uniquement — jamais exposée au navigateur, jamais commitée (`.env.local` reste
  gitignored, comme `VITE_MAPBOX_TOKEN` déjà).
- [ ] Rotation des clés prévue si une fuite est suspectée avant la présentation.

**Auth & autorisation**
- [ ] RLS Postgres stricte dès la semaine 1 : un user authentifié ne peut lire/écrire
  que ses propres lignes (`user_id = auth.uid()`), l'admin passe par un rôle séparé
  (service role côté serveur, jamais exposé au client public).
- [ ] L'auth anonyme Supabase ne doit pas permettre d'usurper le `user_id` d'un autre —
  vérifier que les policies RLS couvrent insert/update/select/delete sur chaque table.
- [ ] Pas de route admin accessible sans vérification de rôle côté serveur (ne pas se
  fier uniquement à `admin.html` comme "sécurité par l'obscurité").

**Validation des entrées & anti-abus**
- [ ] Valider le code postal côté serveur (pas seulement côté client) — un client
  malveillant peut contourner la validation JS.
- [ ] Limiter le nombre de soumissions par `user_id`/IP sur une fenêtre de temps
  (rate limiting) pour éviter le spam de fausses données qui fausserait la synthèse.
- [ ] Valider la géométrie des tracés côté serveur (bornes géographiques raisonnables
  autour du Grand Moncton, nombre de points max) pour éviter l'injection de données
  aberrantes ou des payloads abusifs.
- [ ] Sanitizer tout texte libre (formulaires, labels d'arrêts) avant stockage et avant
  affichage — éviter l'injection XSS dans l'admin (qui affiche du contenu généré par
  des citoyens non vérifiés).

**Confidentialité des données**
- [ ] Le code postal est une donnée à caractère personnel (même partiel) — ne stocker
  que le préfixe FSA nécessaire à la validation, pas le code complet si non requis.
- [ ] Politique de rétention claire : durée de conservation des soumissions, mécanisme
  de suppression sur demande (cohérent avec la LPRPDE/vie privée si présenté à un
  ministère, la rigueur sur ce point sera regardée).
- [ ] Pas de données personnelles identifiables dans les rapports générés par l'IA
  (le rapport agrège, il ne doit jamais citer un citoyen individuel).

**Uploads admin (documents de référence pour le RAG)**
- [ ] Restreindre les types de fichiers acceptés (PDF, image, vidéo, HTML) et la taille
  max, valider le type réel du fichier (pas juste l'extension).
- [ ] Uploads accessibles uniquement via l'admin authentifié (bucket Supabase Storage
  privé, URLs signées à durée limitée, pas de bucket public).
- [ ] Scanner/valider le contenu avant ingestion dans le pipeline d'embedding pour
  éviter qu'un document corrompu ou malveillant ne casse le pipeline.

**Sécurité du cerveau IA**
- [ ] Se prémunir contre l'injection de prompt via le corpus RAG : un document uploadé
  contenant des instructions cachées ne doit pas pouvoir détourner le comportement de
  l'agent (traiter le contenu récupéré comme donnée, jamais comme instruction).
- [ ] Le budget reste calculé par du code déterministe, jamais généré par le LLM —
  principe déjà posé dans le plan, à ne pas relâcher sous pression de deadline.
- [ ] Limiter le taux d'appels à l'API Claude (contrôle de coût + anti-abus) — l'agent
  ne doit pas être déclenchable librement par n'importe qui, seulement par l'admin.
- [ ] Le rapport généré doit afficher ses sources (quels documents du corpus ont été
  utilisés) pour rester vérifiable face à un public technique (ministère).

**Transport & infra**
- [ ] HTTPS partout (Netlify le fait par défaut, à vérifier explicitement pour le
  build admin aussi).
- [ ] En-têtes de sécurité de base (CSP, X-Frame-Options) sur le déploiement Netlify.
- [ ] `npm audit` régulier sur les dépendances, en particulier après l'ajout de
  `supabase-js` et de tout SDK lié au pipeline IA.

---

## Semaine 1 — 20 au 26 juin : Fondations backend ✅ TERMINÉ

**But : sortir du tout-`localStorage`, avoir une vraie base de données partagée.**

- [x] Créer le projet Supabase (Postgres).
- [x] Modéliser le schéma — **écart au plan** : pas de `postgis`/`pgvector`, ni de type
  `geography`. `routes.points`/`stops.pos` sont en `jsonb` brut (`[lat,lng]`), décision
  documentée dans `supabase/migrations/0001_init.sql` : l'agrégation tourne entièrement
  côté client en JS et ne fait aucune requête spatiale serveur, donc PostGIS n'apportait
  rien aujourd'hui. **`pgvector` reste à activer en semaine 3** pour le RAG.
  ```sql
  users        (id uuid, fsa_prefix text, created_at)
  submissions  (id uuid, user_id fk, submission_number int, created_at)
  routes       (id uuid, submission_id fk, points jsonb, color)
  stops        (id uuid, submission_id fk, pos jsonb, type, label)
  forms        (id uuid, submission_id fk, answers jsonb)
  admins       (user_id uuid)  -- rôle admin = ligne dans cette table, pas un rôle Postgres
  ```
- [x] Row Level Security (RLS) activée sur toutes les tables : un user ne lit/écrit que
  ses propres lignes, l'admin (présent dans `admins`) a un accès lecture totale via policy
  dédiée (pas de clé `service_role` exposée au client).
- [x] Client `src/lib/supabase.ts` créé (clé publique + URL en variable d'env Vite).
- [x] `src/lib/storage.ts` réécrit : `saveSubmission`/`getRoutes`/`getStops` parlent à
  Supabase, signature publique conservée côté pages appelantes.
- [x] Données de démo retirées (plus de seed local) — confirmé, aucune trace de
  `purgeSeedData`/`ensureSeedData` dans le code actuel.

**Bug de production découvert et corrigé en cours de route (hors plan initial) :**
l'auth anonyme Supabase était désactivée par défaut dans les réglages du projet
("Allow anonymous sign-ins" off), ce qui faisait échouer silencieusement toute
soumission citoyenne ("Impossible d'enregistrer votre tracé"). Corrigé côté dashboard
Supabase (Authentication → Sign In / Providers).

**Livrable de fin de semaine — atteint :** un citoyen qui dessine sur un appareil voit sa
soumission apparaître dans Supabase, visible depuis n'importe quel autre appareil
connecté à l'admin.

---

## Semaine 2 — 27 juin au 3 juillet : Auth, filtrage géographique, numérotation ✅ TERMINÉ

**But : seuls les citoyens de Moncton/Riverview/Dieppe participent, chaque dessin
est tracé et numéroté correctement.**

- [x] Auth Supabase anonyme (`user_id` stable via `getOrCreateUserId()`).
- [x] Écran de saisie du code postal — `src/pages/PostalCodePage.tsx`, route `/postal`
  entre `/language` et `/map`.
- [x] Validation par préfixe FSA, **côté client et côté serveur** (`src/lib/fsa.ts` +
  fonction SQL `is_valid_fsa()` + contrainte `check` sur `users.fsa_prefix` +ut
  policy d'insert sur `submissions`, voir `0002_fsa_gate_realtime.sql`). **Écart au
  plan** : la liste blanche n'est pas un set précis de préfixes Moncton/Riverview/
  Dieppe, c'est une approximation par région postale `E1` (premiers 2 caractères).
  ⚠️ à vérifier/affiner contre les limites officielles Postes Canada avant la
  présentation — actuellement certains FSA `E1x` hors Grand Moncton pourraient
  passer, et inversement.
- [x] Trigger Postgres `next_submission_number()` : incrément auto par `user_id`.
- [x] `ResultsPage.tsx` et `AdminSimulator.tsx` lisent déjà Supabase via `getRoutes()`/
  `getStops()` (confirmé dans le code, aucune dépendance `localStorage` restante pour
  les données citoyennes).
- [x] `AdminMapPage.tsx` : abonnement Supabase Realtime (`postgres_changes` INSERT sur
  `routes`/`stops`, debounce 500ms) + tables ajoutées à la publication
  `supabase_realtime`. **Non re-testé en bout en bout sur le site live** après la
  correction du bug de corridors — à confirmer.

**Bug de production découvert et corrigé en cours de route (hors plan initial) :**
la carte admin affichait des corridors en zigzag, ne correspondant pas à la forme
réelle des tracés citoyens. Root cause : `orderComponent()` dans
`src/lib/aggregation/corridors.ts` reconstruisait l'ordre des cellules de grille avec
un plus-proche-voisin glouton sans tenir compte de la direction du tracé. Réécrit
pour pondérer les candidats par continuité de cap (bearing) avec un seuil d'arrêt —
corrigé et déployé. Un effet de bord lié au test a aussi été découvert et nettoyé :
`getRoutes()`/`getStops()` agrègent **toutes** les soumissions jamais faites dans la
base (pas de notion de session/date de coupure), donc des tracés de test accumulés
pendant le développement se mélangeaient en un seul corridor avec les nouveaux
tracés. Nettoyage ponctuel fait via `supabase/migrations/0003_clear_test_data.sql`
(`delete from submissions`) — **pas une protection permanente**, à garder en tête si
de nouvelles données de test s'accumulent avant la présentation finale.

**Livrable de fin de semaine — atteint :** participation filtrée géographiquement, chaque
dessin tracé à un utilisateur et numéroté, carte admin mise à jour en direct.

**Bug de production découvert et corrigé après coup (22 juin, hors plan initial) :** la
carte admin restait visuellement décalée par rapport au tracé citoyen même après la
correction du zigzag. Root cause : `extractCorridors()` reconstruit toujours un corridor
à partir des centres de cellules de la grille de densité — avec des cellules de 111m, un
tracé précis (snappé aux rues côté citoyen) était quantifié/arrondi de façon visible, et
un tracé court (< 3 cellules ≈ 330m) était purement supprimé par `minCells`. Corrigé en
réduisant la taille de cellule à 44m (`grid.ts`) et en abaissant `minCells` à 2
(`aggregation/index.ts`). Une couche de vérification a aussi été ajoutée : le toggle
"Tracés bruts" sur `AdminMapPage.tsx` affiche la géométrie exacte soumise par chaque
citoyen par-dessus le heatmap agrégé, pour comparer visuellement les deux sans devoir
remplacer le pipeline d'agrégation (qui reste la base du futur moteur de budget,
semaine 3). ⚠️ Cette quantification reste structurellement approximative — à garder à
l'œil si elle ressort encore une fois qu'il y aura plusieurs dizaines de tracés réels
superposés.

---

## Écarts ouverts — à traiter avant ou pendant la semaine 3

- [x] ~~`src/pages/AdminLogin.tsx` utilise encore un mot de passe codé en dur côté
  client~~ — corrigé : `signInAdmin()` utilise un vrai compte Supabase Auth, vérifié
  contre la table `admins` (voir `src/lib/auth.ts`).
- [x] ~~`src/pages/Page4Form.tsx` n'écrit rien dans la table `forms`~~ — corrigé :
  `handleSubmit` appelle `saveForm(submissionId, ...)`, rattaché à la soumission créée
  par `MapPage`.
- [~] Realtime (carte admin) — au moins une soumission citoyenne réelle de bout en
  bout (tracé + formulaire) est arrivée jusqu'à Supabase et visible côté admin (table
  `forms`, 1 ligne réelle au 22 juin). L'abonnement `postgres_changes` lui-même
  (mise à jour sans rafraîchir la page) n'a pas été revérifié explicitement depuis le
  fix de corridors — à confirmer avec une deuxième soumission pendant que l'admin a
  la carte ouverte.
- [x] ~~`AdminFinalMap.tsx` ("carte finale") n'est pas branchée aux vraies données~~ —
  corrigé (22 juin). `AdminSimulator.tsx` se seede maintenant avec les corridors/arrêts
  agrégés réels (`aggregate()` sur `getRoutes()`/`getStops()`) au montage, avec repli sur
  le jeu de démo `INIT_STOPS`/`INIT_ROUTES` seulement si l'agrégation ne produit rien
  d'exploitable. L'association route → arrêts pour l'achalandage local n'est plus une
  table statique (`ROUTE_STOPS`, ids incompatibles avec les ids réels) mais une fonction
  de proximité géographique (`nearbyStopIds()`, rayon 400m). `handleGenerateFinal()`
  écrit maintenant dans `localStorage['bmt_final_state']` des objets `FinalRoute[]`/
  `FinalStop[]` complets (pas juste des ids) plus un flag `isRealData`, format partagé via
  `src/lib/finalState.ts`. `AdminFinalMap.tsx` lit ce nouveau format (repli sur
  `DEFAULT_ROUTES`/`FINAL_STOPS` si absent/invalide/vide) et affiche un badge visible
  ("● Basée sur les soumissions citoyennes réelles" / "○ Exemple de démonstration")
  pour que l'admin sache toujours si ce qu'il regarde est réel ou fictif.
- [~] Garde-fou serveur sur le nombre de points/bornes géographiques + rate limiting —
  migration écrite (`supabase/migrations/0004_input_guardrails.sql`) : contraintes
  `check` sur `routes.points` (2 à 500 points, lat/lng dans une bbox Grand Moncton avec
  marge) et `stops.pos` (même bbox), trigger `enforce_submission_rate_limit()` qui
  bloque un `user_id` au-delà de 30 soumissions/heure. **Pas encore exécutée en
  production** — aucun accès CLI/identifiants Supabase depuis cet environnement, à
  exécuter manuellement dans le SQL Editor Supabase (même processus que 0001-0003)
  avant de cocher cet écart comme résolu. Limite connue : le rate limit est par
  `user_id` seulement, pas par IP — contournable en créant plusieurs sessions
  anonymes, acceptable pour l'instant mais à garder en tête.

---

## Semaine 3 — 4 au 10 juillet : Cerveau IA — partie 1 (RAG + budget)

**But : poser les fondations du "cerveau" — base de connaissances + moteur de coûts.**

- [ ] Interface admin d'upload de documents de référence (PDF, vidéo, lien, HTML, image)
  vers Supabase Storage.
- [ ] Pipeline d'embedding : extraction de texte (PDF/HTML) → embeddings → stockage
  `pgvector`. (Vidéo/image : transcription/description avant embedding, ou métadonnée
  simple en phase 1 si le temps manque.)
- [ ] Table de coûts unitaires configurable par l'admin (coût/km de ligne, coût/abribus,
  coût/heure-véhicule, etc.) — valeurs de départ à valider avec des références
  réelles pour Moncton/NB.
- [ ] Moteur de calcul déterministe (code, pas IA) : applique les coûts unitaires aux
  corridors produits par l'agrégation → budget total chiffré et défendable.

**Livrable de fin de semaine :** l'admin peut nourrir la base de connaissances,
et un budget calculé existe pour n'importe quelle carte synthétisée.

---

## Semaine 4 — 11 au 17 juillet : Cerveau IA — partie 2 (agent + rapport)

**But : l'agent IA produit une étude complète, prête à présenter.**

- [ ] Edge Function (ou petit service serveur) orchestrant l'agent Claude :
  1. Récupère les données agrégées réelles (corridors, équité, matrice OD).
  2. Récupère les passages pertinents du corpus RAG (méthodologie transit planning).
  3. Produit une analyse structurée (achalandage potentiel, lacunes d'équité,
     score de connectivité, comparaison aux standards de l'industrie).
  4. Intègre le budget calculé (étape déterministe, pas halluciné).
  5. Génère un rapport narratif autour des chiffres réels.
- [ ] Template de rapport final (PDF/HTML) : résumé exécutif, carte du réseau (réutilise
  le rendu Mapbox existant), analyse d'équité, ventilation budgétaire, recommandations.
- [ ] Panneau "assistant IA" côté admin : poser une question ("si on change ceci...")
  et recevoir un commentaire généré à partir des données + du corpus.

**Livrable de fin de semaine :** un rapport complet généré automatiquement à partir
d'une carte synthétisée, avec analyse experte et budget chiffré.

---

## 18 au 20 juillet : Tests, polish, répétition de présentation

- [ ] Test de bout en bout : un citoyen dessine → synthèse → carte mère admin →
  génération du rapport IA, sur plusieurs appareils/comptes réels.
- [ ] Revue complète de la checklist "Sécurité" ci-dessus : RLS testée avec un compte
  non-admin (essayer activement de lire/écrire les données d'un autre user), clés
  vérifiées absentes du bundle client (`grep` sur `dist/`), rate limiting testé,
  injection de prompt testée avec un faux document corpus contenant des instructions
  cachées.
- [ ] `npm audit` final, mise à jour des dépendances à risque avant la présentation.
- [ ] Relecture du rapport généré avec un œil critique — corriger le ton, la mise en
  page, s'assurer qu'aucun chiffre n'est halluciné.
- [ ] Marge de buffer pour imprévus (jours volontairement laissés libres).
- [ ] Répétition de la présentation au ministère avec un jeu de données réel ou simulé
  réaliste.

---

## Risques / points à trancher avec toi en cours de route

- **Coûts unitaires réels** (km de ligne, abribus, heure-véhicule) : il me faudra des
  chiffres de référence crédibles pour Moncton/NB, sinon le budget sera approximatif.
- **Corpus RAG** : qualité du rapport final dépend directement des documents fournis —
  à constituer dès la semaine 3.
- **Charge de la semaine 4** : c'est la semaine la plus dense (agent + rapport) ;
  si du retard s'accumule en semaines 1–2, prévoir de simplifier le rapport plutôt que
  de sacrifier la fiabilité du budget ou des données.
