"""Multilingual sentence embeddings (Groq has no embedding API). The model maps Estonian
and English into one vector space, so an English question finds an Estonian passage and
vice versa.

Two engines:
- FastEmbedder runs the model on this server (needs about 650 MB of memory).
- GeminiEmbedder asks Google's Gemini API instead, so the server itself stays small
  enough for free 512 MB hosts such as Render. Used when GEMINI_API_KEY is set."""
import logging
import time
from typing import Protocol

import httpx
import numpy as np

log = logging.getLogger(__name__)


class Embedder(Protocol):
    model_name: str
    dim: int

    def embed_passages(self, texts: list[str]) -> np.ndarray: ...
    def embed_query(self, text: str) -> np.ndarray: ...


def _unit(vecs) -> np.ndarray:
    arr = np.array(list(vecs), dtype=np.float32)
    return arr / np.linalg.norm(arr, axis=1, keepdims=True)


class FastEmbedder:
    def __init__(self, model_name: str, cache_dir: str | None = None):
        from fastembed import TextEmbedding

        self.model_name = model_name
        # one thread and small batches keep the memory peak lower
        self._model = TextEmbedding(model_name=model_name, cache_dir=cache_dir, threads=1)
        self.dim = len(self.embed_query('probe'))

    # query_embed / passage_embed add the prefixes models such as e5 expect
    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return _unit(self._model.passage_embed(texts, batch_size=8))

    def embed_query(self, text: str) -> np.ndarray:
        return _unit(self._model.query_embed([text]))[0]


class EmbeddingError(RuntimeError):
    pass


class GeminiEmbedder:
    """Google Gemini embeddings over HTTPS. Only passage texts (public rule texts) and the
    farmer's question are sent; the key travels in a header, never in the URL."""

    URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents'
    # The free tier counts every text as a request (about 100 a minute), so indexing the
    # ~240 passage views goes in small, paced batches. It happens once: the vectors are
    # kept in the database and only re-made when the rule texts change.
    BATCH = 20
    PER_MINUTE = 60
    RETRY_WAIT = 65  # seconds; a full rate-limit window

    def __init__(self, api_key: str, model: str = 'gemini-embedding-001', dim: int = 768, client: httpx.Client | None = None, pace: bool = True):
        if not api_key:
            raise EmbeddingError('GEMINI_API_KEY is not set.')
        self._key = api_key
        self._model = model
        self.dim = dim
        # the name goes into the index hash, so changing model or size re-indexes
        self.model_name = f'gemini:{model}@{dim}'
        self._client = client or httpx.Client(timeout=30)
        self._pace = pace

    def _embed(self, texts: list[str], task: str) -> np.ndarray:
        out: list[list[float]] = []
        for i in range(0, len(texts), self.BATCH):
            if i and self._pace:
                time.sleep(60 * self.BATCH / self.PER_MINUTE)
            body = {
                'requests': [
                    {'model': f'models/{self._model}', 'content': {'parts': [{'text': t}]}, 'taskType': task, 'outputDimensionality': self.dim}
                    for t in texts[i : i + self.BATCH]
                ]
            }
            out.extend(self._post(body))
        return _unit(out)

    def _post(self, body: dict) -> list[list[float]]:
        for attempt in range(6):
            r = self._client.post(self.URL.format(model=self._model), json=body, headers={'x-goog-api-key': self._key})
            if r.status_code == 429 or r.status_code >= 500:
                wait = self.RETRY_WAIT if self._pace else 0
                log.warning('Gemini embeddings busy (%s); retrying in %ss', r.status_code, wait)
                time.sleep(wait)
                continue
            if r.status_code != 200:
                # the response never contains the key; keep only the reason
                try:
                    reason = r.json().get('error', {}).get('message', '')
                except ValueError:
                    reason = r.text[:200]
                raise EmbeddingError(f'Gemini embeddings failed ({r.status_code}): {reason}')
            return [e['values'] for e in r.json()['embeddings']]
        try:
            reason = r.json().get('error', {}).get('message', '')[:300]
        except ValueError:
            reason = ''
        raise EmbeddingError(f'Gemini embeddings: still rate-limited after retries. {reason}'.strip())

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return self._embed(texts, 'RETRIEVAL_DOCUMENT')

    def embed_query(self, text: str) -> np.ndarray:
        return self._embed([text], 'RETRIEVAL_QUERY')[0]
