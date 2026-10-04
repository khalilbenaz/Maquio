import { describe, expect, it } from 'vitest'
import { createDocument } from '../model/document'
import { createScreenNode } from '../model/screen'
import { tapNavigation } from '../model/interactions'
import { findNode, findParent, absoluteFrame, NodeNotFoundError, NotAFrameError } from '../tree/tree'
import {
  PageNotFoundError,
  InvalidPatchError,
  MixedParentsError,
  EmptySelectionError,
  LinkTargetNotFoundError,
  LinkToContainingScreenError,
} from './command'
import {
  compositeCommand,
  createNodeCommand,
  createScreenCommand,
  deleteNodeCommand,
  moveNodeCommand,
  resizeNodeCommand,
  reparentNodeCommand,
  updateNodeCommand,
  setTextCommand,
  setLinkCommand,
  clearLinkCommand,
  groupCommand,
  ungroupCommand,
  setLayoutCommand,
  setTokensCommand,
  relayoutCommand,
  withAutoLayout,
  setContainerCommand,
} from './edits'
import { History } from './history'
import type { CalqueDocument, DevicePreset, FrameNode, Node, TextNode } from '../model/types'

function rect(id: string, x: number, y: number, w = 10, h = 10): Node {
  return {
    id, name: id, type: 'rect', frame: { x, y, w, h },
    visible: true, locked: false, opacity: 1, rotation: 0,
    fills: [], strokes: [], cornerRadius: 0,
  }
}

function baseDoc(): { doc: CalqueDocument; pageId: string } {
  const doc = createDocument('Test')
  return { doc, pageId: doc.pages[0]!.id }
}

