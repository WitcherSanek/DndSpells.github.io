# FeatureData

Offline snapshot of D&D 5e class features scraped from [dnd.su](https://dnd.su/class/). 893 features across all 13 official classes. Mirrors the layout of `SpellData/` so a Blazor app can consume it the same way.

## Layout

```
FeatureData/
├── README.md
├── index.json           slim list: title, file
├── index-full.json      per-feature metadata (level, class, archetype, source)
├── lookups.json         ID -> label tables (level, class, archetype, source)
├── features/            one HTML fragment per feature (893 files)
└── <class>/             per-class staging dirs from FeatureExtractor runs +
                         a REVIEW.md flagging anything that needed human eyes
                         (artificer/, bard/, barbarian/, cleric/, druid/,
                          fighter/, monk/, paladin/, ranger/, rogue/,
                          sorcerer/, warlock/, wizard/)
```

The staging dirs are inputs to `FeatureAdder`, not consumed at runtime. Copy only `index*.json`, `lookups.json`, and `features/` into `wwwroot/`.

## Coverage

| Class | id | Features | Notable subclass / synthetic archetype |
|---|---|---|---|
| Варвар (Barbarian) | 87 | 57 | Path of the Giant (Bigby's) |
| Бард (Bard) | 88 | 49 | 7 colleges incl. College of Spirits |
| Жрец (Cleric) | 89 | 95 | 12 domains |
| Друид (Druid) | 90 | 47 | 7 circles |
| Воин (Fighter) | 91 | 89 | **Боевые приёмы** (Maneuvers) synthetic archetype id 310 — 23 items |
| Монах (Monk) | 93 | 65 | Four Elements disciplines bundled into one feature |
| Паладин (Paladin) | 94 | 68 | 10 oaths incl. Oathbreaker (DMG) |
| Следопыт (Ranger) | 97 | 62 | 7 conclaves |
| Плут (Rogue) | 99 | 60 | 9 archetypes incl. Soulknife |
| Чародей (Sorcerer) | 101 | 62 | **Метамагия** synthetic archetype id 318 — 10 items |
| Колдун (Warlock) | 104 | 112 | **Таинственные воззвания** (Invocations) id 308 — 54 items; 9 patrons |
| Волшебник (Wizard) | 105 | 72 | 10 schools incl. Bladesinging |
| Изобретатель (Artificer) | 137 | 55 | **Инфузии изобретателя** id 309 — 16 items |

Unearthed Arcana, homebrew, and third-party content is intentionally excluded.

## File formats

### `index.json`

Slim list, ~30 KB, sufficient for navigation when filters aren't needed.

```json
[
  { "title": "Защита без доспехов", "file": "features/1-unarmored-defense.html" }
]
```

### `index-full.json`

```json
[
  {
    "title": "Защита без доспехов",
    "file": "features/1-unarmored-defense.html",
    "level": 1,
    "filter_class": [87],
    "filter_archetype": [],
    "filter_source": [102]
  }
]
```

| Field | Meaning |
|---|---|
| `title` | display name (Russian) |
| `file` | relative path to the HTML fragment |
| `level` | character level at which the feature is gained (1–20) |
| `filter_class` | class IDs (use with `lookups.class`) — single-element array |
| `filter_archetype` | archetype IDs (use with `lookups.archetype`) — empty array for base-class features |
| `filter_source` | sourcebook IDs (use with `lookups.source`) — single-element array |

### `lookups.json`

ID → label tables. Top-level keys: `level`, `class`, `archetype`, `source`. Each entry:

```json
{ "value": "87", "title": "Варвар", "group": null }
```

`group` is non-null only for `archetype` (parent class name, e.g. `"Варвар"`).

#### ID scheme

Class and archetype IDs follow the **dnd.su URL prefix** convention (e.g. `/class/87-barbarian` → Варвар = 87). Subclass archetype IDs in the 160–290 range mirror dnd.su's archetype IDs from the spell-filter widget (already used in `SpellData/`). Auto-appended archetype IDs start at 300+ for archetypes not pre-seeded — including all four synthetic pool archetypes:

| ID | Synthetic archetype | Class |
|---|---|---|
| 308 | Таинственные воззвания (Eldritch Invocations) | Колдун |
| 309 | Инфузии изобретателя (Artificer Infusions) | Изобретатель |
| 310 | Боевые приёмы (Battle Master Maneuvers) | Воин |
| 318 | Метамагия (Sorcerer Metamagic) | Чародей |

`source` IDs reuse `SpellData/lookups.json` IDs (same physical sourcebooks). Sources added by this project: `Van Richten's Guide to Ravenloft` (145), `Dragonlance: Shadow of the Dragon Queen` (200), `Dungeon Master Guide` (103).

> Note: these class IDs differ from the spell-filter widget's `class` IDs on dnd.su (12, 13, 16, …). Those are an internal filter namespace from the `/spells/` page and don't apply here.

`level` is character level 1–20 (not spell-slot level).

### `features/<slug>.html`

One HTML fragment per feature, ready to drop into a popup:

```html
<article>
  <h2>RUSSIAN NAME IN UPPERCASE</h2>
  <ul><li><div><p>...</p></div></li></ul>
</article>
```

Tags kept: `<article>`, `<h2>`, `<ul>`, `<li>`, `<div>`, `<p>`, `<strong>`, `<em>`. **No attributes.** No `<table>` — page tables are converted to `<ul>` with bold row labels. Inline links and tooltips are stripped (kept as plain text). Sidebars (`additionalInfo`), flavor blockquotes, and "Господин Финик" clarification notes are dropped.

Filename pattern: `<counter>-<en-slug>.html`. Counter is monotonically increasing across all features (1..893). The English slug comes from dnd.su's `feature.X` / `invocation.X` / `infusion.X` span ids when present, otherwise from a BGN/PCGN transliteration of the Russian title — so some slugs read as transliteration (e.g. `tainstvennyy-vzglyad`). Slugs are filenames only and aren't stored in any index.

## Blazor integration

1. Copy `index.json`, `index-full.json`, `lookups.json`, and `features/` to `wwwroot/FeatureData/`.
2. Fetch the index once at startup and the fragment on demand:

```razor
@inject HttpClient Http

@code {
    private Feature[]? features;
    private Lookups? lookups;
    private MarkupString detail;

    protected override async Task OnInitializedAsync()
    {
        features = await Http.GetFromJsonAsync<Feature[]>("FeatureData/index-full.json");
        lookups  = await Http.GetFromJsonAsync<Lookups>("FeatureData/lookups.json");
    }

    private async Task Open(Feature f) =>
        detail = (MarkupString)await Http.GetStringAsync($"FeatureData/{f.File}");

    public record Feature(
        string Title,
        string File,
        int Level,
        [property: JsonPropertyName("filter_class")]     int[] FilterClass,
        [property: JsonPropertyName("filter_archetype")] int[] FilterArchetype,
        [property: JsonPropertyName("filter_source")]    int[] FilterSource);

    public record LookupItem(string Value, string Title, string? Group);
    public record Lookups(LookupItem[] Level, LookupItem[] Class, LookupItem[] Archetype, LookupItem[] Source);
}

<ul>
    @foreach (var f in features ?? Array.Empty<Feature>())
    {
        <li><button @onclick="() => Open(f)">@f.Title</button></li>
    }
</ul>

<div>@detail</div>
```

### Resolving labels

`filter_archetype` items are integers in JSON but the lookup's `value` field is a string — compare with `.ToString()`:

```csharp
string ArchetypeName(int id) =>
    lookups!.Archetype.FirstOrDefault(x => x.Value == id.ToString())?.Title ?? "?";

string ClassName(int id) =>
    lookups!.Class.FirstOrDefault(x => x.Value == id.ToString())?.Title ?? "?";
```

### Filtering examples

Base-class features (no archetype):

```csharp
var baseClass = features.Where(f => f.FilterArchetype.Length == 0);
```

All Warlock Invocations:

```csharp
var invocationsId = 308;
var invocations = features.Where(f => f.FilterArchetype.Contains(invocationsId));
```

Features available to a Battle Master fighter (id 117) at exactly level 5:

```csharp
var battlemasterId = 117;
var fighterId      = 91;
var maneuversId    = 310;
var available = features.Where(f =>
    f.FilterClass.Contains(fighterId) &&
    (f.FilterArchetype.Length == 0
        || f.FilterArchetype.Contains(battlemasterId)
        || f.FilterArchetype.Contains(maneuversId)) &&
    f.Level <= 5);
```

## Regenerating the data

### `FeatureExtractor`

C# console app that scrapes one class page at a time and writes per-feature JSONs + a `REVIEW.md` to a staging directory.

```
dotnet run --project FeatureExtractor -- https://dnd.su/class/104-warlock/ --output FeatureData/warlock
```

The extractor handles four item shapes:

| Pool style | Used by | DOM marker |
|---|---|---|
| Regular `<h3>` features | every class's base/subclass features | `<h3 class="underlined">` |
| `<h2 id='X'>` + `<h3>` items (H3 pool) | Warlock invocations | `<span id='invocations'>` + `<div data-sort="element" data-level data-source data-pact>` wrappers |
| `<h2 id='X'>` + `<h4>` items (H4 pool) | Artificer infusions | `<span id='infusions'>` + `<div data-sort="element" data-level>` wrappers |
| `<h2 id='X'>` + `<p><strong>NAME.</strong>` items (paragraph pool) | Fighter maneuvers | `<span id='maneuvers'>` + bare `<p>` siblings; TCE-only items inside `<div class="TCE-feature-on">` |
| `<h4>` peel-out of an `<h3>` body | Sorcerer metamagic | h3 slug `metamagic` → emit umbrella feature + one feature per h4 child in synthetic archetype |

Pool anchors and the per-class default source live in `FeatureExtractor/sources.json`. Add an entry to `class_base_source` when a class isn't sourced from PHB.

### `FeatureAdder`

Appends one feature at a time:

```
dotnet run --project FeatureAdder -- FeatureData/warlock/01-otherwordly-patron.json
```

It writes the HTML fragment with the title uppercased (ru-RU culture), appends rows to `index.json` and `index-full.json`, and auto-appends new archetypes to `lookups.json` starting from id 300. Sources are **not** auto-appended — an unknown source raises an error so you can add it deliberately (next free id, name as it appears in the JSON).

#### Bulk add a class

```powershell
$exe = "FeatureAdder\bin\Debug\net9.0\FeatureAdder.exe"
Get-ChildItem FeatureData\warlock\*.json | Sort-Object { [int]($_.Name -split "-")[0] } | ForEach-Object {
    & $exe --data-dir FeatureData $_.FullName
}
```

#### Input shape (`feature.json`)

```json
{
  "title":            "Защита без доспехов",
  "title_en":         "Unarmored Defense",
  "level":            1,
  "class":            "Варвар",
  "archetype":        null,
  "archetype_group":  null,
  "source":           "Player's Handbook",
  "body":             "<ul><li><div><p>...</p></div></li></ul>"
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Russian feature name; uppercased into the `<h2>` |
| `title_en` | yes | English name; used **only** for slug generation, not stored |
| `level` | yes | 1..20 |
| `class` | yes | Class title (e.g. "Варвар") or numeric ID from `lookups.class` |
| `archetype` | no | Archetype title; auto-appended to lookups if new |
| `archetype_group` | only for new archetypes | Parent class title (defaults to `class` if omitted) |
| `source` | yes | Sourcebook title or numeric ID from `lookups.source` |
| `body` | yes | Inner HTML — wrapped in `<article><h2>…</h2> … </article>` |

Resolvers match case-insensitively by title or by numeric value.

### Reviewing extractor output

Each staging dir contains a `REVIEW.md` flagging items that need a human eye: tables auto-converted to lists, features missing a level annotation (defaulted to 3), Warlock invocations with a pact prerequisite, and so on. Transliterated-slug warnings are not emitted — the slug only affects the filename and is otherwise invisible.

## Notes

- If dnd.su changes its page structure, `FeatureExtractor` may need an update. The anchors it depends on are the `<span id='class-features'>` / `<span id='klassovye_umeniya'>` section start, `<h2><span id='X.Y'>` for subclass tracking, and the four pool-item DOM shapes listed above.
- Counter values in filenames are historical and don't compress — gaps would only appear if features were deleted (none currently). Don't reorder or renumber.
