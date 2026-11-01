from app.corpus import corpus_hash, load_corpus
from app.prompts import format_sources
from app.text import tokens


def test_tokens_fold_diacritics_and_stem():
    assert tokens('Kas ma võin niita rannaniitu?') == ['niita', 'ranna']
    assert tokens('niitmine niitmise niitmist') == ['niitm']


def test_corpus_matches_the_app_library(settings):
    passages = load_corpus(settings.corpus_path)
    assert len(passages) == 47
    assert len({p.id for p in passages}) == 47
    assert all(p.text and p.summary['en'] and p.summary['et'] for p in passages)


def test_hash_changes_only_when_content_or_model_changes(settings):
    passages = load_corpus(settings.corpus_path)
    assert corpus_hash(passages, 'm1') == corpus_hash(passages, 'm1')
    assert corpus_hash(passages, 'm1') != corpus_hash(passages, 'm2')
    assert corpus_hash(passages, 'm1') != corpus_hash(passages[:-1], 'm1')


def test_reindexes_only_on_change(retriever):
    assert retriever.ensure_index() is False


def test_retrieval_finds_keyword_matches(retriever):
    ids = [h.passage.id for h in retriever.search('Mis kuupäevaks peab rannaniidul karjatamine algama?')]
    assert 'rt-niit-maarus-79-p11' in ids


def test_sources_are_numbered_and_flag_old_versions(settings):
    passages = load_corpus(settings.corpus_path)
    old = next(p for p in passages if p.status == 'older-version')
    text = format_sources([passages[0], old], 'en')
    assert text.startswith('SOURCES:') and '[1]' in text and '[2]' in text
    assert 'OLDER VERSION' in text
    assert format_sources([], 'et').endswith('(none found for this question)')
