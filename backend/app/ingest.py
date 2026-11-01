"""Rebuild the search index: `python -m app.ingest` (add --force to rebuild even if nothing changed).
The API also does this on start-up when documents.json or the embedding model changed."""
import sys

from .config import get_settings
from .main import build_retriever


def main() -> None:
    s = get_settings()
    r = build_retriever(s)
    if '--force' in sys.argv:
        r.store.replace_all([], [], r.embedder.dim, 'forced')  # clears the stored hash
    changed = r.ensure_index()
    r.store.close()
    print(f"{'Indexed' if changed else 'Index already up to date:'} {len(r.passages)} passages into {type(r.store).__name__}.")


if __name__ == '__main__':
    main()
