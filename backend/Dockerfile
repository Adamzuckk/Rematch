FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    DATABASE_URL=sqlite:////tmp/rematch/rematch.db

WORKDIR /app

RUN groupadd --system --gid 10001 rematch \
    && useradd --system --uid 10001 --gid rematch --home-dir /app rematch \
    && mkdir -p /tmp/rematch \
    && chown rematch:rematch /tmp/rematch

COPY pyproject.toml README.md ./
COPY app ./app
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

RUN pip install --no-cache-dir .

USER rematch
EXPOSE 8000

CMD ["sh", "-c", "python -m alembic upgrade head && rematch-seed && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