describe('createNodeCommand / deleteNodeCommand', () => {
  it('cree un noeud a la racine puis le supprime', () => {
    const { doc, pageId } = baseDoc()
    const created = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(findNode(created.pages[0]!.nodes, 'a')).not.toBeNull()

    const deleted = deleteNodeCommand(pageId, 'a').apply(created)
    expect(findNode(deleted.pages[0]!.nodes, 'a')).toBeNull()
  })

  it("l'inverse d'une creation est une suppression, celui d'une suppression une creation a la meme position (point 11)", () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const withAB = createNodeCommand(pageId, null, rect('b', 0, 0)).apply(withA)
    const withABC = createNodeCommand(pageId, null, rect('c', 0, 0)).apply(withAB)

    const del = deleteNodeCommand(pageId, 'b')
    const inverse = del.invert(withABC)
    const afterDelete = del.apply(withABC)
    expect(afterDelete.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'c'])

    const restored = inverse.apply(afterDelete)
    expect(restored.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('moveNodeCommand (deplacement relatif)', () => {
  it('deplace un noeud de dx,dy et s inverse en negant le deplacement', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const cmd = moveNodeCommand(pageId, 'a', 30, 40)
    const inverse = cmd.invert(withA)
    const moved = cmd.apply(withA)
    expect(findNode(moved.pages[0]!.nodes, 'a')!.frame).toMatchObject({ x: 30, y: 40 })

    const back = inverse.apply(moved)
    expect(findNode(back.pages[0]!.nodes, 'a')!.frame).toMatchObject({ x: 0, y: 0 })
  })
})

describe('resizeNodeCommand (cadre final absolu au sein du parent)', () => {
  it('remplace le cadre puis restaure l ancien via invert', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const cmd = resizeNodeCommand(pageId, 'a', { x: 5, y: 5, w: 20, h: 20 })
    const inverse = cmd.invert(withA)
    const resized = cmd.apply(withA)
    expect(findNode(resized.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 5, y: 5, w: 20, h: 20 })

    const back = inverse.apply(resized)
    expect(findNode(back.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })
})

describe('reparentNodeCommand', () => {
  it('deplace un noeud vers une nouvelle frame puis restaure parent+index via invert', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    let d = createNodeCommand(pageId, null, frameNode).apply(doc)
    d = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(d)
    d = createNodeCommand(pageId, null, rect('b', 0, 0)).apply(d)

    const cmd = reparentNodeCommand(pageId, 'b', 'f', 0)
    const inverse = cmd.invert(d)
    const moved = cmd.apply(d)
    expect(findParent(moved.pages[0]!.nodes, 'b')?.id).toBe('f')

    const back = inverse.apply(moved)
    expect(findParent(back.pages[0]!.nodes, 'b')).toBeNull()
    expect(back.pages[0]!.nodes.map((n) => n.id)).toEqual(['f', 'a', 'b'])
  })

  // Correctif parentage (v2, addendum navigation) : le parametre `frame`
  // optionnel porte reparentage ET repositionnement dans la MEME commande --
  // c'est ce dont a besoin un glissement d'ecran a ecran sur le canevas pour
  // qu'un seul "annuler" restaure a la fois le parent d'origine ET le cadre
  // d'origine.
  it('avec un cadre fourni, reparente ET repositionne en une seule commande, restauree a l identique par un seul invert', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 300, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    let d = createNodeCommand(pageId, null, frameNode).apply(doc)
    d = createNodeCommand(pageId, null, rect('a', 10, 10)).apply(d)

    const cmd = reparentNodeCommand(pageId, 'a', 'f', 0, { x: 310, y: 10, w: 10, h: 10 })
    const inverse = cmd.invert(d)
    const moved = cmd.apply(d)
    expect(findParent(moved.pages[0]!.nodes, 'a')?.id).toBe('f')
    expect(findNode(moved.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 310, y: 10, w: 10, h: 10 })

    const back = inverse.apply(moved)
    expect(findParent(back.pages[0]!.nodes, 'a')).toBeNull()
    expect(findNode(back.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 10, y: 10, w: 10, h: 10 })
    expect(back).toEqual(d)
  })

  it('sans cadre fourni (glisser-deposer du panneau des calques, inchange depuis la v1), ne touche pas au cadre', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    let d = createNodeCommand(pageId, null, frameNode).apply(doc)
    d = createNodeCommand(pageId, null, rect('a', 10, 10)).apply(d)

    const moved = reparentNodeCommand(pageId, 'a', 'f', 0).apply(d)
    expect(findNode(moved.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 10, y: 10, w: 10, h: 10 })
  })

  it('un lien pose sur le noeud survit au reparentage vers un AUTRE ecran (§3.2 de l addendum navigation)', () => {
    const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }
    const { doc, pageId } = baseDoc()
    const ecranA = createScreenNode('Écran A', device, { x: 0, y: 0, w: device.width, h: device.height })
    const ecranB = createScreenNode('Écran B', device, { x: 500, y: 0, w: device.width, h: device.height })
    const ecranC = createScreenNode('Écran C', device, { x: 1000, y: 0, w: device.width, h: device.height })
    let d = createScreenCommand(pageId, ecranA).apply(doc)
    d = createScreenCommand(pageId, ecranB).apply(d)
    d = createScreenCommand(pageId, ecranC).apply(d)
    d = createNodeCommand(pageId, ecranA.id, rect('bouton', 10, 10)).apply(d)
    // Le bouton, dans ecranA, est lie a ecranB (« au clic -> Écran B »).
    d = setLinkCommand(pageId, 'bouton', ecranB.id).apply(d)

    // Glissement d'ecran a ecran : le bouton passe de ecranA a ecranC (un
    // TROISIEME ecran, distinct de la cible du lien) -- reparentNodeCommand
    // ne touche jamais au champ `link`, quel que soit son contenu.
    const moved = reparentNodeCommand(pageId, 'bouton', ecranC.id, 0, { x: 20, y: 20, w: 10, h: 10 }).apply(d)
    const boutonDeplace = findNode(moved.pages[0]!.nodes, 'bouton')!
    expect(findParent(moved.pages[0]!.nodes, 'bouton')?.id).toBe(ecranC.id)
    expect(tapNavigation(boutonDeplace.interactions)?.target).toBe(ecranB.id)
  })
})

describe('updateNodeCommand (point 6)', () => {
  it('fusionne le patch, valide via nodeSchema, et restaure les valeurs precedentes via invert', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const cmd = updateNodeCommand(pageId, 'a', { opacity: 0.5, name: 'Renomme' })
    const inverse = cmd.invert(withA)
    const updated = cmd.apply(withA)
    const node = findNode(updated.pages[0]!.nodes, 'a')!
    expect(node.opacity).toBe(0.5)
    expect(node.name).toBe('Renomme')

    const back = inverse.apply(updated)
    const restored = findNode(back.pages[0]!.nodes, 'a')!
    expect(restored.opacity).toBe(1)
    expect(restored.name).toBe('a')
  })

  it('refuse un patch qui changerait le type', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(() => updateNodeCommand(pageId, 'a', { type: 'text' }).apply(withA)).toThrow(InvalidPatchError)
  })

  it('refuse un patch qui changerait l id', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(() => updateNodeCommand(pageId, 'a', { id: 'autre' }).apply(withA)).toThrow(InvalidPatchError)
  })

  it('leve sans toucher au document si le noeud fusionne echoue la validation du schema', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const before = JSON.stringify(withA)
    expect(() => updateNodeCommand(pageId, 'a', { opacity: 5 }).apply(withA)).toThrow()
    expect(JSON.stringify(withA)).toBe(before)
  })
})

