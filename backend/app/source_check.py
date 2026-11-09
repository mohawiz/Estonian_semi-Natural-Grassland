"""Watch the official sources behind the rule library for changes.

For every document in documents.json the checker downloads the source (HTML
page or PDF), extracts its text and checks:

1. Does every passage the library quotes still appear word for word?
   A passage that was found when the library was last reviewed and is now
   gone is a strong signal: the rule text itself changed.
2. Has the rest of the page changed since the last review (text hash)?
   A weaker signal: something was added or reworded elsewhere.

Nothing is changed automatically. The library keeps the reviewed text until a
person updates documents.json and runs `--update-baseline`; until then the
app shows "changed at source, waiting for review" on the document.

    python -m app.source_check                 # check, print a report
    python -m app.source_check --json out.json # also write the report as JSON
    python -m app.source_check --update-baseline   # after reviewing: accept the current sources
"""
import argparse
import hashlib
import html
import io
import json
import re
import sys
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / 'src' / 'data' / 'documents.json'
BASELINE = ROOT / 'src' / 'data' / 'source-baseline.json'
USER_AGENT = 'GrasslandAssistant-SourceCheck/1.0 (+https://github.com/mohawiz/Estonian_semi-Natural-Grassland)'


@dataclass
class DocResult:
    doc_id: str
    url: str
    status: str  # 'unchanged' | 'new-version' | 'changed' | 'page-updated' | 'unreachable' | 'new'
    checked_at: str
    page_hash: str | None = None
    version: str | None = None  # publisher's version id (Riigi Teataja)
    missing: list[str] = field(default_factory=list)  # passages found at review, gone now
    not_matched: list[str] = field(default_factory=list)  # passages never matched verbatim (known differences)
    error: str | None = None

    @property
    def needs_review(self) -> bool:
        return self.status in ('new-version', 'changed', 'page-updated')


def normalize(text: str) -> str:
    t = html.unescape(text).replace('­', '').replace('\xa0', ' ')
    t = re.sub(r'[‘’‚]', "'", t)
    t = re.sub(r'[“”„«»]', '"', t)
    t = re.sub(r'[‐-―−]', '-', t)
    t = re.sub(r'\s+', ' ', t).strip().lower()
    # Riigi Teataja marks amended text: "[RT I, 25.05.2024, 1 - jõust. 28.05.2024]"
    t = re.sub(r'\[\s*rt [ivx]+,[^\]]{0,80}?jõust\.?\s*[\d.]+\s*\]', ' ', t)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r' ([.,;:!?)\]])', r'\1', t)
    return t.replace('( ', '(')


def html_to_text(raw: str) -> str:
    # prefer the page's <main> content (less menu noise), unless it is nearly empty
    main = re.search(r'<main\b.*?</main>', raw, re.S | re.I)
    body = re.search(r'<body\b.*?</body>', raw, re.S | re.I)
    t = main.group(0) if main and len(main.group(0)) > 2000 else body.group(0) if body else raw
    t = re.sub(r'<(script|style|noscript|nav|header|footer|form|button)\b[^>]*>.*?</\1>', ' ', t, flags=re.S | re.I)
    t = re.sub(r'<span[^>]*class="[^"]*material-icons[^"]*"[^>]*>.*?</span>', ' ', t, flags=re.S | re.I)  # icon ligatures ("balance", "history")
    t = re.sub(r'<br\s*/?>|</p>|</li>|</h\d>|</div>|</td>', '\n', t, flags=re.I)
    return re.sub(r'<[^>]+>', ' ', t)


def pdf_to_text(data: bytes) -> str:
    from pypdf import PdfReader

    return '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(data)).pages)


def _get(url: str, timeout: float = 40, accept: str | None = None) -> tuple[bytes, str]:
    headers = {'User-Agent': USER_AGENT, 'Accept-Language': 'et,en;q=0.8'}
    if accept:
        headers['Accept'] = accept
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 (URLs come from our own library file)
        return res.read(30_000_000), res.headers.get('Content-Type', '')


def _decode(data: bytes, ctype: str) -> str:
    if 'pdf' in ctype or data[:5] == b'%PDF-':
        return pdf_to_text(data)
    charset = re.search(r'charset=([\w-]+)', ctype)
    return html_to_text(data.decode(charset.group(1) if charset else 'utf-8', errors='replace'))


RT_ACT = re.compile(r'^https://www\.riigiteataja\.ee/(?:et/)?akt/(\d+)')
EURLEX_CELEX = re.compile(r'eur-lex\.europa\.eu/.*CELEX:(\w+)')


