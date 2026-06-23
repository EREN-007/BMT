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
- **Carte citoyenne (`MapPage.tsx`) — refonte UX mobile-first, 23 juin** : la gomme passait
  d'un effacement aveugle du dernier élément (LIFO) à un effacement ciblé "touchez pour
  supprimer" (lignes via `interactiveLayerIds` + détection de feature au clic, arrêts via
  `onClick` sur le marqueur, affordance visuelle pulsée). Ajout d'un "Annuler le dernier
  point" pendant un tracé actif (remplace badge/stats dans la barre d'actions tant que
  `isDrawing`), pour corriger un point erroné sans devoir jeter toute la ligne. Ajout des
  contrôles Mapbox natifs `NavigationControl` (zoom + boussole, `visualizePitch` pour
  remettre la vue à plat en un tap) et `GeolocateControl` ("me centrer"), réhabillés en
  thème sombre et positionnés en haut à droite pour ne pas empiéter sur la barre d'outils
  flottante. CSS : zones sûres mobiles (`env(safe-area-inset-top)`) appliquées aux
  éléments ancrés en haut, resserrement pour très petits écrans (≤360px). Aucun test
  visuel interactif possible dans cet environnement (pas d'outil navigateur) — vérifié via
  `tsc --noEmit`, `npm run build`, et `curl` sur le serveur dev.

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
  bloque un `user_id` au-delà de 30 soumissions/heure. Exécution manuelle en cours par
  l'admin dans le SQL Editor Supabase (même processus que 0001-0003) — à confirmer puis
  cocher cet écart comme résolu. Limite connue : le rate limit est par `user_id`
  seulement, pas par IP — contournable en créant plusieurs sessions anonymes,
  acceptable pour l'instant mais à garder en tête.

---

## Semaine 3 — 4 au 10 juillet : Cerveau IA — partie 1 (RAG + budget)

**But : poser les fondations du "cerveau" — base de connaissances + moteur de coûts.**

- [x] ~~Interface admin d'upload de documents de référence (PDF, vidéo, lien, HTML, image)
  vers Supabase Storage.~~ — corrigé (22 juin). Nouvelle page `AdminDocuments.tsx`
  (`/documents`) : formulaire d'ajout (pdf/image → upload vers le bucket Storage
  `documents` ; lien → URL ; vidéo → titre + description, pas de transcription en
  phase 1) et table listant les documents avec statut (`pending`/`processing`/`done`/
  `error`), rafraîchie automatiquement toutes les 3s tant qu'un document est en cours
  de traitement. Lien ajouté dans la nav de toutes les pages admin.
- [x] ~~Pipeline d'embedding : extraction de texte (PDF/HTML) → embeddings → stockage
  `pgvector`. (Vidéo/image : transcription/description avant embedding, ou métadonnée
  simple en phase 1 si le temps manque.)~~ — corrigé (22 juin). Edge Function
  `supabase/functions/process-document/index.ts` : pdf/image envoyés en base64
  directement à Jina (embedding multimodal natif, pas d'OCR séparé) ; lien/html
  récupéré côté serveur puis nettoyé (`htmlToText`) et découpé en chunks de ~3000
  caractères ; vidéo embedée à partir de la description saisie par l'admin (phase 1,
  pas de transcription). Embeddings stockés dans `document_chunks` (colonne
  `pgvector`, dimension 1024) via la migration `supabase/migrations/0006_documents_rag.sql`
  (active l'extension `vector`, crée le bucket Storage `documents`, RLS admin-only).
  Fournisseur retenu : **Jina AI** (`jina-embeddings-v4`) — gratuit jusqu'à 1M tokens/
  mois, sans carte de crédit, multilingue (fr/en) et multimodal natif. **Ni la
  migration 0006 ni l'Edge Function ne sont déployées en production** — aucun accès
  CLI/identifiants Supabase depuis cet environnement ; à faire manuellement :
  1) exécuter `0006_documents_rag.sql` dans le SQL Editor (après 0005), 2) déployer
  la fonction (`supabase functions deploy process-document`), 3) définir le secret
  (`supabase secrets set JINA_API_KEY=...`). Recherche par similarité (utilisée par
  l'agent IA) volontairement pas encore implémentée — prévue semaine 4 avec l'agent.
- [x] ~~Table de coûts unitaires configurable par l'admin (coût/km de ligne, coût/abribus,
  coût/heure-véhicule, etc.)~~ — corrigé (22 juin). Table `budget_costs` (migration
  `supabase/migrations/0005_budget_costs.sql`, RLS admin-only, seedée avec les mêmes
  valeurs que `DEFAULT_UNIT_COSTS`), lue/écrite via `src/lib/budget/storage.ts`
  (`getBudgetCosts`/`saveBudgetCosts`, repli en mémoire si la table est absente ou la
  requête échoue). Éditable depuis le nouvel onglet "Budget" de `AdminSimulator.tsx`.
  ⚠️ Valeurs de départ illustratives (ordre de grandeur municipal canadien), pas des
  références validées pour Moncton/N.-B. — voir section Risques, "Coûts unitaires
  réels". **Migration 0005 pas encore exécutée en production**, même processus manuel
  que 0004 (aucun accès CLI/identifiants Supabase depuis cet environnement).
