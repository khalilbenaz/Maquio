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
    const sansDetail = etapes.map(({ step, done, total }) => ({ step, done, total }))
    expect(sansDetail[0]).toEqual({ step: 'plan', done: 0, total: 1 })
    expect(sansDetail).toContainEqual({ step: 'screens', done: 2, total: 2 })
    expect(sansDetail.at(-1)).toEqual({ step: 'critique', done: 2, total: 2 })
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

describe('generateApp : dessin en direct', () => {
  const doc = createDocument('T')
  const pageId = doc.pages[0]!.id

  it('montre chaque ecran pendant qu il s ecrit, puis les ecrans termines', async () => {
    const vus: { ids: string[]; currentId: string | null }[] = []
    await generateApp(new FakeClaudeRunner(routeur()), { instruction: 'Crée un wallet', document: doc, pageId }, {
      onPreview: (p) => vus.push({ ids: p.screens.map((s) => s.id), currentId: p.currentId }),
      previewIntervalMs: 0,
    })
    // L'ecran de connexion apparait pendant son dessin, seul...
    expect(vus).toContainEqual({ ids: ['connexion'], currentId: 'connexion' })
    // ...puis l'accueil s'y ajoute pendant le sien.
    expect(vus).toContainEqual({ ids: ['connexion', 'accueil'], currentId: 'accueil' })
  })

  it('l apercu en cours ne contient que des elements valides, a la place definitive de l ecran', async () => {
    const apercus: import('@maquio/core').FrameNode[][] = []
    const patch = await generateApp(new FakeClaudeRunner(routeur()), { instruction: 'Crée un wallet', document: doc, pageId }, {
      onPreview: (p) => apercus.push(p.screens),
      previewIntervalMs: 0,
    })
    const final = (patch.ops[1] as { node: { frame: unknown } }).node.frame
    const premier = apercus.find((s) => s.length === 1)!
    expect(premier[0]!.frame).toEqual(final)
  })

  it('limite la frequence des apercus', async () => {
    let n = 0
    await generateApp(new FakeClaudeRunner(routeur()), { instruction: 'Crée un wallet', document: doc, pageId }, {
      onPreview: () => n++,
      previewIntervalMs: 60_000,
    })
    // Seulement les changements d'etat de chaque ecran (debut, reflexion,
    // ecriture, fin : 4 x 2 ecrans), jamais chaque morceau de texte.
    expect(n).toBe(8)
  })
})

describe('generateApp : detail en direct', () => {
  const doc = createDocument('T')
  const pageId = doc.pages[0]!.id

  it('montre la direction artistique pendant qu elle s ecrit, puis les ecrans planifies', async () => {
    const etapes: PipelineProgress[] = []
    await generateApp(new FakeClaudeRunner(routeur()), { instruction: 'Crée un wallet', document: doc, pageId }, {
      onProgress: (p) => etapes.push(p),
      previewIntervalMs: 0,
    })
    const details = etapes.filter((p) => p.step === 'plan').map((p) => p.detail ?? '')
    expect(details.some((d) => d.startsWith('Sobre') && !d.includes('Écrans'))).toBe(true)
    expect(details.some((d) => d.includes('Sobre, un accent vert-bleu.') && d.includes('Écran Connexion'))).toBe(true)
  })

  it('nomme l ecran en cours de dessin et liste les points de critique', async () => {
    const etapes: PipelineProgress[] = []
    const critique = (id: string, name: string) => JSON.stringify({ critique: ['Titre trop petit', 'Marges irrégulières'], node: JSON.parse(screenJson(id, name)).node })
    await generateApp(
      new FakeClaudeRunner(routeur({ 'critique:accueil': () => critique('accueil', 'Écran Accueil'), 'critique:connexion': () => critique('connexion', 'Écran Connexion') })),
      { instruction: 'Crée un wallet', document: doc, pageId },
      { onProgress: (p) => etapes.push(p), renderScreen: async () => 'UE5H', previewIntervalMs: 0 },
    )
    expect(etapes.some((p) => p.step === 'screens' && (p.detail ?? '').includes('Écran Accueil'))).toBe(true)
    expect(etapes.some((p) => p.step === 'critique' && (p.detail ?? '').includes('• Titre trop petit'))).toBe(true)
  })
})

