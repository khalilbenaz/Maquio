// Projet de test des interactions : transitions, appui long, delai, retour,
// overlays (dialogue, feuille basse, snackbar) et URL, sur trois ecrans.
import { DEVICE_PRESETS, PALETTE_ITEMS, createDocument, createScreenNode } from '@maquio/core'
import type { MaquioDocument, Interaction, Node, Rect } from '@maquio/core'

const item = (id: string) => PALETTE_ITEMS.find((i) => i.id === id)!
function make(id: string, frame: Partial<Rect>, name: string, props: Record<string, unknown> = {}, interactions: Interaction[] = []): Node {
  const entry = item(id)
  const node = entry.build({ x: 0, y: 0, w: entry.size.w, h: entry.size.h, ...frame })
  const withProps = node.type === 'component' ? ({ ...node, props: { ...node.props, ...props } } as Node) : node
  return { ...withProps, name, id: `${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...(interactions.length > 0 ? { interactions } : {}) } as Node
}
const nav = (target: string, transition: Interaction['transition']): Interaction => ({ trigger: { type: 'tap' }, action: { type: 'navigate', target }, transition })

export function documentInteractions(): MaquioDocument {
  const d = createDocument('Interactions')
  const dialogue = make('dialog', { x: 40, y: 300, w: 313, h: 200 }, 'Confirmer', { title: 'Confirmer', message: 'Valider ?', confirmLabel: 'Oui', cancelLabel: 'Non' })
  const snack = make('snackbar', { x: 16, y: 760, w: 361, h: 48 }, 'Enregistre', { message: 'Enregistré', actionLabel: 'Annuler' })
  const feuille = make('bottomSheet', { x: 0, y: 500, w: 393, h: 340 }, 'Options')
  if (feuille.type === 'frame') {
    feuille.children = [
      make('button', { x: 24, y: 40, w: 345, h: 48 }, 'Fermer la feuille', { label: 'Fermer' }, [{ trigger: { type: 'tap' }, action: { type: 'closeOverlay' }, transition: { type: 'none' } }]),
    ]
  }
  const fade: Interaction['transition'] = { type: 'fade', durationMs: 400, easing: 'linear' }
  const accueil = {
    ...createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [
      make('button', { x: 24, y: 100, w: 345, h: 48 }, 'Glisser', { label: 'Glisser' }, [nav('detail', { type: 'slide', direction: 'left', durationMs: 300, easing: 'easeOut' })]),
      make('button', { x: 24, y: 160, w: 345, h: 48 }, 'Modale', { label: 'Modale' }, [nav('profil', { type: 'modal', durationMs: 350, easing: 'spring' })]),
      make('button', { x: 24, y: 220, w: 345, h: 48 }, 'Pousser', { label: 'Pousser' }, [nav('detail', { type: 'push', durationMs: 300, easing: 'easeInOut' })]),
      make('button', { x: 24, y: 280, w: 345, h: 48 }, 'Dialogue', { label: 'Dialogue' }, [
        { trigger: { type: 'longPress' }, action: { type: 'openOverlay', overlay: 'dialog', target: 'confirmer' }, transition: { type: 'fade', durationMs: 200, easing: 'easeIn' } },
        nav('detail', { type: 'none' }),
      ]),
      make('listTile', { x: 0, y: 340, w: 393, h: 56 }, 'Options liste', { title: 'Options', subtitle: '' }, [
        { trigger: { type: 'tap' }, action: { type: 'openOverlay', overlay: 'bottomSheet', target: 'options' }, transition: { type: 'modal', durationMs: 350, easing: 'easeOut' } },
      ]),
      make('listTile', { x: 0, y: 400, w: 393, h: 56 }, 'Enregistrer', { title: 'Enregistrer', subtitle: '' }, [
        { trigger: { type: 'tap' }, action: { type: 'openOverlay', overlay: 'snackbar', target: 'enregistre' }, transition: { type: 'fade', durationMs: 200, easing: 'linear' } },
      ]),
      make('button', { x: 24, y: 470, w: 345, h: 48 }, 'Site', { label: 'Site web' }, [{ trigger: { type: 'tap' }, action: { type: 'openUrl', url: 'https://exemple.com/aide' }, transition: { type: 'none' } }]),
      make('card', { x: 24, y: 540, w: 345, h: 80 }, 'Carte', {}, [{ trigger: { type: 'longPress' }, action: { type: 'navigate', target: 'profil' }, transition: { type: 'slide', direction: 'up', durationMs: 500, easing: 'easeInOut' } }]),
      dialogue,
      snack,
      feuille,
    ]),
    id: 'accueil',
    interactions: [{ trigger: { type: 'afterDelay', ms: 30000 }, action: { type: 'navigate', target: 'detail' }, transition: fade }] as Interaction[],
  }
  const detail = {
    ...createScreenNode('Détail', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [
      make('appBar', { x: 0, y: 0, w: 393, h: 56 }, 'Barre', { title: 'Détail', leading: 'back' }),
      make('button', { x: 24, y: 100, w: 345, h: 48 }, 'Retour', { label: 'Retour' }, [{ trigger: { type: 'tap' }, action: { type: 'back' }, transition: { type: 'none' } }]),
      make('button', { x: 24, y: 160, w: 345, h: 48 }, 'Accueil', { label: 'Accueil' }, [nav('accueil', fade)]),
    ]),
    id: 'detail',
  }
  const profil = { ...createScreenNode('Profil', DEVICE_PRESETS.iphone15, { x: 1000, y: 0, w: 393, h: 852 }, [make('button', { x: 24, y: 100, w: 345, h: 48 }, 'Retour profil', { label: 'Retour' }, [{ trigger: { type: 'tap' }, action: { type: 'back' }, transition: { type: 'modal', durationMs: 350, easing: 'easeOut' } }])]), id: 'profil' }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [accueil, detail, profil] }] }
}