- [x] ~~Moteur de calcul déterministe (code, pas IA) : applique les coûts unitaires aux
  corridors produits par l'agrégation → budget total chiffré et défendable.~~ — corrigé
  (22 juin). `src/lib/budget/index.ts::computeBudget()` — déterministe, aucune
  génération IA : longueur de ligne active (km) × coût/km, arrêts/stations actifs ×
  coût unitaire, flotte requise (issue du moteur d'achalandage) × coût/véhicule
  (→ immobilisations) ; heures-véhicule/an (flotte × 16h/jour × 312 jours/an,
  hypothèses documentées) × coût/heure-véhicule (→ exploitation annuelle). Affiché
  dans le nouvel onglet "Budget" de `AdminSimulator.tsx` avec détail des lignes,
  total Année 1, et bannière d'avertissement sur le caractère illustratif des coûts.

**Livrable de fin de semaine :** l'admin peut nourrir la base de connaissances,
et un budget calculé existe pour n'importe quelle carte synthétisée. *(Tout le code
des 4 items est écrit et type-check/build proprement. Reste une action manuelle de
l'admin pour activer la base de connaissances en production : exécuter la migration
0006, déployer l'Edge Function `process-document` et y attacher le secret
`JINA_API_KEY` — voir détails ci-dessus. Le moteur de budget, lui, est déjà
opérationnel dès que la migration 0005 est appliquée.)*

---

## Semaine 4 — 11 au 17 juillet : Cerveau IA — partie 2 (agent + rapport)

**But : l'agent IA produit une étude complète, prête à présenter.**

