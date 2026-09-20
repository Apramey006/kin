# Memory Atlas

Open `/graph` to explore the configured family's data. The stage header links
directly to it. Open `/graph?demo=1` for an explicitly labeled, read-only sample
story that works without Supabase or provider credentials. The preview never
writes data or silently replaces a failed live connection.

## Explore

- Select people, traditions, objects, places or events to inspect their sources
  and connected relationships. Select a relationship label to see its direction
  and evidence.
- Select a contribution in the left-hand thread to illuminate the entities and
  relationships supported by that particular memory.
- Switch to **Memory trails** to show contributions as nodes, with dashed links
  to the entities they support. Solid directed links represent family relationships.
- Search entity labels, use the type legend to highlight a category, zoom, pan,
  fit the graph, or use fullscreen for the projector.
- **Watch it grow** replays contributions chronologically. The slider steps
  through memories; **Return to present** restores the current graph. Only
  relationships backed by the memories available at each step are revealed.
- Tab to graph entities and press Enter or Space to inspect them; Escape clears
  selection. The layout adapts to phones and honors reduced-motion preferences.

## Data and provenance

The explorer reads existing `graph_nodes`, `graph_edges`, `memories`, `relatives`
and `provenance` contracts. Queries use the configured `FAMILY_ID`; provenance
is scoped to the returned memory IDs. Pagination avoids silently truncating
larger families. No new schema, dependencies, generated identity, or relationships
are introduced.

Graph node/edge and Weaver realtime events trigger a refresh, with a five-second
poll while the tab is visible to cover memories/provenance not currently published
to Supabase Realtime. Errors preserve the last successful snapshot and display a
retry option. This view uses the existing browser Supabase client and inherits
its access policies; shared auth/RLS changes still belong to the auth workstream.

An edge-only provenance record also links that memory to both endpoint entities.
Unsupported entities remain visible at the present-day position, but the details
panel explicitly states when no recorded source exists. Historical playback never
uses a node's creation date to invent a memory source. Transcripts are displayed
as quotations; generated summaries are labeled as summaries.

The graph uses the existing React Flow dependency, a deterministic layout, and
custom SVG paths and node components. Layout positions are calculated from the
complete snapshot so timeline playback does not reshuffle existing nodes. Entity
positions adapt to the canvas orientation. Very large graphs remain zoomable;
the pairwise layout pass is skipped beyond 200 total entity and memory nodes.

## Checks

`npm test -- tests/memory-graph.test.ts` checks provenance projection, temporal
visibility, Weaver gap completion, dangling records, ordering and deterministic
layout. `npx playwright test e2e/memory-atlas.spec.ts` checks inspection, trails,
playback, keyboard controls, phone overflow and connection failures. Desktop and
mobile screenshots are written under the ignored `test-results/` directory.
