FROM python:3.12-slim

WORKDIR /app

COPY services/elo/pyproject.toml services/elo/README.md ./
COPY services/elo/src ./src

RUN pip install --no-cache-dir .

ENTRYPOINT ["ohfootball-elo"]
CMD ["run"]