- [x] Edge Function (ou petit service serveur) orchestrant l'agent Claude :
  1. Récupère les données agrégées réelles (corridors, équité, matrice OD).
  2. Récupère les passages pertinents du corpus RAG (méthodologie transit planning).
  3. Produit une analyse structurée (achalandage potentiel, lacunes d'équité,
     score de connectivité, comparaison aux standards de l'industrie).
  4. Intègre le budget calculé (étape déterministe, pas halluciné).
  5. Génère un rapport narratif autour des chiffres réels.
- [x] Template de rapport final (PDF/HTML) : résumé exécutif, carte du réseau (réutilise
  le rendu Mapbox existant), analyse d'équité, ventilation budgétaire, recommandations.
- [x] Panneau "assistant IA" côté admin : poser une question ("si on change ceci...")
  et recevoir un commentaire généré à partir des données + du corpus.

*(Implémentation : `supabase/functions/generate-report/index.ts` — Edge Function unique
qui sert les deux items ci-dessus avec deux modes (`mode: 'report'` / `mode: 'question'`)
puisqu'ils partagent la même logique : 1) calcule une requête de recherche (synthétisée
pour le rapport, ou la question de l'admin) et l'embed via Jina (`retrieval.query`) ;
2) appelle la fonction RPC `match_document_chunks` (nouvelle migration
`supabase/migrations/0007_match_document_chunks.sql` — similarité cosinus pgvector,
exécution restreinte à `service_role`, le corpus admin ne doit pas être lisible par un
citoyen via RPC direct) pour récupérer les passages pertinents du corpus ; 3) appelle
xAI Grok (`api.x.ai/v1/chat/completions`, API REST compatible OpenAI, pas de SDK
officiel Deno/ESM donc appel via `fetch` direct ; modèle configurable par la variable
d'env `GROK_MODEL`, défaut `grok-4.3`), sortie forcée en JSON via `response_format:
{type:'json_schema', json_schema:{strict:true,...}}` avec repli automatique (si l'API
rejette le paramètre avec un 400/422, ré-essai sans `response_format` en injectant le
schéma dans le prompt système puis parsing tolérant des blocs ```json```) avec les VRAIES
données calculées (chiffres jamais générés par le modèle, seulement commentés) + le corpus comme
texte de référence explicitement non-instructif (mitigation injection de prompt, cf.
checklist Sécurité). Le résumé envoyé au modèle (`src/lib/report/types.ts::ReportSummary`,
construit par `src/lib/report/index.ts::buildReportSummary`) est agrégé — zones, lignes,
corridors — jamais de tracé/soumission individuelle.
Côté admin, un nouvel onglet "Rapport IA" dans `AdminSimulator.tsx` (`TabReport`) déclenche
la génération et affiche le résumé exécutif, les analyses, le score de connectivité, les
recommandations et les sources du corpus utilisées, plus un encadré "assistant IA" en bas
de l'onglet pour les questions libres — ce dernier couvre déjà l'item "Panneau assistant
IA" même si la présentation reste simple (liste de texte, pas de mise en page soignée).
Template imprimable : bouton "Exporter / Imprimer (PDF)" dans `TabReport` (visible une
fois un rapport généré) qui calcule la géométrie des lignes/arrêts officiels (factorisée
dans `buildFinalState()`, partagée avec "Générer la carte finale" pour éviter la
duplication), l'écrit avec le `ReportResult` dans `localStorage['bmt_report_print_state']`
(contrat `src/lib/reportPrintState.ts`, même convention que `finalState.ts`) et ouvre un
nouvel onglet navigateur sur `/admin.html#/rapport-impression`. Cette nouvelle route
(`src/pages/AdminReportPrint.tsx`, enregistrée dans `AdminApp.tsx`) relit ce localStorage
et affiche un document blanc "rapport" (carte Leaflet/Mapbox compacte des lignes/arrêts,
résumé exécutif, indicateurs clés, analyse d'équité avec tableau des zones critiques/
modérées, analyse de connectivité, comparaison industrie, ventilation budgétaire en
tableau capital/exploitation avec total an 1, recommandations, sources) — export PDF via
`window.print()` natif du navigateur (pas de nouvelle dépendance, même approche que
`AdminFinalMap`), styles `.arp-*` dans `styles.css`.
Action manuelle requise : exécuter la migration 0007, déployer l'Edge Function
`generate-report` (`supabase functions deploy generate-report`) et attacher un NOUVEAU
secret `XAI_API_KEY` (`supabase secrets set XAI_API_KEY=...`), distinct de
`JINA_API_KEY` — à obtenir sur la console xAI (x.ai). Cette fonction réutilise aussi
`JINA_API_KEY` (déjà configuré en semaine 3) pour l'embedding de la requête de recherche.)*

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

---

## Charge à l'échelle du Grand Moncton (~200k habitants) — analyse, 23 juin 2026

**Pas encore implémenté — analyse + recommandations seulement.**

200k habitants ne veut pas dire 200k requêtes simultanées : pour une consultation
citoyenne de ce type, le taux de participation réaliste (même avec une bonne campagne)
tourne historiquement autour de 1 à 5 % de la population sur plusieurs semaines, soit
quelques centaines à ~10 000 soumissions — pas un pic de trafic massif et simultané.
L'architecture actuelle (Netlify CDN statique + Supabase + Mapbox + xAI à la demande
admin) tient largement ce volume sans changement. Les points de vigilance réels avant un
lancement public large :

- **Supabase (tier gratuit probable actuellement)** : limites de connexions DB et de
  MAU sur l'auth anonyme. Chaque soumission citoyenne crée un utilisateur anonyme
  (`getOrCreateUserId()`) — à surveiller si la participation dépasse quelques milliers.
  → Recommandé : passer en tier Pro avant le lancement public (sauvegardes, plus de
  connexions, pas de pause après inactivité).
- **Agrégation côté client** (`src/lib/aggregation/`) : `getRoutes()`/`getStops()`
  rapatrient *toutes* les lignes brutes vers le navigateur admin à chaque mise à jour
  Realtime, puis agrègent en JS. Tient bien jusqu'à quelques milliers de soumissions ;
  au-delà (dizaines de milliers), c'est le vrai goulot d'étranglement — il faudrait
  déplacer l'agrégation vers une vue matérialisée Postgres recalculée côté serveur plutôt
  que de tout retélécharger côté navigateur à chaque fois.
- **Mapbox Map Matching API** : appelée à chaque tracé citoyen (debounce 500ms), quota
  gratuit limité (~100k requêtes/mois). À surveiller via le dashboard Mapbox si la
  participation grimpe ; budgéter du pay-as-you-go si besoin.
- **xAI Grok (génération de rapport)** : déclenché uniquement par l'admin, pas par les
  citoyens — non concerné par la charge publique, mais mérite une limite de fréquence
  par admin pour éviter un coût qui s'emballe sur des clics répétés.
