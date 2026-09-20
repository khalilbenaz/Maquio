// Verifie la decision 2 du brief : src/shared/api.ts ne contient que des
// types et la liste des canaux. Il est importe par les trois cotes (main,
// preload, renderer) et ne doit donc importer ni Electron, ni React, ni
// Node, ni meme les paquets du monorepo (pour rester sans aucune
// dependance) : on verifie ici qu'il n'importe rien du tout.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('purete de src/shared/api.ts', () => {
  it("n'importe rien du tout", () => {
    const src = lire('src/shared/api.ts')
    expect(src).not.toMatch(/^\s*import\b/m)
    expect(src).not.toMatch(/\brequire\(/)
  })
})
