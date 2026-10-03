// Export Flutter des composants mobiles : chaque kind vers son widget Material
// natif, le Scaffold d'un ecran, la navigation par routes et l'export de tous
// les ecrans.
import { describe, expect, it } from 'vitest'
import type { Node } from '@calque/core'
import { flutterExporter } from '../src/flutter/flutter'
import { docOf, linked, make, oneScreen, parent, screen, screenFile } from './helpers/composants'

function dart(...children: Node[]): string {
  const result = flutterExporter.export(oneScreen(...children), { projectName: 'demo' })
  return screenFile(result.files, /screens\/accueil\.dart/)
}

describe('Flutter : actions', () => {
  it('bouton : primaire ElevatedButton, secondaire OutlinedButton, texte TextButton', () => {
    expect(dart(make('button'))).toContain('ElevatedButton(')
    expect(dart(make('button'))).toContain('ElevatedButton.styleFrom(')
    expect(dart(make('button-secondary'))).toContain('OutlinedButton(')
    expect(dart(make('button-text'))).toContain('TextButton(')
  })

  it('bouton desactive : onPressed null ; avec icone : constructeur .icon', () => {
    expect(dart(make('button-disabled'))).toContain('onPressed: null')
    expect(dart(make('button', {}, { icon: 'home' }))).toContain('ElevatedButton.icon(')
    expect(dart(make('button', {}, { icon: 'home' }))).toContain('icon: Icon(Icons.home)')
  })

  it('couleur personnalisee d un bouton primaire', () => {
    const code = dart(make('button', {}, { color: { r: 1, g: 0, b: 0, a: 1 } }))
    expect(code).toContain('backgroundColor: const Color(0xFFFF0000)')
  })

  it('bouton icone et FAB', () => {
    expect(dart(make('iconButton'))).toContain('IconButton(')
    expect(dart(make('iconButton-filled'))).toContain('IconButton.filled(')
    expect(dart(make('iconButton', {}, { variant: 'outlined' }))).toContain('IconButton.outlined(')
    expect(dart(make('fab', { x: 10, y: 10 }, {}, undefined)).includes('FloatingActionButton(')).toBe(true)
    expect(dart(make('fab-extended'))).toContain('FloatingActionButton.extended(')
  })
})

describe('Flutter : saisie', () => {
  it('champ de texte : TextField, mot de passe, multiligne, erreur', () => {
    const base = dart(make('textField'))
    expect(base).toContain('TextField(')
    expect(base).toContain('labelText: ')
    expect(dart(make('textField-password'))).toContain('obscureText: true')
    expect(dart(make('textField-multiline'))).toMatch(/maxLines: \d/)
    expect(dart(make('textField-error'))).toContain("errorText: 'Adresse invalide'")
    expect(dart(make('textField', {}, { placeholder: 'nom@x.fr', helperText: 'aide' }))).toContain("hintText: 'nom@x.fr'")
  })

  it('case, interrupteur, radio, curseur', () => {
    expect(dart(make('checkbox'))).toContain('Checkbox(')
    expect(dart(make('switch'))).toContain('Switch(')
    expect(dart(make('switch', {}, { checked: false }))).toContain('value: false')
    expect(dart(make('radio'))).toContain('RadioGroup<int>(')
    const slider = dart(make('slider'))
    expect(slider).toContain('Slider(')
    expect(slider).toContain('min: 0')
    expect(slider).toContain('max: 100')
    expect(dart(make('slider', {}, { disabled: true }))).toContain('onChanged: null')
  })

  it('liste deroulante et selecteur de date', () => {
    const dropdown = dart(make('dropdown'))
    expect(dropdown).toContain('DropdownButtonFormField<String>(')
    expect(dropdown).toContain('DropdownMenuItem<String>(')
    expect(dropdown).toContain("value: 'Option 2'")
    expect(dropdown).toContain("initialValue: 'Option 1'")
    const date = dart(make('datePicker', {}, { value: '2026-10-03' }))
    expect(date).toContain('showDatePicker(')
    expect(date).toContain('DateTime(2026, 10, 3)')
    expect(date).toContain('readOnly: true')
  })
})

