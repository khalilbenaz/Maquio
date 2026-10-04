import { describe, expect, it } from 'vitest'
import { reactNativeExporter } from '../src/react-native/react-native'
import { documentInteractions } from './fixtures/interactions'

describe('React Native : interactions', () => {
  const out = reactNativeExporter.export(documentInteractions(), { projectName: 'demo' })
  const file = (p: string) => out.files.find((f) => f.path === p)?.contents ?? ''
  const accueil = file('src/screens/Accueil.tsx')
  it('navigation native inchangee ; transition personnalisee par parametres de route', () => {
    expect(accueil).toContain("onPress={() => navigation.navigate('Detail')}")
    expect(accueil).toContain("navigation.navigate('Detail', { transition: 'slide', direction: 'left', durationMs: 300 })")
    expect(accueil).toContain("navigation.navigate('Profil', { transition: 'modal', durationMs: 350 })")
    expect(accueil).toContain("navigation.navigate('Detail', { transition: 'none' })")
  })
  it('src/transitions.ts convertit les parametres en options natives ; App.tsx et navigation.ts les branchent', () => {
    const t = file('src/transitions.ts')
    for (const m of ['screenOptions', "animation: 'slide_from_right'", "presentation: 'modal'", "animation: 'fade'", "animation: 'none'", 'animationDuration']) expect(t).toContain(m)
    expect(file('App.tsx')).toContain('options={({ route }) => screenOptions(route.params)}')
    expect(file('src/navigation.ts')).toContain('Detail: TransitionParams | undefined;')
  })
  it('appui long : onLongPress ; retour : goBack', () => {
    expect(accueil).toMatch(/onLongPress=\{\(\) => setOverlay\('confirmer'\)\}/)
    expect(accueil).toContain("onLongPress={() => navigation.navigate('Profil', { transition: 'slide', direction: 'up', durationMs: 500 })}")
    expect(file('src/screens/Detail.tsx')).toContain('onPress={() => navigation.goBack()}')
  })
  it('overlays : etat unique, Modal (dialogue, feuille basse) et snackbar a fermeture automatique ; gabarits absents de la mise en page', () => {
    expect(accueil).toContain('const [overlay, setOverlay] = useState<string | null>(null);')
    expect(accueil).toContain("<Modal transparent animationType=\"fade\" visible={overlay === 'confirmer'}")
    expect(accueil).toContain("<Modal transparent animationType=\"slide\" visible={overlay === 'options'}")
    expect(accueil).toContain("overlay === 'enregistre' ? (")
    expect(accueil).toContain('setTimeout(() => setOverlay(null), 3000)')
    expect(accueil).toContain("{'Valider ?'}")
    expect((accueil.match(/Valider \?/g) ?? []).length).toBe(1)
    expect(accueil).toContain("onPress={() => setOverlay(null)}")
  })
  it('URL : Linking.openURL', () => {
    expect(accueil).toContain("Linking.openURL('https://exemple.com/aide')")
    expect(accueil).toMatch(/import \{[^}]*Linking[^}]*\} from 'react-native';/)
  })
  it('apres un delai : useEffect + setTimeout nettoye', () => {
    expect(accueil).toContain('useEffect(() => {')
    expect(accueil).toContain("setTimeout(() => navigation.navigate('Detail', { transition: 'fade', durationMs: 400 }), 30000)")
    expect(accueil).toContain('return () => clearTimeout(timer);')
  })
  it('la courbe n etant pas configurable, un avertissement est emis (une seule fois)', () => {
    expect(out.warnings.filter((w) => w.includes('easeOut')).length).toBe(1)
  })
  it('sans transition personnalisee : ni transitions.ts ni TransitionParams', () => {
    const base = reactNativeExporter.export({ ...documentInteractions(), pages: [{ ...documentInteractions().pages[0]!, nodes: [] }] }, { projectName: 'demo' })
    expect(base.files.map((f) => f.path)).not.toContain('src/transitions.ts')
  })
})
