# BestiaryData

Offline snapshot of the D&D 5e bestiary scraped from [dnd.su](https://dnd.su/bestiary/). 2874 official statblocks. Mirrors the layout of `SpellData/` / `FeatureData/` / `FeatData/` so the Blazor app can consume it the same way.

## Layout

```
BestiaryData/
├── index.json          slim list: title, titleEn, file
├── index-full.json     per-beast metadata + filter tags
├── lookups.json        ID -> label tables for every filter
├── bestiary/           one HTML fragment per beast (2874 files)
└── REVIEW.md           extraction flags (missing cards, auto-converted tables etc.)
```

Copy everything except `REVIEW.md` into `wwwroot/BestiaryData/`.

## File formats

### `index.json`

```json
[
  { "title": "Ааракокра", "titleEn": "Aarakocra", "file": "bestiary/30-aarakocra.html" }
]
```

### `index-full.json`

```json
{
  "title": "Ааракокра",
  "title_en": "Aarakocra",
  "link": "/bestiary/30-aarakocra/",
  "file": "bestiary/30-aarakocra.html",
  "id": "30",
  "cr": "1/4",
  "cr_num": 0.25,
  "xp": 50,
  "size": "Средний",
  "type": "Гуманоид",
  "npc": false,
  "filter_danger": ["12"],
  "filter_size": ["3"],
  "filter_type": ["19"],
  "filter_source": ["103"],
  "filter_speed_applied": ["1", "3"],
  "filter_speed_lacking": ["2", "4", "5"],
  "filter_alignment": ["ng"],
  "filter_languages": ["28"],
  "filter_environment": ["4"]
}
```

| Field | Meaning |
|---|---|
| `cr` / `cr_num` / `xp` | challenge rating as displayed (`"1/4"`), as a sortable number (`0.25`), and its XP award |
| `size` / `type` | display labels, pre-resolved from `lookups.size` / `lookups.type` — no join needed for list columns |
| `npc` | named NPC (the "И" mark in the site's list) |
| `filter_danger` | CR id (use with `lookups.danger`, whose titles are `"1/4  - 50 опыта"`) |
| `filter_size` | size id — several beasts carry swarm sizes (`"Большой рой средних"`) |
| `filter_type` | creature type / species id (Гуманоид, Дракон, Зверь, ...) |
| `filter_source` | sourcebook ids, same namespace as the other datasets (PHB = 102, MM = 103, ...) |
| `filter_speed_applied` / `filter_speed_lacking` | movement mode ids the beast **has** / **lacks**; both index the same `lookups.speed` table |
| `filter_alignment` | alignment codes (`"lg"`, `"ne"`, `"none"`, ...); a beast with a free-form alignment carries all nine |
| `filter_languages` / `filter_environment` | extra tags that came free with the same tag map |

Every `filter_*` value is a **string**, matching `lookups.*.value`. All are arrays, including single-valued ones.

### `lookups.json`

Top-level keys: `size`, `type`, `danger`, `source`, `speed`, `npc`, `languages`, `environment`, `alignment`. Entries mirror the other datasets:

```json
{ "value": "103", "title": "Monster Manual", "group": "Core" }
```

`group` is non-null only for `source` (Core / Sourcebooks / Adventures, hardcovers) and `languages`.

Quirks:

- `speed` is normalized. The site's widget lists each mode twice (`"+1"` = has walking speed, `"-1"` = lacks it); this table keeps one entry per mode with a bare id (`"1"` … `"5"`), because the has/lacks distinction is already carried by which of the two `filter_speed_*` arrays the id lands in.
- `xp` for CR 0 is `0` — the site's label reads "0 или 10 опыта" and only the first number is parsed.
- 20 statblocks are `"cr": "?"` with `"cr_num": null` — the summon-spell and companion entries (Дух зверя, Стальной защитник, Дрейк-компаньон, ...) whose CR scales with the caster. Sort them last. A further ~20 carry `filter_danger` ids `44`/`45`, which the site's own filter widget does not offer, so those ids resolve to no `lookups.danger` row; their `cr` / `cr_num` come from the list mark instead and are correct.
- `alignment` is the one filter with no `data-list` widget (the site builds it client-side from `data-custom="alignment"`); its labels are read from the page's `const COMPENDIUM = {"bestiary":{"alignment":{…}}}` instead.

### `bestiary/<id>-<slug>.html`

Cleaned statblock fragment per beast. Filename is the dnd.su URL slug (`/bestiary/30-aarakocra/` → `30-aarakocra.html`).

```html
<article>
<h2>Ааракокра [Aarakocra]</h2>
<ul>
<li>Средний Гуманоид, нейтрально-добрый</li>
<li><strong>Класс Доспеха</strong> 12</li>
<li><strong>Хиты</strong> 13 (3к8)</li>
<li><strong>Скорость</strong> <strong>20 футов</strong>, летая <strong>50 футов</strong></li>
<li><strong>Характеристики</strong> Сил 10 (+0), Лов 14 (+2), ...</li>
<li><strong>Опасность</strong> 1/4 (50 опыта)</li>
<li><p><strong><em>Пикирующая атака</em>.</strong> ...</p></li>
<li><h3>Действия</h3><p>...</p></li>
<li><h3>Описание</h3><p>...</p></li>
</ul>
</article>
```

Tags kept: `<article>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<li>`, `<div>`, `<p>`, `<strong>`, `<em>`. **No attributes.** Section headings (Действия / Реакции / Легендарные действия / Логово / Описание) become `<h3>` inside their `<li>`. Stripped: links, images, source plaques, the "?" tooltip markers after sizes/senses/conditions, and the dice-roll widget next to Хиты. The ability-score grid is flattened to a single `Характеристики` line; page tables are converted to `<ul>` with bold row labels.

## Blazor integration

Same pattern as the other datasets:

```csharp
public record Beast(
    string Title,
    [property: JsonPropertyName("title_en")] string TitleEn,
    string File,
    string Cr,
    [property: JsonPropertyName("cr_num")] double? CrNum,
    int? Xp,
    string Size,
    string Type,
    bool Npc,
    [property: JsonPropertyName("filter_danger")] string[] FilterDanger,
    [property: JsonPropertyName("filter_size")]   string[] FilterSize,
    [property: JsonPropertyName("filter_type")]   string[] FilterType,
    [property: JsonPropertyName("filter_source")] string[] FilterSource,
    [property: JsonPropertyName("filter_speed_applied")] string[] FilterSpeedApplied,
    [property: JsonPropertyName("filter_speed_lacking")] string[] FilterSpeedLacking);
```

Fetch `BestiaryData/index-full.json` + `BestiaryData/lookups.json` at startup, then `BestiaryData/{beast.File}` on demand and render as `MarkupString`. Sort by `cr_num`; filter by intersecting the `filter_*` arrays with the selected lookup values.

## Re-running the scraper

```
dotnet run --project BestiaryExtractor -- --output BestiaryData
```

Existing `bestiary/*.html` are skipped (delete a file to refetch it); the three JSON indexes and `REVIEW.md` are always rewritten. The indexes are written **before** the fetch loop — they derive entirely from the list data, so a cold run leaves usable JSON within seconds and an interrupted run still leaves a complete index covering all 2874 beasts. Useful flags: `--limit <n>` (test on the first n beasts), `--delay <ms>` (default 3000 — dnd.su resets connections on rapid requests). A full cold run is ~2874 pages, so budget a couple of hours; re-running after an interruption resumes from the cache.

`REVIEW.md` is rewritten every run but only re-flags pages that were actually **fetched** — cached ones are skipped, so a small follow-up run produces a much shorter file than the cold run did. The cold run of 2026-07-28 flagged 57 statblocks whose page tables were auto-converted to `<ul>`, plus 11 transient "card not found" failures that all succeeded on a second pass.

In practice dnd.su starts refusing connections partway through a run of this size (it happened around page 900 at a 3 s delay, with a TLS-level reset, then cleared on its own within minutes). The extractor backs off 15 s → 30 s → 1 m → 2 m → 5 m → 10 m, and if a page still won't load it records it in `REVIEW.md` and moves on instead of aborting the run. Re-run afterwards to pick up the stragglers — everything already downloaded is skipped.

## Notes

- Beast **detail** pages are the same shape as feat/spell pages, so that half of the extractor is a straight port. The **index** page differs: `GET https://dnd.su/bestiary/` returns only the filter form and an empty container — the 2874 entries are not in it. The browser's JS fetches them separately from `/piece/bestiary/index-list/?content=multiverse` (1.7 MB, cached in the browser's private filesystem), and all per-beast filter tags live in a `window.filterItems` map at the end of that fragment, keyed by beast id. So the extractor makes two list requests: `/bestiary/` for the filter *labels*, the piece for the entries and their *tags*.
- Official content only (`/bestiary/`); homebrew (`/homebrew/bestiary/`) is not included.
- Source content is owned by Wizards of the Coast / dnd.su contributors; intended for personal/offline use, don't redistribute the text.
- If dnd.su changes its page structure, the anchors the extractor depends on are: the eight `input[data-list]` filter widgets, `div.list-item__beast` + `window.filterItems` in the list fragment, and `div.card__category-bestiary` with `ul.params.card__article-body` on beast pages.
