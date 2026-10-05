# Romagnolo deployment

The designer is a static site. Its image runs the complete Node test suite and
checks script-policy integrity before copying the two HTML entry points into
Caddy. `/model.html` also serves the designer for existing links. Unknown paths
return 404; `/health` reports the web server's health.

The container runs as UID 1000 on port 8080 with a read-only filesystem, dropped
capabilities, bounded memory, and temporary Caddy state. It publishes no host
ports. HTML revalidates on every visit, and response headers protect referrers,
content types, and embedding.

Romagnolo's `codex-ops` control plane manages product `domain-model-designer`,
Compose file `compose.yaml`, service `designer`, and public hostname
`model-designer.romagnolo.eu`. The control plane calls the public deployment
environment `staging`; the container joins `codex_edge` and the shared Caddy
handles HTTPS.

The MCP service is available over SSH as `/usr/local/bin/codex-ops-mcp` and over
authenticated HTTP at `https://mcp.romagnolo.eu/mcp`. Begin with
`portfolio_snapshot`. For updates, sync the product, create an issue-backed task,
record the implementation plan, apply the authorized changes, commit them, run
registered checks, and publish its draft PR. Use `deployment_plan` and
`deployment_apply` for the exact verified commit.

The host's Nginx route forwards HTTP certificate challenges to the existing
Caddy edge and redirects other HTTP requests to HTTPS. Preserve the route when
releasing new versions; update its challenge upstream if Caddy's private
network address changes.

For a rollback, deploy an earlier verified commit through a new task and the
same control-plane workflow. Do not replace unrelated routes or containers.
