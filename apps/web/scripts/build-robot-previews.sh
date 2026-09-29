#!/usr/bin/env bash
# Превью фото роботов для карточек: webp шириной до 800 px.
# Исходники — public/robots_photo/<ID>[_N].<ext>, результат — public/robots_photo/preview/<ID>[_N].webp.
# Запуск из apps/web: bash scripts/build-robot-previews.sh (нужен cwebp: brew install webp)
set -euo pipefail
cd "$(dirname "$0")/../public/robots_photo"
mkdir -p preview
shopt -s nullglob
for src in *.png *.jpg *.jpeg *.jfif *.webp; do
  out="preview/${src%.*}.webp"
  [ "$out" -nt "$src" ] && continue
  width=$(sips -g pixelWidth "$src" 2>/dev/null | awk '/pixelWidth/ {print $2}')
  resize=()
  if [ "${width:-0}" -gt 800 ]; then resize=(-resize 800 0); fi
  cwebp -quiet -q 80 ${resize[@]+"${resize[@]}"} "$src" -o "$out"
done
ls preview | wc -l | xargs echo "превью:"
