// Generation d'une application ECRAN PAR ECRAN.
//
// En un seul patch, Claude consacrait son effort a la plomberie de ~200
// noeuds (coordonnees, identifiants) plutot qu'au design de chaque ecran, et
// ne voyait jamais son rendu. Ici :
// 1. plan : direction artistique, tokens et liste des ecrans (ids fixes) ;
// 2. ecrans : un appel par ecran, UN A LA FOIS (CONCURRENCY), chacun avec
//    toute l'attention du modele ; les ids etant connus d'avance, les
//    interactions sont reliees directement ;
// 3. critique visuelle (si `renderScreen` est fourni) : chaque ecran est
//    rendu en PNG et montre a Claude, qui le critique et le corrige ;
// 4. assemblage en UN patch (setTokens + un insertNode par ecran), applique
//    par l'appelant en une seule commande annulable.
// Chaque appel passe par la boucle de correction (correction-loop.ts).
import { z } from 'zod'
import { applyAutoLayout, createNodeCommand, nodeSchema, setTokensCommand } from '@maquio/core'
import type { DesignTokens, DevicePreset, FrameNode, MaquioDocument, Node } from '@maquio/core'
import type { ClaudeActivity, ClaudeRunner } from './runner'
import { ClaudeCancelledError } from './runner'
import { askWithCorrections } from './correction-loop'
import { InvalidPatchError, extractFirstJsonObject, tokensPatchSchema } from './patch'
import type { DocumentPatch } from './patch'
import { NODE_FORMAT_TEXT } from './prompt'
import { DESIGN_GUIDE_TEXT } from './design-guide'
import { lintDesign } from './design-lint'
import { previewScreen } from './preview'
import { parsePartialJson } from './partial-json'

// Valeur (meme incomplete) de la chaine "direction" d'un plan en cours
// d'ecriture : affichee au fil de l'eau, avant que la chaine se ferme.
function partialDirection(text: string): string | null {
  const m = /"direction"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text)
  if (m === null) return null
  // Une sequence d'echappement coupee en fin de texte est retiree.
  const brut = m[1]!.replace(/\\$/, '')
  try {
    return JSON.parse(`"${brut}"`) as string
  } catch {
    return brut
  }
}

function planDetail(text: string): string {
  const direction = partialDirection(text) ?? ''
  const partial = parsePartialJson(text) as { screens?: { name?: unknown }[] } | null
  const noms = (partial?.screens ?? []).map((s) => s.name).filter((n): n is string => typeof n === 'string')
  return noms.length > 0 ? `${direction}\n\nÉcrans : ${noms.join(', ')}` : direction
}

function critiqueDetail(name: string, text: string): string {
  const partial = parsePartialJson(text) as { critique?: unknown[] } | null
  const points = (partial?.critique ?? []).filter((c): c is string => typeof c === 'string')
  return points.length > 0 ? `${name}\n${points.map((p) => `• ${p}`).join('\n')}` : `${name} : examen du rendu…`
}

// Un ecran a la fois : plusieurs processus `claude` simultanes (200 a
// 400 Mo chacun) saturaient la memoire d'une machine deja chargee.
export const CONCURRENCY = 1
const SCREEN_GAP = 120

export type AppPlanScreen = { id: string; name: string; brief: string }
export type AppPlan = { summary: string; direction: string; tokens: Partial<DesignTokens>; screens: AppPlanScreen[] }

// `detail` : ce qui se passe en ce moment, lisible par l'utilisateur
// (direction artistique en cours d'ecriture, ecran dessine, points de
// critique) ; mis a jour en direct.
export type PipelineProgress = { step: 'plan' | 'screens' | 'critique'; done: number; total: number; detail?: string }
// Rend l'ecran `screenId` du document en PNG (base64), tel que l'utilisateur
// le verra : fourni par l'application (fenetre cachee), absent en test.
export type ScreenRenderer = (document: MaquioDocument, pageId: string, screenId: string) => Promise<string>
// Dessin en direct : les ecrans deja dessines et celui en cours d'ecriture
// (`currentId`), tels qu'ils seront places sur la page.
// `step` et `activity` : ce que fait Claude sur l'ecran courant (prepare
// = appel lance, reflechit = reflexion du modele, ecrit = elements qui
// arrivent), pour l'etiquette du canevas.
// fixing : relance de correction, l'ecran precedent reste affiche.
export type PreviewActivity = 'preparing' | ClaudeActivity | 'fixing'
export type PipelinePreview = { screens: FrameNode[]; currentId: string | null; step?: 'screens' | 'critique'; activity?: PreviewActivity }
export type PipelineHooks = {
  onProgress?: (p: PipelineProgress) => void
  renderScreen?: ScreenRenderer
  onPreview?: (p: PipelinePreview) => void
  // Intervalle minimal entre deux apercus en cours d'ecriture (defaut 250 ms) ;
  // la fin de chaque ecran est toujours signalee.
  previewIntervalMs?: number
}