describe('setTextCommand', () => {
  it('modifie les caracteres d un noeud texte et s inverse', () => {
    const { doc, pageId } = baseDoc()
    const textNode: TextNode = {
      id: 't', name: 't', type: 'text', frame: { x: 0, y: 0, w: 10, h: 10 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      characters: 'avant',
      style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeight: 1, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' },
    }
    const withT = createNodeCommand(pageId, null, textNode).apply(doc)
    const cmd = setTextCommand(pageId, 't', 'apres')
    const inverse = cmd.invert(withT)
    const changed = cmd.apply(withT)
    expect((findNode(changed.pages[0]!.nodes, 't') as TextNode).characters).toBe('apres')

    const back = inverse.apply(changed)
    expect((findNode(back.pages[0]!.nodes, 't') as TextNode).characters).toBe('avant')
  })
})

describe('groupCommand (point 7)', () => {
  it('cree une frame dont le cadre est l union des selectionnes et reparente en coordonnees relatives', () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 30, 10, 10)).apply(d)

    const cmd = groupCommand(pageId, ['a', 'b'])
    const grouped = cmd.apply(d)

    expect(grouped.pages[0]!.nodes).toHaveLength(1)
    const groupFrame = grouped.pages[0]!.nodes[0] as FrameNode
    expect(groupFrame.type).toBe('frame')
    expect(groupFrame.name).toBe('Groupe')
    expect(groupFrame.layout.mode).toBe('absolute')
    expect(groupFrame.clipsContent).toBe(false)
    expect(groupFrame.frame).toEqual({ x: 0, y: 0, w: 30, h: 40 })

    const a = findNode(grouped.pages[0]!.nodes, 'a')!
    const b = findNode(grouped.pages[0]!.nodes, 'b')!
    expect(a.frame).toMatchObject({ x: 0, y: 0 })
    expect(b.frame).toMatchObject({ x: 20, y: 30 })
    expect(findParent(grouped.pages[0]!.nodes, 'a')?.id).toBe(groupFrame.id)
    expect(findParent(grouped.pages[0]!.nodes, 'b')?.id).toBe(groupFrame.id)

    // Le cadre absolu des enfants n a pas bouge malgre le changement de parent.
    expect(absoluteFrame(grouped.pages[0]!.nodes, 'a')).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(absoluteFrame(grouped.pages[0]!.nodes, 'b')).toEqual({ x: 20, y: 30, w: 10, h: 10 })
  })

  it('refuse de grouper des noeuds qui n ont pas le meme parent', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    let d = createNodeCommand(pageId, null, frameNode).apply(doc)
    d = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(d)
    d = createNodeCommand(pageId, 'f', rect('c', 0, 0)).apply(d)

    expect(() => groupCommand(pageId, ['a', 'c']).apply(d)).toThrow(MixedParentsError)
  })

  it("l'inverse d'un groupCommand est un ungroupCommand sur la frame creee", () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 30, 10, 10)).apply(d)

    const cmd = groupCommand(pageId, ['a', 'b'])
    const inverse = cmd.invert(d)
    const grouped = cmd.apply(d)
    const ungrouped = inverse.apply(grouped)

    expect(ungrouped.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(findNode(ungrouped.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(findNode(ungrouped.pages[0]!.nodes, 'b')!.frame).toEqual({ x: 20, y: 30, w: 10, h: 10 })
  })
})

describe('groupCommand - selection vide vs selection a un seul noeud (round de correction 1)', () => {
  it('leve EmptySelectionError sur une selection vide', () => {
    const { doc, pageId } = baseDoc()
    expect(() => groupCommand(pageId, []).apply(doc)).toThrow(EmptySelectionError)
  })

  it('accepte une selection a un seul noeud (grouper un element seul est legitime)', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const grouped = groupCommand(pageId, ['a']).apply(withA)
    const groupFrame = grouped.pages[0]!.nodes[0] as FrameNode
    expect(groupFrame.type).toBe('frame')
    expect(groupFrame.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(findParent(grouped.pages[0]!.nodes, 'a')?.id).toBe(groupFrame.id)
  })
})

