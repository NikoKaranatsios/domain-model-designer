# Security and validation

The application is a static, local editor. It has no accounts, API credentials, database, analytics, or model-upload endpoint. Models are stored in the address and explicit downloads; sharing a link shares the complete model.

The shipped task-board example and test fixtures are fictional. Keep private designs outside the source tree. Standard exported designs, compiled models, AI briefs, and saved share-link files are excluded from Git and container builds. Encoded links contain the complete model and are not encrypted. Generated links use the URL fragment; legacy query links may appear in web-server request logs.

Imported files and decoded URLs pass the same runtime schema before replacing the current design. Validation checks field types and keys, unique type names, references, inheritance and composition cycles, ownership multiplicity, and layout consistency. Failed imports leave the current model intact. JSON and decompressed links are limited to 2 MB; encoded links are limited to 500,000 characters on both creation and decoding. Large backups use compact JSON so they remain restorable. Router allocations and saved-path complexity also have explicit limits. Invalid card drops are rolled back before routing.

Model text is escaped in HTML and SVG, and exports preserve it as data. Object-member names cannot be mistaken for enumeration notes. Hash-based Content Security Policy permits the committed scripts and blocks inline event attributes, unexpected scripts, frames, and application network requests. The optional Google Fonts stylesheet and fonts are permitted. The referrer policy is `no-referrer`, including for legacy query-based links. [MDN documents these CSP controls](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

After editing `src/`, run `node scripts/build.cjs`; it refreshes script hashes automatically and escapes script-closing text in the default model. Checks reject stale generated HTML and script hashes. The distributed HTML already contains the policy, so end users need no build step.

For hosting, set `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. If embedding is unnecessary, also serve `Content-Security-Policy: frame-ancestors 'none'` as an HTTP response header. That directive cannot be enforced by the HTML meta policy. [MDN explains CSP delivery and embedding protection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

Checks cover malformed schemas, invalid relationship graphs, decompression limits, routing limits, script-policy integrity, and pointer rollback. Chrome smoke checks cover escaped hostile-looking text, static-root redirects, invalid-link recovery, editing, exports, and responsive layouts. This pass is not a third-party penetration test.
