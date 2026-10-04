// Export SwiftUI des composants mobiles : controles natifs (Button, TextField,
// Toggle, Slider, Picker, DatePicker, TabView...), NavigationStack et
// navigation par Navigator.
import { describe, expect, it } from 'vitest'
import type { Node } from '@maquio/core'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import { docOf, linked, make, oneScreen, parent, screen, screenFile } from './helpers/composants'

function swift(...children: Node[]): string {
  return screenFile(swiftuiExporter.export(oneScreen(...children), { projectName: 'demo' }).files, /Screens\/Accueil\.swift/)
}

describe('SwiftUI : actions', () => {
  it('Button : styles par variante, tint, desactive, Label avec icone', () => {
    expect(swift(make('button'))).toContain('.buttonStyle(.borderedProminent)')
    expect(swift(make('button-secondary'))).toContain('.buttonStyle(.bordered)')
    expect(swift(make('button-text'))).toContain('.buttonStyle(.borderless)')
    expect(swift(make('button-disabled'))).toContain('.disabled(true)')
    expect(swift(make('button', {}, { icon: 'home' }))).toContain('Label("Bouton", systemImage: "house")')
    expect(swift(make('button', {}, { color: { r: 1, g: 0, b: 0, a: 1 } }))).toContain('.tint(Color(red: 1.0000')
  })

  it('bouton icone (SF Symbol, forme circulaire) et FAB', () => {
    expect(swift(make('iconButton'))).toContain('Image(systemName: "heart")')
    expect(swift(make('iconButton-filled'))).toContain('.buttonBorderShape(.circle)')
    expect(swift(make('fab'))).toContain('Image(systemName: "plus")')
    expect(swift(make('fab-extended'))).toContain('Label("Créer", systemImage: "plus")')
  })
})

describe('SwiftUI : saisie', () => {
  it('TextField, SecureField, multiligne, erreur', () => {
    expect(swift(make('textField', {}, { placeholder: 'nom' }))).toContain('TextField("nom", text: .constant(""))')
    expect(swift(make('textField-password'))).toContain('SecureField(')
    expect(swift(make('textField-multiline'))).toContain('axis: .vertical')
    expect(swift(make('textField-error'))).toContain('Text("Adresse invalide")')
  })

  it('Toggle, Slider, Picker, DatePicker', () => {
    expect(swift(make('switch'))).toContain('Toggle("Activer", isOn: .constant(true))')
    expect(swift(make('slider'))).toContain('Slider(value: .constant(40), in: 0...100)')
    const picker = swift(make('dropdown'))
    expect(picker).toContain('Picker("Choisir", selection: .constant("Option 1"))')
    expect(picker).toContain('.pickerStyle(.menu)')
    const date = swift(make('datePicker', {}, { value: '2026-10-03' }))
    expect(date).toContain('DatePicker("Date", selection: .constant(Date(timeIntervalSince1970: 1790985600)), displayedComponents: .date)')
  })

  it('case a cocher et radio : SF Symbols selon l etat', () => {
    expect(swift(make('checkbox'))).toContain('checkmark.square.fill')
    expect(swift(make('checkbox', {}, { checked: false }))).toContain('"square"')
    expect(swift(make('radio'))).toContain('largecircle.fill.circle')
  })
})

describe('SwiftUI : affichage, listes, mise en page', () => {
  it('icone, avatar, badge, separateur, progression', () => {
    expect(swift(make('icon', {}, { name: 'star', size: 30 }))).toContain('.font(.system(size: 30))')
    expect(swift(make('avatar'))).toContain('Circle().fill(')
    expect(swift(make('badge'))).toContain('Capsule()')
    expect(swift(make('divider'))).toContain('Divider()')
    expect(swift(make('progressBar'))).toContain('ProgressView(value: 0.6)')
    expect(swift(make('spinner'))).toContain('ProgressView()')
    expect(swift(make('chip'))).toContain('.buttonBorderShape(')
  })

  it('carte : ombre ; liste : ScrollView + LazyVStack ; grille : LazyVGrid ; defilement', () => {
    const tile = make('listTile')
    expect(swift(make('card'))).toContain('.shadow(color:')
    const liste = swift(parent(make('listView') as never, [tile, tile]))
    expect(liste).toContain('ScrollView(.vertical)')
    expect(liste).toContain('LazyVStack')
    expect(swift(parent(make('grid') as never, [tile]))).toContain('LazyVGrid(columns: Array(repeating: GridItem(.flexible()')
    expect(swift(parent(make('scrollView') as never, [tile]))).toContain('ScrollView(.vertical)')
    expect(swift(parent(make('listView-horizontal') as never, [tile]))).toContain('ScrollView(.horizontal)')
  })

  it('Row, Column, Stack, espaceur', () => {
    expect(swift(parent(make('row') as never, [make('icon')]))).toContain('HStack(')
    expect(swift(parent(make('column') as never, [make('icon')]))).toContain('VStack(')
    expect(swift(parent(make('stack') as never, [make('icon')]))).toContain('ZStack(alignment: .topLeading)')
    expect(swift(parent(make('row') as never, [make('spacer')]))).toContain('Spacer()')
  })

  it('ListTile : titre, sous-titre, icones', () => {
    const code = swift(make('listTile'))
    expect(code).toContain('Text("Titre")')
    expect(code).toContain('Image(systemName: "chevron.right")')
  })
})

