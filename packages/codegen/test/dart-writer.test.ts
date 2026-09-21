// D2 du rapport dart-correctness-report.md : `collapseShortCalls` comptait
// les parentheses ligne a ligne sans jamais tenir compte des crochets
// d'une liste litterale (`list()` de dart-writer.ts) -- une ligne
// `children: [` a un solde de PARENTHESES nul, donc passait pour "plate"
// et se faisait aspirer dans un regroupement, produisant un `[,` qui ne
// parse pas. Reproduit et verifie a la main avec `dart analyze` avant
// correction (code de sortie 65).
import { describe, expect, it } from 'vitest'
import { collapseShortCalls } from '../src/flutter/dart-writer'

describe('collapseShortCalls', () => {
  it('ne regroupe jamais un appel dont un argument ouvre une liste non refermee sur sa propre ligne (D2)', () => {
    // Forme exacte du rapport : un `Row(` dont le seul argument `children`
    // est une liste developpee (comme le produit toujours `list()`).
    const lines = ['Row(', '  children: [', '    Foo(),', '  ],', ')']

    const result = collapseShortCalls(lines)

    // Le defaut precis a ne plus jamais produire : une virgule collee a un
    // crochet ouvrant, invalide en Dart.
    expect(result.join('\n')).not.toContain('[,')
    // Une ligne qui ouvre une liste non refermee disqualifie tout le
    // groupe englobant du regroupement -- le bloc reste donc developpe
    // exactement comme fourni, plutot que fusionne en une syntaxe brisee.
    expect(result).toEqual(lines)
  })

  // Non-regression : un appel a arguments reellement plats (aucun d'eux
  // n'ouvre de structure non refermee) doit toujours pouvoir se regrouper
  // quand la ligne resultante tient dans MAX_LINE_WIDTH -- le correctif ne
  // doit pas rendre le regroupement inoperant pour le cas courant.
  it('regroupe toujours un appel dont les arguments sont plats et tiennent en largeur', () => {
    const lines = ['SizedBox(', '  height: 16,', ')']
    const result = collapseShortCalls(lines)
    expect(result).toEqual(['SizedBox(height: 16)'])
  })
})
