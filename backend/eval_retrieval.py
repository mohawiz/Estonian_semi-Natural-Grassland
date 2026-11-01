"""Retrieval quality check: how many questions in tests/eval_cases.json find an expected
passage in the top 6. Run from backend/:  .venv\\Scripts\\python eval_retrieval.py [embedding model ...]
With GROQ_API_KEY set it also measures the full pipeline including query rewriting."""
import asyncio
import json
import sys
from pathlib import Path

from app.config import get_settings
from app.corpus import load_corpus
from app.embeddings import FastEmbedder
from app.llm import GroqLLM
from app.rag import RagService
from app.retrieval import Retriever
from app.store import MemoryStore

CASES = json.loads((Path(__file__).parent / 'tests' / 'eval_cases.json').read_text(encoding='utf-8'))


def report(label: str, found: list[list[str]]) -> None:
    misses = [c['q'] for c, ids in zip(CASES, found) if not set(ids) & set(c['expect'])]
    print(f'{label}: {len(CASES) - len(misses)}/{len(CASES)} found in top 6')
    for q in misses:
        print('   miss:', q)


def main() -> None:
    s = get_settings()
    for model in sys.argv[1:] or [s.embed_model]:
        r = Retriever(MemoryStore(), FastEmbedder(model), load_corpus(s.corpus_path), s.top_k, s.min_similarity)
        r.ensure_index()
        report(f'{model} (search only)', [[h.passage.id for h in r.search(c['q'])] for c in CASES])
        if s.groq_api_key:
            rag = RagService(s, r, GroqLLM(s.groq_api_key, s.groq_model))

            async def run():
                return [[p.id for p in (await rag.retrieve(c['q'], []))[0]] for c in CASES]

            report(f'{model} (with query rewriting)', asyncio.run(run()))


if __name__ == '__main__':
    main()
