# FeatData

Offline snapshot of D&D 5e feats (2014 rules) scraped from [dnd.su](https://dnd.su/feats/). 105 feats. Mirrors the layout of `SpellData/` / `FeatureData/` so a Blazor app can consume it the same way.

## Layout

```
FeatData/
├── index.json          slim list: title, titleEn, file
├── index-full.json     per-feat metadata (link, source)
├── lookups.json        ID -> label table for the source filter
├── feats/              one HTML fragment per feat (105 files)
└── REVIEW.md           extraction flags (auto-converted tables etc.)
```

Copy everything except `REVIEW.md` into `wwwroot/FeatData/`.

## File formats

### `index.json`

```json
[
  { "title": "Артистичный", "titleEn": "Actor", "file": "feats/101-actor.html" }
]
```

### `index-full.json`

```json
[
  {
    "title": "Артистичный",
    "title_en": "Actor",
    "link": "/feats/101-actor/",
    "file": "feats/101-actor.html",
    "filter_source": [102]
  }
]
```

`filter_source` is the only filter tag (single-element array, use with `lookups.source`). Source IDs share the namespace used by `SpellData/` and `FeatureData/` (PHB = 102, Tasha's = 117, Xanathar's = 109, ...).

### `lookups.json`

Single top-level key `source`. Entries mirror the other datasets:

```json
{ "value": "102", "title": "Player's Handbook", "group": "Core" }
```

`group` is the dnd.su source category (Core / Sourcebooks / Adventures, hardcovers). 11 sourcebooks contain feats.

### `feats/<id>-<slug>.html`

Cleaned HTML fragment per feat. Filename is the dnd.su URL slug (`/feats/101-actor/` → `101-actor.html`).

```html
<article>
<h2>Борец [Grappler]</h2>
<ul>
<li><strong>Требование:</strong> Сила 13 или выше</li>
<li><div><p>description ...</p><ul><li>...</li></ul></div></li>
</ul>
</article>
```

The prerequisite `<li>` is present only for feats that have one. Tags kept: `<article>`, `<h2>`, `<ul>`, `<li>`, `<div>`, `<p>`, `<strong>`, `<em>`. **No attributes.** Tooltips, links, and source plaques (PH14/PH24) are stripped to plain text; page tables are converted to `<ul>` with bold row labels.

## Blazor integration

Same pattern as the other datasets:

```csharp
public record Feat(
    string Title,
    [property: JsonPropertyName("title_en")] string TitleEn,
    string Link,
    string File,
    [property: JsonPropertyName("filter_source")] int[] FilterSource);
```

Fetch `FeatData/index-full.json` + `FeatData/lookups.json` at startup, then `FeatData/{feat.File}` on demand and render as `MarkupString`.

## Re-running the scraper

```
dotnet run --project FeatExtractor -- --output FeatData
```

Existing `feats/*.html` are skipped (delete a file to refetch it); the three JSON indexes and `REVIEW.md` are always rewritten. Useful flags: `--limit <n>` (test on the first n feats), `--delay <ms>` (default 3000 — dnd.su resets connections on rapid requests, so keep a delay; transient "feat card not found" flags in `REVIEW.md` are fixed by re-running).

## Notes

- Feats are the classic 2014 versions; the 2024 PHB variants live on next.dnd.su and are not included (consistent with `SpellData/` and `FeatureData/`).
- Source content is owned by Wizards of the Coast / dnd.su contributors; intended for personal/offline use, don't redistribute the text.
- If dnd.su changes its page structure, the anchors the extractor depends on are the `div.list-item__spell` list items (with `data-id` / `data-source` / `data-search`), the `input[name=source]` filter widget's `data-list` JSON, and the `div.card__category-feats` card with `ul.params.card__article-body` on feat pages.
