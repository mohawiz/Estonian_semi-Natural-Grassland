"""Settings from environment variables (and backend/.env). Secrets never reach the browser."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CORPUS = BACKEND_DIR.parent / 'src' / 'data' / 'documents.json'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / '.env', extra='ignore')

    groq_api_key: str = ''
    groq_model: str = 'openai/gpt-oss-120b'
    # small, fast model that rewrites the question into search queries ('' turns it off)
    rewrite_model: str = 'openai/gpt-oss-20b'
    # gpt-oss only: how much the model reasons before answering (low / medium / high)
    reasoning_effort: str = 'medium'
    temperature: float = 0.2
    top_p: float = 1.0
    max_tokens: int = 2000  # includes reasoning tokens

    database_url: str = ''
    corpus_path: Path = DEFAULT_CORPUS

    embed_model: str = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
    embed_cache_dir: Path | None = None
    top_k: int = 6
    min_similarity: float = 0.30

    allowed_origins: str = 'http://localhost:5173,http://localhost:4173'
    rate_limit: int = 30
    max_question_chars: int = 1000
    max_history_turns: int = 6

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(',') if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
