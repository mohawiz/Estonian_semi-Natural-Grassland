"""Hybrid retrieval: meaning (vector similarity) ranks the passages, and a keyword
match adds a small boost. Vectors catch paraphrases and cross-language questions;
keywords help with exact terms such as section numbers and Estonian legal words.
(Plain rank fusion let weak keyword overlaps outrank the best semantic match.)"""
from dataclasses import dataclass

from .corpus import Passage, corpus_hash
from .embeddings import Embedder
from .store import Store, VectorRow
from .text import tokens

KEYWORD_BOOST = 0.12


@dataclass
class Hit:
    passage: Passage
    score: float
    similarity: float
    keyword: bool


class Retriever:
    def __init__(self, store: Store, embedder: Embedder, passages: list[Passage], top_k: int = 6, min_similarity: float = 0.3):
        self.store = store
        self.embedder = embedder
        self.passages = {p.id: p for p in passages}
        self.top_k = top_k
        self.min_similarity = min_similarity

    def ensure_index(self) -> bool:
        """Index the corpus if it changed since the last run. Returns True when it re-indexed."""
        passages = list(self.passages.values())
        h = corpus_hash(passages, self.embedder.model_name)
        if self.store.indexed_hash() == h:
            return False
        rows: list[tuple[str, str, str]] = [(p.id, view, text) for p in passages for view, text in p.views().items() if text.strip()]
        vecs = self.embedder.embed_passages([r[2] for r in rows])
        vectors: list[VectorRow] = [(pid, view, vec) for (pid, view, _), vec in zip(rows, vecs)]
        self.store.replace_all(passages, vectors, self.embedder.dim, h)
        return True

    def search(self, query: str) -> list[Hit]:
        qvec = self.embedder.embed_query(query)
        pool = self.top_k * 3
        by_vector = self.store.vector_search(qvec, pool)
        by_text = self.store.text_search(tokens(query), pool)

        sims = dict(by_vector)
        text_rank = {pid: rank for rank, (pid, _) in enumerate(by_text)}
        strong_text = {pid for pid, _ in by_text[:3]}
        hits = []
        for pid in {*sims, *text_rank}:
            if pid not in self.passages:
                continue
            sim = sims.get(pid, 0.0)
            if sim < self.min_similarity and pid not in strong_text:
                continue
            boost = KEYWORD_BOOST / (1 + text_rank[pid]) if pid in text_rank else 0.0
            hits.append(Hit(self.passages[pid], sim + boost, sim, pid in strong_text))
        hits.sort(key=lambda h: -h.score)
        return hits[: self.top_k]