describe('generateApp : apercu mis en page', () => {
  it('applique l auto-layout a l apercu : les enfants d une colonne s etagent au lieu de s empiler', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const enColonne = (id: string, name: string) => {
      const ecran = JSON.parse(screenJson(id, name))
      const t = (n: number) => ({ ...ecran.node.children[0], id: `${id}-t${n}`, characters: `Ligne ${n}`, frame: { x: 0, y: 0, w: 300, h: 30 } })
      ecran.node.layout = { mode: 'column', gap: 12, padding: { top: 60, right: 20, bottom: 0, left: 20 }, alignMain: 'start', alignCross: 'start' }
      ecran.node.children = [t(1), t(2), t(3)]
      return JSON.stringify(ecran)
    }
    const runner = new FakeClaudeRunner(routeur({ 'ecran:connexion': () => enColonne('connexion', 'Écran Connexion'), 'ecran:accueil': () => enColonne('accueil', 'Écran Accueil') }))
    const apercus: import('@maquio/core').FrameNode[][] = []
    await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, { onPreview: (p) => apercus.push(p.screens), previewIntervalMs: 0 })
    const final = apercus.at(-1)![0]!
    expect(final.children.map((c) => c.frame.y)).toEqual([60, 102, 144])
    // Pendant l'ecriture aussi : jamais deux enfants a la meme place.
    for (const ecrans of apercus) {
      const ys = ecrans[0]!.children.map((c) => c.frame.y)
      expect(new Set(ys).size).toBe(ys.length)
    }
  })
})

describe('generateApp : ce qui se passe avant le premier element', () => {
  it('pose le cadre vide de l ecran des son debut, puis signale reflexion et ecriture', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const vus: { n: number; activity?: string; step?: string }[] = []
    await generateApp(new FakeClaudeRunner(routeur()), { instruction: 'Crée un wallet', document: doc, pageId }, {
      onPreview: (p) => {
        const courant = p.screens.find((s) => s.id === p.currentId)
        if (p.currentId === 'connexion') vus.push({ n: courant?.children.length ?? -1, activity: p.activity, step: p.step })
      },
      renderScreen: async () => 'UE5H',
      previewIntervalMs: 0,
    })
    const dessin = vus.filter((v) => v.step === 'screens')
    expect(dessin[0]).toEqual({ n: 0, activity: 'preparing', step: 'screens' })
    expect(dessin.map((v) => v.activity)).toEqual(expect.arrayContaining(['preparing', 'thinking', 'writing']))
    expect(vus.some((v) => v.step === 'critique' && v.activity === 'preparing')).toBe(true)
  })
})

describe('generateApp : une correction ne vide pas l ecran', () => {
  it('garde la version precedente pendant la relance, jusqu a ce que la nouvelle la rattrape', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    // Premier essai : navigation vers un ecran inconnu -> relance.
    const runner = new FakeClaudeRunner(
      routeur({ 'ecran:connexion': (_p, n) => screenJson('connexion', 'Écran Connexion', { target: n === 1 ? 'inconnu' : 'accueil' }) }),
    )
    const vus: { n: number; activity?: string }[] = []
    await generateApp(runner, { instruction: 'Crée un wallet', document: doc, pageId }, {
      onPreview: (p) => {
        if (p.currentId !== 'connexion' || p.step !== 'screens') return
        vus.push({ n: p.screens.find((s) => s.id === 'connexion')!.children.length, activity: p.activity })
      },
      previewIntervalMs: 0,
    })
    const premierPlein = vus.findIndex((v) => v.n === 1)
    // Une fois l'ecran dessine, il ne redevient jamais vide.
    expect(vus.slice(premierPlein).every((v) => v.n === 1)).toBe(true)
    expect(vus.some((v) => v.activity === 'fixing')).toBe(true)
  })
})
