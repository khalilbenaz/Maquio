import { describe, expect, it } from 'vitest'
import { composeExporter } from '../src/compose/compose'
import { documentInteractions } from './fixtures/interactions'

describe('Compose : interactions', () => {
  const out = composeExporter.export(documentInteractions(), { projectName: 'demo' })
  const file = (p: string) => out.files.find((f) => f.path === p)?.contents ?? ''
  const accueil = file('src/main/kotlin/screens/Accueil.kt')
  const nav = file('src/main/kotlin/AppNavigation.kt')
  it('transitions : par destination dans NavHost (enter / popExit), jamais pour la poussee native', () => {
    expect(nav).toContain('slideInHorizontally(initialOffsetX = { it }, animationSpec = tween(300, easing = EaseOut))')
    expect(nav).toContain('popExitTransition = { slideOutHorizontally(targetOffsetX = { it }')
    expect(nav).not.toContain('EnterTransition.None') // la 1re transition vers Detail (glissement) l'emporte
    expect(out.warnings.some((w) => w.includes('Détail'))).toBe(true)
    expect(nav).toContain('fadeIn(animationSpec = tween(400, easing = LinearEasing))')
    expect(nav).toContain('import androidx.compose.animation.slideInHorizontally')
    // l'ecran Profil a deux transitions differentes (modale et glissement vers le haut) : avertissement
    expect(out.warnings.some((w) => w.includes('plusieurs transitions') && w.includes('Profil'))).toBe(true)
  })
  it('navigation : navController.navigate ; retour : popBackStack', () => {
    expect(accueil).toContain('navController.navigate("detail")')
    expect(file('src/main/kotlin/screens/Detail.kt')).toContain('navController.popBackStack()')
  })
  it('appui long : combinedClickable avec opt-in foundation', () => {
    expect(accueil).toContain('combinedClickable(onClick = {}, onLongClick = { overlay = "confirmer" })')
    expect(accueil).toContain('@OptIn(')
    expect(accueil).toContain('ExperimentalFoundationApi::class')
  })
  it('overlays : AlertDialog, ModalBottomSheet et snackbar relies a l etat overlay ; gabarits absents de la mise en page', () => {
    expect(accueil).toContain('var overlay by remember { mutableStateOf<String?>(null) }')
    expect(accueil).toContain('if (overlay == "confirmer") {')
    expect(accueil).toContain('AlertDialog(')
    expect(accueil).toContain('onDismissRequest = { overlay = null }')
    expect(accueil).toContain('if (overlay == "options") {')
    expect(accueil).toContain('ModalBottomSheet(')
    expect(accueil).toContain('snackbarHost = { SnackbarHost(snackbarHostState) }')
    expect(accueil).toContain('snackbarHostState.showSnackbar(message = "Enregistré", actionLabel = "Annuler")')
    expect((accueil.match(/Valider \?/g) ?? []).length).toBe(1)
    expect(accueil).not.toContain('showDialog')
  })
  it('URL et delai', () => {
    expect(accueil).toContain('val uriHandler = LocalUriHandler.current')
    expect(accueil).toContain('uriHandler.openUri("https://exemple.com/aide")')
    expect(accueil).toContain('LaunchedEffect(Unit) {')
    expect(accueil).toContain('delay(30000L)')
  })
})
