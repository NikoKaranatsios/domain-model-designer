# Domain model designer

Version **1.0.0 · alpha**. Open `index.html` or `FCP Domain Model.html` in a current browser. The HTML is standalone; it includes the existing FCP model as a starting point and needs no build or backend.

- **+ Class** creates a class. Select a card and choose **Edit class** to rename it, change its description or domain area, or edit its attributes. Choose an existing domain area or type a new name; saving creates the area automatically. Types are grouped into primitives, value types, enumerations, and classes. Types and multiplicities have preset choices and a custom option. Custom multiplicities must use valid UML notation, such as `2..5`.
- Attributes can be added, removed, and reordered, with identifier, unique-key, foreign-key, and description controls. **Delete** is visible beside the class actions and in the edit drawer. Confirmation explains which connections and referring attributes will be removed. Deleting the last class leaves a usable empty model.
- **Connect** lets you select two cards. You can also drag a card’s connection handle onto another card. The drawer sets the relationship type, name, endpoint multiplicities, roles, and association navigation. Composition restricts the whole end to at most one owner. Click a connection or its pencil in the drawer to edit or delete it.
- **View** changes the model name, card width, spacing, attribute visibility, relationship labels, and visible domain areas, including on mobile. When all classes are hidden, **Show all areas** restores them. **Domain areas** creates, renames, describes, and colours areas; deleting an area moves its classes to another area. **Enumerations** defines allowed values for attribute types. View also provides **Import design** and **Start a new model**.
- Drag cards to rearrange them. Dropping on an occupied cell swaps the cards. Escape or interrupted pointer input cancels a drag; a drop beyond the layout's resource limits restores its original position. Zoom, pan, and use **Fit to screen** as needed.
- **Undo / Redo** covers saved model edits, view settings, and card arrangement. Keyboard shortcuts are Ctrl/⌘ Z and Ctrl/⌘ Shift Z. History lasts for the current browser session.
- Save drawer changes with **Save**. **Share design** produces a link containing the model, layout, and current view. The address also updates automatically after saved changes. A `file:` or localhost link needs a shared web address before it can be sent to someone on another computer.
- Unsaved drawer edits are protected when switching or closing the drawer, undoing, or leaving the page. The in-app confirmation lets you keep editing or discard the draft. Export and Share flag unsaved edits; **Review edits** returns to the drawer so you can save them first.

## Export and restore

**Export** shows a model summary, suggested filename, and file size, with preview, download, and copy. It offers three formats:

- **Model JSON · for AI and other tools** (`.model.json`) is a versioned `uml-data-model` graph with explicit `domainAreas`, `classes`, `attributes`, `relationships`, `enumerations`, `valueTypes`, and `primitiveTypes`. It includes descriptions, keys, constraints, roles, navigation, inheritance, and whole/part direction. Multiplicities include notation and numeric bounds; a null upper bound means unbounded. Included Lineage fields are expanded once. `inheritedAttributes` resolves superclass fields recursively, excluding overridden names, with `declaredIn` and `inheritedFrom` recording their origins. Ambiguous inherited definitions appear in `inheritanceConflicts`; referenced types without definitions appear in `unresolvedTypes`.
- **AI brief · Markdown** (`.ai.md`) compiles the same graph into readable class and relationship tables with inherited fields, constraints, type definitions, and short instructions for an AI. Use this for pasting into a chat or documentation; it is substantially smaller than the expanded JSON.
- **Design backup · JSON** (`.design.json`) preserves the exact model, arrangement, routing, and view in the existing `{v:1, model, layout, view}` format. Restore this file using **View → Import design**. Imports are validated before replacing the model and can be undone. Large backups use compact JSON to stay within the 2 MB import limit.

All formats include hidden areas and attributes. Export captures one saved snapshot while its dialog is open; summary attribute counts refer to declared class fields. Give the Model JSON or AI brief directly to an AI with your question or requested changes. There is no gzip or URL decoding step. Restore uses a Design backup or a design link.

## Run and host

For a local preview, serve this directory:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open `http://127.0.0.1:8766/`. For an alpha launch, publish `index.html` and `FCP Domain Model.html` to a static HTTPS host. The root entry preserves both query parameters and design fragments. No API keys, database, build process, or server application are required. The optional web fonts have system-font fallbacks.

The editor focuses on UML data structures: classes, typed attributes, associations, shared aggregation, composition, and inheritance. It follows [UML 2.5.1 notation](https://www.omg.org/spec/UML/2.5.1/PDF) for attribute types, multiplicities, italic abstract classes, navigation arrows, inheritance triangles, and whole-end aggregation/composition diamonds. It does not model operations or behavior. Existing FCP interfaces and dependencies remain readable. PK/FK/unique-key metadata and textual constraints are additional data-model information shown in the drawer.

The repository also includes a verified static container and Compose definition
for Romagnolo. See [deployment instructions](deploy/README.md).

## Implementation

Readable source lives in `src/`, with separate data, styles, codec, editing commands, exports, routing, and focused UI files. See the [source map](src/README.md). A dependency-free Node build generates the standalone HTML and its security hashes. A command works on an independent snapshot; class renames update endpoint, inheritance, foreign-key, and attribute-type references. Confirmed deletion removes connections and typed references, clears foreign-key tags, and cleans constraints on removed attributes. Inheritance/composition cycles and invalid multiplicities are rejected.

Links contain JSON compressed with gzip and encoded as Base64url. Both `?model=...` and `#model=...` are accepted, with the fragment taking precedence; generated links use the fragment. Existing valid links remain compatible. Oversized designs use a Design backup instead of a share link. No backend or browser storage is needed.

Controls share the existing typography, colour tokens, rounded surfaces, focus states, and thin SVG icons. Dialogs use the same heading, backdrop, button, feedback, and overflow patterns. The drawer becomes a bottom sheet on narrow screens; actions wrap, controls expose disabled states, and reduced-motion preferences are respected.

Imports and shared links use the same runtime schema, with type, key, reference, namespace, inheritance, composition, and resource-limit checks. See [SECURITY.md](SECURITY.md) for the security controls and static-host headers.

## Checks

Run the tests with Node.js 22 or newer:

```sh
node scripts/build.cjs --check
node --test tests/*.test.cjs
node scripts/security-policy.cjs
```

The committed HTML permits only its exact inline scripts. After editing `src/`, rebuild before previewing or testing:

```sh
node scripts/build.cjs
```

The build refreshes script hashes automatically. Commit both the readable source and generated HTML; checks reject outdated output.

Tests cover shared-link round trips and validation, hostile or oversized inputs, domain-area visibility and management, empty models, import/export, recursive and multiple inheritance, Markdown escaping, safe export filenames, reference cleanup, UML relationship constraints, interrupted pointer input, security-policy integrity, and preservation of connection geometry during card dragging.
