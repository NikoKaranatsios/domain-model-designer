FROM node:24-alpine AS verify
WORKDIR /app
COPY ["index.html", "model.html", "./"]
COPY scripts ./scripts
COPY tests ./tests
COPY src ./src
RUN node scripts/build.cjs --check && node --test tests/*.test.cjs && node scripts/security-policy.cjs

FROM caddy:2-alpine
RUN setcap -r /usr/bin/caddy
COPY --chmod=0644 deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=verify --chmod=0644 /app/index.html /srv/index.html
COPY --from=verify --chmod=0644 /app/model.html /srv/model.html
ENV XDG_DATA_HOME=/tmp/caddy-data
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
