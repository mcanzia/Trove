import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { getCountryBounds } from '@/lib/countryBounds'
import MapGL, {
  Source,
  Layer,
  Popup,
  type MapRef,
  type MapLayerMouseEvent,
  type LayerProps,
} from 'react-map-gl/mapbox'
import type { FeatureCollection, Feature, Point } from 'geojson'
import type { AnalysisItem } from '@/types'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

// ── Layer definitions ─────────────────────────────────────────────────────────

const clusterCircleLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  source: 'travel-pins',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'step', ['get', 'point_count'],
      '#10b981',   // emerald-500 for small clusters
      8,  '#059669',  // emerald-600
      20, '#047857',  // emerald-700
    ],
    'circle-radius': ['step', ['get', 'point_count'], 18, 8, 26, 20, 34],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
    'circle-opacity': 0.9,
  },
}

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'travel-pins',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-size': 13,
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
  },
  paint: { 'text-color': '#ffffff' },
}

const pointLayer: LayerProps = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'travel-pins',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
        // hover: lighten the colour
        ['case', ['==', ['get', 'pinType'], 'city_fallback'], '#94a3b8', '#34d399'],
      // normal
      ['case', ['==', ['get', 'pinType'], 'city_fallback'], '#64748b', '#059669'],
    ],
    'circle-radius': [
      'case', ['boolean', ['feature-state', 'hover'], false], 13, 10,
    ],
    'circle-stroke-width': 2.5,
    'circle-stroke-color': '#ffffff',
    'circle-opacity': 1,
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PinProperties {
  itemId: number
  activity: string
  city: string
  country: string
  costLevel: string
  bestFor: string
  platform: string
  url: string
  pinType: string
  label: string
}

