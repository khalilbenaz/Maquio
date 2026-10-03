// Version courante du format de document Calque.
// Isole dans model/ (plutot que dans index.ts) pour eviter tout cycle
// d'import entre le barrel et les modules de model/ qui en dependent
// (voir document.ts, qui compare a cette constante).
//
// v2 (addendum navigation, 2026-09-21) : ecrans multiples et liens. Un
// document v1 se migre automatiquement a l'ouverture (voir
// migrateV1ToV2 dans document.ts) ; un document v2 se lit tel quel.
//
// v3 (composants mobiles) : noeuds `component` et conteneurs semantiques
// (`frame.container`). Purement ADDITIF : un document v1/v2 ne contient
// aucune de ces formes, il s'ouvre donc sans transformation de contenu
// (seul le numero de version est releve) ; un document v3 est refuse par
// une application qui ne connait que v2, comme tout document futur.
export const DOCUMENT_VERSION = 3 as const
