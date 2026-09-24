# pi-web-diagrams-plugin

Diagrams plugin for PI WEB (plugin **apiVersion 4**):

- **contentRenderer** for ```drawio``` fences and .drawio files — renders
  in chat and the Files preview inside a sandboxed iframe running the
  official viewer-static build (renderMode: automatic)
- **workspace panel** listing diagrams/*.mmd (mermaid@11) and
  diagrams/*.drawio, live-polling every 4s

Mermaid chat fences are covered by the bundled mermaid plugin; the
panel renders them with the vendored mermaid@11.



Diagrams workspace panel for PI WEB: renders `diagrams/*.mmd` (mermaid) and
`diagrams/*.drawio` (draw.io viewer) from the current workspace, live-polling
every 4s.

Why a panel and not inline chat rendering: the PI WEB plugin API exposes
workspace panels, not transcript markdown hooks — see pi-web docs
`docs/plugins.md` (Workspace panels, Reading/Listing workspace files).

## Usage

Ask the agent to write `diagrams/<name>.mmd` or `diagrams/<name>.drawio`
in the workspace; open the **Diagrams** tab in the workspace side panel.

## Install

```bash
mkdir -p ~/.pi-web/plugins
ln -sfn ~/projects/pi-etc/pi-web-plugins/diagrams ~/.pi-web/plugins/diagrams
```

Then reload the PI WEB browser tab (browser-only plugin — no daemon restart).

## Vendor

- `vendor/mermaid.min.js` — mermaid@11 self-contained IIFE build (npm `mermaid`).
- `vendor/viewer-static.min.js` — official drawio viewer build, same as blog embeds (source: jgraph/drawio `src/main/webapp/js/viewer-static.min.js`); replaces older
  `src/main/webapp/js/viewer.min.js`), exposes `GraphViewer`.

Mermaid runs with `securityLevel: "loose"` — htmlLabels for `<br/>` labels;
diagram content is agent-authored, not internet input.

## Drawio viewer zoom

Ctrl/Cmd + mouse wheel = zoom (pointer-anchored); plain wheel scrolls the
panel. Zoom state is remembered per file, so agent edits that re-render the
diagram keep your view.

## Viewer config notes (from GraphViewer.js source, src/main/webapp/js/diagramly/)

- no native wheel handling in GraphViewer — the plugin's Ctrl/Cmd+wheel zoom is the only wheel zoom
- `auto-fit` fits the diagram to the container on load; `responsive` scales to panel width
- DO NOT set `toolbar-position: inline`: in that mode GraphViewer fades the toolbar to 30% opacity until hover (GraphViewer.js ~line 1444). Default overlay mode keeps it solid, pinned above the diagram
- `edit: _blank` adds an edit button opening the diagram in app.diagrams.net
- click the diagram = fullscreen lightbox (native zoom UI there)

## Toolbar visibility root cause (GraphViewer.js)

Default mode keeps the toolbar OUT of the DOM until mouseenter on the
diagram and removes it on mouseleave — headless renders and casual looks
show nothing. `toolbar-position: inline` fades it to 30%. The fix is
`toolbar-nohide: true`: enter() runs immediately, toolbar is appended to
the container once, solid, no hover listeners. Verified headless.
