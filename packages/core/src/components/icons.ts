// Jeu d'icones commun, mappe vers les trois bibliotheques natives :
// Material Icons (Flutter `Icons.*`, React Native `MaterialIcons`),
// SF Symbols (SwiftUI `systemName`) et Compose `Icons.Default.*`.
//
// Le jeu est volontairement restreint a ce que `material-icons-core` de
// Compose fournit SANS la dependance `material-icons-extended` : un nom
// de ce tableau compile donc sur les quatre cibles telles quelles. Les
// pictogrammes sans equivalent dans `core` (echange, carte, coffre...) ont
// leur dessin exact sur le canevas ; en Compose ils se rabattent sur l'icone
// `core` la plus proche (voir `compose` ci-dessous).
export const ICON_NAMES = [
  'home',
  'search',
  'menu',
  'add',
  'close',
  'check',
  'arrowBack',
  'arrowForward',
  'chevronRight',
  'chevronDown',
  'settings',
  'person',
  'favorite',
  'star',
  'delete',
  'edit',
  'share',
  'moreVert',
  'info',
  'notifications',
  'email',
  'phone',
  'lock',
  'calendar',
  'cart',
  'send',
  'refresh',
  'warning',
  'location',
  'list',
  'face',
  'backspace',
  'swap',
  'moreHoriz',
  'card',
  'vault',
  'copy',
  'coffee',
  'shield',
  'shieldCheck',
  'arrowUp',
  'arrowDown',
  'eye',
  'snowflake',
  'sliders',
  'plane',
  'bike',
  'document',
  'globe',
  'contrast',
  'smartphone',
  'logout',
  'chevronLeft',
  'upload',
] as const

export type IconName = (typeof ICON_NAMES)[number]

export type IconMapping = {
  label: string
  // Identifiant Dart apres `Icons.` (Flutter).
  flutter: string
  // Nom de glyphe de `react-native-vector-icons/MaterialIcons`.
  materialName: string
  // Nom de SF Symbol (SwiftUI).
  sfSymbol: string
  // Identifiant Kotlin apres `Icons.Default.` (Compose, material-icons-core).
  compose: string
}

