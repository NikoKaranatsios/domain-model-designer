FROM golang:1.27.3-alpine AS caddy-build
ENV GOMAXPROCS=2
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch v2.11.7 https://github.com/caddyserver/caddy.git . && test "$(git rev-parse HEAD)" = "72dd0fb067f6d7826c7f79907670ba4a713bfe37"
RUN go get golang.org/x/net@v0.60.0 && CGO_ENABLED=0 go build -trimpath -o /tmp/caddy ./cmd/caddy

FROM node:24.22.1-alpine AS verify
WORKDIR /app
COPY ["index.html", "model.html", "./"]
COPY scripts ./scripts
COPY tests ./tests
COPY src ./src
RUN node scripts/build.cjs --check && node --test tests/*.test.cjs && node scripts/security-policy.cjs

FROM caddy:2.11.7-alpine
RUN apk upgrade --no-cache
COPY --from=caddy-build /tmp/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=verify /app/index.html /srv/index.html
COPY --from=verify /app/model.html /srv/model.html
# COPY inherits checkout modes; normalize before switching to the non-root user.
RUN chmod 0644 /etc/caddy/Caddyfile /srv/index.html /srv/model.html
ENV XDG_DATA_HOME=/tmp/caddy-data
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
