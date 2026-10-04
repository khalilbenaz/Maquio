// Version courante du format de document Maquio.
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
//
// v4 (interactions de prototype) : `NodeBase.link` est remplace par
// `interactions` (declencheur, action, transition). Un document v1/v2/v3 se
// migre a l'ouverture : chaque `link` devient `tap -> navigate` avec la
// transition par defaut (voir migrateLinks dans document.ts).
export const DOCUMENT_VERSION = 4 as const
