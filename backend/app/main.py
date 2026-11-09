"""HTTP API. POST /api/ask streams Server-Sent Events: `token` (text pieces), then
`done` (kind, text, citations) or `error` (code, message). GET /api/health reports readiness."""
import asyncio
import json
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from . import source_check
from .config import Settings, get_settings
from .corpus import load_corpus
from .llm import LLM, GroqLLM
from .rag import RagService, Turn
from .retrieval import Retriever

log = logging.getLogger('grassland')


class HistoryTurn(BaseModel):
    role: Literal['user', 'assistant']
    text: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    lang: Literal['et', 'en'] = 'et'
    history: list[HistoryTurn] = Field(default_factory=list, max_length=20)


class RateLimiter:
    """Sliding window per client IP, to keep one visitor from using up the free Groq quota."""

    def __init__(self, limit: int, window_s: int = 600):
        self.limit, self.window = limit, window_s
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


def build_retriever(s: Settings) -> Retriever:
    from .embeddings import FastEmbedder
    from .store import MemoryStore, PgStore

    if s.database_url:
        store = PgStore(s.database_url)
    else:
        log.warning('DATABASE_URL is not set: using an in-memory index (rebuilt on every start).')
        store = MemoryStore()
    embedder = FastEmbedder(s.embed_model, str(s.embed_cache_dir) if s.embed_cache_dir else None)
    return Retriever(store, embedder, load_corpus(s.corpus_path), s.top_k, s.min_similarity)


def create_app(settings: Settings | None = None, retriever: Retriever | None = None, llm: LLM | None = None) -> FastAPI:
    s = settings or get_settings()
    state: dict = {'rag': None, 'error': None, 'retriever': None, 'sources': None}

    async def warm_up():
        try:
            r = retriever or await asyncio.to_thread(build_retriever, s)
            state['retriever'] = r
            if await asyncio.to_thread(r.ensure_index):
                log.info('Indexed %d passages.', len(r.passages))
            model = llm or (GroqLLM(s.groq_api_key, s.groq_model, s.reasoning_effort) if s.groq_api_key else None)
            if model is None:
                state['error'] = 'GROQ_API_KEY is not set.'
                return
            if isinstance(model, GroqLLM):
                missing = await model.check_models(s.groq_model, s.rewrite_model)
                if missing:
                    state['error'] = f"Model not available for this Groq key: {', '.join(missing)}. Set GROQ_MODEL / REWRITE_MODEL."
                    return
            state['rag'] = RagService(s, r, model)
        except Exception as e:  # noqa: BLE001 - reported through /api/health
            log.exception('Startup failed')
            state['error'] = f'{type(e).__name__}: {e}'

    async def watch_sources():
        """Re-check the official sources now and then; results feed /api/library/status."""
        await asyncio.sleep(60)  # let the warm-up and first questions go first
        while True:
            try:
                results = await asyncio.to_thread(source_check.run, s.corpus_path, s.corpus_path.parent / 'source-baseline.json')
                state['sources'] = {
                    'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                    'documents': {r.doc_id: {'status': r.status, 'needsReview': r.needs_review, 'missing': r.missing, 'version': r.version, 'error': r.error} for r in results},
                }
                flagged = [r.doc_id for r in results if r.needs_review]
                if flagged:
                    log.warning('Official sources changed, review needed: %s', ', '.join(flagged))
            except Exception:  # noqa: BLE001 - try again next round
                log.exception('Source check failed')
            await asyncio.sleep(s.source_check_hours * 3600)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # warm up in the background so the port opens at once (hosts health-check it)
        task = asyncio.create_task(warm_up())
        app.state.warmup = task
        watcher = asyncio.create_task(watch_sources()) if s.source_check_hours > 0 else None
        yield
        task.cancel()
        if watcher:
            watcher.cancel()
        if state['retriever'] is not None:
            state['retriever'].store.close()

    app = FastAPI(title='Grassland Assistant API', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=s.origins, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
    limiter = RateLimiter(s.rate_limit)

    @app.get('/api/health')
    async def health():
        rag: RagService | None = state['rag']
        return {
            'ready': rag is not None,
            'error': state['error'],
            'model': rag.llm.model if rag else None,
            'passages': len(rag.retriever.passages) if rag else 0,
            'store': type(rag.retriever.store).__name__ if rag else None,
        }

    @app.get('/api/library/status')
    async def library_status():
        """Which official sources changed since the library was last reviewed (null until the first check)."""
        return state['sources'] or {'checkedAt': None, 'documents': {}}

    @app.post('/api/ask')
    async def ask(body: AskRequest, request: Request):
        rag: RagService | None = state['rag']
        if rag is None:
            raise HTTPException(503, state['error'] or 'Starting up, try again in a moment.')
        ip = request.headers.get('x-forwarded-for', request.client.host if request.client else '?').split(',')[0].strip()
        if not limiter.allow(ip):
            raise HTTPException(429, 'Too many questions. Try again in a few minutes.')
        question = body.question.strip()[: s.max_question_chars]
        history = [Turn(t.role, t.text) for t in body.history]

        async def events():
            async for ev in rag.answer(question, body.lang, history):
                yield {'event': ev['type'], 'data': json.dumps({k: v for k, v in ev.items() if k != 'type'}, ensure_ascii=False)}

        return EventSourceResponse(events())

    return app


logging.basicConfig(level=logging.INFO)
app = create_app()