- **Hébergement statique (Netlify)** : aucune inquiétude, le CDN absorbe un trafic bien
  plus élevé que ce dont ce projet a besoin.

**Conclusion :** l'app tiendra la charge réaliste d'une consultation à l'échelle du
Grand Moncton telle qu'elle est construite aujourd'hui. Les trois actions à faire avant
un lancement public élargi (pas urgent pour la présentation au ministère) : tier
Supabase Pro, alertes d'usage Mapbox/xAI, et préparer (sans nécessairement déployer tout
de suite) une vue d'agrégation côté serveur si la participation dépasse les attentes.

---

## Plan de sécurisation — anti-abus, piratage, scraping (23 juin 2026)

**Pas encore implémenté — plan seulement, à prioriser avec toi.** Complète la checklist
"Sécurité" plus haut (déjà en bonne partie couverte côté validation serveur — bornes
géographiques, rate limit par `user_id`, RLS stricte, voir `0004_input_guardrails.sql`)
avec une couche réseau/anti-bot qui manque encore.

**Déjà en place (vérifié dans le code actuel) :**
- RLS sur toutes les tables, policies séparées citoyen (lecture/écriture de ses propres
  lignes) vs admin (lecture totale via ligne dans `admins`, pas de clé `service_role`
  côté client).
- Validation serveur de la géométrie (bornes géographiques + max 500 points/route) et
  rate limit de 30 soumissions/heure par `user_id` (trigger Postgres,
  `0004_input_guardrails.sql`).
- Filtrage FSA côté client *et* serveur (`is_valid_fsa()` + contrainte `check`).
- Edge Functions (`generate-report`, `process-document`) vérifient l'auth + le rôle
  admin avant tout traitement — pas d'accès anonyme à l'IA/au RAG.
- React échappe par défaut tout texte affiché (aucun `dangerouslySetInnerHTML` dans le
  code) — pas d'injection XSS triviale via les labels d'arrêts ou réponses de formulaire.
- Clés sensibles (`service_role`, clé xAI) confinées aux Edge Functions, jamais dans le
  bundle client (`VITE_*` seulement pour les clés publiques destinées au navigateur).

**Manquant — à ajouter, par priorité :**
1. **Anti-bot / CAPTCHA invisible** sur la soumission citoyenne (Cloudflare Turnstile,
   gratuit, respectueux de la vie privée) — le rate limit actuel est par `user_id`
   Supabase, contournable en créant des comptes anonymes en boucle (limite déjà notée
   dans le commentaire de `0004_input_guardrails.sql`).
2. **Cloudflare devant Netlify** (gratuit) : protection DDoS de base, règles de rate
   limiting au niveau edge sur les routes sensibles (soumission, Edge Functions),
   option de restriction géographique si le bruit hors région devient un problème.
3. **En-têtes de sécurité** (CSP, X-Frame-Options, X-Content-Type-Options,
   Referrer-Policy, Permissions-Policy) via un fichier `_headers` Netlify ou
   `netlify.toml` — actuellement absents.
4. **Restriction du token Mapbox** par domaine dans le compte Mapbox (le token est
   public par design dans le bundle client, mais doit être limité aux domaines de
   production pour empêcher la réutilisation ailleurs).
5. **`npm audit` régulier + Dependabot/Renovate** sur les dépendances (déjà notée dans
   la checklist "Sécurité", pas encore mise en place comme automatisation récurrente).
6. **Monitoring/alertes** : pic anormal de soumissions, échecs RLS répétés, quotas
   Mapbox/xAI proches de la limite — actuellement aucune alerte configurée, tout est
   silencieux jusqu'à ce que ça casse.
7. **Politique de rétention/suppression des données personnelles** (FSA, réponses de
   formulaire) — encore à formaliser, item déjà ouvert dans la checklist "Sécurité".
8. **Test de pénétration léger avant la présentation** : reprendre les items déjà listés
   dans la semaine "18 au 20 juillet" (RLS testée avec un compte non-admin, clés
   absentes du bundle, rate limiting testé, injection de prompt testée) et y ajouter un
   essai de scraping (boucle de requêtes anonymes contre `saveSubmission`) pour valider
   que le rate limit + futur Turnstile bloquent bien le scénario.

---

## Plan de migration application mobile (iOS/Android, bilingue) + admin web seul (23 juin 2026)

