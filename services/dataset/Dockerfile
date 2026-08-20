FROM python:3.12-slim

WORKDIR /app

COPY services/dataset/pyproject.toml services/dataset/README.md ./
COPY services/dataset/src ./src

RUN pip install --no-cache-dir .

ENTRYPOINT ["ohfootball-dataset"]
CMD ["publish"]
