FROM python:3.12-slim

ARG DBT_CORE_VERSION=1.12.0
ARG DBT_POSTGRES_VERSION=1.11.0

RUN apt-get update \
    && apt-get install --yes --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir \
        "dbt-core==${DBT_CORE_VERSION}" \
        "dbt-postgres==${DBT_POSTGRES_VERSION}"

WORKDIR /usr/app

ENTRYPOINT ["dbt"]