describe('Flutter : affichage', () => {
  it('icone, avatar, badge, chip, separateur, progression, indicateur', () => {
    expect(dart(make('icon', {}, { name: 'star', size: 32 }))).toContain('Icon(Icons.star, size: 32)')
    expect(dart(make('avatar'))).toContain('CircleAvatar(')
    expect(dart(make('avatar', {}, { src: 'https://x.fr/a.png' }))).toContain("NetworkImage('https://x.fr/a.png')")
    expect(dart(make('badge'))).toContain('Badge(')
    expect(dart(make('chip'))).toContain('ActionChip(')
    expect(dart(make('chip-filter'))).toContain('FilterChip(')
    expect(dart(make('divider'))).toContain('Divider(')
    expect(dart(make('divider-vertical'))).toContain('VerticalDivider(')
    expect(dart(make('progressBar'))).toContain('LinearProgressIndicator(value: 0.6)')
    expect(dart(make('progressBar', {}, { indeterminate: true }))).toContain('LinearProgressIndicator()')
    expect(dart(make('spinner'))).toContain('CircularProgressIndicator(')
  })

  it('carte : Card avec elevation et rayon', () => {
    const code = dart(make('card'))
    expect(code).toContain('Card(')
    expect(code).toContain('elevation: 2')
    expect(code).toContain('BorderRadius.circular(12)')
  })
})

describe('Flutter : listes', () => {
  it('ListTile avec icones, titre et sous-titre', () => {
    const code = dart(make('listTile'))
    expect(code).toContain('ListTile(')
    expect(code).toContain("title: Text('Titre')")
    expect(code).toContain("subtitle: Text('Sous-titre')")
    expect(code).toContain('trailing: Icon(Icons.chevron_right)')
  })

  it('ListView avec separateurs, grille, zone defilante', () => {
    const tile = (i: number) => make('listTile', { w: 360, h: 72 }, { title: `T${i}` })
    const liste = parent(make('listView') as never, [tile(1), tile(2)])
    expect(dart(liste)).toContain('ListView(')
    const avecSeparateurs = parent(make('listView') as never, [tile(1), tile(2)])
    ;(avecSeparateurs as { container: unknown }).container = { kind: 'listView', axis: 'vertical', dividers: true }
    expect(dart(avecSeparateurs)).toContain('Divider(height: 1)')
    const grille = parent(make('grid') as never, [tile(1), tile(2), tile(3)])
    const g = dart(grille)
    expect(g).toContain('GridView.count(')
    expect(g).toContain('crossAxisCount: 2')
    expect(dart(parent(make('scrollView') as never, [tile(1)]))).toContain('SingleChildScrollView(')
  })
})

describe('Flutter : mise en page', () => {
  it('Row, Column, Stack, SafeArea, Spacer', () => {
    const rangee = parent(make('row') as never, [make('icon'), make('spacer'), make('icon')])
    const r = dart(rangee)
    expect(r).toContain('Row(')
    expect(r).toContain('Spacer()')
    expect(dart(parent(make('column') as never, [make('icon')]))).toContain('Column(')
    expect(dart(parent(make('stack') as never, [make('icon')]))).toContain('Stack(')
    expect(dart(parent(make('safeArea') as never, [make('icon')]))).toContain('SafeArea(')
    // Hors d'une Row/Column, un espaceur n'a pas de sens : boite vide.
    expect(dart(make('spacer'))).toContain('SizedBox.shrink()')
  })

  it('un Spacer a poids dans une Row', () => {
    const rangee = parent(make('row') as never, [make('spacer', {}, { flex: 3 })])
    expect(dart(rangee)).toContain('Spacer(flex: 3)')
  })
})

