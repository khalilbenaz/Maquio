import { describe, expect, it } from 'vitest'
import {
  findNode,
  findParent,
  insertNode,
  removeNode,
  moveNode,
  absoluteFrame,
  hitTest,
  replaceNode,
  pathToNode,
  walk,
  isScreenNode,
  screenContaining,
  cloneNodeWithNewIds,
  NodeNotFoundError,
  NotAFrameError,
  CycleError,
} from './tree'
import type { DevicePreset, FrameNode, Node } from '../model/types'

const leaf = (id: string, x: number, y: number): Node => ({
  id, name: id, type: 'rect', frame: { x, y, w: 50, h: 50 },
  visible: true, locked: false, opacity: 1, rotation: 0,
  fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }], strokes: [], cornerRadius: 0,
})

const frame = (id: string, x: number, y: number, children: Node[]): FrameNode => ({
  id, name: id, type: 'frame', frame: { x, y, w: 200, h: 200 },
  visible: true, locked: false, opacity: 1, rotation: 0,
  layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
  fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children,
})

const tree: Node[] = [frame('root', 10, 10, [leaf('a', 5, 5), frame('inner', 100, 100, [leaf('b', 1, 1)])])]

describe('parcours', () => {
  it('trouve un noeud profond et son parent', () => {
    expect(findNode(tree, 'b')?.id).toBe('b')
    expect(findParent(tree, 'b')?.id).toBe('inner')
    expect(findParent(tree, 'root')).toBeNull()
  })
  it('calcule un cadre absolu en cumulant les ancetres', () => {
    expect(absoluteFrame(tree, 'b')).toEqual({ x: 111, y: 111, w: 50, h: 50 })
  })
})

describe('mutations immuables', () => {
  it('insere sans muter l arbre d origine', () => {
    const next = insertNode(tree, 'inner', leaf('c', 0, 0))
    expect(findNode(next, 'c')).not.toBeNull()
    expect(findNode(tree, 'c')).toBeNull()
  })
  it('supprime un noeud profond', () => {
    expect(findNode(removeNode(tree, 'b'), 'b')).toBeNull()
  })
  it('reparente un noeud a la racine', () => {
    const next = moveNode(tree, 'b', null, 0)
    expect(findParent(next, 'b')).toBeNull()
    expect(next[0]!.id).toBe('b')
  })
  it('refuse de deplacer un noeud dans son propre descendant', () => {
    expect(() => moveNode(tree, 'root', 'inner', 0)).toThrow()
  })
})

describe('hitTest', () => {
  it('rend le noeud le plus profond sous le point', () => {
    expect(hitTest(tree, { x: 116, y: 116 })?.id).toBe('b')
  })
  it('ignore les noeuds verrouilles ou invisibles', () => {
    const verrouille: Node[] = [{ ...leaf('v', 0, 0), locked: true }]
    expect(hitTest(verrouille, { x: 10, y: 10 })).toBeNull()
  })
})

// --- Tests complementaires (decisions du cahier des charges) ---

describe('partage structurel (point 2)', () => {
  it('preserve par reference une branche non touchee lors d une insertion', () => {
    const nodeA = findNode(tree, 'a')
    const next = insertNode(tree, 'inner', leaf('c', 0, 0))
    expect(findNode(next, 'a')).toBe(nodeA)
  })
  it('preserve par reference une branche non touchee lors d une suppression', () => {
    const nodeA = findNode(tree, 'a')
    const next = removeNode(tree, 'b')
    expect(findNode(next, 'a')).toBe(nodeA)
  })
  it('preserve par reference une branche non touchee lors d un remplacement', () => {
    const nodeA = findNode(tree, 'a')
    const next = replaceNode(tree, 'b', leaf('b2', 0, 0))
    expect(findNode(next, 'a')).toBe(nodeA)
  })
})