describe('validation partagee des noeuds modifies en place (round de correction 1)', () => {
  it('resizeNodeCommand refuse une largeur negative sans toucher au document', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const before = JSON.stringify(withA)
    expect(() => resizeNodeCommand(pageId, 'a', { x: 0, y: 0, w: -10, h: 10 }).apply(withA)).toThrow()
    expect(JSON.stringify(withA)).toBe(before)
  })

  it('resizeNodeCommand refuse une hauteur negative sans toucher au document', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const before = JSON.stringify(withA)
    expect(() => resizeNodeCommand(pageId, 'a', { x: 0, y: 0, w: 10, h: -10 }).apply(withA)).toThrow()
    expect(JSON.stringify(withA)).toBe(before)
  })

  it('moveNodeCommand, resizeNodeCommand et updateNodeCommand preservent le partage structurel d une branche soeur non touchee', () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 20, 10, 10)).apply(d)
    const untouchedSibling = findNode(d.pages[0]!.nodes, 'b')

    const afterMove = moveNodeCommand(pageId, 'a', 1, 1).apply(d)
    expect(findNode(afterMove.pages[0]!.nodes, 'b')).toBe(untouchedSibling)

    const afterResize = resizeNodeCommand(pageId, 'a', { x: 0, y: 0, w: 5, h: 5 }).apply(d)
    expect(findNode(afterResize.pages[0]!.nodes, 'b')).toBe(untouchedSibling)

    const afterUpdate = updateNodeCommand(pageId, 'a', { name: 'Renomme' }).apply(d)
    expect(findNode(afterUpdate.pages[0]!.nodes, 'b')).toBe(untouchedSibling)
  })
})

describe('ungroupCommand (point 8)', () => {
  it('remonte les enfants a la place de la frame, en coordonnees relatives au nouveau parent', () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 30, 10, 10)).apply(d)
    const grouped = groupCommand(pageId, ['a', 'b']).apply(d)
    const groupId = grouped.pages[0]!.nodes[0]!.id

    const ungrouped = ungroupCommand(pageId, groupId).apply(grouped)
    expect(findNode(ungrouped.pages[0]!.nodes, groupId)).toBeNull()
    expect(ungrouped.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(findNode(ungrouped.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(findNode(ungrouped.pages[0]!.nodes, 'b')!.frame).toEqual({ x: 20, y: 30, w: 10, h: 10 })
  })

  it('leve NotAFrameError si l identifiant ne designe pas une frame', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(() => ungroupCommand(pageId, 'a').apply(withA)).toThrow(NotAFrameError)
  })
})

describe('setLayoutCommand', () => {
  it('remplace la disposition d une frame et s inverse', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    const withF = createNodeCommand(pageId, null, frameNode).apply(doc)
    const newLayout = { mode: 'row' as const, gap: 8, padding: { top: 1, right: 2, bottom: 3, left: 4 }, alignMain: 'center' as const, alignCross: 'stretch' as const }
    const cmd = setLayoutCommand(pageId, 'f', newLayout)
    const inverse = cmd.invert(withF)
    const changed = cmd.apply(withF)
    expect((findNode(changed.pages[0]!.nodes, 'f') as FrameNode).layout).toEqual(newLayout)

    const back = inverse.apply(changed)
    expect((findNode(back.pages[0]!.nodes, 'f') as FrameNode).layout.mode).toBe('absolute')
  })
})

describe('setTokensCommand', () => {
  it('fusionne les tokens et s inverse en restaurant les tokens precedents', () => {
    const { doc } = baseDoc()
    const cmd = setTokensCommand({ spacing: { sm: 4 } })
    const inverse = cmd.invert(doc)
    const changed = cmd.apply(doc)
    expect(changed.tokens.spacing).toEqual({ sm: 4 })

    const back = inverse.apply(changed)
    expect(back.tokens).toEqual(doc.tokens)
  })
})

