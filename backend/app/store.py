"""Where passages and their vectors live. PgStore (Postgres + pgvector) is the real one;
MemoryStore keeps the same behaviour in process for tests and quick local tries."""
from typing import Protocol

import numpy as np

from .corpus import Passage
from .text import index_text

VectorRow = tuple[str, str, np.ndarray]  # passage id, view name, unit vector


class Store(Protocol):
    def indexed_hash(self) -> str | None: ...
    def replace_all(self, passages: list[Passage], vectors: list[VectorRow], dim: int, corpus_hash: str) -> None: ...
    def vector_search(self, query: np.ndarray, k: int) -> list[tuple[str, float]]: ...
    def text_search(self, query_tokens: list[str], k: int) -> list[tuple[str, float]]: ...
    def count(self) -> int: ...
    def close(self) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self._hash: str | None = None
        self._ids: list[str] = []
        self._views: list[str] = []
        self._matrix = np.zeros((0, 1), dtype=np.float32)
        self._terms: dict[str, set[str]] = {}

    def indexed_hash(self) -> str | None:
        return self._hash

    def replace_all(self, passages, vectors, dim, corpus_hash):
        self._ids = [r[0] for r in vectors]
        self._views = [r[1] for r in vectors]
        self._matrix = np.stack([r[2] for r in vectors]) if vectors else np.zeros((0, dim), dtype=np.float32)
        self._terms = {p.id: set(index_text(p.search_text()).split()) for p in passages}
        self._hash = corpus_hash

    def vector_search(self, query, k):
        if not len(self._ids):
            return []
        sims = self._matrix @ query
        best: dict[str, float] = {}
        for pid, s in zip(self._ids, sims):
            best[pid] = max(best.get(pid, -1.0), float(s))
        return sorted(best.items(), key=lambda x: -x[1])[:k]

    def text_search(self, query_tokens, k):
        q = set(query_tokens)
        if not q:
            return []
        scored = [(pid, len(q & terms) / len(q)) for pid, terms in self._terms.items()]
        return sorted([s for s in scored if s[1] > 0], key=lambda x: -x[1])[:k]

    def count(self):
        return len(self._terms)

    def close(self):
        pass


class PgStore:
    """Postgres + pgvector. Tables: passages (with a tsvector for keyword search),
    passage_vectors (one row per passage view, cosine HNSW index) and rag_meta."""

    def __init__(self, url: str):
        import psycopg
        from pgvector.psycopg import register_vector
        from psycopg_pool import ConnectionPool

        # the extension must exist before connections register the vector type
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute('CREATE EXTENSION IF NOT EXISTS vector')
        self.pool = ConnectionPool(url, min_size=1, max_size=4, configure=register_vector, open=True)
        with self.pool.connection() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS rag_meta (key text PRIMARY KEY, value text NOT NULL)')
            conn.execute(
                'CREATE TABLE IF NOT EXISTS passages ('
                ' id text PRIMARY KEY, doc_id text NOT NULL, section text NOT NULL, lang text NOT NULL,'
                ' body text NOT NULL, search tsvector NOT NULL)'
            )
            conn.execute('CREATE INDEX IF NOT EXISTS passages_search_idx ON passages USING gin (search)')

    def indexed_hash(self):
        with self.pool.connection() as conn:
            row = conn.execute("SELECT value FROM rag_meta WHERE key = 'corpus_hash'").fetchone()
        return row[0] if row else None

    def replace_all(self, passages, vectors, dim, corpus_hash):
        with self.pool.connection() as conn, conn.transaction():
            conn.execute('DROP TABLE IF EXISTS passage_vectors')
            conn.execute('DELETE FROM passages')
            conn.execute(
                f'CREATE TABLE passage_vectors (passage_id text NOT NULL REFERENCES passages(id) ON DELETE CASCADE,'
                f' view text NOT NULL, embedding vector({int(dim)}) NOT NULL, PRIMARY KEY (passage_id, view))'
            )
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO passages (id, doc_id, section, lang, body, search) VALUES (%s, %s, %s, %s, %s, to_tsvector('simple', %s))",
                    [(p.id, p.doc_id, p.section, p.lang, p.text, index_text(p.search_text())) for p in passages],
                )
                cur.executemany(
                    'INSERT INTO passage_vectors (passage_id, view, embedding) VALUES (%s, %s, %s)',
                    [(pid, view, vec) for pid, view, vec in vectors],
                )
            conn.execute('CREATE INDEX passage_vectors_hnsw ON passage_vectors USING hnsw (embedding vector_cosine_ops)')
            conn.execute(
                "INSERT INTO rag_meta (key, value) VALUES ('corpus_hash', %s) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (corpus_hash,),
            )

    def vector_search(self, query, k):
        with self.pool.connection() as conn:
            rows = conn.execute(
                'SELECT passage_id, max(1 - (embedding <=> %s)) AS sim FROM passage_vectors'
                ' GROUP BY passage_id ORDER BY sim DESC LIMIT %s',
                (query, k),
            ).fetchall()
        return [(r[0], float(r[1])) for r in rows]

    def text_search(self, query_tokens, k):
        if not query_tokens:
            return []
        tsq = ' | '.join(f'{t}:*' for t in query_tokens)  # tokens are [a-z0-9] only (see text.tokens)
        with self.pool.connection() as conn:
            rows = conn.execute(
                "SELECT id, ts_rank_cd(search, q) AS r FROM passages, to_tsquery('simple', %s) q"
                ' WHERE search @@ q ORDER BY r DESC LIMIT %s',
                (tsq, k),
            ).fetchall()
        return [(r[0], float(r[1])) for r in rows]

    def count(self):
        with self.pool.connection() as conn:
            return conn.execute('SELECT count(*) FROM passages').fetchone()[0]

    def close(self):
        self.pool.close()
