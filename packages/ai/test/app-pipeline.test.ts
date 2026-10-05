import { describe, expect, it } from 'vitest'
import { createDocument, findNode, isScreenNode } from '@maquio/core'
import { AiService } from '../src/service'
import { FakeClaudeRunner } from '../src/fake-runner'
import { generateApp, isAppCreationRequest } from '../src/app-pipeline'
import type { PipelineProgress } from '../src/app-pipeline'

const accent = { r: 0.06, g: 0.46, b: 0.43, a: 1 }

const plan = {
  summary: 'Wallet en deux écrans',
  direction: 'Sobre, un accent vert-bleu.',
  tokens: { colors: { accent } },
  screens: [
    { id: 'connexion', name: 'Écran Connexion', brief: 'Formulaire, bouton vers accueil' },
    { id: 'accueil', name: 'Écran Accueil', brief: 'Solde et transactions' },
  ],
}

function screenJson(id: string, name: string, opts: { target?: string; title?: string } = {}) {
  const text = {
    id: `${id}-titre`, name: 'Titre', type: 'text', frame: { x: 20, y: 80, w: 300, h: 40 }, visible: true, locked: false, opacity: 1, rotation: 0,
    characters: opts.title ?? name, style: { fontFamily: 'Inter', fontSize: 28, fontWeight: 700, lineHeight: 34, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' },
    ...(opts.target ? { interactions: [{ trigger: { type: 'tap' }, action: { type: 'navigate', target: opts.target }, transition: { type: 'push', durationMs: 300, easing: 'easeOut' } }] } : {}),
  }
  return JSON.stringify({
    node: {
      id, name, type: 'frame', frame: { x: 0, y: 0, w: 393, h: 852 }, visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: true, children: [text],
      device: { id: 'x', label: 'x', width: 393, height: 852, pixelRatio: 3 },
    },
  })
}

// Faux Claude qui repond selon le prompt recu (plan, ecran, critique).
function routeur(over: Partial<Record<string, (prompt: string, n: number) => string>> = {}) {
  const counts: Record<string, number> = {}
  return (prompt: string) => {
    const key = prompt.includes('RENDU REEL')
      ? `critique:${/ecran "([a-z-]+)"/.exec(prompt)![1]}`
      : prompt.includes('Ecran a dessiner')
        ? `ecran:${/Ecran a dessiner : "([a-z-]+)"/.exec(prompt)![1]}`
        : 'plan'
    counts[key] = (counts[key] ?? 0) + 1
    if (over[key]) return over[key]!(prompt, counts[key]!)
    if (key === 'plan') return JSON.stringify(plan)
    const id = key.split(':')[1]!
    const spec = plan.screens.find((s) => s.id === id)!
    return screenJson(id, spec.name, { target: id === 'connexion' ? 'accueil' : undefined, title: key.startsWith('critique') ? `${spec.name} (revu)` : undefined })
  }
}

describe('isAppCreationRequest', () => {
  it.each([
    'Crée une application wallet mywafacash',
    'Génère les écrans d onboarding',
    'Conçois une app de réservation',
    'Fais-moi les écrans du parcours de paiement',
  ])('reconnait une creation : %s', (s) => expect(isAppCreationRequest(s)).toBe(true))

  it.each(['aligne ces éléments sur leur bord gauche', 'traduis les textes en anglais', 'mets le bouton en vert'])(
    'laisse une retouche en edition : %s',
    (s) => expect(isAppCreationRequest(s)).toBe(false),
  )
})

describe('generateApp', () => {
  const doc = createDocument('T')
  const pageId = doc.pages[0]!.id

  it('planifie, dessine chaque ecran separement et assemble un seul patch', async () => {
    const runner = new FakeClaudeRunner(routeur())
    const patch = await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, {})
    expect(runner.prompts.filter((p) => p.includes('Ecran a dessiner'))).toHaveLength(2)
    expect(patch.summary).toBe('Wallet en deux écrans')
    expect(patch.ops.map((o) => o.op)).toEqual(['setTokens', 'insertNode', 'insertNode'])
    const [, a, b] = patch.ops as { node: { id: string; frame: { x: number } } }[]
    expect([a!.node.id, b!.node.id]).toEqual(['connexion', 'accueil'])
    expect(b!.node.frame.x).toBeGreaterThan(a!.node.frame.x)
  })

  it('chaque prompt d ecran porte la direction, les tokens et les ids des autres ecrans', async () => {
    const runner = new FakeClaudeRunner(routeur())
    await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, {})
    const p = runner.prompts.find((x) => x.includes('Ecran a dessiner : "accueil"'))!
    expect(p).toContain('Sobre, un accent vert-bleu.')
    expect(p).toContain('"connexion"')
    expect(p).toContain(JSON.stringify(plan.tokens))
  })

  it('renvoie a Claude une navigation vers un ecran inexistant', async () => {
    const runner = new FakeClaudeRunner(
      routeur({ 'ecran:connexion': (_p, n) => screenJson('connexion', 'Écran Connexion', { target: n === 1 ? 'tableau-de-bord' : 'accueil' }) }),
    )
    const patch = await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, {})
    expect(runner.prompts.some((p) => p.includes('"tableau-de-bord"') && p.includes('REJETÉE'))).toBe(true)
    expect(JSON.stringify(patch)).not.toContain('tableau-de-bord')
  })

  it('critique visuelle : montre le rendu de chaque ecran et garde la version revue', async () => {
    const runner = new FakeClaudeRunner(routeur())
    const rendus: string[] = []
    const patch = await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, {
      renderScreen: async (_d, _p, id) => {
        rendus.push(id)
        return 'UE5H'
      },
    })
    expect(rendus.sort()).toEqual(['accueil', 'connexion'])
    const critiques = runner.prompts.map((p, i) => ({ p, o: runner.options[i] })).filter(({ p }) => p.includes('RENDU REEL'))
    expect(critiques).toHaveLength(2)
    expect(critiques[0]!.o?.images).toEqual([{ mediaType: 'image/png', base64: 'UE5H' }])
    expect(JSON.stringify(patch)).toContain('Écran Accueil (revu)')
  })

  it('garde l ecran d origine si sa critique est inexploitable', async () => {
    const runner = new FakeClaudeRunner(routeur({ 'critique:accueil': () => 'je ne sais pas' }))
    const patch = await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, { renderScreen: async () => 'UE5H' })
    const json = JSON.stringify(patch)
    expect(json).toContain('Écran Connexion (revu)')
    expect(json).toContain('"characters":"Écran Accueil"')
  })

  it('signale sa progression : plan, ecrans, critique', async () => {
    const etapes: PipelineProgress[] = []
    await generateApp(new FakeClaudeRunner(routeur()), { instruction: 'Crée un wallet', document: doc, pageId }, {
      renderScreen: async () => 'UE5H',
      onProgress: (p) => etapes.push(p),
    })
    expect(etapes[0]).toEqual({ step: 'plan', done: 0, total: 1 })
    expect(etapes).toContainEqual({ step: 'screens', done: 2, total: 2 })
    expect(etapes.at(-1)).toEqual({ step: 'critique', done: 2, total: 2 })
  })
})

describe('AiService : creation d application', () => {
  it('passe par la generation ecran par ecran et rend une commande unique', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const out = await new AiService(new FakeClaudeRunner(routeur())).ask({ instruction: 'Crée une application wallet', document: doc, selectionIds: [], pageId })
    const apres = out.command.apply(doc)
    const ecrans = apres.pages[0]!.nodes.filter(isScreenNode).map((s) => s.id)
    expect(ecrans).toEqual(expect.arrayContaining(['connexion', 'accueil']))
    expect(findNode(apres.pages[0]!.nodes, 'connexion-titre')?.interactions?.[0]?.action).toEqual({ type: 'navigate', target: 'accueil' })
    expect(apres.tokens.colors.accent).toEqual(accent)
  })
})
