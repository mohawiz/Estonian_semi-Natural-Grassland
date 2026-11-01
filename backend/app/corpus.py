"""The rule library. The app's src/data/documents.json is the single source of truth;
the backend indexes the same passages so citations match what the app shows."""
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Passage:
    id: str
    doc_id: str
    doc_title: dict[str, str]
    publisher: str
    url: str
    status: str
    section: str
    lang: str
    text: str
    summary: dict[str, str]
    keywords: tuple[str, ...] = field(default_factory=tuple)

    def views(self) -> dict[str, str]:
        """Short texts embedded separately. The embedding model reads ~128 tokens,
        so the summaries, keywords and verbatim text each get their own vector."""
        return {
            'summary_en': f"{self.section}. {self.summary.get('en', '')}",
            'summary_et': f"{self.section}. {self.summary.get('et', '')}",
            'keywords': ', '.join(self.keywords),
            'text': self.text,
        }

    def search_text(self) -> str:
        """Everything the keyword search should match."""
        return ' '.join([self.section, self.doc_title.get('et', ''), self.doc_title.get('en', ''), self.text, *self.summary.values(), *self.keywords])


def load_corpus(path: Path) -> list[Passage]:
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    out: list[Passage] = []
    for d in data['documents']:
        for p in d['passages']:
            out.append(
                Passage(
                    id=p['id'],
                    doc_id=d['id'],
                    doc_title=d['title'],
                    publisher=d['publisher'],
                    url=d['url'],
                    status=d['status'],
                    section=p['section'],
                    lang=p['lang'],
                    text=p['text'],
                    summary=p['summary'],
                    keywords=tuple(p.get('keywords', [])),
                )
            )
    return out


def corpus_hash(passages: list[Passage], embed_model: str) -> str:
    """Changes when any passage or the embedding model changes, so re-indexing runs only when needed."""
    h = hashlib.sha256(embed_model.encode())
    for p in passages:
        h.update(json.dumps([p.id, p.views(), p.search_text()], ensure_ascii=False, sort_keys=True).encode())
    return h.hexdigest()[:16]
