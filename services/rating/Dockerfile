FROM python:3.12-slim

WORKDIR /app

COPY services/rating/pyproject.toml services/rating/README.md ./
COPY services/rating/src ./src

RUN pip install --no-cache-dir .

ENTRYPOINT ["ohfootball-rating"]
CMD ["--help"]
