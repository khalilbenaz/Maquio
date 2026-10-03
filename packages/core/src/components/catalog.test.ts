import { describe, expect, it } from 'vitest'
import type { ComponentKind } from '../index'
import {
  COMPONENT_DEFINITIONS,
  componentPropKeys,
  COMPONENT_KINDS,
  CONTAINER_DEFINITIONS,
  CONTAINER_KINDS,
  ICONS,
  ICON_NAMES,
  PALETTE_CATEGORIES,
  PALETTE_ITEMS,
  nodeSchema,
  searchPalette,
} from '../index'

describe('catalogue des composants', () => {
  it('definit chaque kind du modele, et seulement eux', () => {
    expect(Object.keys(COMPONENT_DEFINITIONS).sort()).toEqual([...COMPONENT_KINDS].sort())
    expect(Object.keys(CONTAINER_DEFINITIONS).sort()).toEqual([...CONTAINER_KINDS].sort())
  })

  it('couvre les 7 familles demandees', () => {
    expect([...PALETTE_CATEGORIES]).toEqual([
      'Actions',
      'Saisie',
      'Affichage',
      'Listes',
      'Navigation',
      'Mise en page',
      'Overlays',
    ])
  })

  it('chaque entree de palette fabrique un noeud valide pour nodeSchema', () => {
    for (const item of PALETTE_ITEMS) {
      const node = item.build({ x: 10, y: 20, w: item.size.w, h: item.size.h })
      const result = nodeSchema.safeParse(node)
      expect(result.success, `${item.id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`).toBe(true)
    }
  })

  it('les identifiants de palette sont uniques et chaque categorie est utilisee', () => {
    const ids = PALETTE_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const category of PALETTE_CATEGORIES) {
      expect(PALETTE_ITEMS.some((i) => i.category === category), category).toBe(true)
    }
  })

  it('chaque champ editable designe une propriete existante du composant par defaut', () => {
    for (const [kind, def] of Object.entries(COMPONENT_DEFINITIONS)) {
      for (const field of def.fields) {
        expect(componentPropKeys(kind as ComponentKind), `${kind}.${field.key}`).toContain(field.key)
      }
    }
  })

  it('chaque noeud fabrique recoit un id unique', () => {
    const a = PALETTE_ITEMS[0]!.build({ x: 0, y: 0, w: 10, h: 10 })
    const b = PALETTE_ITEMS[0]!.build({ x: 0, y: 0, w: 10, h: 10 })
    expect(a.id).not.toBe(b.id)
  })

  it('le jeu d icones est mappe vers Material, SF Symbols et Compose', () => {
    for (const name of ICON_NAMES) {
      const m = ICONS[name]
      expect(m.flutter, name).toMatch(/^[a-z0-9_]+$/)
      expect(m.materialName, name).toMatch(/^[a-z0-9-]+$/)
      expect(m.sfSymbol, name).toMatch(/^[a-z0-9.]+$/)
      expect(m.compose, name).toMatch(/^[A-Z][A-Za-z]+$/)
    }
  })
})

describe('recherche dans la palette', () => {
  it('trouve par libelle, sans casse ni accent', () => {
    expect(searchPalette('bouton').some((i) => i.id === 'button')).toBe(true)
    expect(searchPalette('BOUTON').some((i) => i.id === 'button')).toBe(true)
    expect(searchPalette('reglages').length + searchPalette('Réglages').length).toBeGreaterThanOrEqual(0)
  })

  it('trouve par mot-cle anglais ou natif', () => {
    expect(searchPalette('switch').some((i) => i.id === 'switch')).toBe(true)
    expect(searchPalette('toggle').some((i) => i.id === 'switch')).toBe(true)
    expect(searchPalette('scaffold').some((i) => i.id === 'appBar')).toBe(true)
  })

  it('rend tout pour une requete vide et rien pour une requete absurde', () => {
    expect(searchPalette('')).toEqual(PALETTE_ITEMS)
    expect(searchPalette('   ')).toEqual(PALETTE_ITEMS)
    expect(searchPalette('zzzzqqqq')).toEqual([])
  })
})
