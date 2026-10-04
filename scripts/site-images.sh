#!/bin/sh
# Optimise les captures du site : AVIF + WebP (clair et sombre) et un PNG de
# repli (clair, 1200 px). Usage : scripts/site-images.sh <dossier des captures>
# Captures produites par `THEME=dark|light OUT=<dossier> node test/e2e/captures-site.mjs`.
# Outils : ImageMagick, cwebp, avifenc.
set -eu
src="${1:?dossier des captures}"
out="$(dirname "$0")/../site/img"
mkdir -p "$out"
tmp="$(mktemp -d)"
conv() { # nom_source nom_sortie
  for t in dark light; do
    magick "$src/$1-$t.png" -resize 1600x -strip "$tmp/$2-$t.png"
    cwebp -quiet -q 80 -m 6 "$tmp/$2-$t.png" -o "$out/$2-$t.webp"
    avifenc -q 55 -s 4 "$tmp/$2-$t.png" "$out/$2-$t.avif" >/dev/null
  done
  magick "$src/$1-light.png" -resize 1100x -strip +dither -colors 128 -define png:compression-level=9 "$out/$2-light.png"
}
conv hero hero
conv composants-ecran composants
conv liens liens
conv proto proto
conv export-menu export
conv figma figma
conv claude claude
conv panneaux-replies panneaux
rm -rf "$tmp"
# Planches maquette / rendu : produites a la main (maquette de reference a
# gauche, rendu Maquio a droite). Voir site/img/planche-*.