describe('compositeCommand (round de correction 1, Tache 15)', () => {
  it('applique toutes les commandes dans l ordre', () => {
    const { doc, pageId } = baseDoc()
    const withThree = [rect('a', 0, 0), rect('b', 10, 0), rect('c', 20, 0)].reduce(
      (d, n) => createNodeCommand(pageId, null, n).apply(d),
      doc,
    )

    const composite = compositeCommand('Supprimer la selection', [
      deleteNodeCommand(pageId, 'a'),
      deleteNodeCommand(pageId, 'b'),
      deleteNodeCommand(pageId, 'c'),
    ])
    const result = composite.apply(withThree)

    expect(findNode(result.pages[0]!.nodes, 'a')).toBeNull()
    expect(findNode(result.pages[0]!.nodes, 'b')).toBeNull()
    expect(findNode(result.pages[0]!.nodes, 'c')).toBeNull()
  })

  it('s inverse en une seule commande qui restaure tout, y compris l ordre exact de la fratrie', () => {
    const { doc, pageId } = baseDoc()
    const withThree = [rect('a', 0, 0), rect('b', 10, 0), rect('c', 20, 0)].reduce(
      (d, n) => createNodeCommand(pageId, null, n).apply(d),
      doc,
    )

    const composite = compositeCommand('Supprimer la selection', [
      deleteNodeCommand(pageId, 'a'),
      deleteNodeCommand(pageId, 'b'),
      deleteNodeCommand(pageId, 'c'),
    ])
    const inverse = composite.invert(withThree)
    const deleted = composite.apply(withThree)

    const restored = inverse.apply(deleted)
    expect(restored.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(restored).toEqual(withThree)
  })

  it('n applique rien si une commande du lot echoue (tout ou rien)', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)

    const composite = compositeCommand('Lot invalide', [
      deleteNodeCommand(pageId, 'a'),
      deleteNodeCommand(pageId, 'fantome'),
    ])

    expect(() => composite.apply(withA)).toThrow(NodeNotFoundError)
  })
})

describe('point 12 : erreurs nommees sur toutes les fabriques', () => {
  it('leve PageNotFoundError quand pageId est introuvable', () => {
    const { doc } = baseDoc()
    expect(() => moveNodeCommand('page-inexistante', 'a', 1, 1).apply(doc)).toThrow(PageNotFoundError)
  })

  it('chaque fabrique leve NodeNotFoundError quand l id vise est introuvable', () => {
    const { doc, pageId } = baseDoc()
    expect(() => moveNodeCommand(pageId, 'x', 1, 1).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => deleteNodeCommand(pageId, 'x').apply(doc)).toThrow(NodeNotFoundError)
    expect(() => resizeNodeCommand(pageId, 'x', { x: 0, y: 0, w: 1, h: 1 }).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => reparentNodeCommand(pageId, 'x', null, 0).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => updateNodeCommand(pageId, 'x', {}).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => setTextCommand(pageId, 'x', 'y').apply(doc)).toThrow(NodeNotFoundError)
    expect(() => createNodeCommand(pageId, 'x', rect('a', 0, 0)).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => groupCommand(pageId, ['x']).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => ungroupCommand(pageId, 'x').apply(doc)).toThrow(NodeNotFoundError)
    expect(() =>
      setLayoutCommand(pageId, 'x', { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' }).apply(doc),
    ).toThrow(NodeNotFoundError)
  })
})

// v2 (addendum navigation, §3, §5, §8) : ecrans (createScreenCommand) et
// liens (setLinkCommand / clearLinkCommand), plus la cascade de suppression
// d'un ecran (deleteNodeCommand).
describe('createScreenCommand (v2, addendum navigation)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  it('insere un ecran au premier niveau de la page', () => {
    const { doc, pageId } = baseDoc()
    const screen = createScreenNode('Écran 2', device, { x: 500, y: 0, w: device.width, h: device.height })

    const created = createScreenCommand(pageId, screen).apply(doc)
    const found = findNode(created.pages[0]!.nodes, screen.id) as FrameNode
    expect(found).toBeDefined()
    expect(found.device).toEqual(device)
    expect(found.frame).toEqual({ x: 500, y: 0, w: device.width, h: device.height })
  })

  it('s annule par une simple suppression (aucun lien entrant a nettoyer sur un ecran fraichement cree)', () => {
    const { doc, pageId } = baseDoc()
    const screen = createScreenNode('Écran 2', device, { x: 0, y: 0, w: device.width, h: device.height })

    const cmd = createScreenCommand(pageId, screen)
    const created = cmd.apply(doc)
    const back = cmd.invert(created).apply(created)
    expect(findNode(back.pages[0]!.nodes, screen.id)).toBeNull()
  })
})

