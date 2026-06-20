# BMT — Plan de construction (20 juin → 20 juillet 2026)

> Objectif final : présenter BMT au ministère des Transports avec un backend réel,
> un filtrage des utilisateurs par code postal, une numérotation fiable des dessins,
> et un "cerveau IA" capable de produire une étude de transit planning complète
> (analyse + budgétisation + rapport) à partir des dessins citoyens synthétisés.

Démarrage : 20 juin 2026, au réveil.
Échéance : 20 juillet 2026.

---

## État actuel (point de départ)

- React 19 + TypeScript + Vite, deux points d'entrée (`index.html` user, `admin.html` admin).
- **Aucun backend** : tout est dans `localStorage` (`src/lib/storage.ts`). Chaque appareil
  est isolé — l'admin ne voit que les données du navigateur où il consulte.
- Aucune authentification, aucun filtrage géographique des participants.
- Agrégation des dessins déjà codée et fonctionnelle (`src/lib/aggregation/`), grille spatiale,
  corridors, zones d'équité (`src/lib/equity/`), matrice OD (`src/lib/od/`).
- Carte admin (`AdminMapPage.tsx`) déjà migrée vers Mapbox GL JS, lit les vraies
  soumissions (les fausses données de démo viennent d'être retirées).
- Pas de stockage de documents de référence, pas de RAG, pas d'IA assistante, pas de
  module budgétaire.

---

## Semaine 1 — 20 au 26 juin : Fondations backend

**But : sortir du tout-`localStorage`, avoir une vraie base de données partagée.**

- [ ] Créer le projet Supabase (Postgres + extensions `postgis` + `pgvector`).
- [ ] Modéliser le schéma :
  ```sql
  users        (id uuid, postal_code text, created_at)
  submissions  (id uuid, user_id fk, submission_number int, created_at)
  routes       (id uuid, submission_id fk, points geography(LineString), color)
  stops        (id uuid, submission_id fk, pos geography(Point), type, label)
  forms        (id uuid, submission_id fk, answers jsonb)
  ```
- [ ] Activer Row Level Security (RLS) : un user ne peut écrire que ses propres
  soumissions, l'admin a un rôle séparé en lecture totale.
- [ ] Créer un client `src/lib/supabase.ts` (clé publique + URL en variable d'env Vite,
  même pattern que `VITE_MAPBOX_TOKEN`).
- [ ] Réécrire `src/lib/storage.ts` : remplacer les fonctions `saveRoutes`/`getRoutes`/
  `saveStops`/`getStops` par des appels Supabase, en gardant la même signature
  publique pour limiter les changements dans les pages appelantes.
- [ ] Garder `purgeSeedData()` actif le temps de la transition (nettoyage local),
  le retirer une fois la bascule confirmée stable.

**Livrable de fin de semaine :** un citoyen qui dessine sur un appareil voit sa
soumission apparaître dans Supabase, visible depuis n'importe quel autre appareil
connecté à l'admin.

---

## Semaine 2 — 27 juin au 3 juillet : Auth, filtrage géographique, numérotation

**But : seuls les citoyens de Moncton/Riverview/Dieppe participent, chaque dessin
est tracé et numéroté correctement.**

- [ ] Auth Supabase anonyme (un `user_id` stable, persistant entre sessions).
- [ ] Écran de saisie du code postal (intégré à `LanguageChoice.tsx` ou juste après).
- [ ] Validation par préfixe FSA (3 premiers caractères) — liste blanche des préfixes
  Moncton/Riverview/Dieppe. Refus poli + message explicatif si hors zone.
- [ ] Trigger Postgres (ou logique applicative) pour `submission_number` : incrément
  automatique par `user_id`, autorise les envois multiples, chacun numéroté.
- [ ] Mettre à jour `ResultsPage.tsx` et `AdminSimulator.tsx` pour lire depuis Supabase
  au lieu de `localStorage` (suite du nettoyage `ensureSeedData` déjà fait).
- [ ] `AdminMapPage.tsx` : abonnement Supabase Realtime pour mise à jour live de la
  carte mère sans recharger la page.

**Livrable de fin de semaine :** participation filtrée géographiquement, chaque
dessin tracé à un utilisateur et numéroté, carte admin mise à jour en direct.

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
- [ ] Revue de sécurité légère (RLS Supabase, clés exposées, validation des entrées).
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
