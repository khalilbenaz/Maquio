// Export Jetpack Compose des composants mobiles : widgets Material 3,
// Scaffold, ModalNavigationDrawer et Navigation Compose.
import { describe, expect, it } from 'vitest'
import type { Node } from '@maquio/core'
import { composeExporter } from '../src/compose/compose'
import { docOf, linked, make, oneScreen, parent, screen, screenFile } from './helpers/composants'

function kotlin(...children: Node[]): string {
  return screenFile(composeExporter.export(oneScreen(...children), { projectName: 'demo' }).files, /screens\/Accueil\.kt/)
}

describe('Compose : actions', () => {
  it('Button, OutlinedButton, TextButton ; desactive ; icone ; couleur', () => {
    expect(kotlin(make('button'))).toContain('Button(')
    expect(kotlin(make('button'))).toContain('import androidx.compose.material3.Button\n')
    expect(kotlin(make('button-secondary'))).toContain('OutlinedButton(')
    expect(kotlin(make('button-text'))).toContain('TextButton(')
    expect(kotlin(make('button-disabled'))).toContain('enabled = false')
    expect(kotlin(make('button', {}, { icon: 'home' }))).toContain('Icon(Icons.Default.Home')
    expect(kotlin(make('button', {}, { color: { r: 1, g: 0, b: 0, a: 1 } }))).toContain('ButtonDefaults.buttonColors(containerColor = Color(0xFFFF0000))')
  })

  it('boutons icone et FAB (taille, etendu)', () => {
    expect(kotlin(make('iconButton'))).toContain('IconButton(')
    expect(kotlin(make('iconButton-filled'))).toContain('FilledIconButton(')
    expect(kotlin(make('iconButton', {}, { variant: 'outlined' }))).toContain('OutlinedIconButton(')
    expect(kotlin(make('fab', {}, { size: 'small' }))).toContain('SmallFloatingActionButton(')
    expect(kotlin(make('fab', {}, { size: 'large' }))).toContain('LargeFloatingActionButton(')
    expect(kotlin(make('fab-extended'))).toContain('ExtendedFloatingActionButton(')
  })
})

describe('Compose : saisie', () => {
  it('OutlinedTextField : mot de passe, multiligne, erreur, icone', () => {
    const base = kotlin(make('textField'))
    expect(base).toContain('OutlinedTextField(')
    expect(base).toContain('singleLine = true')
    expect(kotlin(make('textField-password'))).toContain('PasswordVisualTransformation()')
    expect(kotlin(make('textField-multiline'))).toMatch(/minLines = \d/)
    const error = kotlin(make('textField-error'))
    expect(error).toContain('isError = true')
    expect(error).toContain('supportingText = { Text("Adresse invalide") }')
    expect(kotlin(make('textField-password'))).toContain('leadingIcon = { Icon(Icons.Default.Lock')
  })

  it('Switch, Checkbox, RadioButton, Slider', () => {
    expect(kotlin(make('switch'))).toContain('Switch(checked = true, onCheckedChange = null)')
    expect(kotlin(make('checkbox'))).toContain('Checkbox(checked = true')
    expect(kotlin(make('radio'))).toContain('RadioButton(selected = true')
    const slider = kotlin(make('slider'))
    expect(slider).toContain('Slider(')
    expect(slider).toContain('valueRange = 0f..100f')
    expect(slider).toContain('value = 40f')
  })

  it('liste deroulante (ExposedDropdownMenuBox) et selecteur de date (DatePickerDialog)', () => {
    const dropdown = kotlin(make('dropdown'))
    expect(dropdown).toContain('ExposedDropdownMenuBox(')
    expect(dropdown).toContain('DropdownMenuItem(')
    expect(dropdown).toContain('@OptIn(ExperimentalMaterial3Api::class)')
    const date = kotlin(make('datePicker'))
    expect(date).toContain('DatePickerDialog(')
    expect(date).toContain('rememberDatePickerState()')
  })
})

