# RAG backend. Build from the repository root (it needs src/data/documents.json):
#   docker build -f backend/Dockerfile -t grassland-api .
#   docker run --rm -p 8000:8000 --env-file backend/.env grassland-api
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    EMBED_CACHE_DIR=/srv/models \
    HF_HUB_DISABLE_SYMLINKS_WARNING=1

WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# Bake the embedding model into the image so start-up needs no download.
ARG EMBED_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV EMBED_MODEL=$EMBED_MODEL
RUN python -c "import os; from fastembed import TextEmbedding; TextEmbedding(os.environ['EMBED_MODEL'], cache_dir=os.environ['EMBED_CACHE_DIR'])"

COPY src/data/documents.json src/data/documents.json
COPY backend/app backend/app

WORKDIR /srv/backend
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT', '8000') + '/api/health')" || exit 1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
