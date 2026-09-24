FROM python:3.12-slim

WORKDIR /app

COPY services/elo/pyproject.toml services/elo/README.md ./
COPY services/elo/src ./src

# The tracking extra is installed here because this image also runs the tracking server itself,
# and because `run` and `sweep` log to it. The pipeline image installs the package without the
# extra, because the weekly run only publishes.
RUN pip install --no-cache-dir ".[tracking]"

ENTRYPOINT ["ohfootball-elo"]
CMD ["run"]
