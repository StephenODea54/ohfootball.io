FROM python:3.12-slim

WORKDIR /app

COPY services/predictor/pyproject.toml services/predictor/README.md ./
COPY services/predictor/src ./src

RUN pip install --no-cache-dir .

ENTRYPOINT ["ohfootball-elo"]
CMD ["run"]
