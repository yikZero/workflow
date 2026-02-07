# TraceViewer Architecture

## Component Tree

```
trace-viewer/index.tsx (public exports)
│
├── trace-viewer.tsx
│   ├── TraceViewer          – Full component (timeline + panel)
│   ├── TraceViewerPanel     – Standalone panel mode
│   └── TraceViewerProvider  – Context-only wrapper
│
│   └── TraceViewerTimeline (core rendering logic)
│       │
│       ├── SearchBar              ← components/search.tsx
│       │   └── SearchInput        ← components/search-input.tsx
│       │   (hidden if ≤10 spans or highlighted spans present)
│       │
│       ├── MiniMap                ← components/map.tsx
│       │   (canvas-based overview of all spans)
│       │
│       ├── Timeline (scrollable area)
│       │   ├── Markers            ← components/markers.tsx
│       │   │   (time axis tick marks)
│       │   ├── EventMarkers       ← components/markers.tsx
│       │   │   (vertical event lines)
│       │   ├── CursorMarker       ← components/markers.tsx
│       │   │   (hover crosshair + timestamp)
│       │   └── SpanNodes          ← components/node.tsx
│       │       (each span bar, memoized, CSS positioned)
│       │
│       ├── ZoomButton             ← components/zoom-button.tsx
│       │   └── zoom-icons.tsx     (SVG icons)
│       │
│       └── SpanDetailPanel        ← components/span-detail-panel.tsx
│           (resizable side panel, shows attributes/events/quick links)
│           (only rendered when withPanel=true)
```

## State & Data Layer

```
context.tsx
├── TraceViewerContextProvider   React context + useReducer
├── useTraceViewer()             Consumer hook
├── TraceViewerState             root, spanMap, scale, selected, filter, etc.
└── TraceViewerAction            setRoot, select, zoom, filter, etc.

types.ts
├── Span, SpanEvent              Raw OTEL span data
├── Trace, Resource              Input data shape
├── RootNode, SpanNode           Tree nodes after parsing
├── VisibleSpan, VisibleSpanEvent  Positioned for rendering
├── ScrollSnapshot               Scroll position state
└── QuickLink, GetQuickLinks     Extensible panel links
```

## Utilities (`util/`)

| File                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `tree.ts`               | Parse raw `Trace` → `RootNode`/`SpanNode` tree       |
| `use-streaming-spans.ts`| Tree → positioned rows, filtering, web worker bridge |
| `constants.ts`          | `ROW_HEIGHT`, `MARKER_HEIGHT`, `TIMELINE_PADDING`    |
| `timing.ts`             | Time formatting helpers                              |
| `scrollbar-width.ts`    | Detect OS scrollbar width                            |
| `use-immediate-style.ts`| Direct DOM style mutations for performance           |
| `use-trackpad-zoom.tsx` | Pinch-to-zoom gesture handler                        |

## Web Worker

`worker.ts` runs span position calculation and filtering off the main thread to keep timeline rendering smooth during zoom/scroll.

## Styling

`trace-viewer.module.css` — all visual styling via CSS Modules with `--ds-*` Geist design tokens. Dark mode handled via `:global(.dark-theme)`. Span colors are assigned per resource type.

## Data Flow

```
Trace (raw OTEL data)
  │
  ▼
parseTrace()                    [util/tree.ts]
  │  Builds parent→child tree, computes depths & durations
  ▼
dispatch('setRoot')             [context.tsx]
  │
  ▼
useStreamingSpans()             [util/use-streaming-spans.ts]
  │  Posts to Web Worker → worker.ts calculates row positions
  │  Returns: rows[], spans[], events[], scale
  ▼
TraceViewerTimeline renders:
  ├── Markers       (time axis)
  ├── SpanNodes     (positioned span bars)
  ├── EventMarkers  (vertical event lines)
  ├── CursorMarker  (hover interaction)
  ├── MiniMap       (canvas overview)
  └── SpanDetailPanel (selected span info)
```

## Key Design Decisions

- **Web Worker** (`worker.ts`) — expensive span positioning/filtering runs off the main thread so zoom and scroll stay responsive.
- **CSS Modules** — self-contained styling with no Tailwind dependency for the core trace viewer.
- **Context + useReducer** — single source of truth for zoom level, selection, scroll position, and filtering.
- **`useImmediateStyle`** — bypasses React re-renders for high-frequency updates (cursor position, scroll) by writing directly to DOM style properties.
- **Memoization** via `MemoCacheKey` objects — SpanNodes only re-render when their cache key reference changes.