describe('Flutter : overlays', () => {
  it('AlertDialog avec ses deux boutons ; sans annulation un seul', () => {
    const code = dart(make('dialog'))
    expect(code).toContain('AlertDialog(')
    expect(code).toContain("child: Text('Annuler')")
    expect(code).toContain("child: Text('OK')")
    expect(dart(make('dialog', {}, { cancelLabel: '' }))).not.toContain('Annuler')
  })

  it('feuille basse : BottomSheet ; snackbar : message et action', () => {
    const code = dart(parent(make('bottomSheet') as never, [make('listTile')]))
    expect(code).toContain('BottomSheet(')
    expect(code).toContain('showDragHandle: true')
    const snack = dart(make('snackbar'))
    expect(snack).toContain("'Enregistré'")
    expect(snack).toContain("Text('Annuler')")
  })
})

describe('Flutter : Scaffold', () => {
  it('toute barre d application / barre basse / FAB / tiroir occupe son emplacement natif', () => {
    const code = dart(
      make('appBar', { y: 0 }),
      make('bottomNav', { y: 772 }),
      make('fab', { x: 321, y: 690 }),
      parent(make('drawer') as never, [make('listTile')]),
      make('button', { y: 300 }),
    )
    expect(code).toContain('Scaffold(')
    expect(code).toMatch(/appBar: AppBar\(/)
    expect(code).toMatch(/bottomNavigationBar: BottomNavigationBar\(/)
    expect(code).toMatch(/floatingActionButton: FloatingActionButton\(/)
    expect(code).toMatch(/drawer: Drawer\(/)
    expect(code).toContain('body: Stack(')
    // Ni la barre ni le FAB ne sont dupliques dans le corps.
    expect(code.match(/AppBar\(/g)).toHaveLength(1)
    expect(code.match(/BottomNavigationBar\(/g)).toHaveLength(1)
  })

  it('les enfants du corps sont decales de la hauteur de la barre d application', () => {
    const code = dart(make('appBar', { y: 0 }), make('button', { x: 20, y: 156 }))
    expect(code).toMatch(/left: 20,\s*top: 100,/)
  })

  it('FAB centre : floatingActionButtonLocation centerFloat', () => {
    const code = dart(make('fab', { x: (393 - 56) / 2, y: 700 }))
    expect(code).toContain('FloatingActionButtonLocation.centerFloat')
  })

  it('un ecran sans barre reste un Scaffold (ancetre Material des composants)', () => {
    expect(dart(make('button'))).toContain('Scaffold(')
  })

  it('un bouton « menu » ouvre le tiroir existant (AppBar le fournit), sinon un IconButton', () => {
    const avec = dart(make('appBar', {}, { leading: 'menu' }), parent(make('drawer') as never, []))
    expect(avec).not.toContain('Icons.menu')
    const sans = dart(make('appBar', {}, { leading: 'menu' }))
    expect(sans).toContain('Icons.menu')
    expect(dart(make('appBar', {}, { leading: 'none' }))).toContain('automaticallyImplyLeading: false')
    expect(dart(make('appBar', {}, { leading: 'back' }))).toContain('Navigator.of(context).maybePop()')
  })

  it('barre d application : titre, actions icones, titre centre', () => {
    const code = dart(make('appBar', {}, { title: 'Messages', actions: ['search', 'moreVert'], centerTitle: true }))
    expect(code).toContain("title: Text('Messages')")
    expect(code).toContain('Icons.search')
    expect(code).toContain('Icons.more_vert')
    expect(code).toContain('centerTitle: true')
  })

  it('barre de navigation basse : BottomNavigationBarItem et index courant ; onglets : TabBar', () => {
    const nav = dart(make('bottomNav', {}, { selectedIndex: 2 }))
    expect(nav).toContain('BottomNavigationBarItem(')
    expect(nav).toContain('currentIndex: 2')
    expect(nav).toContain('BottomNavigationBarType.fixed')
    const onglets = dart(make('tabs', {}, { selectedIndex: 1 }))
    expect(onglets).toContain('TabBar(')
    expect(onglets).toContain('initialIndex: 1')
    expect(onglets).toContain('length: 3')
  })
})

describe('Flutter : navigation et tous les ecrans', () => {
  const a = screen('Accueil', [], 0)
  const b = screen('Profil', [], 500)

  it('exporte TOUS les ecrans, sans avertissement « non exporte »', () => {
    const result = flutterExporter.export(docOf(a, b), { projectName: 'demo' })
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('lib/screens/accueil.dart')
    expect(paths).toContain('lib/screens/profil.dart')
    expect(result.warnings.filter((w) => /non export/.test(w))).toEqual([])
  })

  it('main.dart : MaterialApp, route de depart et table de routes', () => {
    const main = flutterExporter.export(docOf(a, b), { projectName: 'demo' }).files.find((f) => f.path === 'lib/main.dart')!.contents
    expect(main).toContain('MaterialApp(')
    expect(main).toContain("initialRoute: '/accueil'")
    expect(main).toContain("'/accueil': (context) => const Accueil()")
    expect(main).toContain("'/profil': (context) => const Profil()")
    expect(main).toContain("import 'screens/profil.dart';")
  })

  it('l ecran actif choisit la route de depart', () => {
    const main = flutterExporter.export(docOf(a, b), { projectName: 'demo', activeScreenId: b.id }).files.find((f) => f.path === 'lib/main.dart')!.contents
    expect(main).toContain("initialRoute: '/profil'")
  })

  it('un bouton lie navigue vers la route de l ecran cible', () => {
    const cible = screen('Profil', [], 500)
    const source = screen('Accueil', [linked(make('button'), cible.id)])
    const code = screenFile(flutterExporter.export(docOf(source, cible), { projectName: 'p' }).files, /accueil\.dart/)
    expect(code).toContain("Navigator.of(context).pushNamed('/profil')")
  })

  it('un noeud ordinaire lie devient cliquable (GestureDetector)', () => {
    const cible = screen('Profil', [], 500)
    const rect = make('card')
    const source = screen('Accueil', [linked(rect, cible.id)])
    const code = screenFile(flutterExporter.export(docOf(source, cible), { projectName: 'p' }).files, /accueil\.dart/)
    expect(code).toContain('GestureDetector(')
    expect(code).toContain("pushNamed('/profil')")
  })

  it('entrees de la barre basse : navigation par route', () => {
    const cible = screen('Profil', [], 500)
    const nav = make('bottomNav', {}, {
      items: [
        { label: 'A', icon: 'home' },
        { label: 'B', icon: 'person', target: cible.id },
      ],
    })
    const source = screen('Accueil', [nav])
    const code = screenFile(flutterExporter.export(docOf(source, cible), { projectName: 'p' }).files, /accueil\.dart/)
    expect(code).toContain("const routes = <String?>[null, '/profil'];")
    expect(code).toContain('pushReplacementNamed(route)')
  })

  it('un nom d ecran avec accents donne un fichier et une classe valides, sans collision', () => {
    const result = flutterExporter.export(docOf(screen('Écran d’accueil', []), screen('Ecran d’accueil', [], 500)), { projectName: 'p' })
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('lib/screens/ecran_d_accueil.dart')
    expect(paths).toContain('lib/screens/ecran_d_accueil_2.dart')
  })

  it('un document sans ecran (page libre) ne produit pas de main.dart ni de Scaffold', () => {
    // Comportement historique conserve : voir les fichiers temoins existants.
    const result = flutterExporter.export({ ...oneScreen(), pages: [{ ...oneScreen().pages[0]!, nodes: [make('card') as never] }] }, { projectName: 'p' })
    expect(result.files.map((f) => f.path)).not.toContain('lib/main.dart')
    expect(screenFile(result.files, /screens\//)).not.toContain('Scaffold(')
  })
})
