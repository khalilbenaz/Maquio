// Version courante du format de document Calque.
// Isole dans model/ (plutot que dans index.ts) pour eviter tout cycle
// d'import entre le barrel et les modules de model/ qui en dependent
// (voir document.ts, qui compare a cette constante).
export const DOCUMENT_VERSION = 1 as const
