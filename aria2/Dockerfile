FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       aria2 \
       ca-certificates \
       netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r aria2 --gid=1000 \
    && useradd -r -g aria2 --uid=1000 --home-dir=/config --shell=/usr/sbin/nologin aria2 \
    && mkdir -p /downloads /config \
    && chown -R aria2:aria2 /downloads /config

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER aria2

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
