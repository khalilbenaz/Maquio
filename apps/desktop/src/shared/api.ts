// Frontiere figee entre les trois cotes de l'application (main, preload,
// renderer). Ce fichier ne contient QUE des types et la liste des canaux :
// il n'importe ni Electron, ni React, ni Node, ni meme les paquets du
// monorepo (@maquio/core, @maquio/codegen, @maquio/figma, @maquio/ai) --
// les quelques types qui en proviennent (ExporterId, ImportReport) sont
// dupliques ci-dessous a l'identique, pour que ce fichier reste sans
// aucune dependance et puisse etre importe tel quel par les trois cotes.
//
// API_CHANNELS est la source de verite unique des noms de canaux IPC : le
// main y enregistre un ipcMain.handle par entree, le preload expose
// exactement ces noms, et les tests verifient les deux contre cette liste.
// Aucun nom de canal ne doit etre ecrit en dur ailleurs dans le code.

// Duplique de @maquio/codegen (ExporterId), voir la note ci-dessus.
export type ExporterId = 'flutter' | 'react-native' | 'swiftui' | 'compose' | 'svg' | 'figma'

// Duplique de @maquio/codegen (Exporter, prive de sa methode export() qui
// ne traverserait pas l'IPC) : ce que listExporters() rend au renderer
// pour peupler le menu d'export sans jamais importer @maquio/codegen
// (Tache 17, decision du brief sur la barre d'outils).
export type ExportTargetInfo = { id: ExporterId; label: string; maturity: 'complete' | 'preview' }

// Duplique de @maquio/figma (ImportWarning / ImportReport), voir la note
// ci-dessus.
export type ImportWarning = { nodeId: string; nodeName: string; reason: string }
export type ImportReport = { nodesImported: number; warnings: ImportWarning[] }

export type MaquioApi = {
  openDocument(): Promise<{ path: string; json: string } | null>
  // Ouverture d'un chemin donne (glisser-deposer, ouverture par le systeme) ;
  // seules les extensions de document (.maquio, ancien .calque) sont acceptees.
  openDocumentAt(path: string): Promise<{ path: string; json: string }>
  saveDocument(input: { path: string | null; json: string }): Promise<{ path: string } | null>
  importFigma(
    input: { source: 'api'; fileKey: string } | { source: 'file' },
  ): Promise<{ json: string; report: ImportReport } | null>
  exportProject(input: {
    exporterId: ExporterId
    json: string
    projectName: string
    // Identifiant de l'ecran actif du renderer : ecran de DEPART de la
    // navigation generee (route initiale). Tous les ecrans sont exportes.
    // Absent = le premier ecran.
    activeScreenId?: string
    // Chemin du .maquio courant (null si jamais enregistre) : sert a retrouver
    // les images relatives dans `<nom>.ressources/` pour les copier.
    documentPath?: string | null
  }): Promise<{ directory: string; files: string[]; warnings: string[] } | null>
  listExporters(): Promise<ExportTargetInfo[]>
  // Tache 17 : rend aussi documentJson (le document apres application de la
  // commande composite atomique, calculee cote main via @maquio/ai) en plus
  // de patchJson (pour l'affichage du resume) -- le renderer ne peut pas
  // reconstruire la commande lui-meme sans importer @maquio/ai (interdit),
  // il se contente de rejouer le remplacement de document (voir
  // ClaudePanel.tsx), ce qui reste annulable en un seul geste.
  askClaude(input: {
    instruction: string
    json: string
    selectionIds: string[]
    pageId: string
  }): Promise<{ patchJson: string; documentJson: string }>
  // Point 2 de la reparation du pont : interrompt reellement la demande
  // askClaude en cours (au plus une a la fois -- le bouton "Demander à
  // Claude" reste desactive pendant l'attente, voir ClaudePanel.tsx), en
  // declenchant cote main l'AbortSignal transmis jusqu'a
  // ProcessClaudeRunner.run (packages/ai/src/runner.ts), qui tue
  // reellement le sous-processus. Ne leve jamais si aucune demande n'est
  // en cours (no-op silencieux) : le panneau peut l'appeler sans avoir a
  // suivre lui-meme si une demande est encore active a l'instant du clic.
  cancelClaude(): Promise<void>
  claudeAvailable(): Promise<boolean>
  // La connexion a Claude Code se regle dans les reglages, au meme titre
  // que le jeton Figma : getSettings rend maintenant aussi l'etat de
  // detection du binaire `claude` (trouve ou non, et le chemin REELLEMENT
  // resolu quand il l'est -- l'information qui permet de comprendre quel
  // `claude` sera lance s'il y en a plusieurs), ainsi que le chemin
  // personnalise actuellement enregistre (null si aucun).
  getSettings(): Promise<{
    hasFigmaToken: boolean
    claudeAvailable: boolean
    claudePath: string | null
    claudeCustomPath: string | null
  }>
  setFigmaToken(token: string): Promise<void>
  // Enregistre (ou efface, avec une chaine vide) un chemin personnalise
  // vers le binaire `claude`, utile quand il n'est pas dans le PATH de
  // l'application (cas courant sur macOS : une application lancee depuis
  // le Finder n'herite pas du PATH d'un shell de connexion). Un chemin
  // inexistant, non executable, ou qui designe un dossier est refuse avec
  // sa raison (l'ancien reglage n'est pas ecrase) -- voir
  // claudeSettingsHandlers.ts. Rend le nouvel etat de detection, deja a
  // jour avec le reglage applique.
  setClaudeCustomPath(path: string): Promise<{ claudeAvailable: boolean; claudePath: string | null }>
  // Défaut n3 (« comment mettre l'image ? ») : sélecteur de fichier natif
  // pour choisir une image, utilisé au tracé d'un nœud Image (voir
  // useDragInteraction.ts) et depuis l'inspecteur (« Choisir une image… »,
  // voir InspectorPanel.tsx). Rend le chemin ABSOLU choisi, ou null si
  // l'utilisateur annule -- aucun nœud n'est créé/modifié dans ce cas.
  // Le chemin absolu n'est relogé sous `<document>.ressources/` (et rendu
  // relatif) qu'au moment de l'enregistrement du document (voir
  // documentHandlers.ts) : tant que le document n'a jamais été enregistré,
  // il n'y a nulle part où le copier.
  chooseImage(): Promise<string | null>
  // Theme de l'editeur (systeme, clair, sombre) : memorise cote main, applique
  // sans redemarrage (nativeTheme) et sans flash au lancement.
  getThemePreference(): Promise<'system' | 'light' | 'dark'>
  setThemePreference(preference: 'system' | 'light' | 'dark'): Promise<void>
}

export const API_CHANNELS = [
  'openDocument',
  'openDocumentAt',
  'saveDocument',
  'importFigma',
  'exportProject',
  'listExporters',
  'askClaude',
  'cancelClaude',
  'claudeAvailable',
  'getSettings',
  'setFigmaToken',
  'setClaudeCustomPath',
  'chooseImage',
  'getThemePreference',
  'setThemePreference',
] as const