describe('setLinkCommand / clearLinkCommand (v2, addendum navigation §3.2, §5)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  // Deux ecrans ('ecranA', 'ecranB' -- identifies par leur `id`, distinct de
  // leur `name`) sur la meme page, plus un bouton ('bouton') enfant de
  // 'ecranA' -- de quoi tester un lien pose depuis un noeud imbrique vers un
  // AUTRE ecran de la page.
  function docAvecDeuxEcrans(): { doc: CalqueDocument; pageId: string; ecranA: FrameNode; ecranB: FrameNode } {
    const { doc, pageId } = baseDoc()
    const bouton = rect('bouton', 10, 10)
    const ecranA = createScreenNode('ecranA', device, { x: 0, y: 0, w: device.width, h: device.height }, [bouton])
    const ecranB = createScreenNode('ecranB', device, { x: 500, y: 0, w: device.width, h: device.height })
    const withScreens = createNodeCommand(pageId, null, ecranB).apply(createNodeCommand(pageId, null, ecranA).apply(doc))
    return { doc: withScreens, pageId, ecranA, ecranB }
  }

  it('pose un lien valide vers un autre ecran de la page', () => {
    const { doc, pageId, ecranB } = docAvecDeuxEcrans()
    const linked = setLinkCommand(pageId, 'bouton', ecranB.id).apply(doc)
    expect(tapNavigation(findNode(linked.pages[0]!.nodes, 'bouton')?.interactions)?.target).toBe(ecranB.id)
  })

  it('un seul annuler retire le lien pose', () => {
    const { doc, pageId, ecranB } = docAvecDeuxEcrans()
    const cmd = setLinkCommand(pageId, 'bouton', ecranB.id)
    const linked = cmd.apply(doc)
    const back = cmd.invert(doc).apply(linked)
    expect(tapNavigation(findNode(back.pages[0]!.nodes, 'bouton')?.interactions)).toBeNull()
    expect(back).toEqual(doc)
  })

  it('remplacer un lien existant s annule en restaurant l ancienne cible (pas en effacant tout court)', () => {
    const { doc, pageId, ecranB } = docAvecDeuxEcrans()
    const first = setLinkCommand(pageId, 'bouton', ecranB.id).apply(doc)
    // Un troisieme ecran, pour remplacer 'ecranB' par une cible differente
    // ('ecranA' contient 'bouton' : cette cible-la serait refusee).
    const ecranC = createScreenNode('ecranC', device, { x: 1000, y: 0, w: device.width, h: device.height })
    const withC = createNodeCommand(pageId, null, ecranC).apply(first)
    const replaceValide = setLinkCommand(pageId, 'bouton', ecranC.id)
    const replaced = replaceValide.apply(withC)
    expect(tapNavigation(findNode(replaced.pages[0]!.nodes, 'bouton')?.interactions)?.target).toBe(ecranC.id)

    const back = replaceValide.invert(withC).apply(replaced)
    expect(tapNavigation(findNode(back.pages[0]!.nodes, 'bouton')?.interactions)?.target).toBe(ecranB.id)
  })

  it('refuse une cible qui n existe pas dans la page (LinkTargetNotFoundError)', () => {
    const { doc, pageId } = docAvecDeuxEcrans()
    expect(() => setLinkCommand(pageId, 'bouton', 'introuvable').apply(doc)).toThrow(LinkTargetNotFoundError)
  })

  it("refuse un lien vers l'ecran qui contient le noeud (LinkToContainingScreenError)", () => {
    const { doc, pageId, ecranA } = docAvecDeuxEcrans()
    expect(() => setLinkCommand(pageId, 'bouton', ecranA.id).apply(doc)).toThrow(LinkToContainingScreenError)
  })

  it('refuse un ecran qui se lierait a lui-meme', () => {
    const { doc, pageId, ecranA } = docAvecDeuxEcrans()
    expect(() => setLinkCommand(pageId, ecranA.id, ecranA.id).apply(doc)).toThrow(LinkToContainingScreenError)
  })

  it('clearLinkCommand retire la cle link (pas seulement sa valeur) et s annule en la reposant', () => {
    const { doc, pageId, ecranB } = docAvecDeuxEcrans()
    const linked = setLinkCommand(pageId, 'bouton', ecranB.id).apply(doc)

    const cleared = clearLinkCommand(pageId, 'bouton').apply(linked)
    const node = findNode(cleared.pages[0]!.nodes, 'bouton')!
    expect('interactions' in node).toBe(false)

    const back = clearLinkCommand(pageId, 'bouton').invert(linked).apply(cleared)
    expect(tapNavigation(findNode(back.pages[0]!.nodes, 'bouton')?.interactions)?.target).toBe(ecranB.id)
  })

  it('clearLinkCommand ne fait rien de visible sur un noeud sans lien (idempotent)', () => {
    const { doc, pageId } = docAvecDeuxEcrans()
    const cleared = clearLinkCommand(pageId, 'bouton').apply(doc)
    expect(cleared).toEqual(doc)
  })
})