**Pas encore implémenté — plan seulement.** Bonne nouvelle : une bonne partie du
terrain est déjà préparée sans que ce soit un projet à part — `capacitor.config.ts`
existe déjà (`appId: ca.moncton.bmt`, `appName: Build Moncton`, `webDir: dist`),
`@capacitor/core`/`ios`/`android` sont déjà dans `package.json`, et l'app citoyenne
utilise déjà `HashRouter` (compatible nativement avec un WebView Capacitor, pas besoin
de routing serveur). Les dossiers natifs (`ios/`, `android/`) n'ont pas encore été
générés (`cap add ios` / `cap add android` jamais lancés).

**Portée : app citoyenne (`index.html` / `src/user`) en iOS + Android natif via
Capacitor, bilingue (déjà géré par `src/lib/lang.ts`). L'app admin (`admin.html` /
`src/admin`) reste volontairement web seul** — plus simple à patcher instantanément
(pas de délai de revue App Store/Play Store pour un correctif), et son usage (quelques
admins, sur ordinateur) ne justifie pas une app native.

**Phase 1 — préparer le shell natif (rapide, peut se faire avant la présentation) :**
- Finaliser le PWA existant : le manifest (`manifest.json`) est déjà lié dans
  `index.html`, mais `registerServiceWorker()` (`registerSW.ts`, racine du repo)
  n'est **pas appelé** depuis `src/user/main.tsx` actuellement — soit le brancher, soit
  le retirer s'il est obsolète (à trancher).
  Vérifier au passage : `App.tsx`, `Auth.tsx`, `FormPage4.tsx`, `Home.tsx`,
  `LanguageChoice.tsx`, `AdminLogo.tsx` à la racine du repo semblent être des fichiers
  legacy non utilisés par le build actuel (le vrai code vit sous `src/user` et
  `src/admin`) — à confirmer et nettoyer pour éviter la confusion.
- `npx cap add ios` / `npx cap add android` pour générer les projets natifs, puis
  `npm run build:mobile` (déjà scripté) pour les garder synchronisés avec `dist/`.
- Icônes/splash screen aux bonnes résolutions (actuellement un seul `icon.svg`) +
  config `SplashScreen` déjà présente dans `capacitor.config.ts`.
- Permissions natives à déclarer : géolocalisation (`GeolocateControl` utilisé dans
  `MapPage.tsx` — nécessite une chaîne de permission `NSLocationWhenInUseUsageDescription`
  côté iOS et la permission `ACCESS_FINE_LOCATION` côté Android, configurées via le
  plugin Capacitor Geolocation).
- Le travail récent sur les zones sûres (`env(safe-area-inset-*)`, fait le 23 juin sur
  `MapPage.tsx`) profite directement à l'app native — pas de travail supplémentaire
  pour les encoches/barres système.

**Phase 2 — bilingue dans le contexte natif :**
- Le contenu est déjà bilingue (`lang.ts`), seule la persistance du choix
  (`localStorage`) doit être vérifiée dans le WebView Capacitor (fonctionne nativement,
  pas de changement de code attendu).
- Pour une vraie expérience native : détecter la langue de l'appareil au premier
  lancement comme valeur par défaut plutôt que de toujours démarrer sur `fr`.
- Fiches App Store / Play Store à soumettre en fr **et** en, noms et descriptions
  localisés (`CFBundleDisplayName`/`strings.xml` si on veut aussi un nom d'app localisé,
  optionnel).

**Phase 3 — soumission aux stores (à traiter après la présentation, pas avant) :**
- Comptes développeur : Apple Developer Program (99 $US/an) + Google Play Developer
  (25 $US, paiement unique).
- Politique de confidentialité publique obligatoire (collecte de géolocalisation, auth
  anonyme) avant soumission sur les deux stores.
- Apple est parfois strict sur les apps "wrapper WebView" — un Capacitor bien intégré
  (apparence native, pas juste un iframe du site) passe généralement la revue, mais
  prévoir une marge pour un premier rejet/itération.
- Pour la démo au ministère, **pas besoin d'attendre la publication officielle** : un
  build TestFlight (iOS) ou un APK signé installable directement (Android) suffit à
  démontrer "c'est une vraie app mobile" sans le délai de revue des stores.

**Recommandation de séquencement vu le calendrier (présentation le 20 juillet) :**
Phase 1 peut se faire en parallèle des semaines 3-4 sans gêner le cerveau IA — c'est
indépendant. Garder les Phases 2-3 (peaufinage + soumission stores) pour après la
présentation, sauf si tu veux explicitement un build installable (TestFlight/APK) à
montrer le jour J plutôt qu'une démo web — à trancher ensemble.