// Demande de creation d'une application ou d'un ensemble d'ecrans : verbe de
// creation suivi de ce qui est cree. Une retouche (« aligne », « traduis »,
// « améliore ce bouton ») reste une edition en un seul patch.
const CREATION = /\b(cr[ée]{1,2}[rz]?|g[ée]n[èée]r(e|er|ez)|con[çc]oi[st]|concevoir|fais|faire|imagine[rz]?|design(e|er|ez)?)\b[\s\S]*\b(app|apps|application|applications|appli|[ée]crans|parcours|onboarding)\b/i

export function isAppCreationRequest(instruction: string): boolean {
  return CREATION.test(instruction)
}

const planSchema = z
  .object({
    summary: z.string(),
    direction: z.string().min(1),
    tokens: tokensPatchSchema,
    screens: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), name: z.string().min(1), brief: z.string().min(1) }).strict())
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const seen = new Set<string>()
    plan.screens.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: ['screens', i, 'id'], message: `id en double : ${s.id}` })
      seen.add(s.id)
    })
  })

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(extractFirstJsonObject(raw))
  } catch (err) {
    if (err instanceof InvalidPatchError) throw err
    throw new InvalidPatchError('JSON malforme dans la reponse de Claude Code')
  }
}

export function parsePlan(raw: string): AppPlan {
  const result = planSchema.safeParse(parseJson(raw))
  if (!result.success) throw new InvalidPatchError('Plan invalide', { cause: result.error })
  return result.data
}

function pageOf(document: MaquioDocument, pageId: string) {
  const page = document.pages.find((p) => p.id === pageId)
  if (page === undefined) throw new Error(`Page introuvable : ${pageId}`)
  return page
}

// Les nouveaux ecrans s'alignent a droite de ceux qui existent deja.
function placements(document: MaquioDocument, pageId: string, count: number, device: DevicePreset) {
  const page = pageOf(document, pageId)
  const right = page.nodes.reduce((max, n) => Math.max(max, n.frame.x + n.frame.w), Number.NEGATIVE_INFINITY)
  const startX = Number.isFinite(right) ? right + SCREEN_GAP : 0
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * (device.width + SCREEN_GAP), y: 0, w: device.width, h: device.height }))
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node)
  if (node.type === 'frame') for (const c of node.children) walk(c, visit)
}

// Cibles d'interaction : une navigation vise un AUTRE ecran du plan, un
// overlay un element de cet ecran.
function linkProblems(screen: FrameNode, screenIds: Set<string>): string[] {
  const ids = new Set<string>()
  walk(screen, (n) => ids.add(n.id))
  const problems: string[] = []
  walk(screen, (n) => {
    for (const it of n.interactions ?? []) {
      if (it.action.type === 'navigate' && (!screenIds.has(it.action.target) || it.action.target === screen.id)) {
        problems.push(`- "${n.id}" navigue vers "${it.action.target}", qui n'est pas un autre écran de l'application (ids possibles : ${[...screenIds].filter((s) => s !== screen.id).join(', ')})`)
      }
      if (it.action.type === 'openOverlay' && !ids.has(it.action.target)) {
        problems.push(`- "${n.id}" ouvre "${it.action.target}", absent de cet écran`)
      }
    }
    if (n.type === 'component' && n.kind === 'bottomNav') {
      for (const item of (n.props as { items?: { label?: string; target?: string }[] }).items ?? []) {
        if (item.target !== undefined && !screenIds.has(item.target)) {
          problems.push(`- onglet « ${item.label ?? ''} » de "${n.id}" vise "${item.target}", qui n'est pas un écran de l'application`)
        }
      }
    }
  })
  return problems
}

const screenResponseSchema = z.object({ critique: z.array(z.string()).optional(), node: nodeSchema }).strict()

