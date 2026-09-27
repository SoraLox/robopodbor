#!/usr/bin/env bash
# Сжатие 3D-моделей симуляции: assets-src/models/*.glb → public/models/*.glb.
# Запуск из apps/web: bash scripts/build-models.sh
#
# Качество важнее последних килобайт: текстуры — 2048 px и webp высокого качества
# (1024 px с сильным сжатием давали мыло на крупном плане), геометрию не упрощаем.
# Геометрия сжимается meshopt (квантование + склейка одинаковых вершин) — без
# видимых потерь, декодер подключён в robots/glbModel.js.
set -euo pipefail
cd "$(dirname "$0")/.."
cli=(npx --yes @gltf-transform/cli@4)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for src in assets-src/models/*.glb; do
  name=$(basename "$src")
  "${cli[@]}" resize "$src" "$tmp/1-$name" --width 2048 --height 2048 >/dev/null
  "${cli[@]}" webp "$tmp/1-$name" "$tmp/2-$name" --quality 92 >/dev/null
  "${cli[@]}" meshopt "$tmp/2-$name" "public/models/$name" >/dev/null
  echo "$name: $(wc -c <"$src" | xargs) → $(wc -c <"public/models/$name" | xargs) байт"
done
