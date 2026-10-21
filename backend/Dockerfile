# Pinned to the verified multi-architecture OCI index for python:3.12-slim.
FROM python:3.12-slim@sha256:cb33f7f771ecec2ef1225cf39b159591a040391bd73e4c01f00fdfc4c47611d2

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    DATABASE_URL=sqlite:////tmp/rematch/rematch.db

WORKDIR /app

RUN groupadd --system --gid 10001 rematch \
    && useradd --system --uid 10001 --gid rematch --home-dir /app rematch \
    && mkdir -p /tmp/rematch \
    && chown rematch:rematch /tmp/rematch

COPY requirements.txt ./

# requirements.txt is generated from uv.lock and contains hashes for every
# production dependency. Do not replace this with an unpinned `pip install .`.
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.txt

COPY app ./app
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

USER rematch
EXPOSE 8000

CMD ["sh", "-c", "python -m alembic upgrade head && python -m app.services.seed && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
