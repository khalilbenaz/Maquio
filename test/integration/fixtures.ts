// Chargement partage des fixtures Figma utilisees par les tests
// d'integration (figma-to-codegen.test.ts ET flutter-dart-format.test.ts,
// re-corrige apres re-revue de la vague de correction finale) : les deux
// doivent manger EXACTEMENT les memes documents pour que le garde-fou
// `dart format` ne se contente pas, comme avant sa correction, de la seule
// fixture ecrite a la main dont Critical 4 dit precisement qu'elle ne
// prouve rien.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FigmaFileResponse } from '@calque/figma'

const FIGMA_PACKAGE_FIXTURES = join(__dirname, '..', '..', 'packages', 'figma', 'test', 'fixtures')

function loadFigmaFixture(path: string): FigmaFileResponse {
  return JSON.parse(readFileSync(path, 'utf8')) as FigmaFileResponse
}

export type NamedFigmaFixture = { name: string; file: FigmaFileResponse }

export const FIGMA_FIXTURES: NamedFigmaFixture[] = [
  { name: 'simple-file', file: loadFigmaFixture(join(FIGMA_PACKAGE_FIXTURES, 'simple-file.json')) },
  { name: 'autolayout-file', file: loadFigmaFixture(join(FIGMA_PACKAGE_FIXTURES, 'autolayout-file.json')) },
  { name: 'unsupported-file', file: loadFigmaFixture(join(FIGMA_PACKAGE_FIXTURES, 'unsupported-file.json')) },
  {
    name: 'realistic-figma-file',
    file: loadFigmaFixture(join(__dirname, 'fixtures', 'realistic-figma-file.json')),
  },
]
