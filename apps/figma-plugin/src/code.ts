// Point d'entree du plugin (thread principal de Figma) : recoit le contenu du
// fichier depuis l'interface, le valide, construit le plan puis le cree dans
// la page courante. Tout echec est rapporte a l'interface, rien n'est cree
// a moitie quand la lecture du fichier echoue.
import { buildInFigma } from './builder'
import { applyPrototype } from './prototype'
import { BundleError, buildPlan, parseBundle } from './mapping'

figma.showUI(__html__, { width: 440, height: 560, themeColors: true })

type FromUi = { type: 'import'; text: string } | { type: 'close' }

figma.ui.onmessage = async (msg: FromUi) => {
  if (msg.type === 'close') {
    figma.closePlugin()
    return
  }
  try {
    figma.ui.postMessage({ type: 'progress', text: 'Lecture du fichier…' })
    const bundle = parseBundle(msg.text)
    const plan = buildPlan(bundle)
    figma.ui.postMessage({ type: 'progress', text: `Création de ${plan.screens.length} écran(s)…` })
    const { report, screens, created } = await buildInFigma(figma, plan, bundle)
    const proto = await applyPrototype(figma, bundle, created)
    report.warnings.push(...proto.warnings)
    figma.currentPage.selection = screens
    if (screens.length > 0) figma.viewport.scrollAndZoomIntoView(screens)
    figma.ui.postMessage({ type: 'done', report: { ...report, reactions: proto.reactions } })
    figma.notify(`Calque : ${report.screens} écran(s) importé(s)`)
  } catch (e) {
    const message = e instanceof BundleError ? e.message : `Import impossible : ${e instanceof Error ? e.message : String(e)}`
    figma.ui.postMessage({ type: 'error', message })
  }
}
