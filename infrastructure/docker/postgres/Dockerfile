FROM postgres:17-bookworm

RUN apt-get update \
    && apt-get install --yes --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*

