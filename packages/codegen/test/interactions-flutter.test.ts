import { describe, expect, it } from 'vitest'
import { documentSchema } from '@maquio/core'
import { flutterExporter } from '../src/flutter/flutter'
import { documentInteractions } from './fixtures/interactions'

describe('fixture des interactions', () => {
  it('est un document valide', () => {
    const r = documentSchema.safeParse(documentInteractions())
    expect(r.success, JSON.stringify(r.success ? '' : r.error.issues.slice(0, 3))).toBe(true)
  })
})

describe('Flutter : interactions', () => {
  const out = flutterExporter.export(documentInteractions(), { projectName: 'demo' })
  const file = (p: string) => out.files.find((f) => f.path === p)?.contents ?? ''
  const accueil = file('lib/screens/accueil.dart')
  const actions = file('lib/actions.dart')

  it('la navigation par defaut (poussee native) reste un pushNamed', () => {
    expect(accueil).toContain("onPressed: () => Navigator.of(context).pushNamed('/detail')")
  })
  it('une transition personnalisee appelle une fonction de lib/actions.dart avec son AppTransition', () => {
    expect(accueil).toContain('onPressed: () => goDetailSlide(context)')
    expect(accueil).toContain("import '../actions.dart';")
    expect(actions).toContain('const t = AppTransition.slide(SlideDirection.left, 300, Curves.easeOut);')
    expect(actions).toContain('Navigator.of(context).push(appRoute(const Detail(), t));')
    expect(actions).toContain('const t = AppTransition.modal(350, Curves.easeOutBack);') // ressort
    expect(actions).toContain('const t = AppTransition.none();')
    expect(actions).toContain('const t = AppTransition.fade(400, Curves.linear);')
  })
  it('lib/transitions.dart definit les cinq transitions et la route animee', () => {
    const t = file('lib/transitions.dart')
    for (const m of ['enum SlideDirection', 'enum TransitionKind', 'AppTransition.slide', 'AppTransition.push', 'AppTransition.fade', 'AppTransition.modal', 'PageRouteBuilder<T>', 'SlideTransition', 'FadeTransition']) expect(t).toContain(m)
  })
  it('appui long : GestureDetector.onLongPress (et le clic du bouton reste sur le bouton)', () => {
    expect(accueil).toMatch(/onLongPress: \(\) => showConfirmer\(context\)[\s\S]*onPressed: \(\) => goDetailNone\(context\)/)
    expect(accueil).toContain('onLongPress: () => goProfilSlide(context)')
  })
  it('retour et fermeture d overlay : Navigator.maybePop', () => {
    const detail = file('lib/screens/detail.dart')
    expect(detail).toContain('onPressed: () => Navigator.of(context).maybePop()')
    expect(actions).toContain('onPressed: () => Navigator.of(context).maybePop()')
  })
  it('dialogue : showDialog + AlertDialog avec son style d animation ; le gabarit n est pas rendu dans l ecran', () => {
    expect(actions).toContain('showDialog<void>(')
    expect(actions).toContain('AlertDialog(')
    expect(actions).toContain("title: Text('Confirmer')")
    expect(actions).toContain('curve: Curves.easeIn')
    expect(accueil).not.toContain('AlertDialog')
    expect(accueil).not.toContain("'Enregistré'")
  })
  it('feuille basse : showModalBottomSheet avec son contenu et sa hauteur', () => {
    expect(actions).toContain('showModalBottomSheet<void>(')
    expect(actions).toContain('sheetAnimationStyle: const AnimationStyle(')
    expect(actions).toContain('height: 340')
    expect(actions).toContain("child: Text('Fermer')")
  })
  it('snackbar : ScaffoldMessenger.showSnackBar avec son action', () => {
    expect(actions).toContain('ScaffoldMessenger.of(context).showSnackBar(')
    expect(actions).toContain("SnackBarAction(label: 'Annuler'")
  })
  it('URL : url_launcher, dependance ajoutee a pubspec.yaml', () => {
    expect(actions).toContain("import 'package:url_launcher/url_launcher.dart';")
    expect(actions).toContain("Future<void> openUrl1() => launchUrl(Uri.parse('https://exemple.com/aide'));")
    expect(file('pubspec.yaml')).toContain('url_launcher')
  })
  it('apres un delai : ecran StatefulWidget avec Timer annule a la sortie', () => {
    expect(accueil).toContain("import 'dart:async';")
    expect(accueil).toContain('class Accueil extends StatefulWidget')
    expect(accueil).toContain('Timer(const Duration(milliseconds: 30000), () {')
    expect(accueil).toContain('if (mounted) goDetailFade(context);')
    expect(accueil).toContain('_timer?.cancel();')
    expect(file('lib/screens/detail.dart')).toContain('extends StatelessWidget')
  })
  it('sans interaction speciale, ni actions.dart ni transitions.dart ni url_launcher', () => {
    const plain = flutterExporter.export(documentInteractionsSansSpecial(), { projectName: 'demo' })
    expect(plain.files.map((f) => f.path)).not.toContain('lib/actions.dart')
    expect(plain.files.find((f) => f.path === 'pubspec.yaml')!.contents).not.toContain('url_launcher')
  })
})

function documentInteractionsSansSpecial() {
  const d = documentInteractions()
  const strip = (n: import('@maquio/core').Node): import('@maquio/core').Node => {
    const { interactions: _i, ...rest } = n as never as Record<string, unknown>
    void _i
    const copy = rest as unknown as import('@maquio/core').Node
    return copy.type === 'frame' ? { ...copy, children: copy.children.map(strip) } : copy
  }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: d.pages[0]!.nodes.map(strip) }] }
}
