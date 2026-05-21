# SpellData

Offline snapshot of D&D 5e spells from [dnd.su](https://dnd.su/spells/), ready to drop into a Blazor `wwwroot/` folder.

## Layout

```
SpellData/
├── index.json          slim list: title, titleEn, file path
├── index-full.json     full per-spell metadata (level, school, classes, components, ...)
├── lookups.json        ID -> label tables for every filter
└── spells/             one HTML fragment per spell (522 files)
```

## File formats

### `index.json`

```json
[
  { "title": "Адское возмездие", "titleEn": "Hellish rebuke", "file": "spells/1-hellish-rebuke.html" },
  ...
]
```

Use it when you only need the navigation list. ~70 KB.

### `index-full.json`

Raw card metadata for every spell. Each entry has all the fields needed for filtering, sorting, and grouping without opening the HTML:

| Field | Meaning |
|---|---|
| `title` / `title_en` | display names |
| `link` | original site path (informational) |
| `level` / `item_prefix` | level 0–9 (0 = cantrip) |
| `item_prefix_title` | level label ("Заговор", "1 уровень", ...) |
| `school` / `item_icon_title` | school of magic (Russian text) |
| `item_icon` | icon slug, e.g. `spell_school_evocation` |
| `item_suffix` | component shorthand ("ВС.", "ВСМ", ...) |
| `filter_level` | `[level]` |
| `filter_class` | class IDs (use with `lookups.class`) |
| `filter_class_tce` | extra classes from Tasha's optional list |
| `filter_archetype` | subclass IDs (use with `lookups.archetype`) |
| `filter_source` | sourcebook IDs (use with `lookups.source`) |
| `filter_school` | school ID (use with `lookups.school`) |
| `filter_concentration` | `["1"]` if concentration |
| `filter_ritual` | `["1"]` if ritual |
| `filter_components` | pipe-encoded mask, e.g. `"1\|1\|0\|"` = V \| S \| M \| R |
| `filter_casttime` | `"action"`, `"bonus_action"`, `"reaction"`, `"minute"`, `"hour"` |
| `filter_damtype` | damage type IDs (use with `lookups.damtype`) |
| `filter_text` | precomputed lowercase search blob |

### `lookups.json`

Maps every filter ID to a human label. Top-level keys: `level`, `class`, `archetype`, `school`, `source`, `concentration`, `ritual`, `components`, `casttime`, `damtype`. Each entry:

```json
{ "value": "21", "title": "Волшебник", "group": null }
```

`group` is non-null for tables that have a parent grouping — `archetype` is grouped by parent class, `source` by category (Core / Sourcebooks / Adventures / AL / Homebrew).

Quirk: `components` uses letter codes (`v`, `s`, `m`) while card field `filter_components` is a pipe mask. To decode the mask:

```csharp
var parts = card.FilterComponents.Split('|');
bool verbal    = parts.ElementAtOrDefault(0) == "1";
bool somatic   = parts.ElementAtOrDefault(1) == "1";
bool material  = parts.ElementAtOrDefault(2) == "1";
bool royalty   = parts.ElementAtOrDefault(3) == "1";
```

### `spells/<slug>.html`

Cleaned HTML fragment per spell. Structure:

```html
<article>
  <h2>Russian name [English name]</h2>
  <ul>
    <li>level, school</li>
    <li><strong>Время накладывания:</strong> 1 действие</li>
    <li><strong>Дистанция:</strong> ...</li>
    <li><strong>Компоненты:</strong> ...</li>
    <li><strong>Длительность:</strong> ...</li>
    <li><strong>Классы:</strong> ...</li>
    <li><div><p>description paragraph</p><p>...</p></div></li>
  </ul>
</article>
```

Stripped: `<a>`, `<script>`, `<style>`, `<svg>`, source plaques (PH14/PH24), and **every attribute** (class/id/itemprop/style/data-\*/on\*). Kept: `<article>`, `<h2>`, `<ul>`, `<li>`, `<div>`, `<p>`, `<strong>`. No fonts required — body uses plain text only.

## Blazor integration

1. Copy this entire folder to `wwwroot/SpellData/` in your Blazor project.
2. Fetch the index once at startup and the fragment on demand:

```razor
@inject HttpClient Http

@code {
    private Spell[]? spells;
    private Lookups? lookups;
    private MarkupString detail;

    protected override async Task OnInitializedAsync()
    {
        spells  = await Http.GetFromJsonAsync<Spell[]>("SpellData/index-full.json");
        lookups = await Http.GetFromJsonAsync<Lookups>("SpellData/lookups.json");
    }

    private async Task Open(Spell s)
    {
        var slug = s.Link.Trim('/').Split('/')[^1];
        var html = await Http.GetStringAsync($"SpellData/spells/{slug}.html");
        detail = (MarkupString)html;
    }

    public record Spell(
        string Title,
        [property: JsonPropertyName("title_en")] string TitleEn,
        string Link,
        int Level,
        [property: JsonPropertyName("filter_class")]  int[] FilterClass,
        [property: JsonPropertyName("filter_school")] int[] FilterSchool,
        [property: JsonPropertyName("filter_components")] string FilterComponents);

    public record LookupItem(string Value, string Title, string? Group);
    public record Lookups(
        LookupItem[] Level,
        LookupItem[] Class,
        LookupItem[] Archetype,
        LookupItem[] School,
        LookupItem[] Source,
        LookupItem[] Concentration,
        LookupItem[] Ritual,
        LookupItem[] Components,
        LookupItem[] Casttime,
        LookupItem[] Damtype);
}

<ul>
    @foreach (var s in spells ?? Array.Empty<Spell>())
    {
        <li><button @onclick="() => Open(s)">@s.Title</button></li>
    }
</ul>

<div>@detail</div>
```

### Resolving labels

```csharp
string SchoolName(int id) =>
    lookups!.School.FirstOrDefault(x => x.Value == id.ToString())?.Title ?? "?";
```

### Re-running the scraper

From the repo root:

```
dotnet run --project DndSuParser -- --download SpellData
```

Cached files (existing `spells/*.html`) are skipped, so re-runs only refetch what's missing. `index.json`, `index-full.json`, and `lookups.json` are always rewritten.

## Notes

- Source content is owned by Wizards of the Coast / dnd.su contributors. This snapshot is intended for personal/offline use of a tool you control; don't redistribute the spell text.
- If dnd.su changes its page structure, the scraper regex may need an update. The two anchors it depends on are `window.LIST = {...};` (list endpoint) and `<ul class="params card__article-body">` (spell page).