describe('insertNode - index (point 4)', () => {
  it('insere en fin de fratrie quand l index est absent', () => {
    const next = insertNode(tree, 'inner', leaf('c', 0, 0))
    const innerNode = findNode(next, 'inner') as FrameNode
    expect(innerNode.children.map((c) => c.id)).toEqual(['b', 'c'])
  })
  it('clampe un index trop grand a la fin plutot que de lever', () => {
    const next = insertNode(tree, 'inner', leaf('c', 0, 0), 999)
    const innerNode = findNode(next, 'inner') as FrameNode
    expect(innerNode.children.map((c) => c.id)).toEqual(['b', 'c'])
  })
  it('clampe un index negatif au debut plutot que de lever', () => {
    const next = insertNode(tree, 'inner', leaf('d', 0, 0), -5)
    const innerNode = findNode(next, 'inner') as FrameNode
    expect(innerNode.children.map((c) => c.id)).toEqual(['d', 'b'])
  })
})

describe('erreurs nommees (point 5)', () => {
  it('insertNode leve NodeNotFoundError si le parent cible est introuvable', () => {
    expect(() => insertNode(tree, 'inexistant', leaf('x', 0, 0))).toThrow(NodeNotFoundError)
  })
  it('insertNode leve NotAFrameError si la cible n est pas une frame', () => {
    expect(() => insertNode(tree, 'a', leaf('x', 0, 0))).toThrow(NotAFrameError)
  })
  it('removeNode leve NodeNotFoundError si l id est introuvable', () => {
    expect(() => removeNode(tree, 'inexistant')).toThrow(NodeNotFoundError)
  })
  it('replaceNode leve NodeNotFoundError si l id est introuvable', () => {
    expect(() => replaceNode(tree, 'inexistant', leaf('x', 0, 0))).toThrow(NodeNotFoundError)
  })
  it('moveNode leve NodeNotFoundError si le nouveau parent est introuvable', () => {
    expect(() => moveNode(tree, 'a', 'inexistant', 0)).toThrow(NodeNotFoundError)
  })
  it('moveNode leve NotAFrameError si le nouveau parent n est pas une frame', () => {
    expect(() => moveNode(tree, 'inner', 'a', 0)).toThrow(NotAFrameError)
  })
})

describe('cycles (point 6)', () => {
  it('refuse de deplacer un noeud dans lui meme', () => {
    expect(() => moveNode(tree, 'inner', 'inner', 0)).toThrow(CycleError)
  })
  it('refuse de deplacer un noeud dans son descendant, avec le bon type d erreur', () => {
    expect(() => moveNode(tree, 'root', 'inner', 0)).toThrow(CycleError)
  })
})

describe('hitTest - regles avancees (point 7)', () => {
  it('parmi des candidats de meme profondeur, choisit le dernier du tableau (dessus)', () => {
    const superposes: Node[] = [leaf('bas', 0, 0), leaf('dessus', 0, 0)]
    expect(hitTest(superposes, { x: 10, y: 10 })?.id).toBe('dessus')
  })
  it('un enfant visible dans une frame invisible est inatteignable', () => {
    const cachee = { ...frame('cachee', 0, 0, [leaf('enfant', 10, 10)]), visible: false }
    expect(hitTest([cachee], { x: 15, y: 15 })).toBeNull()
  })
})

