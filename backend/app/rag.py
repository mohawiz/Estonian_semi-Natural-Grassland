"""One question, end to end: rewrite → hybrid retrieval → grounded generation → citations."""
import asyncio
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from .config import Settings
from .corpus import Passage
from .llm import LLM, LLMError
from .prompts import NO_ANSWER, rewrite_prompt, system_prompt, user_message
from .retrieval import Retriever

# a message the rewriter calls small talk is still searched normally if it matches a passage this well
SMALL_TALK_MAX_SIMILARITY = 0.45
RRF_K = 60

CITE_RE = re.compile(r'\[(\d+(?:\s*[,–-]\s*\d+)*)\]')


@dataclass
class Turn:
    role: str  # 'user' | 'assistant'
    text: str


def cited_numbers(text: str, n_sources: int) -> list[int]:
    found: set[int] = set()
    for group in CITE_RE.findall(text):
        nums = [int(x) for x in re.findall(r'\d+', group)]
        if re.search(r'[–-]', group) and len(nums) == 2:
            nums = list(range(nums[0], nums[1] + 1))
        found.update(n for n in nums if 1 <= n <= n_sources)
    return sorted(found)


def previous_question(history: list[Turn]) -> str | None:
    return next((t.text for t in reversed(history) if t.role == 'user'), None)


def retrieval_query(question: str, history: list[Turn]) -> str:
    """A short follow-up ("and for coastal meadows?") is searched together with the previous question."""
    prev = previous_question(history)
    return f'{prev} {question}' if prev and len(question.split()) <= 6 else question


class RagService:
    def __init__(self, settings: Settings, retriever: Retriever, llm: LLM):
        self.s = settings
        self.retriever = retriever
        self.llm = llm
        self.rewrite_system = rewrite_prompt(list(retriever.passages.values())) if retriever else ''

    async def rewrite(self, question: str, previous: str | None = None) -> list[str] | None:
        """Extra search queries from a small model. None = small talk; [] = rewriting unavailable.
        The previous question is context for short follow-ups; small talk is judged on the new message."""
        if not self.s.rewrite_model:
            return []
        content = f'Earlier question (context only): {previous}\nMessage: {question}' if previous else f'Message: {question}'
        try:
            out = await self.llm.complete(
                [{'role': 'system', 'content': self.rewrite_system}, {'role': 'user', 'content': content}],
                model=self.s.rewrite_model,
                max_tokens=600,  # room for reasoning tokens
            )
        except LLMError:
            return []
        lines = [ln.strip(' -•*0123456789.').strip() for ln in out.splitlines() if ln.strip()]
        if lines and lines[0].upper() == 'NONE':
            return None
        return [ln[:200] for ln in lines[:3]]

    async def retrieve(self, question: str, history: list[Turn]) -> tuple[list[Passage], bool]:
        """The passages to answer from, and whether the message is small talk."""
        query = retrieval_query(question, history)
        extra = await self.rewrite(question, previous_question(history))
        if extra is None:
            # trust the small-talk label only if search agrees nothing relevant matches the message
            hits = await asyncio.to_thread(self.retriever.search, question)
            if not hits or hits[0].similarity < SMALL_TALK_MAX_SIMILARITY:
                return [], True
            extra = []
        results = await asyncio.gather(*(asyncio.to_thread(self.retriever.search, q) for q in [query, *extra]))
        # reciprocal rank fusion across the queries: each query's best passages get a fair
        # share, instead of the original wording's higher similarities crowding them out
        fused: dict[str, float] = {}
        passages: dict[str, Passage] = {}
        for hits in results:
            for rank, h in enumerate(hits):
                fused[h.passage.id] = fused.get(h.passage.id, 0.0) + 1 / (RRF_K + rank)
                passages[h.passage.id] = h.passage
        ranked = sorted(fused, key=lambda pid: -fused[pid])
        return [passages[pid] for pid in ranked[: self.s.top_k]], False

    async def answer(self, question: str, lang: str, history: list[Turn]) -> AsyncIterator[dict]:
        passages, small_talk = await self.retrieve(question, history)
        messages = [{'role': 'system', 'content': system_prompt(lang)}]
        for t in history[-self.s.max_history_turns :]:
            messages.append({'role': 'assistant' if t.role == 'assistant' else 'user', 'content': t.text[:1500]})
        messages.append({'role': 'user', 'content': user_message(question, passages, lang, small_talk)})

        text = ''
        pending = ''  # held back until we know whether the answer starts with the NO_ANSWER sentinel
        decided = False
        unknown = False
        try:
            async for delta in self.llm.stream(messages, temperature=self.s.temperature, top_p=self.s.top_p, max_tokens=self.s.max_tokens):
                if decided:
                    text += delta
                    yield {'type': 'token', 'text': delta}
                    continue
                pending += delta
                head = pending.lstrip()
                if len(head) < len(NO_ANSWER) and NO_ANSWER.startswith(head):
                    continue
                decided = True
                if head.startswith(NO_ANSWER):
                    unknown = True
                    pending = head[len(NO_ANSWER) :].lstrip(' :\n')
                if pending:
                    text += pending
                    yield {'type': 'token', 'text': pending}
        except LLMError as e:
            yield {'type': 'error', 'code': e.code, 'message': str(e)}
            return
        if not decided:  # the whole answer was shorter than the sentinel
            unknown = pending.strip() == NO_ANSWER
            text = '' if unknown else pending
            if text:
                yield {'type': 'token', 'text': text}

        numbers = [] if unknown else cited_numbers(text, len(passages))
        yield {
            'type': 'done',
            'kind': 'unknown' if unknown else 'answer',
            'text': text.strip(),
            'citations': [{'n': n, 'passageId': passages[n - 1].id, 'docId': passages[n - 1].doc_id} for n in numbers],
            'model': self.llm.model,
        }
