# Source map

Edit the files here, then run `node scripts/build.cjs` from the repository root.
The build produces `index.html` and `model.html`, including their exact
script security hashes. Both generated files stay committed and work without a
build tool, server application, or external JavaScript dependencies.

| Source | Responsibility |
| --- | --- |
| `template.html`, `index.html` | Designer markup and the root redirect |
| `styles/` | Base styles, canvas and controls, editor and responsive styles |
| `default-model.json`, `default-layout.json` | Readable starting model and saved arrangement |
| `design-url.js` | Model validation, limits, compression and shared links |
| `model-editor.js` | Validated editing commands and reference cleanup |
| `model-export.js` | Compiled model JSON, AI Markdown, and design backups |
| `orthogonal-router.js`, `wire-preview.js` | Connection routing and stable drag previews |
| `app.js` | Ordered UI assembly and its private asynchronous scope |
| `ui/state.js`, `ui/boot.js` | Model state, indexes, layout and startup |
| `ui/cards.js`, `ui/zones.js`, `ui/routing.js`, `ui/wires.js` | Canvas rendering |
| `ui/highlight.js`, `ui/viewport.js`, `ui/pointers.js` | Focus, zoom, pan and dragging |
| `ui/details.js`, `ui/search.js` | Selection details, search and domain filters |
| `ui/sharing.js`, `ui/exports.js` | Share and export dialogs |
| `ui/editor/` | History, class and relationship forms, settings, connections and form events |

The UI files share the private scope defined in `app.js`; its source markers
make their assembly order explicit. The build inlines these sources rather
than loading browser modules, preserving direct-file opening and portable
standalone HTML. The codec, editing commands, exporter and routing helpers
remain independent of the DOM.

Check generated files with `node scripts/build.cjs --check`, and run
`node --test tests/*.test.cjs` before committing source and generated output.
`.prettierrc.json` defines the source formatting conventions.