describe('moveNode - insertion a un index precis', () => {
  it('deplace un noeud vers un nouveau parent a l index donne', () => {
    const next = moveNode(tree, 'a', 'inner', 0)
    const innerNode = findNode(next, 'inner') as FrameNode
    expect(innerNode.children.map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('pathToNode (point 10)', () => {
  it('rend les ancetres du plus externe au noeud lui meme inclus', () => {
    expect(pathToNode(tree, 'b')).toEqual(['root', 'inner', 'b'])
  })
  it('rend un tableau vide si le noeud est introuvable', () => {
    expect(pathToNode(tree, 'inexistant')).toEqual([])
  })
})

describe('walk (point 10)', () => {
  it('parcourt en profondeur d abord, dans l ordre du tableau, avec le parent de chaque noeud', () => {
    const visited: Array<{ id: string; parentId: string | null }> = []
    walk(tree, (n, parent) => visited.push({ id: n.id, parentId: parent ? parent.id : null }))
    expect(visited).toEqual([
      { id: 'root', parentId: null },
      { id: 'a', parentId: 'root' },
      { id: 'inner', parentId: 'root' },
      { id: 'b', parentId: 'inner' },
    ])
  })
})

// v2 (addendum navigation §3.1, §3.2) : isScreenNode et screenContaining,
// partages par commands/edits.ts (setLinkCommand, deleteNodeCommand) et par
// le renderer (calcul de l'ecran "actif").
describe('isScreenNode / screenContaining (v2, addendum navigation)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }
  const screenFrame = (id: string, children: Node[]): FrameNode => ({ ...frame(id, 0, 0, children), device })

  it("un noeud de premier niveau avec device est un ecran, un noeud ordinaire n'en est pas un", () => {
    const bouton = leaf('bouton', 10, 10)
    const arbre: Node[] = [screenFrame('ecran', [bouton]), frame('ordinaire', 500, 0, [])]
    expect(isScreenNode(arbre[0]!)).toBe(true)
    expect(isScreenNode(arbre[1]!)).toBe(false)
  })

  it("screenContaining rend l'ecran d'un noeud imbrique, l'ecran lui-meme pour un ecran, et null pour un noeud sans ecran englobant", () => {
    const bouton = leaf('bouton', 10, 10)
    const arbre: Node[] = [screenFrame('ecran', [bouton]), frame('ordinaire', 500, 0, [leaf('orphelin', 0, 0)])]

    expect(screenContaining(arbre, 'bouton')).toBe('ecran')
    expect(screenContaining(arbre, 'ecran')).toBe('ecran')
    expect(screenContaining(arbre, 'orphelin')).toBeNull()
    expect(screenContaining(arbre, 'ordinaire')).toBeNull()
    expect(screenContaining(arbre, 'introuvable')).toBeNull()
  })
})

// v2 (addendum navigation §4 : duplication d'un ecran depuis le panneau
// des calques).
describe('cloneNodeWithNewIds (v2, addendum navigation)', () => {
  it('genere un nouvel id pour le noeud ET tous ses descendants, en gardant le reste identique', () => {
    const original = frame('root', 10, 10, [leaf('a', 5, 5), frame('inner', 100, 100, [leaf('b', 1, 1)])])
    const clone = cloneNodeWithNewIds(original) as FrameNode

    expect(clone.id).not.toBe('root')
    expect(clone.frame).toEqual(original.frame)
    expect(clone.children).toHaveLength(2)
    expect(clone.children[0]!.id).not.toBe('a')
    const innerClone = clone.children[1] as FrameNode
    expect(innerClone.id).not.toBe('inner')
    expect(innerClone.children[0]!.id).not.toBe('b')

    // Aucun id du clone ne recoupe un id de l'original.
    const idsOriginal = new Set<string>()
    walk([original], (n) => idsOriginal.add(n.id))
    const idsClone: string[] = []
    walk([clone], (n) => idsClone.push(n.id))
    for (const id of idsClone) expect(idsOriginal.has(id)).toBe(false)
  })

  it('un ecran clone garde son device et son lien vers un noeud tiers, avec un nouvel id', () => {
    const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }
    const bouton = { ...leaf('bouton', 10, 10), link: { target: 'autre-ecran' } }
    const screen: FrameNode = { ...frame('ecran', 0, 0, [bouton]), device }

    const clone = cloneNodeWithNewIds(screen) as FrameNode
    expect(clone.device).toEqual(device)
    expect(clone.id).not.toBe('ecran')
    expect(clone.children[0]!.link).toEqual({ target: 'autre-ecran' })
  })
})