describe('SwiftUI : overlays', () => {
  it('dialogue : .alert natif avec etat ; feuille basse : .sheet avec detents', () => {
    const dialog = swift(make('dialog'))
    expect(dialog).toContain('@State private var showAlert1 = true')
    expect(dialog).toContain('.alert("Titre", isPresented: $showAlert1)')
    expect(dialog).toContain('Button("Annuler", role: .cancel) {}')
    const sheet = swift(parent(make('bottomSheet') as never, [make('listTile')]))
    expect(sheet).toContain('.sheet(isPresented: $showSheet1)')
    expect(sheet).toContain('.presentationDetents([.height(280)])')
  })

  it('snackbar : message et action', () => {
    const code = swift(make('snackbar'))
    expect(code).toContain('Text("Enregistré")')
    expect(code).toContain('Text("Annuler")')
  })
})

describe('SwiftUI : barre de navigation, onglets, ecran', () => {
  it('barre d application : navigationTitle et toolbar (actions, menu)', () => {
    const code = swift(make('appBar', {}, { title: 'Messages', leading: 'menu', actions: ['search'] }), parent(make('drawer') as never, []))
    expect(code).toContain('.navigationTitle("Messages")')
    expect(code).toContain('.toolbar {')
    expect(code).toContain('ToolbarItem(placement: .primaryAction)')
    expect(code).toContain('showDrawer.toggle()')
    expect(code).toContain('.overlay(alignment: .leading)')
  })

  it('bouton de retour masque quand leading vaut none', () => {
    expect(swift(make('appBar', {}, { leading: 'none' }))).toContain('.navigationBarBackButtonHidden(true)')
  })

  it('barre basse : TabView natif dans safeAreaInset ; onglets : Picker segmente', () => {
    const nav = swift(make('bottomNav', { y: 772 }))
    expect(nav).toContain('.safeAreaInset(edge: .bottom')
    expect(nav).toContain('TabView(selection: $tab1)')
    expect(nav).toContain('.tabItem { Label("Accueil", systemImage: "house") }')
    const tabs = swift(make('tabs'))
    expect(tabs).toContain('.pickerStyle(.segmented)')
  })

  it('les enfants du corps sont decales de la hauteur de la barre', () => {
    const code = swift(make('appBar'), make('button', { x: 20, y: 156 }))
    expect(code).toContain('.offset(x: 20, y: 100)')
  })

  it('opacite et rotation d un composant sont honorees (pas d avertissement)', () => {
    const base = make('button')
    const result = swiftuiExporter.export(oneScreen({ ...base, opacity: 0.5, rotation: 10 }), { projectName: 'p' })
    const code = screenFile(result.files, /Accueil\.swift/)
    expect(code).toContain('.opacity(0.5)')
    expect(code).toContain('.rotationEffect(.degrees(10))')
    expect(result.warnings.filter((w) => /opacity|rotation/.test(w))).toEqual([])
  })
})

describe('SwiftUI : navigation et tous les ecrans', () => {
  const a = screen('Accueil', [], 0)
  const b = screen('Profil', [], 500)

  it('exporte tous les ecrans, Navigation.swift (Route, Navigator) et App.swift (NavigationStack)', () => {
    const result = swiftuiExporter.export(docOf(a, b), { projectName: 'demo', activeScreenId: b.id })
    const paths = result.files.map((f) => f.path)
    expect(paths).toEqual(expect.arrayContaining(['Sources/Screens/Accueil.swift', 'Sources/Screens/Profil.swift', 'Sources/Navigation.swift', 'Sources/App.swift']))
    expect(result.warnings.filter((w) => /non export/.test(w))).toEqual([])
    const navigation = result.files.find((f) => f.path === 'Sources/Navigation.swift')!.contents
    expect(navigation).toContain('case accueil')
    expect(navigation).toContain('case profil')
    expect(navigation).toContain('let root: Route = .profil')
    const app = result.files.find((f) => f.path === 'Sources/App.swift')!.contents
    expect(app).toContain('NavigationStack(path: $navigator.path)')
    expect(app).toContain('.navigationDestination(for: Route.self)')
    expect(app).toContain('@main')
    expect(app).toContain('struct DemoApp: App')
  })

  it('un bouton lie appelle le Navigator ; l ecran recoit l EnvironmentObject', () => {
    const cible = screen('Profil', [], 500)
    const source = screen('Accueil', [linked(make('button'), cible.id)])
    const code = screenFile(swiftuiExporter.export(docOf(source, cible), { projectName: 'p' }).files, /Accueil\.swift/)
    expect(code).toContain('navigator.go(.profil)')
    expect(code).toContain('@EnvironmentObject private var navigator: Navigator')
  })

  it('un ecran sans navigation ne declare pas le Navigator', () => {
    expect(swift(make('button'))).not.toContain('Navigator')
  })

  it('un noeud ordinaire lie : onTapGesture', () => {
    const cible = screen('Profil', [], 500)
    const code = screenFile(swiftuiExporter.export(docOf(screen('Accueil', [linked(make('card'), cible.id)]), cible), { projectName: 'p' }).files, /Accueil\.swift/)
    expect(code).toContain('.onTapGesture { navigator.go(.profil) }')
  })

  it('entrees de la barre basse : switchTo vers l ecran cible', () => {
    const cible = screen('Profil', [], 500)
    const nav = make('bottomNav', {}, { items: [{ label: 'A', icon: 'home' }, { label: 'B', icon: 'person', target: cible.id }] })
    const code = screenFile(swiftuiExporter.export(docOf(screen('Accueil', [nav]), cible), { projectName: 'p' }).files, /Accueil\.swift/)
    expect(code).toContain('case 1: navigator.switchTo(.profil)')
  })

  it('un nom d ecran qui est un mot reserve Swift est protege dans l enum', () => {
    const result = swiftuiExporter.export(docOf(screen('default', [])), { projectName: 'p' })
    expect(result.files.find((f) => f.path === 'Sources/Navigation.swift')!.contents).toContain('case `default`')
  })
})
