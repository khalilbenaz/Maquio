import { describe, expect, it } from 'vitest'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import { documentInteractions } from './fixtures/interactions'

describe('SwiftUI : interactions', () => {
  const out = swiftuiExporter.export(documentInteractions(), { projectName: 'demo' })
  const file = (p: string) => out.files.find((f) => f.path === p)?.contents ?? ''
  const accueil = file('Sources/Screens/Accueil.swift')
  it('une transition personnalisee active la pile de navigation maison (AppTransition, Navigator.go avec transition)', () => {
    const nav = file('Sources/Navigation.swift')
    for (const m of ['struct AppTransition', 'static func slide', 'static func fade', 'static func modal', 'AnyTransition', 'withAnimation(transition.animation)', 'func back()']) expect(nav).toContain(m)
    expect(accueil).toContain('navigator.go(.detail, .slide(.left, duration: 0.3, curve: .easeOut))')
    expect(accueil).toContain('navigator.go(.profil, .modal(duration: 0.35, curve: .spring))')
    expect(accueil).toContain('navigator.go(.detail, .none)')
    expect(file('Sources/App.swift')).toContain('.transition(entry.transition.transition)')
  })
  it('la poussee par defaut est la poussee de la pile maison', () => {
    expect(accueil).toContain('{ navigator.go(.detail) }')
  })
  it('appui long : LongPressGesture ; retour : navigator.back() et bouton retour explicite', () => {
    expect(accueil).toContain('.simultaneousGesture(LongPressGesture().onEnded { _ in overlay = "confirmer" })')
    expect(file('Sources/Screens/Detail.swift')).toContain('Button { navigator.back() }')
  })
  it('overlays : alert, sheet et snackbar lies a l etat overlay', () => {
    expect(accueil).toContain('@State private var overlay: String? = nil')
    expect(accueil).toContain('.alert("Confirmer", isPresented: Binding(get: { overlay == "confirmer" }')
    expect(accueil).toContain('.sheet(isPresented: Binding(get: { overlay == "options" }')
    expect(accueil).toContain('.presentationDetents([.height(340)])')
    expect(accueil).toContain('if overlay == "enregistre" {')
    expect(accueil).toContain('try? await Task.sleep(nanoseconds: 3_000_000_000)')
    expect(accueil).toContain('overlay = nil')
    expect((accueil.match(/Valider \?/g) ?? []).length).toBe(1)
  })
  it('URL : openURL de l environnement ; delai : .task avec Task.sleep', () => {
    expect(accueil).toContain('@Environment(\\.openURL) private var openURL')
    expect(accueil).toContain('openURL(URL(string: "https://exemple.com/aide")!)')
    expect(accueil).toContain('try? await Task.sleep(nanoseconds: 30000000000)')
  })
  it('sans transition personnalisee : NavigationStack inchange', () => {
    const d = documentInteractions()
    const plain = swiftuiExporter.export({ ...d, pages: [{ ...d.pages[0]!, nodes: [] }] }, { projectName: 'demo' })
    expect(plain.files.find((f) => f.path === 'Sources/Navigation.swift')?.contents ?? 'NavigationStack').not.toContain('AppTransition')
  })
})
