#!/usr/bin/env bash
# Regenera los PNG/ICO de marca a partir de los SVG (requiere rsvg-convert y ImageMagick).
set -euo pipefail
cd "$(dirname "$0")/../.."

rsvg-convert -w 1200 -h 630 scripts/brand/og.svg -o app/opengraph-image.png
rsvg-convert -w 1200 -h 630 scripts/brand/og.svg -o app/twitter-image.png
rsvg-convert -w 180 -h 180 public/logo-icon.svg -o app/apple-icon.png
rsvg-convert -w 192 -h 192 public/logo-icon.svg -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/logo-icon.svg -o public/icon-512.png
for s in 16 32 48; do rsvg-convert -w $s -h $s public/logo-icon.svg -o "/tmp/nefroia-ico-$s.png"; done
convert /tmp/nefroia-ico-16.png /tmp/nefroia-ico-32.png /tmp/nefroia-ico-48.png app/favicon.ico
