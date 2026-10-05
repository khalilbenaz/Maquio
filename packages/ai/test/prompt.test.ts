import { describe, expect, it } from 'vitest'
import {
  COMPONENT_DEFINITIONS,
  COMPONENT_KINDS,
  CONTAINER_DEFINITIONS,
  CONTAINER_KINDS,
  createDocument,
  createNodeCommand,
  History,
  nodeSchema,
} from '@maquio/core'
import type { Node } from '@maquio/core'
import { buildPrompt } from '../src/prompt'
import { NODE_EXAMPLES } from '../src/prompt-examples'

function rect(id: string, name: string): Node {
  return {
    id,
    name,
    type: 'rect',
    frame: { x: 0, y: 0, w: 10, h: 10 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    fills: [],
    strokes: [],
    cornerRadius: 0,
  }
}

describe('buildPrompt', () => {
  const doc = createDocument('Mon app')
  it('contient l instruction, le schema attendu et le document', () => {
    const p = buildPrompt({ instruction: 'ajoute un bouton', document: doc, selectionIds: [] })
    expect(p).toContain('ajoute un bouton')
    expect(p).toContain('insertNode')
    expect(p).toContain(doc.pages[0]!.id)
  })
  it('nomme explicitement la selection quand il y en a une', () => {
    const p = buildPrompt({ instruction: 'x', document: doc, selectionIds: ['a', 'b'] })
    expect(p).toContain('a, b')
  })
  it('signale que le contenu du document est une donnee non fiable, jamais des instructions', () => {
    const prompt = buildPrompt({ instruction: 'x', document: createDocument('Doc'), selectionIds: [] })
    expect(prompt).toMatch(/non fiable/i)
    expect(prompt).toMatch(/jamais .*instruction/i)
  })

  it('interdit explicitement de renvoyer un document complet', () => {
    expect(buildPrompt({ instruction: 'x', document: doc, selectionIds: [] }))
      .toMatch(/jamais un document complet/i)
  })

  // Decision 6 : le modele doit connaitre les bornes du modele de donnees,
  // sous peine de produire un patch qui sera rejete.
  it('nomme les bornes du modele (couleurs, dimensions, rotation)', () => {
    const p = buildPrompt({ instruction: 'x', document: doc, selectionIds: [] })
    expect(p).toMatch(/entre 0 et 1/i) // couleurs 0..1
    expect(p.toLowerCase()).toContain('degr') // rotation en degres
    expect(p.toLowerCase()).toMatch(/positi/) // dimensions positives
  })

  // Decision 6 : quand une selection existe, c'est ELLE qui est serialisee,
  // pas le document entier - un noeud hors selection ne doit pas fuiter.
  it('serialise la selection seule, pas le reste du document', () => {
    const withNodes = createDocument('Mon app')
    const pageId = withNodes.pages[0]!.id
    const h = new History(withNodes)
    h.execute(createNodeCommand(pageId, null, rect('sel', 'NoeudSelectionne')))
    h.execute(createNodeCommand(pageId, null, rect('autre', 'NoeudHorsSelection')))

    const p = buildPrompt({ instruction: 'x', document: h.document, selectionIds: ['sel'] })
    expect(p).toContain('NoeudSelectionne')
    expect(p).not.toContain('NoeudHorsSelection')
  })

  // Defaut B (reparation du pont) : diagnostic reel a l'appel du vrai
  // binaire `claude` -- prive d'un exemple de la forme exacte d'un noeud,
  // le modele invente une forme plausible mais fausse (x/y/width/height a
  // plat, "fontSize" a plat, "text" au lieu de "characters", un type
  // "rectangle" qui n'existe pas), rejetee par parsePatch/nodeSchema. Ces
  // tests verifient que le prompt fixe desormais explicitement la forme
  // exacte -- les six types, "frame" imbrique, "characters"/"style", la
  // structure d'un ecran -- plutot que seulement le vocabulaire des
  // operations.
  describe('forme exacte des noeuds (defaut B)', () => {
    const doc = createDocument('Mon app')
    const p = buildPrompt({ instruction: 'x', document: doc, selectionIds: [] })

    it('nomme les sept types exacts de noeud', () => {
      for (const type of ['"frame"', '"text"', '"rect"', '"ellipse"', '"image"', '"line"', '"component"']) {
        expect(p).toContain(type)
      }
      // "rectangle" est le nom INVENTE en conditions reelles (voir le
      // rapport de diagnostic) : le prompt en parle bien, mais uniquement
      // pour l'interdire explicitement -- jamais comme exemple JSON reel.
      expect(p).toContain('jamais "rectangle"')
      expect(p).not.toMatch(/"type"\s*:\s*"rectangle"/)
    })

    it('precise que la position/taille vit dans un objet frame imbrique, jamais a plat', () => {
      expect(p).toMatch(/frame["']?\s*:\s*\{\s*["']?x/)
      expect(p.toLowerCase()).toContain('jamais "x"/"y"/"width"/"height" a plat'.toLowerCase())
    })

    it('precise que le texte vit dans characters et sa typographie dans style', () => {
      expect(p).toContain('"characters"')
      expect(p).toContain('"style"')
    })

    it('precise la structure d un ecran (frame de premier niveau portant device)', () => {
      expect(p.toLowerCase()).toContain('device')
      expect(p.toLowerCase()).toMatch(/premier niveau/)
    })

    it('precise que les dimensions doivent etre entieres', () => {
      expect(p.toLowerCase()).toContain('entier')
    })

    it('inclut un exemple JSON complet et valide pour chacun des sept types', () => {
      const parses = NODE_EXAMPLES.map((n) => n.type)
      expect(new Set(parses)).toEqual(new Set(['frame', 'text', 'rect', 'ellipse', 'image', 'line', 'component']))
      // Chaque exemple present dans le prompt doit lui-meme passer
      // nodeSchema -- exactement le validateur qui jugera le vrai patch,
      // pour qu'un exemple qui derive du modele casse ce test plutot que
      // de laisser passer un exemple obsolete en silence.
      for (const example of NODE_EXAMPLES) {
        expect(() => nodeSchema.parse(example)).not.toThrow()
        expect(p).toContain(JSON.stringify(example, null, 2))
      }
    })
  })

  // v3 (composants mobiles) : le modele doit pouvoir poser un bouton, un champ
  // ou une barre de navigation SEMANTIQUES plutot qu'un rectangle avec du
  // texte, et connaitre la forme exacte de leurs `props`.
  describe('composants mobiles semantiques', () => {
    const p = buildPrompt({ instruction: 'x', document: createDocument('Mon app'), selectionIds: [] })

    it('explique le noeud component (kind + props) et nomme chaque kind', () => {
      expect(p).toContain('"kind"')
      expect(p).toContain('"props"')
      for (const kind of COMPONENT_KINDS) expect(p, kind).toContain(`"${kind}"`)
    })

    it('donne les props par defaut de chaque kind, derivees du catalogue (valides)', () => {
      for (const kind of COMPONENT_KINDS) {
        expect(p).toContain(JSON.stringify(COMPONENT_DEFINITIONS[kind].props))
      }
    })

    it('nomme les conteneurs semantiques de frame et leurs valeurs par defaut', () => {
      expect(p).toContain('"container"')
      for (const kind of CONTAINER_KINDS) expect(p, kind).toContain(JSON.stringify(CONTAINER_DEFINITIONS[kind].spec))
    })

    it('rappelle que les composants n ont pas d enfants et les valeurs d icones autorisees', () => {
      expect(p.toLowerCase()).toMatch(/aucun enfant|n'a pas d'enfants|pas d'enfants/)
      for (const icon of ['home', 'search', 'arrowBack']) expect(p).toContain(icon)
    })
  })
})

describe('buildPrompt : valeurs fixes', () => {
  it('liste les valeurs autorisees de style.align et du layout', () => {
    const p = buildPrompt({ instruction: 'x', document: createDocument('T'), selectionIds: [] })
    expect(p).toContain('"style.align" : "left", "center" ou "right"')
    expect(p).toContain('"layout.alignCross" : "start", "center", "end" ou "stretch"')
  })
})

describe('buildPrompt : guide de design', () => {
  it('embarque le guide de design (hierarchie, couleur, anti-patterns, transitions)', () => {
    const p = buildPrompt({ instruction: 'x', document: createDocument('T'), selectionIds: [] })
    expect(p).toContain('UN seul accent')
    expect(p).toContain('ne se superposent JAMAIS')
    expect(p).toContain('look IA generique')
    expect(p).toContain('"push" ou "slide"')
  })
})

describe('buildPrompt : champs optionnels par composant', () => {
  it('liste les champs optionnels exacts de chaque kind (button n a pas leadingIcon)', () => {
    const p = buildPrompt({ instruction: 'x', document: createDocument('T'), selectionIds: [] })
    const ligneBouton = p.split('\n').find((l) => l.startsWith('- "button"'))!
    expect(ligneBouton).toMatch(/optionnels : .*"icon"/)
    expect(ligneBouton).toMatch(/"color"/)
    expect(ligneBouton).not.toContain('leadingIcon')
    expect(p).not.toContain('"leadingIcon", "color"... peuvent s\'ajouter')
  })

  it('demande de teinter les composants avec la couleur d accent', () => {
    const p = buildPrompt({ instruction: 'x', document: createDocument('T'), selectionIds: [] })
    expect(p).toMatch(/"color".*accent/)
  })
})

describe('buildPrompt : devise et barre d application', () => {
  it('demande une devise collee au montant et une barre d application de la couleur de surface', () => {
    const p = buildPrompt({ instruction: 'x', document: createDocument('T'), selectionIds: [] })
    expect(p).toContain('COLLEE au montant')
    expect(p).toContain('"appBar") recoit "color" = la couleur de surface')
  })
})
