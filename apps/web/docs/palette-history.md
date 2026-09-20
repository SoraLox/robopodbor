# История цветовой палитры

## До 2026-09-19 — «спокойный синий»

Токены из `src/styles/globals.css` на момент переключения на Apple Store-подобную палитру:

```css
--canvas: 210 25% 97%; /* #F5F7FA */
--background: 0 0% 100%; /* #FFFFFF */
--foreground: 222 35% 12%; /* #131A2B */
--muted-foreground: 215 16% 42%; /* #59677D */
--meta-foreground: 215 14% 52%; /* #77839A */
--border: 214 24% 90%; /* #DEE4EC */
--hairline: 214 26% 94%; /* #EBEFF4 */
--radius: 20px;

--primary: 219 44% 34%; /* #2C4372 */
--primary-foreground: 0 0% 100%;
--primary-hover: 219 46% 27%; /* #22345A */
--primary-bright: 213 68% 52%; /* #2E76D6 */
--accent-tint: 213 58% 95%; /* #EAF1FB */
```

Статусы, графики и shadcn-производные токены не менялись.

## С 2026-09-19 — Apple Store-подобная (монохром + один синий для ссылок)

См. текущее состояние `src/styles/globals.css`. Ключевые цвета: белый `#FFFFFF`,
светло-серый `#F5F5F7`, почти чёрный `#1D1D1F` (референс — apple.com/store).
