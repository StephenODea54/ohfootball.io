FROM python:3.12-slim

WORKDIR /app

COPY services/rating/pyproject.toml services/rating/README.md ./
COPY services/rating/src ./src

# The tracking extra is installed here because this image also runs the tracking server itself,
# and because `run` and `sweep` log to it. The pipeline image installs the package without the
# extra, because the weekly run only publishes.
RUN pip install --no-cache-dir ".[tracking]"

ENTRYPOINT ["ohfootball-rating"]
CMD ["run"]
