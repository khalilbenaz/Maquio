// « À propos » : icone, logotype et accroche de Maquio.
import { useEffect } from 'react'
import pkg from '../../../package.json'
import './Dialog.css'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <section aria-label="À propos de Maquio" className="dialog-panel" style={{ textAlign: 'center', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-body" style={{ alignItems: 'center', padding: '32px 40px' }}>
          <img className="maquio-about-icon" src="./icon.png" alt="Icône de Maquio" />
          <p className="maquio-about-wordmark">maquio</p>
          <p className="maquio-about-tagline">De la maquette au code natif.</p>
          <p className="maquio-about-version">Version {pkg.version}</p>
          <div className="dialog-actions">
            <button type="button" className="dialog-button dialog-button-primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