function parseScreen(raw: string, spec: AppPlanScreen, frame: FrameNode['frame'], device: DevicePreset, screenIds: Set<string>): FrameNode {
  const result = screenResponseSchema.safeParse(parseJson(raw))
  if (!result.success) throw new InvalidPatchError('Écran invalide', { cause: result.error })
  const node = result.data.node
  if (node.type !== 'frame') throw new InvalidPatchError(`"node" doit être une "frame" d'écran, pas un "${node.type}"`)
  if (node.id !== spec.id) throw new InvalidPatchError(`"node.id" doit valoir "${spec.id}" (reçu "${node.id}")`)
  const problems = linkProblems(node, screenIds)
  if (problems.length > 0) throw new InvalidPatchError(`Interactions invalides :\n${problems.join('\n')}`)
  // Position et appareil imposes : la mise en page de la page est la notre.
  return { ...node, frame, device }
}

function context(instruction: string, plan: AppPlan, device: DevicePreset): string {
  return `Instruction de l'utilisateur : ${instruction}

Direction artistique de l'application (a respecter sur chaque ecran) :
${plan.direction}

Tokens de l'application (couleurs, typographie, espacements -- reprends EXACTEMENT ces valeurs) :
${JSON.stringify(plan.tokens)}

Ecrans de l'application (ids a utiliser comme cibles de navigation) :
${plan.screens.map((s) => `- "${s.id}" : ${s.name} -- ${s.brief}`).join('\n')}

Appareil : ${JSON.stringify(device)}`
}

const SCREEN_FORMAT = (spec: AppPlanScreen, device: DevicePreset) => `Reponds UNIQUEMENT avec un objet JSON { "node": <frame d'ecran complete> }, eventuellement dans un bloc de code : une "frame" d'id "${spec.id}", de nom "${spec.name}", avec "device" = ${JSON.stringify(device)} et "frame" = { "x": 0, "y": 0, "w": ${device.width}, "h": ${device.height} }, son fond et TOUS ses enfants. Les interactions "navigate" (et les "target" des onglets) ne visent QUE les ids d'ecrans listes ci-dessus, jamais "${spec.id}" lui-meme ; un "openOverlay" vise un element de CET ecran.`

export function buildPlanPrompt(instruction: string, document: MaquioDocument, pageId: string): string {
  const existing = pageOf(document, pageId).nodes.map((n) => n.name)
  return `Tu es directeur artistique et designer produit senior. Tu prepares la conception d'une application mobile dans l'editeur Maquio, avant que chaque ecran soit dessine separement.

Instruction de l'utilisateur : ${instruction}

${existing.length > 0 ? `Elements deja presents sur la page (a ne pas recreer) : ${existing.join(', ')}` : 'La page est vide.'}

Definis :
- "direction" : le parti pris visuel en 4 a 6 phrases precises et concretes (ambiance, role de chaque couleur, typographie, forme des surfaces, composition SIGNATURE de l'ecran principal, ton des textes). Evite le generique : l'application doit avoir une identite reconnaissable ;
- "tokens" : { "colors": { "accent", "background", "surface", "textPrimary", "textSecondary", "border", "success", "error", ... }, "spacing": { ... } } (couleurs { "r", "g", "b", "a" } entre 0 et 1 ; "typography" facultatif, chaque style avec fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, color, align) ;
- "screens" : 3 a 10 ecrans couvrant le parcours complet, chacun { "id" (kebab-case unique, ex. "accueil"), "name" (ex. "Écran Accueil"), "brief" (2 a 4 phrases : sections, donnees cles, et pour chaque action l'id de l'ecran vise) }. Le premier ecran est le point d'entree.
- "summary" : une phrase qui resume ce qui est cree.

Reponds UNIQUEMENT avec ce JSON : { "summary", "direction", "tokens", "screens" }.

${DESIGN_GUIDE_TEXT}`
}

export function buildScreenPrompt(instruction: string, plan: AppPlan, spec: AppPlanScreen, device: DevicePreset): string {
  return `Tu es designer produit senior. Tu dessines UN SEUL ecran d'une application mobile dans l'editeur Maquio : prends le temps de soigner chaque detail (hierarchie, alignements sur une grille de 4, rythme vertical, contrastes, finitions), comme pour un ecran de presentation.

${context(instruction, plan, device)}

Ecran a dessiner : "${spec.id}" -- ${spec.name}
${spec.brief}

${SCREEN_FORMAT(spec, device)}

${NODE_FORMAT_TEXT}

${DESIGN_GUIDE_TEXT}`
}

