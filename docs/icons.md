# Icons

Anywhere the config or an entity names an icon, cube resolves it one of two ways.

## Material Design icons

Names beginning `mdi:` come from the Material Design set, which ships with the panel:

```yaml
icon: mdi:broom
```

The full set is browsable at [pictogrammers.com/library/mdi](https://pictogrammers.com/library/mdi/). Anything there works, offline, with no further setup.

## Your own set

Any other name is looked up in `resources/icons.json`, a map of the full name to an SVG path drawn on a 24-unit grid:

```json
{
  "house:wind": "m1.29 13.48c0 .22.08.4.25.56…",
  "house:sunrise": "m12 3.5l3.5 4h-7l3.5-4z…"
}
```

Then use it like any other:

```yaml
icon: house:wind
```

The prefix is yours to choose; cube only cares that the name is not `mdi:`.

Home Assistant setups often carry a custom iconset already, usually as a JavaScript file registering a map of names to paths. Converting one is a matter of pulling out the name and `path` of each entry into the JSON above.

This lives in `resources/` rather than in the image because it is yours — and a custom set often carries company marks or personal glyphs that have no business in something published.

## Icons that change with state

Some entities report their own icon, and it is often more useful than a fixed one. A time-of-day sensor, for instance, reports a sun or a moon depending on the hour.

For a header reading, name the attribute:

```yaml
- entity_id: sensor.time_of_day
  attribute: remaining
  icon_attribute: icon      # take the glyph from this attribute
  icon: mdi:clock-outline   # fall back to this if it has none
```

Notices read `icon` from their entity by default. An `icon` in the config wins, since naming one is a deliberate choice:

```yaml
notices:
  - entity_id: sensor.notice_bins
    icon: mdi:delete          # always this, whatever the entity says
  - entity_id: sensor.notice_travel
                              # whatever the entity reports
```

## When an icon does not appear

An unresolvable name draws nothing rather than a placeholder. The usual causes are a name from a set that is not in `icons.json`, or a typo in the prefix. `curl http://localhost:4096/api/icons` lists everything the panel can currently resolve.
