// Projet multi-ecrans AVEC IMAGES locales : garde-fou « vrai compilateur » de
// la copie et de la declaration des images (pubspec, require, imageset,
// res/drawable). Les sources sont des noms relatifs a `<document>.ressources/`
// (voir `ressourcesImages`), deux fichiers de meme nom venant de dossiers
// differents (`logo.png` relatif et `/tmp/autre/logo.png` absolu).
import { DEVICE_PRESETS, PALETTE_ITEMS, createDocument, createScreenNode } from '@calque/core'
import type { CalqueDocument, ImageNode, Node } from '@calque/core'

// PNG 1x1 valide.
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function image(name: string, src: string, x: number, y: number, fit: ImageNode['fit'] = 'cover'): ImageNode {
  return { id: crypto.randomUUID(), name, type: 'image', frame: { x, y, w: 120, h: 120 }, visible: true, locked: false, opacity: 1, rotation: 0, src, fit }
}

export function documentProjetImages(absoluteLogo: string): CalqueDocument {
  const d = createDocument('Projet images')
  const bouton = PALETTE_ITEMS.find((i) => i.id === 'button')!.build({ x: 20, y: 400, w: 200, h: 48 })
  const avatar = PALETTE_ITEMS.find((i) => i.id === 'avatar')!.build({ x: 20, y: 300, w: 56, h: 56 })
  const avatarAvecImage: Node = avatar.type === 'component' && avatar.kind === 'avatar' ? { ...avatar, props: { ...avatar.props, src: 'avatar.png' } } : avatar
  const accueil = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [
    image('Logo', 'logo.png', 20, 40),
    image('Autre logo', absoluteLogo, 160, 40, 'contain'),
    image('Photo été', 'Photo Été 2.png', 20, 180, 'fill'),
    image('Distante', 'https://exemple.test/photo.png', 160, 180),
    avatarAvecImage,
    bouton,
  ])
  const detail = createScreenNode('Détail', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [image('Logo', 'logo.png', 20, 40)])
  const lie = { ...bouton, link: { target: detail.id } } as Node
  accueil.children = accueil.children.map((c) => (c.id === bouton.id ? lie : c))
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [accueil, detail] }] }
}

// Ecrit les fichiers sources des images referencees (relatives a un dossier
// de ressources, absolues pour `absoluteLogo`).
export const RESSOURCES_RELATIVES = ['logo.png', 'avatar.png', 'Photo Été 2.png']