describe('deleteNodeCommand sur un ecran : cascade de liens (v2, addendum navigation §3.2, §8)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  // 'cible' est un ecran vise par TROIS liens : deux depuis des boutons
  // imbriques dans 'source', un depuis un bouton imbrique dans 'autre' --
  // de quoi verifier que la cascade retrouve les liens ou qu'ils vivent,
  // pas seulement au premier niveau de la page.
  function docAvecTroisLiens(): { doc: CalqueDocument; pageId: string } {
    const { doc, pageId } = baseDoc()
    const btn1 = rect('btn1', 0, 0)
    const btn2 = rect('btn2', 60, 0)
    const btn3 = rect('btn3', 0, 0)
    const source = createScreenNode('source', device, { x: 0, y: 0, w: device.width, h: device.height }, [btn1, btn2])
    const autre = createScreenNode('autre', device, { x: 500, y: 0, w: device.width, h: device.height }, [btn3])
    const cible = createScreenNode('cible', device, { x: 1000, y: 0, w: device.width, h: device.height })

    let d = doc
    d = createNodeCommand(pageId, null, source).apply(d)
    d = createNodeCommand(pageId, null, autre).apply(d)
    d = createNodeCommand(pageId, null, cible).apply(d)
    d = setLinkCommand(pageId, 'btn1', cible.id).apply(d)
    d = setLinkCommand(pageId, 'btn2', cible.id).apply(d)
    d = setLinkCommand(pageId, 'btn3', cible.id).apply(d)

    return { doc: d, pageId }
  }

  it('supprimer l ecran vise par trois liens les retire tous, dans la meme commande', () => {
    const { doc, pageId } = docAvecTroisLiens()
    const cible = (doc.pages[0]!.nodes.find((n) => n.name === 'cible') as FrameNode).id

    const apres = deleteNodeCommand(pageId, cible).apply(doc)

    expect(findNode(apres.pages[0]!.nodes, cible)).toBeNull()
    expect(findNode(apres.pages[0]!.nodes, 'btn1')?.interactions).toBeUndefined()
    expect(findNode(apres.pages[0]!.nodes, 'btn2')?.interactions).toBeUndefined()
    expect(findNode(apres.pages[0]!.nodes, 'btn3')?.interactions).toBeUndefined()
  })

  it('un seul annuler restaure l ecran ET ses trois liens', () => {
    const { doc, pageId } = docAvecTroisLiens()
    const cible = (doc.pages[0]!.nodes.find((n) => n.name === 'cible') as FrameNode).id

    const cmd = deleteNodeCommand(pageId, cible)
    const apres = cmd.apply(doc)
    const inverse = cmd.invert(doc)
    const restaure = inverse.apply(apres)

    expect(findNode(restaure.pages[0]!.nodes, cible)).not.toBeNull()
    expect(tapNavigation(findNode(restaure.pages[0]!.nodes, 'btn1')?.interactions)?.target).toBe(cible)
    expect(tapNavigation(findNode(restaure.pages[0]!.nodes, 'btn2')?.interactions)?.target).toBe(cible)
    expect(tapNavigation(findNode(restaure.pages[0]!.nodes, 'btn3')?.interactions)?.target).toBe(cible)
    expect(restaure).toEqual(doc)
  })

  it('supprimer un ecran sans lien entrant reste une simple suppression (comportement v1 inchange)', () => {
    const { doc, pageId } = baseDoc()
    const seul = createScreenNode('seul', device, { x: 0, y: 0, w: device.width, h: device.height })
    const withScreen = createNodeCommand(pageId, null, seul).apply(doc)

    const cmd = deleteNodeCommand(pageId, seul.id)
    const apres = cmd.apply(withScreen)
    expect(findNode(apres.pages[0]!.nodes, seul.id)).toBeNull()

    const restaure = cmd.invert(withScreen).apply(apres)
    expect(restaure).toEqual(withScreen)
  })

  it('supprimer un noeud qui n est pas un ecran reste inchange (aucune cascade cherchee)', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const deleted = deleteNodeCommand(pageId, 'a').apply(withA)
    expect(findNode(deleted.pages[0]!.nodes, 'a')).toBeNull()
  })
})