describe('Compose : affichage', () => {
  it('Icon, avatar, Badge, chips, separateurs, progression', () => {
    expect(kotlin(make('icon', {}, { name: 'star' }))).toContain('Icons.Default.Star')
    expect(kotlin(make('avatar'))).toContain('CircleShape')
    expect(kotlin(make('badge'))).toContain('Badge(')
    expect(kotlin(make('chip'))).toContain('AssistChip(')
    expect(kotlin(make('chip-filter'))).toContain('FilterChip(')
    expect(kotlin(make('divider'))).toContain('HorizontalDivider(')
    expect(kotlin(make('divider-vertical'))).toContain('VerticalDivider(')
    expect(kotlin(make('progressBar'))).toContain('LinearProgressIndicator(')
    expect(kotlin(make('progressBar'))).toContain('progress = { 0.6f }')
    expect(kotlin(make('spinner'))).toContain('CircularProgressIndicator(')
  })

  it('icones en miroir (fleche retour) : Icons.AutoMirrored', () => {
    const code = kotlin(make('icon', {}, { name: 'arrowBack' }))
    expect(code).toContain('Icons.AutoMirrored.Filled.ArrowBack')
    expect(code).toContain('import androidx.compose.material.icons.automirrored.filled.ArrowBack')
  })

  it('carte : Card avec elevation ; ListItem', () => {
    const card = kotlin(make('card'))
    expect(card).toContain('Card(')
    expect(card).toContain('CardDefaults.cardElevation(defaultElevation = 2.dp)')
    expect(card).toContain('RoundedCornerShape(12.dp)')
    const tile = kotlin(make('listTile'))
    expect(tile).toContain('ListItem(')
    expect(tile).toContain('headlineContent = { Text("Titre") }')
    expect(tile).toContain('supportingContent = { Text("Sous-titre") }')
  })
})

describe('Compose : listes et mise en page', () => {
  it('LazyColumn, LazyRow, LazyVerticalGrid, defilement, zone sure', () => {
    const tile = make('listTile')
    expect(kotlin(parent(make('listView') as never, [tile]))).toContain('LazyColumn(')
    expect(kotlin(parent(make('listView-horizontal') as never, [tile]))).toContain('LazyRow(')
    const grid = kotlin(parent(make('grid') as never, [tile, tile]))
    expect(grid).toContain('LazyVerticalGrid(')
    expect(grid).toContain('GridCells.Fixed(2)')
    expect(kotlin(parent(make('scrollView') as never, [tile]))).toContain('verticalScroll(rememberScrollState())')
    expect(kotlin(parent(make('safeArea') as never, [tile]))).toContain('safeDrawingPadding()')
  })

  it('separateurs de liste : HorizontalDivider entre les elements', () => {
    const liste = parent(make('listView') as never, [make('listTile'), make('listTile')])
    ;(liste as { container: unknown }).container = { kind: 'listView', axis: 'vertical', dividers: true }
    expect(kotlin(liste)).toContain('item { HorizontalDivider() }')
  })

  it('Row, Column, Stack(Box) ; Spacer pondere dans une Row', () => {
    expect(kotlin(parent(make('row') as never, [make('icon')]))).toContain('Row(')
    expect(kotlin(parent(make('column') as never, [make('icon')]))).toContain('Column(')
    expect(kotlin(parent(make('stack') as never, [make('icon')]))).toContain('Box(')
    expect(kotlin(parent(make('row') as never, [make('spacer', {}, { flex: 2 })]))).toContain('Spacer(modifier = Modifier.weight(2f))')
  })
})

describe('Compose : overlays', () => {
  it('AlertDialog avec etat ; ModalBottomSheet ; Snackbar', () => {
    const dialog = kotlin(make('dialog'))
    expect(dialog).toContain('AlertDialog(')
    expect(dialog).toContain('var showDialog1 by remember { mutableStateOf(true) }')
    expect(dialog).toContain('dismissButton')
    expect(kotlin(make('dialog', {}, { cancelLabel: '' }))).not.toContain('dismissButton')
    const sheet = kotlin(parent(make('bottomSheet') as never, [make('listTile')]))
    expect(sheet).toContain('ModalBottomSheet(')
    expect(sheet).toContain('@OptIn(ExperimentalMaterial3Api::class)')
    const snack = kotlin(make('snackbar'))
    expect(snack).toContain('Snackbar(')
    expect(snack).toContain('Text("Enregistré")')
  })
})

