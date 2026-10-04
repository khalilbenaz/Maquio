// Bouton « Télécharger » : détecte le système et pointe vers l'artefact de la
// dernière release publiée (API GitHub, sans clé). Sans réponse, le lien reste
// celui de la page des releases : la page fonctionne sans JavaScript.
(() => {
  const REPO = 'khalilbenaz/Maquio'
  const main = document.getElementById('dl-main')
  const note = document.getElementById('dl-note')
  const list = document.getElementById('dl-list')
  if (!main || !note || !list) return

  const uad = navigator.userAgentData
  const ua = navigator.userAgent || ''
  const plat = `${(uad && uad.platform) || ''} ${navigator.platform || ''}`
  let os = 'autre'
  if (/mac/i.test(plat) || /Macintosh/.test(ua)) os = 'mac'
  else if (/win/i.test(plat) || /Windows/.test(ua)) os = 'win'
  else if (/linux|cros/i.test(plat) || /Linux|X11/.test(ua)) os = 'linux'
  const NOMS = { mac: 'macOS', win: 'Windows', linux: 'Linux' }
  if (NOMS[os]) main.textContent = `Télécharger pour ${NOMS[os]}`

  async function arm() {
    if (uad && uad.getHighEntropyValues) {
      try { return (await uad.getHighEntropyValues(['architecture'])).architecture === 'arm' } catch { /* ignoré */ }
    }
    return /arm|aarch64/i.test(ua)
  }

  async function init() {
    let release
    try {
      const rep = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=1`, { headers: { Accept: 'application/vnd.github+json' } })
      if (!rep.ok) return
      release = (await rep.json())[0]
    } catch { return }
    if (!release || !Array.isArray(release.assets) || release.assets.length === 0) return
    const url = (re) => { const a = release.assets.find((x) => re.test(x.name)); return a ? a.browser_download_url : null }
    const isArm = await arm()
    const liens = {
      mac: [['.dmg', url(/mac-universal\.dmg$/)], ['.zip', url(/mac-universal\.zip$/)]],
      win: [['x64', url(/win-x64\.exe$/)], ['arm64', url(/win-arm64\.exe$/)]],
      linux: [['.AppImage', url(/\.AppImage$/)], ['.deb', url(/\.deb$/)]],
    }
    const principal = os === 'win' ? (isArm ? liens.win[1][1] : liens.win[0][1]) : NOMS[os] ? liens[os][0][1] : null
    if (principal) main.href = principal
    note.textContent = `Version ${release.tag_name.replace(/^v/, '')} · gratuit et libre (licence MIT).`
    list.textContent = ''
    for (const [cle, items] of Object.entries(liens)) {
      for (const [etiquette, href] of items) {
        if (!href) continue
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = href
        a.textContent = `${NOMS[cle]} ${etiquette}`
        li.appendChild(a)
        list.appendChild(li)
      }
    }
  }
  void init()
})()
