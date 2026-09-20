import { describe, expect, it } from 'vitest'
import { applyAutoLayout, layoutPage } from './autolayout'
import type { FrameNode, Node, Page } from '../model/types'

const child = (id: string, w: number, h: number): Node => ({
  id, name: id, type: 'rect', frame: { x: 0, y: 0, w, h },
  visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0,
})

const makeFrame = (partial: Partial<FrameNode['layout']>, children: Node[]): FrameNode => ({
  id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 300, h: 200 },
  visible: true, locked: false, opacity: 1, rotation: 0,
  layout: { mode: 'row', gap: 10, padding: { top: 5, right: 5, bottom: 5, left: 5 }, alignMain: 'start', alignCross: 'start', ...partial },
  fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children,
})

// Variante permettant de choisir librement le rectangle de la frame elle-meme
// (utile pour les cas de debordement / clamp ou 300x200 ne conviendrait pas).
const makeFrameWithRect = (
  rect: FrameNode['frame'],
  partial: Partial<FrameNode['layout']>,
  children: Node[],
): FrameNode => ({ ...makeFrame(partial, children), frame: rect })

describe('applyAutoLayout', () => {
  // --- Tests verbatim du cahier des charges (task-6-brief.md) ---

  it('aligne en ligne avec espacement et marges', () => {
    const out = applyAutoLayout(makeFrame({}, [child('a', 50, 20), child('b', 30, 20)]))
    expect(out.children[0]!.frame).toMatchObject({ x: 5, y: 5 })
    expect(out.children[1]!.frame).toMatchObject({ x: 65, y: 5 })
  })

  it('centre sur l axe transverse', () => {
    const out = applyAutoLayout(makeFrame({ alignCross: 'center' }, [child('a', 50, 20)]))
    expect(out.children[0]!.frame.y).toBe(90)
  })

  it('etire sur l axe transverse', () => {
    const out = applyAutoLayout(makeFrame({ alignCross: 'stretch' }, [child('a', 50, 20)]))
    expect(out.children[0]!.frame.h).toBe(190)
  })

  it('repartit l espace restant avec space-between', () => {
    const out = applyAutoLayout(makeFrame({ alignMain: 'space-between' }, [child('a', 50, 20), child('b', 50, 20)]))
    expect(out.children[0]!.frame.x).toBe(5)
    expect(out.children[1]!.frame.x).toBe(245)
  })

  it('empile en colonne', () => {
    const out = applyAutoLayout(makeFrame({ mode: 'column' }, [child('a', 50, 20), child('b', 50, 30)]))
    expect(out.children[1]!.frame.y).toBe(35)
  })

  it('laisse les positions intactes en mode absolu', () => {
    const f = makeFrame({ mode: 'absolute' }, [{ ...child('a', 10, 10), frame: { x: 77, y: 88, w: 10, h: 10 } }])
    expect(applyAutoLayout(f).children[0]!.frame).toMatchObject({ x: 77, y: 88 })
  })

  it('descend dans les frames imbriquees', () => {
    const inner = makeFrame({ mode: 'column' }, [child('x', 10, 10)])
    const out = applyAutoLayout(makeFrame({}, [{ ...inner, id: 'inner' }]))
    const nested = out.children[0] as FrameNode
    expect(nested.children[0]!.frame).toMatchObject({ x: 5, y: 5 })
  })

  // --- Partage structurel (decision 2) ---

  it('rend la meme reference de frame si aucune position ne change', () => {
    // L'enfant est deja exactement a la position que l'algorithme calculerait :
    // x = padding.left = 5, y = padding.top = 5, taille inchangee.
    const a = { ...child('a', 50, 20), frame: { x: 5, y: 5, w: 50, h: 20 } }
    const f = makeFrame({}, [a])
    const out = applyAutoLayout(f)
    expect(out).toBe(f)
    expect(out.children[0]).toBe(a)
  })

  it('ne clone pas les enfants dont la position ne bouge pas, meme si un frere bouge', () => {
    // b n'est pas a sa place (x:0 au lieu de 65) : seul b doit etre clone.
    const a = { ...child('a', 50, 20), frame: { x: 5, y: 5, w: 50, h: 20 } }
    const b = child('b', 30, 20)
    const out = applyAutoLayout(makeFrame({}, [a, b]))
    expect(out.children[0]).toBe(a)
    expect(out.children[1]).not.toBe(b)
  })

  it('une frame sans enfant est rendue telle quelle (meme reference)', () => {
    const f = makeFrame({}, [])
    expect(applyAutoLayout(f)).toBe(f)
  })

  // --- Cas limites (decision 4) ---

  it('space-between avec un seul enfant le place au debut, sans centrage ni etirement', () => {
    const out = applyAutoLayout(makeFrame({ alignMain: 'space-between' }, [child('a', 50, 20)]))
    expect(out.children[0]!.frame.x).toBe(5)
  })

  it('space-between quand le contenu depasse : espace calcule a 0, jamais negatif', () => {
    // Deux enfants de 200 chacun dans une frame de 100 sans marge : ca deborde largement.
    const f = makeFrameWithRect(
      { x: 0, y: 0, w: 100, h: 100 },
      { alignMain: 'space-between', padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      [child('a', 200, 20), child('b', 200, 20)],
    )
    const out = applyAutoLayout(f)
    // Pas de gap negatif : b colle directement apres a, en debordant vers la droite.
    expect(out.children[0]!.frame.x).toBe(0)
    expect(out.children[1]!.frame.x).toBe(200)
  })

  it('alignMain end quand le contenu depasse : la position peut passer sous padding.left, sans clamp', () => {
    const f = makeFrameWithRect(
      { x: 0, y: 0, w: 100, h: 100 },
      { alignMain: 'end', padding: { top: 0, right: 5, bottom: 0, left: 5 } },
      [child('a', 400, 20)],
    )
    const out = applyAutoLayout(f)
    // frameW(100) - padRight(5) - contentW(400) = -305
    expect(out.children[0]!.frame.x).toBe(-305)
  })

  it('alignMain center quand le contenu depasse : la position peut passer sous padding.left, sans clamp', () => {
    const f = makeFrameWithRect(
      { x: 0, y: 0, w: 100, h: 100 },
      { alignMain: 'center', padding: { top: 0, right: 5, bottom: 0, left: 5 } },
      [child('a', 400, 20)],
    )
    const out = applyAutoLayout(f)
    // 5 + ((100 - 5 - 5) - 400) / 2 = 5 + (-310)/2 = -150
    expect(out.children[0]!.frame.x).toBe(-150)
  })

  it('stretch avec padding superieur a la hauteur : clampe a 0, jamais negatif', () => {
    const f = makeFrameWithRect(
      { x: 0, y: 0, w: 100, h: 5 },
      { alignCross: 'stretch', padding: { top: 10, right: 0, bottom: 10, left: 0 } },
      [child('a', 20, 20)],
    )
    const out = applyAutoLayout(f)
    expect(out.children[0]!.frame.h).toBe(0)
    expect(out.children[0]!.frame.h).toBeGreaterThanOrEqual(0)
  })

  // --- Descente a travers une frame absolute (decision 5) ---

  it('met en page les frames enfants en row/column meme sous une frame absolute', () => {
    const columnChild = makeFrame({ mode: 'column' }, [child('x', 10, 10), child('y', 10, 10)])
    const absoluteParent = makeFrame(
      { mode: 'absolute' },
      [{ ...columnChild, id: 'inner', frame: { x: 77, y: 88, w: 300, h: 200 } }],
    )
    const out = applyAutoLayout(absoluteParent)
    const inner = out.children[0] as FrameNode
    // La frame absolute ne repositionne pas son enfant direct...
    expect(inner.frame).toMatchObject({ x: 77, y: 88 })
    // ...mais l'enfant, qui est lui-meme en column, a bien mis en page SES enfants.
    expect(inner.children[0]!.frame).toMatchObject({ x: 5, y: 5 })
    expect(inner.children[1]!.frame).toMatchObject({ y: 25 })
  })

  // --- Ordre de calcul enfants d'abord (decision 6) ---

  it('met en page une frame enfant avant que le parent ne s appuie sur elle', () => {
    // grand-parent (row) > parent (column, 3 niveaux) > deux feuilles.
    // Si le parent n'etait pas mis en page avant que le grand-parent ne travaille,
    // ses propres petits-enfants resteraient a leur position d'origine (0,0).
    const parent = makeFrame({ mode: 'column' }, [child('leaf1', 10, 10), child('leaf2', 10, 10)])
    const grandParent = makeFrame({}, [{ ...parent, id: 'parent' }])
    const out = applyAutoLayout(grandParent)
    const laidOutParent = out.children[0] as FrameNode
    expect(laidOutParent.children[0]!.frame).toMatchObject({ x: 5, y: 5 })
    expect(laidOutParent.children[1]!.frame).toMatchObject({ x: 5, y: 25 })
  })

  // --- La mise en page ne redimensionne jamais la frame elle-meme (decision 8) ---

  it('ne modifie jamais la taille (w/h) de la frame mise en page', () => {
    const f = makeFrame({}, [child('a', 500, 500)])
    const out = applyAutoLayout(f)
    expect(out.frame).toMatchObject({ w: 300, h: 200 })
  })
})

describe('layoutPage', () => {
  const device = { id: 'iphone', label: 'iPhone', width: 390, height: 844, pixelRatio: 3 }

  it('met en page chaque frame de premier niveau et laisse les autres noeuds intacts', () => {
    const frame = makeFrame({}, [child('a', 50, 20)])
    const rect = child('r', 10, 10)
    const page: Page = { id: 'p', name: 'Page 1', device, nodes: [frame, rect] }

    const out = layoutPage(page)

    const laidOutFrame = out.nodes[0] as FrameNode
    expect(laidOutFrame.children[0]!.frame).toMatchObject({ x: 5, y: 5 })
    expect(out.nodes[1]).toBe(rect)
  })

  it('rend la meme reference de page si rien ne change', () => {
    const a = { ...child('a', 50, 20), frame: { x: 5, y: 5, w: 50, h: 20 } }
    const frame = makeFrame({}, [a])
    const rect = child('r', 10, 10)
    const page: Page = { id: 'p', name: 'Page 1', device, nodes: [frame, rect] }

    const out = layoutPage(page)

    expect(out).toBe(page)
  })
})
