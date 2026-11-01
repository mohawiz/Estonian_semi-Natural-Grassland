"""Multilingual sentence embeddings, computed locally (Groq has no embedding API).
The model maps Estonian and English into one vector space, so an English question
finds an Estonian passage and vice versa."""
from typing import Protocol

import numpy as np


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
        self._model = TextEmbedding(model_name=model_name, cache_dir=cache_dir)
        self.dim = len(self.embed_query('probe'))

    # query_embed / passage_embed add the prefixes models such as e5 expect
    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return _unit(self._model.passage_embed(texts))

    def embed_query(self, text: str) -> np.ndarray:
        return _unit(self._model.query_embed([text]))[0]
