#!/usr/bin/env bash
# Сборка сопроводительной документации в один PDF (ТЗ 8.2.4).
# Нужны Node.js и Google Chrome/Chromium; путь к браузеру можно задать через CHROME.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v chromium || command -v google-chrome)"
OUT="${1:-robopodbor-docs.pdf}"
HTML="$(mktemp -t robopodbor-docs.XXXXXX).html"

{
  cat <<'HEAD'
<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>РОБОПОДБОР — документация</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.5 "PT Sans", "Helvetica Neue", Arial, sans-serif; color: #1c1c1e; }
  h1 { font-size: 18pt; margin: 0 0 10pt; break-before: page; }
  section:first-of-type h1 { break-before: auto; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.5pt; }
  th, td { border: 1px solid #d1d1d6; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #f2f2f7; }
  tr, pre, .mermaid { break-inside: avoid; }
  code { font: 9pt "JetBrains Mono", Menlo, monospace; background: #f2f2f7; padding: 0 2pt; }
  pre { background: #f2f2f7; padding: 6pt 8pt; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 6pt 0; padding: 4pt 10pt; border-left: 3px solid #8e8e93; color: #3a3a3c; }
  a { color: inherit; }
</style></head><body>
HEAD
  for file in README.md 0*.md 1*.md; do
    echo "<section id=\"${file%.md}\">"
    npx --yes marked@14 --gfm -i "$file" \
      | sed -E 's#<pre><code class="language-mermaid">#<pre class="mermaid">#' \
      | sed -E 's#href="([0-9]{2}-[a-z-]+)\.md"#href="\#\1"#g'
    echo "</section>"
  done
  cat <<'TAIL'
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  document.querySelectorAll("pre.mermaid").forEach((el) => { el.textContent = el.textContent; });
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });
  await mermaid.run({ querySelector: "pre.mermaid" });
</script>
</body></html>
TAIL
} > "$HTML"

"$CHROME" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 \
  --print-to-pdf="$PWD/$OUT" "file://$HTML" 2>/dev/null
rm -f "$HTML"
echo "Готово: docs/$OUT"