export function buildCritiquePrompt(instruction: string, plan: AppPlan, spec: AppPlanScreen, device: DevicePreset, screen: FrameNode): string {
  return `Tu es directeur artistique exigeant. L'image jointe est le RENDU REEL, dans Maquio, de l'ecran "${spec.id}" (${spec.name}) d'une application mobile ; son JSON actuel est donne plus bas.

${context(instruction, plan, device)}

Ecran critique : "${spec.id}" -- ${spec.brief}

JSON actuel de l'ecran :
${JSON.stringify(screen)}

Examine l'image comme lors d'une revue de design : hierarchie et point focal, alignements, rythme et espacements, contraste et lisibilite, textes rognes ou superposes, densite, coherence avec la direction artistique, finitions, generique ou "look IA". Liste dans "critique" les 3 a 6 defauts les plus visibles, puis corrige-les TOUS dans "node" (l'ecran COMPLET corrige, meme id), sans perdre le contenu ni les interactions qui fonctionnent.

Reponds UNIQUEMENT avec { "critique": ["..."], "node": <frame d'ecran complete> }. ${SCREEN_FORMAT(spec, device)}

${NODE_FORMAT_TEXT}

${DESIGN_GUIDE_TEXT}`
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}

function countNodes(node: Node): number {
  return node.type === 'frame' ? 1 + node.children.reduce((n, c) => n + countNodes(c), 0) : 1
}

function subtreeIds(node: Node): Set<string> {
  const ids = new Set<string>()
  walk(node, (n) => ids.add(n.id))
  return ids
}

