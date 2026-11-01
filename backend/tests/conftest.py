import hashlib
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402
from app.corpus import load_corpus  # noqa: E402
from app.retrieval import Retriever  # noqa: E402
from app.store import MemoryStore  # noqa: E402
from app.text import tokens  # noqa: E402


class HashEmbedder:
    """Deterministic bag-of-stems vectors: no model download, good enough for wiring tests."""

    model_name = 'test-hash'
    dim = 256

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(self.dim, dtype=np.float32)
        for t in tokens(text) or ['empty']:
            v[int(hashlib.md5(t.encode()).hexdigest(), 16) % self.dim] += 1
        return v / np.linalg.norm(v)

    def embed_passages(self, texts):
        return np.stack([self._vec(t) for t in texts])

    def embed_query(self, text):
        return self._vec(text)


class FakeLLM:
    """Streams a scripted answer in small chunks and records what it was sent."""

    model = 'fake-model'

    def __init__(self, answer: str = 'Grazing must start by 31 May [1].', rewrite: str = 'karjatamine rannaniit\ncoastal grazing\nkarjatamine'):
        self.answer, self.rewrite_out = answer, rewrite
        self.calls: list[list[dict]] = []
        self.rewrite_calls: list[list[dict]] = []
        self.error = None

    async def stream(self, messages, *, temperature, top_p, max_tokens):
        self.calls.append(messages)
        if self.error:
            raise self.error
        for i in range(0, len(self.answer), 4):
            yield self.answer[i : i + 4]

    async def complete(self, messages, *, model=None, max_tokens=200):
        self.rewrite_calls.append(messages)
        return self.rewrite_out


@pytest.fixture
def settings():
    return Settings(_env_file=None, groq_api_key='test', database_url='', rate_limit=3)


@pytest.fixture
def retriever(settings):
    r = Retriever(MemoryStore(), HashEmbedder(), load_corpus(settings.corpus_path), top_k=6, min_similarity=0.05)
    r.ensure_index()
    return r
