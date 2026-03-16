# Future: MapLibre + mapcn migration and multi-country support

This doc covers migrating from react-simple-maps to **MapLibre GL** using **[mapcn](https://www.mapcn.dev/)** for the main map: keeping theme and behavior (transitions, church view), adding street names when zoomed in, and laying groundwork for future countries. **Use MapLibre + mapcn instead of Mapbox — no API key or pricing;** free tiles (e.g. CARTO, OSM) and no usage-based cost. Use this as the single roadmap when you're ready to implement.

**Branch:** Do all migration work on a dedicated branch (e.g. `feature/maplibre-migration` or `feature/mapcn-migration`). Do not implement on `main` until the migration is reviewed and ready to merge.

---

## Current state

- **Map:** [MapCanvas.tsx](../../src/app/components/MapCanvas.tsx) uses **react-simple-maps** (ComposableMap, ZoomableGroup) with US state and county TopoJSON ([GEO_URL](https://github.com/topojson/us-atlas), [COUNTIES_GEO_URL](../../src/app/components/map-constants.ts)); church markers via [ChurchDots.tsx](../../src/app/components/ChurchDots.tsx). No basemap tiles or street names.
- **Zoom:** Scale factor 1–500 (roughly linear); [getStateZoom()](../../src/app/components/map-constants.ts) and min/max zoom wired through [useChurchMapData.ts](../../src/app/components/useChurchMapData.ts), [MapControls.tsx](../../src/app/components/MapControls.tsx), and ZoomableGroup.
- **Projection:** geoAlbersUsa (US-only). Center is `[lng, lat]`.
- **Tech stack reference:** [ARCHITECTURE.md](../ARCHITECTURE.md) (frontend map stack).

---

## Goals

- **Single map engine:** MapLibre GL for all zoom levels (no hybrid SVG + MapLibre). mapcn provides the React components (Map, MapControls, etc.) on top of MapLibre.
- **Street names:** Show streets and labels when zoomed in so users can locate churches that have no address (via free vector tiles: CARTO, OSM, etc.).
- **Preserve theme:** Purple palette, state/county colors, and marker styling (via custom MapLibre style or data-driven layers).
- **Preserve UX:** View transitions (fly to state/church, zoom buttons) and church view (center on church, mobile pin above 55vh panel).
- **Foundation for future countries:** One projection (Web Mercator), one stack; add regions/countries later without a second map system.
- **No API key or pricing:** Use MapLibre + free tiles; no Mapbox token or usage-based cost.

---

## What stays the same (and how MapLibre supports it)

| Current behavior | With MapLibre + mapcn |
|------------------|------------------------|
| **Theme / styling** | Custom MapLibre style (or any MapLibre-compatible tiles) for land, water, roads, labels; state/county fill via data-driven styling; church markers keep current colors and sizes (GeoJSON + circle/symbol layer or mapcn’s MapClusterLayer). |
| **View transitions** | Replace CSS transition on SVG with `map.flyTo({ center, zoom, duration })` (e.g. 800ms for state/church) and `map.easeTo({ zoom, duration })` (~320ms for zoom buttons). Use mapcn’s `useMap()` or ref to get the map instance. |
| **Church view** | `flyTo` to church center at target zoom; on mobile use camera padding or offset so the pin sits above the detail panel. |
| **Detail panel and other UI** | Unchanged (motion.div, modals, tooltips). |

---

## Migration scope (what must change)

| Area | Current | With MapLibre + mapcn |
|------|---------|------------------------|
| **Zoom model** | App uses scale 1–500; zoom in/out uses `z * 1.5` / `z / 1.5`. | MapLibre uses zoom 0–22 (exponential). Migrate all zoom read/write to MapLibre zoom (or a single conversion layer). |
| **ChurchDots** | Uses `useMapContext()` and SVG projection; viewport culling with `center` and `zoom`. | Replace with GeoJSON + circle/symbol layer (mapcn “Markers via Layers”) or MapClusterLayer; culling via `map.getBounds()` if needed. |
| **State and county layers** | TopoJSON (GEO_URL, COUNTIES_GEO_URL) + custom fill (getStateTier, getCountyPerCapitaColor). | Provide state/county as GeoJSON (or compatible source); replicate tier/choropleth with MapLibre data-driven styling. |
| **MapSearchBar viewport** | Uses projection + 400/zoom half-extent math to filter churches in view. | Use `map.getBounds()` and filter churches by geographic bounds. |
| **Mobile church-view offset** | [getMobileLatOffset()](../../src/app/components/useChurchMapData.ts) is Albers/viewBox-specific. | Reimplement with MapLibre camera padding or center offset so the church pin stays in the visible area above the panel. |
| **getStateZoom()** | Tuned for Albers; returns values like 3.7, 5.3, 8. | Use `map.fitBounds(stateBbox)` then read zoom, or a MapLibre-zoom lookup table per state. |
| **Config** | No map API key. | **No API key required.** mapcn defaults to free CARTO tiles; optional to use other MapLibre-compatible sources (OSM, MapTiler, etc.). |

---

## Implementation steps (high level)

1. **Branch:** Create and work on a dedicated branch (e.g. `feature/maplibre-migration`).
2. **Dependencies:** Add mapcn (adds `maplibre-gl`): `npx shadcn@latest add @mapcn/map`. Prerequisites: Tailwind + shadcn already in the project. No Mapbox token or env var needed.
3. **Map component:** Introduce a single MapLibre map component using mapcn’s `<Map>` that accepts center, zoom (MapLibre scale), layers data (states, counties, churches), and handlers (onMoveEnd, onChurchClick, etc.). Use `viewport` + `onViewportChange` for controlled mode.
4. **Replace MapCanvas:** In [ChurchMap.tsx](../../src/app/components/ChurchMap.tsx), use the new MapLibre/mapcn component instead of MapCanvas; remove react-simple-maps from the main map path (keep in package.json until migration is verified).
5. **Zoom:** Migrate zoom everywhere—state zoom (fitBounds or table), church-view zoom, zoom controls; replace moveToView with flyTo/easeTo via `useMap()` or ref.
6. **Layers:** Port state/county GeoJSON and styling; port church markers to GeoJSON + circle/symbol layer (or MapClusterLayer) and click/hover behavior.
7. **Viewport search:** Update [MapSearchBar.tsx](../../src/app/components/MapSearchBar.tsx) to use map bounds for “churches in view.”
8. **Mobile offset:** Reimplement pin-above-panel with MapLibre camera (padding or offset).
9. **Cleanup:** Remove or refactor `.map-transitioning` / `.map-zoom-transitioning` in [theme.css](../../src/styles/theme.css) (no longer needed for the map container).
10. **Docs:** Update [ARCHITECTURE.md](../ARCHITECTURE.md) and any README that mention the map stack to say MapLibre + mapcn.

---

## Future countries

When adding support for more countries or regions, use this section to plan. The same MapLibre stack applies; only data and defaults change.

- **Data source:** Where will country/region boundaries and church (or venue) data come from? (e.g. per-country TopoJSON/GeoJSON, existing OSM/Census-style pipeline, or new API.)
- **Bounds and zoom:** Default bounds and default zoom per country or region; any region-specific “fit to region” zoom (e.g. getRegionZoom) equivalent to getStateZoom.
- **Locale and URL:** URL structure (e.g. `/country/:code/...` or `/region/:id/...`); labels and copy; i18n if needed.
- **Placeholder:** _Add country-specific notes and checklists here as you expand._

---

## References

| File | Purpose |
|------|---------|
| [MapCanvas.tsx](../../src/app/components/MapCanvas.tsx) | Current map (react-simple-maps). |
| [useChurchMapData.ts](../../src/app/components/useChurchMapData.ts) | Zoom, center, moveToView, moveToChurchView, getMobileLatOffset. |
| [map-constants.ts](../../src/app/components/map-constants.ts) | GEO_URL, COUNTIES_GEO_URL, getStateZoom, STATE_BOUNDS, state/county colors. |
| [ChurchDots.tsx](../../src/app/components/ChurchDots.tsx) | Church markers and viewport culling. |
| [MapSearchBar.tsx](../../src/app/components/MapSearchBar.tsx) | Viewport filter for “search in view.” |
| [theme.css](../../src/styles/theme.css) | .map-transitioning, .map-zoom-transitioning. |
| [ChurchMap.tsx](../../src/app/components/ChurchMap.tsx) | Map container and detail panel layout. |

---

## Summary

Use **MapLibre + mapcn** instead of Mapbox: same goals (street names when zoomed in, one global-ready map stack, preserved theme and transitions), with **no API key or pricing** — free tiles (CARTO, OSM, etc.) and no usage-based cost. mapcn provides React components (Map, MapControls, markers/GeoJSON/clusters) on top of MapLibre. Migration touches the zoom model, markers, state/county layers, viewport search, and mobile offset; the detail panel and other UI stay as-is. Do the work on a dedicated branch. The **Future countries** section above is the place to fill in data, bounds, and locale when expanding beyond the US.
