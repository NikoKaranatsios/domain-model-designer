FROM node:24-alpine AS verify
WORKDIR /app
COPY ["index.html", "FCP Domain Model.html", "./"]
COPY scripts ./scripts
COPY tests ./tests
RUN node --test tests/*.test.cjs && node scripts/security-policy.cjs

FROM caddy:2-alpine
RUN setcap -r /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=verify /app/index.html /srv/index.html
COPY --from=verify ["/app/FCP Domain Model.html", "/srv/FCP Domain Model.html"]
COPY --from=verify ["/app/FCP Domain Model.html", "/srv/model.html"]
ENV XDG_DATA_HOME=/tmp/caddy-data
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
