-- BMT — nettoyage des soumissions de test accumulées pendant le développement
-- (semaines 1-2 : bug auth anonyme, validation FSA, bug zigzag corridors).
-- À exécuter une seule fois dans le SQL Editor Supabase avant les prochains tests
-- de la carte admin, pour repartir sur une base propre.
--
-- `routes`, `stops` et `forms` ont une FK `on delete cascade` vers `submissions`
-- (cf. 0001_init.sql) : vider `submissions` suffit à tout nettoyer d'un coup.
-- Les tables `users` et `admins` ne sont pas touchées (comptes réels à conserver).

delete from submissions;