export async function generateApp(
  runner: ClaudeRunner,
  input: { instruction: string; document: MaquioDocument; pageId: string },
  hooks: PipelineHooks,
  signal?: AbortSignal,
): Promise<DocumentPatch> {
  const { instruction, document, pageId } = input
  const device = pageOf(document, pageId).device
  const progress = hooks.onProgress ?? (() => {})
  const check = () => {
    if (signal?.aborted) throw new ClaudeCancelledError()
  }

  const interval = hooks.previewIntervalMs ?? 250
  // Detail en direct, limite en frequence comme l'apercu.
  let lastDetail = Date.now()
  const liveProgress = (p: PipelineProgress) => {
    const now = Date.now()
    if (now - lastDetail < interval) return
    lastDetail = now
    progress(p)
  }

  // 1. Plan.
  progress({ step: 'plan', done: 0, total: 1 })
  const plan = await askWithCorrections({
    runner,
    signal,
    prompt: buildPlanPrompt(instruction, document, pageId),
    parse: parsePlan,
    onText: (text) => {
      const detail = planDetail(text)
      if (detail !== '') liveProgress({ step: 'plan', done: 0, total: 1, detail })
    },
  })
  progress({ step: 'plan', done: 1, total: 1, detail: `${plan.direction}\n\nÉcrans : ${plan.screens.map((s) => s.name).join(', ')}` })
  check()

  const screenIds = new Set(plan.screens.map((s) => s.id))
  const frames = placements(document, pageId, plan.screens.length, device)
  const withTokens = setTokensCommand(plan.tokens).apply(document)
  // Document de controle : tokens du plan + l'ecran examine (lint d'accent,
  // auto-layout).
  const docWith = (screens: FrameNode[]) => screens.reduce((doc, s) => createNodeCommand(pageId, null, s).apply(doc), withTokens)
  const defectsOf = (screen: FrameNode) => lintDesign(docWith([screen]), pageId, subtreeIds(screen))

  // Apercu en direct : un ecran par entree du plan, rempli au fil du dessin.
  const shown: (FrameNode | undefined)[] = plan.screens.map(() => undefined)
  let lastPreview = Date.now()
  let step: 'screens' | 'critique' = 'screens'
  let activity: PreviewActivity = 'preparing'
  const emit = (currentId: string | null, force: boolean) => {
    if (hooks.onPreview === undefined) return
    const now = Date.now()
    if (!force && now - lastPreview < interval) return
    lastPreview = now
    // Mis en page comme le fera le document (row, column, grille) : sans
    // cela, les enfants d'un cadre automatique s'empileraient tous a leurs
    // coordonnees brutes, souvent 0,0.
    hooks.onPreview({ screens: shown.filter((s): s is FrameNode => s !== undefined).map(applyAutoLayout), currentId, step, activity })
  }
  // Une relance (correction, revue) reecrit l'ecran depuis le debut : la
  // version affichee reste en place tant que la nouvelle ne l'a pas
  // rattrapee (`keep` = son nombre d'elements), l'ecran ne se vide jamais.
  const keep: (number | null)[] = plan.screens.map(() => null)
  const wrote: boolean[] = plan.screens.map(() => false)
  const live = (i: number) => (text: string) => {
    const spec = plan.screens[i]!
    const p = previewScreen(text, spec.id, frames[i]!, device)
    if (p === null) return
    const base = keep[i]
    if (base !== null && base !== undefined) {
      if (countNodes(p) < base) return
      keep[i] = null
    }
    shown[i] = p
    emit(spec.id, false)
  }
  // Debut d'un ecran : en dessin, son cadre vide apparait aussitot a sa
  // place ; en revue, l'ecran reste affiche tel quel.
  const begin = (i: number, nextStep: 'screens' | 'critique') => {
    step = nextStep
    activity = 'preparing'
    const spec = plan.screens[i]!
    wrote[i] = false
    keep[i] = nextStep === 'critique' && shown[i] !== undefined ? countNodes(shown[i]!) : null
    if (nextStep === 'screens') {
      shown[i] = { id: spec.id, name: spec.name, type: 'frame', frame: frames[i]!, visible: true, locked: false, opacity: 1, rotation: 0, layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' }, fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }], strokes: [], cornerRadius: 0, clipsContent: true, children: [], device }
    }
    emit(spec.id, true)
  }
  const phase = (i: number) => (next: ClaudeActivity) => {
    if (next === 'thinking' && wrote[i] && shown[i] !== undefined) {
      // Nouvel essai apres une reponse ecrite : relance de correction.
      keep[i] = countNodes(shown[i]!)
      activity = 'fixing'
    } else if (!(next === 'writing' && activity === 'fixing')) {
      activity = next
    }
    if (next === 'writing') wrote[i] = true
    emit(plan.screens[i]!.id, true)
  }
  const settle = (i: number, screen: FrameNode) => {
    keep[i] = null
    shown[i] = screen
    emit(plan.screens[i]!.id, true)
  }

  // 2. Ecrans, un a la fois.
  let done = 0
  progress({ step: 'screens', done, total: plan.screens.length })
  let screens = await mapLimit(plan.screens, CONCURRENCY, async (spec, i) => {
    check()
    progress({ step: 'screens', done, total: plan.screens.length, detail: `${spec.name} — ${spec.brief}` })
    begin(i, 'screens')
    const screen = await askWithCorrections({
      runner,
      signal,
      prompt: buildScreenPrompt(instruction, plan, spec, device),
      parse: (raw) => parseScreen(raw, spec, frames[i]!, device, screenIds),
      defects: defectsOf,
      onText: live(i),
      onActivity: phase(i),
    })
    settle(i, screen)
    progress({ step: 'screens', done: ++done, total: plan.screens.length, detail: `${spec.name} — ${spec.brief}` })
    return screen
  })

  // 3. Critique visuelle : rendu reel de chaque ecran, revu par Claude. Un
  // echec (rendu ou reponse) garde l'ecran tel quel : la critique ameliore,
  // elle ne doit jamais faire perdre un ecran valide.
  const render = hooks.renderScreen
  if (render !== undefined) {
    check()
    const full = docWith(screens)
    let reviewed = 0
    progress({ step: 'critique', done: reviewed, total: screens.length })
    screens = await mapLimit(screens, CONCURRENCY, async (screen, i) => {
      check()
      const spec = plan.screens[i]!
      let result = screen
      progress({ step: 'critique', done: reviewed, total: screens.length, detail: critiqueDetail(spec.name, '') })
      begin(i, 'critique')
      try {
        const png = await render(full, pageId, screen.id)
        result = await askWithCorrections({
          runner,
          signal,
          images: [{ mediaType: 'image/png', base64: png }],
          prompt: buildCritiquePrompt(instruction, plan, spec, device, screen),
          parse: (raw) => parseScreen(raw, spec, frames[i]!, device, screenIds),
          defects: defectsOf,
          onText: (text) => {
            live(i)(text)
            liveProgress({ step: 'critique', done: reviewed, total: screens.length, detail: critiqueDetail(spec.name, text) })
          },
          onActivity: phase(i),
        })
      } catch (err) {
        if (err instanceof ClaudeCancelledError || signal?.aborted) throw err
      }
      settle(i, result)
      progress({ step: 'critique', done: ++reviewed, total: screens.length })
      return result
    })
  }

  // 4. Assemblage.
  return {
    summary: plan.summary,
    ops: [
      ...(Object.keys(plan.tokens).length > 0 ? [{ op: 'setTokens' as const, tokens: plan.tokens }] : []),
      ...screens.map((node) => ({ op: 'insertNode' as const, parentId: null, node })),
    ],
  }
}
