// Export React Native des composants mobiles : primitives natives
// (Pressable, TextInput, Switch...), modules communautaires de reference,
// structure d'ecran (equivalent Scaffold) et navigation React Navigation.
import { describe, expect, it } from 'vitest'
import type { Node } from '@calque/core'
import { reactNativeExporter } from '../src/react-native/react-native'
import { docOf, linked, make, oneScreen, parent, screen, screenFile } from './helpers/composants'

function tsx(...children: Node[]): string {
  return screenFile(reactNativeExporter.export(oneScreen(...children), { projectName: 'demo' }).files, /screens\/Accueil\.tsx/)
}

describe('React Native : actions', () => {
  it('bouton : Pressable + Text, variantes, desactive, icone', () => {
    const primaire = tsx(make('button'))
    expect(primaire).toContain('<Pressable')
    expect(primaire).toContain("{'Bouton'}")
    expect(primaire).toMatch(/backgroundColor: '#6750a4'/)
    expect(tsx(make('button-secondary'))).toMatch(/borderWidth: 1/)
    expect(tsx(make('button-text'))).not.toMatch(/backgroundColor: '#6750a4'/)
    expect(tsx(make('button-disabled'))).toContain(' disabled>')
    const avecIcone = tsx(make('button', {}, { icon: 'home' }))
    expect(avecIcone).toContain("name='home'")
    expect(avecIcone).toContain("import MaterialIcons from 'react-native-vector-icons/MaterialIcons';")
  })

  it('bouton icone et FAB : Pressable avec icone', () => {
    expect(tsx(make('iconButton'))).toContain("name='favorite'")
    expect(tsx(make('fab'))).toContain("name='add'")
    expect(tsx(make('fab-extended'))).toContain("{'Créer'}")
  })
})

describe('React Native : saisie', () => {
  it('TextInput : mot de passe, multiligne, valeur, erreur', () => {
    expect(tsx(make('textField'))).toContain('<TextInput')
    expect(tsx(make('textField-password'))).toContain('secureTextEntry')
    expect(tsx(make('textField-multiline'))).toContain('multiline')
    expect(tsx(make('textField', {}, { value: 'abc', placeholder: 'x' }))).toContain("defaultValue='abc'")
    expect(tsx(make('textField-error'))).toContain("{'Adresse invalide'}")
    expect(tsx(make('textField', {}, { disabled: true }))).toContain('editable={false}')
  })

  it('Switch natif, curseur, liste, date : composants communautaires de reference', () => {
    expect(tsx(make('switch'))).toContain('<Switch value={true}')
    const slider = tsx(make('slider'))
    expect(slider).toContain("import Slider from '@react-native-community/slider';")
    expect(slider).toContain('minimumValue={0} maximumValue={100}')
    const picker = tsx(make('dropdown'))
    expect(picker).toContain("import { Picker } from '@react-native-picker/picker';")
    expect(picker).toContain("<Picker.Item label='Option 2' value='Option 2' />")
    const date = tsx(make('datePicker', {}, { value: '2026-10-03' }))
    expect(date).toContain("import DateTimePicker from '@react-native-community/datetimepicker';")
    expect(date).toContain("new Date('2026-10-03')")
  })

  it('case et radio : etat visible', () => {
    expect(tsx(make('checkbox'))).toContain("name='check'")
    expect(tsx(make('radio'))).toContain('borderRadius: 5')
  })
})

describe('React Native : affichage et listes', () => {
  it('icone, avatar, badge, chip, separateur, progression, spinner', () => {
    expect(tsx(make('icon', {}, { name: 'star', size: 32 }))).toContain("name='star' size={32}")
    expect(tsx(make('avatar'))).toContain("{'AB'}")
    expect(tsx(make('avatar', {}, { src: 'https://x.fr/a.png' }))).toContain("uri: 'https://x.fr/a.png'")
    expect(tsx(make('badge'))).toContain("{'3'}")
    expect(tsx(make('chip'))).toContain("{'Chip'}")
    expect(tsx(make('divider'))).toContain('height: 1')
    expect(tsx(make('progressBar'))).toContain("width: '60%'")
    expect(tsx(make('spinner'))).toContain('<ActivityIndicator')
  })

  it('carte : ombre ; liste : ScrollView ; grille : flexWrap ; zone defilante ; zone sure', () => {
    const tile = make('listTile')
    expect(tsx(make('card'))).toMatch(/shadowRadius: 3/)
    expect(tsx(parent(make('listView') as never, [tile]))).toContain('<ScrollView')
    expect(tsx(parent(make('grid') as never, [tile, tile]))).toContain("flexWrap: 'wrap'")
    expect(tsx(parent(make('scrollView') as never, [tile]))).toContain('<ScrollView')
    expect(tsx(parent(make('scrollView') as never, [tile]))).toContain('contentContainerStyle')
    expect(tsx(parent(make('safeArea') as never, [tile]))).toContain('<SafeAreaView')
    expect(tsx(make('listTile'))).toContain("{'Sous-titre'}")
  })

  it('liste horizontale', () => {
    expect(tsx(parent(make('listView-horizontal') as never, [make('chip')]))).toContain('horizontal')
  })
})

