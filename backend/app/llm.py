"""Groq chat models behind a small interface, so tests can use a fake and another
provider can be swapped in. The API key stays on the server."""
import logging
from collections.abc import AsyncIterator
from typing import Protocol

log = logging.getLogger('grassland')


class LLMError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class LLM(Protocol):
    model: str

    def stream(self, messages: list[dict], *, temperature: float, top_p: float, max_tokens: int) -> AsyncIterator[str]: ...
    async def complete(self, messages: list[dict], *, model: str | None = None, max_tokens: int = 200) -> str: ...


def _error(e: Exception) -> LLMError:
    import groq

    log.warning('Groq call failed: %s: %s', type(e).__name__, e)
    if isinstance(e, groq.RateLimitError):
        return LLMError('rate_limited', 'The language model is busy (rate limit). Try again in a minute.')
    if isinstance(e, groq.AuthenticationError):
        return LLMError('auth', 'The server has no valid Groq API key.')
    if isinstance(e, groq.NotFoundError):
        return LLMError('model_not_found', 'The configured model is not available for this API key.')
    if isinstance(e, groq.APIConnectionError):
        return LLMError('unreachable', 'Could not reach the language model.')
    return LLMError('llm_error', 'The language model returned an error.')


class GroqLLM:
    def __init__(self, api_key: str, model: str, reasoning_effort: str = 'medium'):
        from groq import AsyncGroq

        self.model = model
        self.reasoning_effort = reasoning_effort
        self._client = AsyncGroq(api_key=api_key, max_retries=1, timeout=30)

    async def check_models(self, *models: str) -> list[str]:
        """The given model ids this key cannot use (empty = all fine)."""
        try:
            available = {m.id for m in (await self._client.models.list()).data}
        except Exception as e:  # noqa: BLE001
            raise _error(e) from e
        return [m for m in models if m and m not in available]

    def _extra(self, model: str, effort: str) -> dict:
        # gpt-oss models reason before answering. The reasoning is returned separately,
        # never mixed into the answer text, but it counts toward max_completion_tokens.
        return {'reasoning_effort': effort} if model.startswith('openai/gpt-oss') else {}

    async def stream(self, messages, *, temperature, top_p, max_tokens):
        try:
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                top_p=top_p,
                max_completion_tokens=max_tokens,
                stream=True,
                **self._extra(self.model, self.reasoning_effort),
            )
            async for chunk in resp:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
        except Exception as e:  # noqa: BLE001 - mapped to a user-facing code
            raise _error(e) from e

    async def complete(self, messages, *, model=None, max_tokens=200):
        m = model or self.model
        try:
            resp = await self._client.chat.completions.create(
                # a little temperature avoids the repetition loops small models fall into at 0
                model=m, messages=messages, temperature=0.3, max_completion_tokens=max_tokens, **self._extra(m, 'low')
            )
        except Exception as e:  # noqa: BLE001
            raise _error(e) from e
        return resp.choices[0].message.content or ''
