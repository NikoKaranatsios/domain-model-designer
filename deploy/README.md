# Romagnolo deployment

The designer is a static site. Its image runs the complete Node test suite and
checks script-policy integrity before copying the two HTML entry points into
Caddy. Runtime files receive explicit read permissions during the build so
restrictive checkout permissions cannot prevent the non-root server from reading
its configuration or HTML. A `RUN chmod` step supports the host Docker builder
without requiring BuildKit copy flags. `/model.html` serves the standalone
designer. Unknown paths
return 404; `/health` reports the web server's health.

The container runs as UID 1000 on port 8080 with a read-only filesystem, dropped
capabilities, bounded memory, and temporary Caddy state. It publishes no host
ports. Its default network is internal; the hosting override connects the
designer to the HTTPS edge. HTML revalidates on every visit, and response headers protect referrers,
content types, and embedding.

Romagnolo's `codex-ops` control plane manages product `domain-model-designer`,
Compose file `compose.yaml` and service `designer`. Its protected development
hostname is `model-designer-dev.romagnolo.eu`, called `staging` by the MCP.
`model-designer.romagnolo.eu` is the public production hostname. The container
joins `codex_edge`, and the shared Caddy handles HTTPS and development access.
Preserve the registered authentication policy. Public rollout requires explicit
product enablement, a merged default-branch release, and production support in
the control plane; a successful development deployment does not update the
public site.

The MCP service is available over SSH as `/usr/local/bin/codex-ops-mcp` and over
authenticated HTTP at `https://mcp.romagnolo.eu/mcp`. Begin with
`portfolio_snapshot`. For updates, sync the product, create an issue-backed task,
record and approve the implementation plan, apply the authorized changes, commit them, run
registered checks, and publish its draft PR. Use `deployment_plan` and
`deployment_apply` for the exact verified commit.

The host's Nginx route in `nginx-http.conf` forwards HTTP certificate challenges
to the existing Caddy edge and redirects other HTTP requests to HTTPS. It is
installed as `/etc/nginx/sites-available/domain-model-designer-redirect`.
Preserve the route when releasing new versions; update its challenge upstream
if Caddy's private network address changes. The managed deployment records the exact shipped commit.

For a rollback, deploy only a verified product-only release through a new task
and the same control-plane workflow. Check its default model and container
contents before publishing; private design exports belong outside the source
tree. Do not replace unrelated routes or containers.
