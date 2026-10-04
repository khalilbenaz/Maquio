// Palette de composants mobiles : recherche, familles, glisser-deposer vers
// le canevas (un clic ajoute aussi l'element a l'ecran actif -- accessible au
// clavier et sans souris). Les entrees viennent du catalogue de @maquio/core,
// source unique partagee avec l'inspecteur et les exportateurs.
import { useState } from 'react'
import type { DragEvent } from 'react'
import { PALETTE_CATEGORIES, searchPalette } from '@maquio/core'
import type { PaletteItem } from '@maquio/core'
import { PALETTE_MIME, insertPaletteItemInActiveScreen } from '../canvas/paletteInsert'
import './PalettePanel.css'

export { PALETTE_MIME }

export function PalettePanel() {
  const [query, setQuery] = useState('')
  const items = searchPalette(query)

  function onDragStart(e: DragEvent, item: PaletteItem) {
    e.dataTransfer.setData(PALETTE_MIME, item.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <section className="palette-panel" aria-label="Composants">
      <div className="palette-search">
        <input
          type="search"
          role="searchbox"
          aria-label="Rechercher un composant"
          placeholder="Rechercher (button, toggle, appbar…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="palette-scroll">
        {items.length === 0 ? <p className="palette-empty">Aucun composant ne correspond à « {query} ».</p> : null}
        {PALETTE_CATEGORIES.map((category) => {
          const inCategory = items.filter((i) => i.category === category)
          if (inCategory.length === 0) return null
          return (
            <div key={category}>
              <h3 className="palette-category">{category}</h3>
              <ul className="palette-items">
                {inCategory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="palette-item"
                      data-testid={`palette-item-${item.id}`}
                      draggable
                      title={`${item.label} — glisser sur le canevas ou cliquer pour ajouter`}
                      onDragStart={(e) => onDragStart(e, item)}
                      onClick={() => insertPaletteItemInActiveScreen(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