describe('Compose : Scaffold', () => {
  it('topBar, bottomBar, floatingActionButton dans un Scaffold', () => {
    const code = kotlin(make('appBar'), make('bottomNav', { y: 772 }), make('fab', { x: 321, y: 690 }), make('button', { y: 300 }))
    expect(code).toContain('Scaffold(')
    expect(code).toContain('topBar = {')
    expect(code).toContain('TopAppBar(')
    expect(code).toContain('bottomBar = {')
    expect(code).toContain('NavigationBar(')
    expect(code).toContain('NavigationBarItem(')
    expect(code).toContain('floatingActionButton = {')
    expect(code).toContain('{ innerPadding ->')
    expect(code.match(/TopAppBar\(/g)).toHaveLength(1)
  })

  it('titre centre : CenterAlignedTopAppBar', () => {
    expect(kotlin(make('appBar', {}, { centerTitle: true }))).toContain('CenterAlignedTopAppBar(')
  })

  it('les enfants du corps sont decales de la hauteur de la barre', () => {
    expect(kotlin(make('appBar'), make('button', { x: 20, y: 156 }))).toContain('.offset(x = 20.dp, y = 100.dp)')
  })

  it('tiroir : ModalNavigationDrawer, ModalDrawerSheet, ouvert par le bouton menu', () => {
    const code = kotlin(make('appBar', {}, { leading: 'menu' }), parent(make('drawer') as never, [make('listTile')]))
    expect(code).toContain('ModalNavigationDrawer(')
    expect(code).toContain('ModalDrawerSheet {')
    expect(code).toContain('scope.launch { drawerState.open() }')
    expect(code).toContain('rememberDrawerState(DrawerValue.Closed)')
  })

  it('onglets : TabRow et Tab ; FAB centre : FabPosition.Center', () => {
    const tabs = kotlin(make('tabs'))
    expect(tabs).toContain('TabRow(selectedTabIndex = 0')
    expect(tabs).toContain('Tab(')
    expect(kotlin(make('fab', { x: (393 - 56) / 2, y: 700 }))).toContain('FabPosition.Center')
  })

  it('opacite et rotation d un composant sont honorees', () => {
    const base = make('button')
    const result = composeExporter.export(oneScreen({ ...base, opacity: 0.5, rotation: 10 }), { projectName: 'p' })
    const code = screenFile(result.files, /Accueil\.kt/)
    expect(code).toContain('.alpha(0.5f)')
    expect(code).toContain('.rotate(10f)')
    expect(result.warnings.filter((w) => /opacity|rotation/.test(w))).toEqual([])
  })
})

describe('Compose : navigation et tous les ecrans', () => {
  const a = screen('Accueil', [], 0)
  const b = screen('Profil', [], 500)

  it('exporte tous les ecrans, AppNavigation (NavHost) et MainActivity', () => {
    const result = composeExporter.export(docOf(a, b), { projectName: 'demo', activeScreenId: b.id })
    const paths = result.files.map((f) => f.path)
    expect(paths).toEqual(expect.arrayContaining(['src/main/kotlin/screens/Accueil.kt', 'src/main/kotlin/screens/Profil.kt', 'src/main/kotlin/AppNavigation.kt', 'src/main/kotlin/MainActivity.kt']))
    expect(result.warnings.filter((w) => /non export/.test(w))).toEqual([])
    const nav = result.files.find((f) => f.path === 'src/main/kotlin/AppNavigation.kt')!.contents
    expect(nav).toContain('NavHost(navController = navController, startDestination = "profil")')
    expect(nav).toContain('composable("accueil") { Accueil(navController) }')
    expect(nav).toContain('import screens.Profil')
  })

  it('chaque ecran recoit le NavController', () => {
    expect(kotlin(make('button'))).toContain('fun Accueil(navController: NavController)')
  })

  it('un bouton lie navigue ; un noeud ordinaire lie devient cliquable', () => {
    const cible = screen('Profil', [], 500)
    const source = screen('Accueil', [linked(make('button'), cible.id), linked(make('card', { y: 100 }), cible.id)])
    const code = screenFile(composeExporter.export(docOf(source, cible), { projectName: 'p' }).files, /Accueil\.kt/)
    expect(code).toContain('onClick = { navController.navigate("profil") }')
    expect(code).toContain('.clickable { navController.navigate("profil") }')
  })

  it('entrees de la barre basse : navigate avec launchSingleTop', () => {
    const cible = screen('Profil', [], 500)
    const nav = make('bottomNav', {}, { items: [{ label: 'A', icon: 'home' }, { label: 'B', icon: 'person', target: cible.id }] })
    const code = screenFile(composeExporter.export(docOf(screen('Accueil', [nav]), cible), { projectName: 'p' }).files, /Accueil\.kt/)
    expect(code).toContain('navController.navigate("profil") { launchSingleTop = true }')
  })

  it('retour : popBackStack', () => {
    expect(kotlin(make('appBar', {}, { leading: 'back' }))).toContain('navController.popBackStack()')
  })
})