describe('React Native : mise en page et overlays', () => {
  it('Row / Column : flexDirection ; espaceur dans une Row : flex', () => {
    expect(tsx(parent(make('row') as never, [make('icon')]))).toContain("flexDirection: 'row'")
    expect(tsx(parent(make('column') as never, [make('icon')]))).toContain("flexDirection: 'column'")
    expect(tsx(parent(make('row') as never, [make('spacer', {}, { flex: 2 })]))).toContain('flex: 2')
  })

  it('dialogue : Modal avec etat local ; snackbar ; feuille basse', () => {
    const dialog = tsx(make('dialog'))
    expect(dialog).toContain('<Modal')
    expect(dialog).toContain('useState(true)')
    expect(dialog).toContain("import { useState } from 'react';")
    expect(tsx(make('snackbar'))).toContain("{'Enregistré'}")
    expect(tsx(parent(make('bottomSheet') as never, [make('listTile')]))).toContain('borderTopLeftRadius: 24')
  })
})

describe('React Native : structure d ecran', () => {
  it('barre d application en haut, corps, barre basse, FAB : racine plein ecran', () => {
    const code = tsx(make('appBar'), make('bottomNav', { y: 772 }), make('fab', { x: 321, y: 690 }), make('button', { y: 300 }))
    expect(code).toContain('flex: 1')
    const ordre = ["{'Titre'}", 'styles.body', "{'Accueil'}"].map((s) => code.indexOf(s))
    expect(ordre[0]).toBeLessThan(ordre[1]!)
    expect(ordre[1]).toBeLessThan(ordre[2]!)
    expect(code).toContain("name='add'")
  })

  it('les enfants du corps sont decales de la hauteur de la barre', () => {
    const code = tsx(make('appBar'), make('button', { x: 20, y: 156 }))
    expect(code).toMatch(/left: 20,\s*top: 100,/)
  })

  it('tiroir : etat local, ouvert par le bouton menu', () => {
    const code = tsx(make('appBar', {}, { leading: 'menu' }), parent(make('drawer') as never, [make('listTile')]))
    expect(code).toContain('const [drawerOpen, setDrawerOpen] = useState(false);')
    expect(code).toContain('onPress={() => setDrawerOpen(true)}')
    expect(code).toContain('{drawerOpen ? (')
  })
})

describe('React Native : navigation et tous les ecrans', () => {
  const a = screen('Accueil', [], 0)
  const b = screen('Profil', [], 500)

  it('exporte tous les ecrans, App.tsx (pile native) et les types de routes', () => {
    const result = reactNativeExporter.export(docOf(a, b), { projectName: 'demo', activeScreenId: b.id })
    const paths = result.files.map((f) => f.path)
    expect(paths).toEqual(expect.arrayContaining(['src/screens/Accueil.tsx', 'src/screens/Profil.tsx', 'App.tsx', 'src/navigation.ts']))
    expect(result.warnings.filter((w) => /non export/.test(w))).toEqual([])
    const app = result.files.find((f) => f.path === 'App.tsx')!.contents
    expect(app).toContain('createNativeStackNavigator<RootStackParamList>()')
    expect(app).toContain("initialRouteName='Profil'")
    expect(app).toContain("<Stack.Screen name='Accueil' component={Accueil} />")
    expect(result.files.find((f) => f.path === 'src/navigation.ts')!.contents).toContain('Profil: undefined;')
  })

  it('un bouton lie appelle navigation.navigate ; l ecran recoit ses props de pile', () => {
    const cible = screen('Profil', [], 500)
    const source = screen('Accueil', [linked(make('button'), cible.id)])
    const code = screenFile(reactNativeExporter.export(docOf(source, cible), { projectName: 'p' }).files, /Accueil\.tsx/)
    expect(code).toContain("navigation.navigate('Profil')")
    expect(code).toContain('NativeStackScreenProps<RootStackParamList, \'Accueil\'>')
    expect(code).toContain('export function Accueil({ navigation }: Props)')
  })

  it('un ecran sans navigation n a pas de parametre inutilise', () => {
    const code = screenFile(reactNativeExporter.export(docOf(a, b), { projectName: 'p' }).files, /Accueil\.tsx/)
    expect(code).toContain('export function Accueil()')
    expect(code).not.toContain('NativeStackScreenProps')
  })

  it('un noeud ordinaire lie devient un Pressable ; un texte lie recoit onPress', () => {
    const cible = screen('Profil', [], 500)
    const source = screen('Accueil', [linked(make('card'), cible.id)])
    const code = screenFile(reactNativeExporter.export(docOf(source, cible), { projectName: 'p' }).files, /Accueil\.tsx/)
    expect(code).toContain("onPress={() => navigation.navigate('Profil')}")
    expect(code).toContain('<Pressable')
  })

  it('barre basse et onglets : chaque entree vise son ecran', () => {
    const cible = screen('Profil', [], 500)
    const nav = make('bottomNav', {}, { items: [{ label: 'A', icon: 'home' }, { label: 'B', icon: 'person', target: cible.id }] })
    const code = screenFile(reactNativeExporter.export(docOf(screen('Accueil', [nav]), cible), { projectName: 'p' }).files, /Accueil\.tsx/)
    expect(code).toContain("onPress={() => navigation.navigate('Profil')}")
  })

  it('retour : navigation.goBack()', () => {
    expect(tsx(make('appBar', {}, { leading: 'back' }))).toContain('navigation.goBack()')
  })
})