export const ICONS: Record<IconName, IconMapping> = {
  home: { label: 'Accueil', flutter: 'home', materialName: 'home', sfSymbol: 'house', compose: 'Home' },
  search: { label: 'Recherche', flutter: 'search', materialName: 'search', sfSymbol: 'magnifyingglass', compose: 'Search' },
  menu: { label: 'Menu', flutter: 'menu', materialName: 'menu', sfSymbol: 'line.3.horizontal', compose: 'Menu' },
  add: { label: 'Ajouter', flutter: 'add', materialName: 'add', sfSymbol: 'plus', compose: 'Add' },
  close: { label: 'Fermer', flutter: 'close', materialName: 'close', sfSymbol: 'xmark', compose: 'Close' },
  check: { label: 'Valider', flutter: 'check', materialName: 'check', sfSymbol: 'checkmark', compose: 'Check' },
  arrowBack: { label: 'Retour', flutter: 'arrow_back', materialName: 'arrow-back', sfSymbol: 'arrow.left', compose: 'ArrowBack' },
  arrowForward: { label: 'Suivant', flutter: 'arrow_forward', materialName: 'arrow-forward', sfSymbol: 'arrow.right', compose: 'ArrowForward' },
  chevronRight: { label: 'Chevron droit', flutter: 'chevron_right', materialName: 'chevron-right', sfSymbol: 'chevron.right', compose: 'KeyboardArrowRight' },
  chevronDown: { label: 'Chevron bas', flutter: 'keyboard_arrow_down', materialName: 'keyboard-arrow-down', sfSymbol: 'chevron.down', compose: 'KeyboardArrowDown' },
  settings: { label: 'Réglages', flutter: 'settings', materialName: 'settings', sfSymbol: 'gearshape', compose: 'Settings' },
  person: { label: 'Profil', flutter: 'person', materialName: 'person', sfSymbol: 'person', compose: 'Person' },
  favorite: { label: 'Favori', flutter: 'favorite', materialName: 'favorite', sfSymbol: 'heart', compose: 'Favorite' },
  star: { label: 'Étoile', flutter: 'star', materialName: 'star', sfSymbol: 'star', compose: 'Star' },
  delete: { label: 'Supprimer', flutter: 'delete', materialName: 'delete', sfSymbol: 'trash', compose: 'Delete' },
  edit: { label: 'Modifier', flutter: 'edit', materialName: 'edit', sfSymbol: 'pencil', compose: 'Edit' },
  share: { label: 'Partager', flutter: 'share', materialName: 'share', sfSymbol: 'square.and.arrow.up', compose: 'Share' },
  moreVert: { label: 'Plus', flutter: 'more_vert', materialName: 'more-vert', sfSymbol: 'ellipsis', compose: 'MoreVert' },
  info: { label: 'Information', flutter: 'info', materialName: 'info', sfSymbol: 'info.circle', compose: 'Info' },
  notifications: { label: 'Notifications', flutter: 'notifications', materialName: 'notifications', sfSymbol: 'bell', compose: 'Notifications' },
  email: { label: 'E-mail', flutter: 'email', materialName: 'email', sfSymbol: 'envelope', compose: 'Email' },
  phone: { label: 'Téléphone', flutter: 'phone', materialName: 'phone', sfSymbol: 'phone', compose: 'Phone' },
  lock: { label: 'Cadenas', flutter: 'lock', materialName: 'lock', sfSymbol: 'lock', compose: 'Lock' },
  calendar: { label: 'Calendrier', flutter: 'calendar_today', materialName: 'calendar-today', sfSymbol: 'calendar', compose: 'DateRange' },
  cart: { label: 'Panier', flutter: 'shopping_cart', materialName: 'shopping-cart', sfSymbol: 'cart', compose: 'ShoppingCart' },
  send: { label: 'Envoyer', flutter: 'send', materialName: 'send', sfSymbol: 'paperplane', compose: 'Send' },
  refresh: { label: 'Actualiser', flutter: 'refresh', materialName: 'refresh', sfSymbol: 'arrow.clockwise', compose: 'Refresh' },
  warning: { label: 'Avertissement', flutter: 'warning', materialName: 'warning', sfSymbol: 'exclamationmark.triangle', compose: 'Warning' },
  location: { label: 'Lieu', flutter: 'location_on', materialName: 'location-on', sfSymbol: 'mappin', compose: 'LocationOn' },
  list: { label: 'Liste', flutter: 'list', materialName: 'list', sfSymbol: 'list.bullet', compose: 'List' },
  face: { label: 'Visage', flutter: 'face', materialName: 'face', sfSymbol: 'faceid', compose: 'Face' },
  backspace: { label: 'Effacer', flutter: 'backspace', materialName: 'backspace', sfSymbol: 'delete.left', compose: 'Clear' },
  swap: { label: 'Échange', flutter: 'swap_horiz', materialName: 'swap-horiz', sfSymbol: 'arrow.left.arrow.right', compose: 'Refresh' },
  moreHoriz: { label: 'Plus (horizontal)', flutter: 'more_horiz', materialName: 'more-horiz', sfSymbol: 'ellipsis', compose: 'MoreVert' },
  card: { label: 'Carte', flutter: 'credit_card', materialName: 'credit-card', sfSymbol: 'creditcard', compose: 'AccountBox' },
  vault: { label: 'Coffre', flutter: 'savings', materialName: 'savings', sfSymbol: 'banknote', compose: 'Lock' },
  copy: { label: 'Copier', flutter: 'content_copy', materialName: 'content-copy', sfSymbol: 'doc.on.doc', compose: 'Share' },
  coffee: { label: 'Café', flutter: 'coffee', materialName: 'local-cafe', sfSymbol: 'cup.and.saucer', compose: 'ShoppingCart' },
  shield: { label: 'Bouclier', flutter: 'shield', materialName: 'shield', sfSymbol: 'shield', compose: 'CheckCircle' },
  shieldCheck: { label: 'Bouclier validé', flutter: 'verified_user', materialName: 'verified-user', sfSymbol: 'checkmark.shield', compose: 'CheckCircle' },
  arrowUp: { label: 'Haut', flutter: 'arrow_upward', materialName: 'arrow-upward', sfSymbol: 'arrow.up', compose: 'KeyboardArrowUp' },
  arrowDown: { label: 'Bas', flutter: 'arrow_downward', materialName: 'arrow-downward', sfSymbol: 'arrow.down', compose: 'KeyboardArrowDown' },
  eye: { label: 'Voir', flutter: 'visibility', materialName: 'visibility', sfSymbol: 'eye', compose: 'Search' },
  snowflake: { label: 'Geler', flutter: 'ac_unit', materialName: 'ac-unit', sfSymbol: 'snowflake', compose: 'Build' },
  sliders: { label: 'Réglages fins', flutter: 'tune', materialName: 'tune', sfSymbol: 'slider.horizontal.3', compose: 'Settings' },
  plane: { label: 'Voyage', flutter: 'flight', materialName: 'flight', sfSymbol: 'airplane', compose: 'Send' },
  bike: { label: 'Vélo', flutter: 'pedal_bike', materialName: 'pedal-bike', sfSymbol: 'bicycle', compose: 'Place' },
  document: { label: 'Document', flutter: 'description', materialName: 'description', sfSymbol: 'doc.text', compose: 'List' },
  globe: { label: 'Langue', flutter: 'language', materialName: 'language', sfSymbol: 'globe', compose: 'LocationOn' },
  contrast: { label: 'Apparence', flutter: 'contrast', materialName: 'brightness-medium', sfSymbol: 'circle.lefthalf.filled', compose: 'Info' },
  smartphone: { label: 'Téléphone mobile', flutter: 'smartphone', materialName: 'smartphone', sfSymbol: 'iphone', compose: 'Phone' },
  logout: { label: 'Déconnexion', flutter: 'logout', materialName: 'logout', sfSymbol: 'rectangle.portrait.and.arrow.right', compose: 'ExitToApp' },
  chevronLeft: { label: 'Chevron gauche', flutter: 'chevron_left', materialName: 'chevron-left', sfSymbol: 'chevron.left', compose: 'KeyboardArrowLeft' },
  upload: { label: 'Téléverser', flutter: 'file_upload', materialName: 'file-upload', sfSymbol: 'square.and.arrow.up', compose: 'Share' },
}