interface PopupInfo {
  longitude: number
  latitude: number
  /** All items at this location — usually 1, but can be many for stacked pins */
  items: PinProperties[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface FlyTarget {
  lat: number
  lng: number
  /** Unique key so clicking the same pin twice still triggers the effect */
  key: number
  /** Item that was clicked in the table — shown first in the popup */
  itemId?: number
}

interface TravelMapProps {
  items: AnalysisItem[]
  flyTarget?: FlyTarget | null
  visible?: boolean
  country?: string
}

const MAP_STYLES = [
  { id: 'streets',   label: 'Streets',   url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'outdoors',  label: 'Outdoors',  url: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'dark',      label: 'Dark',      url: 'mapbox://styles/mapbox/dark-v11' },
] as const

type StyleId = typeof MAP_STYLES[number]['id']

export default function TravelMap({ items, flyTarget, visible = true, country }: TravelMapProps) {
  const mapRef       = useRef<MapRef>(null)
  const flyTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredIdRef = useRef<number | null>(null)   // track hovered feature for state cleanup
  const [popup, setPopup]         = useState<PopupInfo | null>(null)
  const [popupPage, setPopupPage] = useState(0)
  const [styleId, setStyleId]     = useState<StyleId>('streets')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [cursor, setCursor]       = useState('auto')

  const activeStyle = MAP_STYLES.find((s) => s.id === styleId)!.url

  // Helper — build all PinProperties for items whose _locations include (lat, lng)
  const propsAtCoords = useCallback((lat: number, lng: number, preferItemId?: number): PinProperties[] => {
    const EPSILON = 0.0002
    const found: PinProperties[] = []
    for (const item of items) {
      const locs = item.item_data._locations as
        | { lat: number; lng: number; label: string; type: string }[]
        | undefined
      if (!locs) continue
      const match = locs.find(
        (l) => Math.abs(l.lat - lat) < EPSILON && Math.abs(l.lng - lng) < EPSILON,
      )
      if (!match) continue
      const d = item.item_data
      found.push({
        itemId: item.id,
        activity:  String(d.activity  ?? ''),
        city:      String(d.city      ?? ''),
        country:   String(d.country   ?? ''),
        costLevel: String(d.cost_level ?? ''),
        bestFor:   String(d.best_for  ?? ''),
        platform:  item.platform,
        url:       item.posts?.url ?? '',
        pinType:   match.type  ?? '',
        label:     match.label ?? '',
      })
    }
    // Put the preferred item first
    if (preferItemId != null) {
      found.sort((a, b) => (a.itemId === preferItemId ? -1 : b.itemId === preferItemId ? 1 : 0))
    }
    return found
  }, [items])

  // Resize canvas when map becomes visible (CSS hidden breaks Mapbox sizing)
  useEffect(() => {
    if (visible && mapLoaded) mapRef.current?.resize()
  }, [visible, mapLoaded])

  // Fit country bounds / pin bounds — skips when a specific flyTarget is active
  useEffect(() => {
    if (!mapLoaded) return
    if (flyTarget) return
    const map = mapRef.current
    if (!map) return

    if (country) {
      const bbox = getCountryBounds(country)
      if (bbox) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, duration: 800 })
        return
      }
    }

    const coords: [number, number][] = []
    for (const item of items) {
      const locs = item.item_data._locations as { lat: number; lng: number }[] | undefined
      if (!locs) continue
      for (const loc of locs) {
        if (loc.lat && loc.lng) coords.push([loc.lng, loc.lat])
      }
    }
    if (coords.length === 0) return
    if (coords.length === 1) { map.flyTo({ center: coords[0], zoom: 12, duration: 800 }); return }
    const lngs = coords.map((c) => c[0])
    const lats  = coords.map((c) => c[1])
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, maxZoom: 13, duration: 800 },
    )
  }, [items, country, flyTarget, mapLoaded])

  // Fly to a specific pin from the table.
  // Uses a timeout instead of map.once('moveend') — moveend fires for ANY map
  // movement and would silently consume the listener before the popup fires.
  useEffect(() => {
    if (!flyTarget || !mapLoaded) return
    const map = mapRef.current
    if (!map) return

    if (flyTimer.current) clearTimeout(flyTimer.current)
    setPopup(null)

    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: 15, duration: 900 })

    flyTimer.current = setTimeout(() => {
      const pinItems = propsAtCoords(flyTarget.lat, flyTarget.lng, flyTarget.itemId)
      if (pinItems.length > 0) {
        setPopupPage(0)
        setPopup({ longitude: flyTarget.lng, latitude: flyTarget.lat, items: pinItems })
      }
    }, 1000)   // slightly longer than flyTo duration (900 ms)

    return () => { if (flyTimer.current) clearTimeout(flyTimer.current) }
  }, [flyTarget, mapLoaded, propsAtCoords])

  // Build GeoJSON from items — one Feature per pin
  const geojson = useMemo<FeatureCollection<Point, PinProperties>>(() => {
    const features: Feature<Point, PinProperties>[] = []
    for (const item of items) {
      const locs = item.item_data._locations as
        | { lat: number; lng: number; label: string; type: string }[]
        | undefined
      if (!locs) continue

      const d = item.item_data
      for (const loc of locs) {
        if (!loc.lat || !loc.lng) continue
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
          properties: {
            itemId: item.id,
            activity: String(d.activity ?? ''),
            city: String(d.city ?? ''),
            country: String(d.country ?? ''),
            costLevel: String(d.cost_level ?? ''),
            bestFor: String(d.best_for ?? ''),
            platform: item.platform,
            url: item.posts?.url ?? '',
            pinType: loc.type ?? '',
            label: loc.label,
          },
        })
      }
    }
    return { type: 'FeatureCollection', features }
  }, [items])

  // Click on a cluster → zoom in
  const onClusterClick = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current
    if (!map || !e.features?.length) return
    const feature = e.features[0]
    const clusterId = feature.properties?.cluster_id as number
    const source = map.getSource('travel-pins') as mapboxgl.GeoJSONSource
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || zoom == null) return
      const coords = (feature.geometry as Point).coordinates as [number, number]
      map.easeTo({ center: coords, zoom, duration: 400 })
    })
  }, [])

  // Click on an individual point → show popup (all items at that location)
  const onPointClick = useCallback((e: MapLayerMouseEvent) => {
    if (!e.features?.length) return
    const f     = e.features[0]
    const coords = (f.geometry as Point).coordinates as [number, number]
    const [lng, lat] = coords

    // queryRenderedFeatures with a small bbox catches stacked/nearby pins that
    // the single-feature e.features would miss
    const map = mapRef.current
    const nearby = map
      ? map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: ['unclustered-point'] },
        )
      : e.features

    // Deduplicate by itemId
    const seen = new Set<number>()
    const pinItems: PinProperties[] = []
    for (const feat of nearby) {
      const p = feat.properties as PinProperties
      if (!seen.has(p.itemId)) { seen.add(p.itemId); pinItems.push(p) }
    }

    setPopupPage(0)
    setPopup({ longitude: lng, latitude: lat, items: pinItems.length ? pinItems : [f.properties as PinProperties] })
  }, [])

  // Hover: update cursor + feature-state so the circle brightens
  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current
    if (!map) return
    const features = e.features ?? []
    const overInteractive =
      features.some((f) => f.layer?.id === 'unclustered-point' || f.layer?.id === 'clusters')

    setCursor(overInteractive ? 'pointer' : 'auto')

    const pointFeat = features.find((f) => f.layer?.id === 'unclustered-point')
    const newId = pointFeat?.id != null ? (pointFeat.id as number) : null

    if (hoveredIdRef.current !== null && hoveredIdRef.current !== newId) {
      map.setFeatureState({ source: 'travel-pins', id: hoveredIdRef.current }, { hover: false })
    }
    if (newId !== null && newId !== hoveredIdRef.current) {
      map.setFeatureState({ source: 'travel-pins', id: newId }, { hover: true })
    }
    hoveredIdRef.current = newId
  }, [])

  const onMouseLeave = useCallback(() => {
    const map = mapRef.current
    if (hoveredIdRef.current !== null) {
      map?.setFeatureState({ source: 'travel-pins', id: hoveredIdRef.current }, { hover: false })
      hoveredIdRef.current = null
    }
    setCursor('auto')
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-muted/30 text-muted-foreground text-sm">
        Add <code className="mx-1 px-1.5 py-0.5 bg-muted rounded text-xs">VITE_MAPBOX_TOKEN</code> to .env.local to enable the map.
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 560 }}>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: 130, latitude: 30, zoom: 2.5 }}
        mapStyle={activeStyle}
        interactiveLayerIds={['clusters', 'unclustered-point']}
        onLoad={() => setMapLoaded(true)}
        onClick={(e) => {
          const features = e.features ?? []
          if (features[0]?.layer?.id === 'clusters') onClusterClick(e)
          else if (features[0]?.layer?.id === 'unclustered-point') onPointClick(e)
          else setPopup(null)
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        cursor={cursor}
      >
        <Source
          id="travel-pins"
          type="geojson"
          data={geojson}
          generateId   // auto-assigns feature IDs needed for setFeatureState hover
          cluster
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer {...clusterCircleLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...pointLayer} />
        </Source>

        {popup && (() => {
          const p = popup.items[popupPage] ?? popup.items[0]
          const total = popup.items.length
          return (
            <Popup
              longitude={popup.longitude}
              latitude={popup.latitude}
              anchor="bottom"
              offset={14}
              closeButton={false}
              onClose={() => setPopup(null)}
              maxWidth="300px"
            >
              <div className="relative text-sm p-1" style={{ minWidth: 220 }}>
                {/* Close button — absolutely positioned so it never adds height */}
                <button
                  onClick={() => setPopup(null)}
                  className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs leading-none"
                  aria-label="Close"
                >✕</button>

                {/* Pager — only rendered for multi-item pins */}
                {total > 1 && (
                  <div className="flex items-center gap-1 mb-2 pr-6">
                    <button
                      onClick={() => setPopupPage((n) => Math.max(0, n - 1))}
                      disabled={popupPage === 0}
                      className="px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >‹</button>
                    <span className="text-xs text-muted-foreground">
                      {popupPage + 1} / {total}
                    </span>
                    <button
                      onClick={() => setPopupPage((n) => Math.min(total - 1, n + 1))}
                      disabled={popupPage === total - 1}
                      className="px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >›</button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="font-semibold leading-snug text-foreground">{p.activity}</p>
                  <p className="text-xs text-muted-foreground">📍 {p.city}, {p.country}</p>
                  {p.costLevel && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Cost: </span>{p.costLevel}
                    </p>
                  )}
                  {p.bestFor && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Best for: </span>{p.bestFor}
                    </p>
                  )}
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 hover:underline block pt-0.5"
                    >
                      {p.platform === 'reddit' ? 'Reddit →' : 'Instagram →'}
                    </a>
                  )}
                  {p.pinType === 'city_fallback' && (
                    <p className="text-xs text-muted-foreground italic pt-0.5">
                      City-level pin · no specific venue found
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          )
        })()}
      </MapGL>

      {/* Legend */}
      <div className="absolute bottom-8 left-3 flex flex-col gap-1.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-lg px-3 py-2 shadow text-xs pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" />
          Specific place
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />
          City fallback
        </div>
      </div>

      {/* Style picker */}
      <div className="absolute bottom-8 right-3 flex gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-lg p-1 shadow">
        {MAP_STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyleId(s.id)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              styleId === s.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