// v3 (composants mobiles) : les positions des enfants d'une frame en
// mise en page automatique (row/column/grid) sont MATERIALISEES dans le
// document, pour que le canevas affiche exactement ce que les exportateurs
// generent -- et que l'annulation les restaure en un seul geste.
describe('relayoutCommand / withAutoLayout', () => {
  function rowDoc(): { doc: CalqueDocument; pageId: string; rowId: string } {
    const { doc, pageId } = baseDoc()
    const row: FrameNode = {
      id: 'row', name: 'row', type: 'frame', frame: { x: 0, y: 0, w: 300, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'row', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [rect('a', 0, 0, 50, 20), rect('b', 0, 0, 30, 20)],
    }
    return { doc: createNodeCommand(pageId, null, row).apply(doc), pageId, rowId: 'row' }
  }

  it('replace les enfants selon la disposition, sans toucher les frames absolues', () => {
    const { doc, pageId } = rowDoc()
    const out = relayoutCommand().apply(doc)
    const page = out.pages.find((p) => p.id === pageId)!
    const row = findNode(page.nodes, 'row') as FrameNode
    expect(row.children[0]!.frame.x).toBe(0)
    expect(row.children[1]!.frame.x).toBe(60)
  })

  it('rend le meme document (meme reference) quand rien ne bouge', () => {
    const { doc } = rowDoc()
    const once = relayoutCommand().apply(doc)
    expect(relayoutCommand().apply(once)).toBe(once)
  })

  it('withAutoLayout : une seule entree d historique, annulable et retablissable', () => {
    const { doc, pageId } = rowDoc()
    const history = new History(doc)
    history.execute(withAutoLayout(createNodeCommand(pageId, 'row', rect('c', 0, 0, 20, 20))))
    const row = () => findNode(history.document.pages[0]!.nodes, 'row') as FrameNode
    expect(row().children.map((c) => c.frame.x)).toEqual([0, 60, 100])
    expect(history.undoLabels).toEqual(['Créer'])

    history.undo()
    expect(row().children.map((c) => c.id)).toEqual(['a', 'b'])
    expect(row().children.map((c) => c.frame.x)).toEqual([0, 0])

    history.redo()
    expect(row().children.map((c) => c.frame.x)).toEqual([0, 60, 100])
  })
})


describe('setContainerCommand (v3, conteneurs semantiques)', () => {
  function frameDoc(): { doc: CalqueDocument; pageId: string } {
    const { doc, pageId } = baseDoc()
    const frame: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    return { doc: createNodeCommand(pageId, null, frame).apply(doc), pageId }
  }

  it('pose un conteneur sur une frame, et s annule en le retirant vraiment (cle absente)', () => {
    const { doc, pageId } = frameDoc()
    const cmd = setContainerCommand(pageId, 'f', { kind: 'card', elevation: 4 })
    const apres = cmd.apply(doc)
    expect((findNode(apres.pages[0]!.nodes, 'f') as FrameNode).container).toEqual({ kind: 'card', elevation: 4 })
    const annule = cmd.invert(doc).apply(apres)
    expect('container' in (findNode(annule.pages[0]!.nodes, 'f') as FrameNode)).toBe(false)
  })

  it('null retire le conteneur ; l inverse le restaure', () => {
    const { doc, pageId } = frameDoc()
    const avec = setContainerCommand(pageId, 'f', { kind: 'grid', columns: 3 }).apply(doc)
    const cmd = setContainerCommand(pageId, 'f', null)
    const sans = cmd.apply(avec)
    expect('container' in (findNode(sans.pages[0]!.nodes, 'f') as FrameNode)).toBe(false)
    expect((findNode(cmd.invert(avec).apply(sans).pages[0]!.nodes, 'f') as FrameNode).container).toEqual({ kind: 'grid', columns: 3 })
  })

  it('refuse un conteneur invalide et un noeud qui n est pas une frame', () => {
    const { doc, pageId } = frameDoc()
    expect(() => setContainerCommand(pageId, 'f', { kind: 'grid', columns: 0 }).apply(doc)).toThrow()
    const avecRect = createNodeCommand(pageId, null, rect('r', 0, 0)).apply(doc)
    expect(() => setContainerCommand(pageId, 'r', { kind: 'safeArea' }).apply(avecRect)).toThrow(NotAFrameError)
  })
})