def fetch(url: str, timeout: float = 40) -> tuple[str, str | None]:
    """The source text, and a version id when the publisher has one.

    Riigi Teataja is a JavaScript app: its public API gives the version in force
    and its full text. EUR-Lex blocks automated requests, so the same act is read
    from the EU Publications Office (Cellar) in Estonian."""
    rt = RT_ACT.match(url)
    if rt:
        meta, _ = _get(f'https://www.riigiteataja.ee/public-api/api/v1/akt/{rt.group(1)}?leiaKehtiv=true', timeout)
        info = json.loads(meta)
        version = str(info.get('kehtivId') or rt.group(1))
        body, ctype = _get(f'https://www.riigiteataja.ee/public-api/api/v1/akt/{version}/blob-html', timeout)
        return _decode(body, ctype or 'text/html'), version
    eu = EURLEX_CELEX.search(url)
    if eu:
        body, ctype = _get(f'https://publications.europa.eu/resource/celex/{eu.group(1)}', timeout, accept='application/xhtml+xml')
        return _decode(body, ctype), None
    body, ctype = _get(url, timeout)
    return _decode(body, ctype), None


def compact(text: str) -> str:
    """Text without spaces, hyphens and bullets: PDF extraction adds or drops
    spaces ("2023 -2027", "kohapealsestkontrollist") and list markers."""
    return re.sub(r'[\s\-•▪●◦·]', '', text)


def fragments(passage_text: str) -> list[str]:
    """A passage may skip parts with […]; each remaining fragment must appear."""
    return [f for f in (compact(normalize(x)) for x in re.split(r'\[\s*(?:…|\.\.\.)\s*\]', passage_text)) if len(f) >= 12]


def found(passage_text: str, page: str) -> bool:
    """Is the passage in the normalized page text?"""
    page = compact(page)
    return all(f in page for f in fragments(passage_text))


def page_hash(page: str) -> str:
    # dates and numbers in page chrome ("updated 3 min ago", view counters) change often; ignore digits
    return hashlib.sha256(re.sub(r'\d+', '#', page).encode()).hexdigest()[:16]


def check_document(doc: dict, base: dict | None, fetcher=fetch, now: str | None = None) -> DocResult:
    now = now or datetime.now(timezone.utc).isoformat(timespec='seconds')
    try:
        raw, version = fetcher(doc['url'])
        page = normalize(raw)
    except Exception as e:  # network, HTTP or PDF errors: report, never crash the run
        return DocResult(doc['id'], doc['url'], 'unreachable', now, error=f'{type(e).__name__}: {e}'[:300])
    present = {p['id']: found(p['text'], page) for p in doc['passages']}
    h = page_hash(page)
    not_matched = [pid for pid, ok in present.items() if not ok]
    if base is None:
        return DocResult(doc['id'], doc['url'], 'new', now, h, version, not_matched=not_matched)
    known_missing = set(base.get('not_matched', []))
    missing = [pid for pid in not_matched if pid not in known_missing]
    if version and base.get('version') and version != base['version']:
        status = 'new-version'
    elif missing:
        status = 'changed'
    elif h != base.get('page_hash'):
        status = 'page-updated'
    else:
        status = 'unchanged'
    return DocResult(doc['id'], doc['url'], status, now, h, version, missing=missing, not_matched=not_matched)


def load_baseline(path: Path = BASELINE) -> dict:
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'documents': {}}


def run(library: Path = LIBRARY, baseline_path: Path = BASELINE, fetcher=fetch) -> list[DocResult]:
    docs = json.loads(library.read_text(encoding='utf-8'))['documents']
    base = load_baseline(baseline_path)['documents']
    return [check_document(d, base.get(d['id']), fetcher) for d in docs]


def write_baseline(results: list[DocResult], path: Path = BASELINE) -> None:
    """Accept the current sources as reviewed. Unreachable documents keep their old entry."""
    old = load_baseline(path)['documents']
    docs = dict(old)
    for r in results:
        if r.status != 'unreachable':
            docs[r.doc_id] = {'page_hash': r.page_hash, 'version': r.version, 'not_matched': r.not_matched, 'reviewed_at': r.checked_at[:10], 'url': r.url}
    path.write_text(json.dumps({'note': 'Last reviewed state of each official source. Update with: python -m app.source_check --update-baseline', 'documents': docs}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def report(results: list[DocResult]) -> str:
    lines = []
    for r in results:
        extra = ''
        if r.status == 'new-version':
            extra = f' — a new version is in force (id {r.version})'
        elif r.missing:
            extra = f" — quoted text no longer found: {', '.join(r.missing)}"
        elif r.error:
            extra = f' — {r.error}'
        lines.append(f'{r.status:>12}  {r.doc_id}{extra}')
    flagged = [r for r in results if r.needs_review]
    lines.append(f'\n{len(flagged)} of {len(results)} sources need review.')
    return '\n'.join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--json', type=Path, help='write the report as JSON')
    ap.add_argument('--update-baseline', action='store_true', help='accept the current sources as reviewed')
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding='utf-8')
    results = run()
    print(report(results))
    if args.json:
        args.json.write_text(json.dumps([asdict(r) | {'needs_review': r.needs_review} for r in results], ensure_ascii=False, indent=2), encoding='utf-8')
    if args.update_baseline:
        write_baseline(results)
        print(f'Baseline updated: {BASELINE}')
        return 0
    return 1 if any(r.needs_review for r in results) else 0


if __name__ == '__main__':
    raise SystemExit(main())
