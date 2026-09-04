FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN groupadd -r ariahub --gid=1000 \
    && useradd -r -g ariahub --uid=1000 --home-dir=/app --shell=/usr/sbin/nologin ariahub

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data && chown -R ariahub:ariahub /app /data

USER ariahub

EXPOSE 8000

HEALTHCHECK NONE

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
