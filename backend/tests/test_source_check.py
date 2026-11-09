import json

from app.source_check import check_document, found, html_to_text, normalize, run, write_baseline

DOC = {
    'id': 'law',
    'url': 'https://example.test/law',
    'passages': [
        {'id': 'law-p1', 'text': '(1) Pärandniit peab olema niidetud 1. septembriks. […] Niide tuleb kokku koguda.'},
        {'id': 'law-p2', 'text': 'Karjatamist alustatakse hiljemalt 31. mail.'},
    ],
}
PAGE = (
    '<html><body><nav>Menüü</nav><p>(1) Pärandniit peab olema niidetud 1. septembriks.</p>'
    '<p>Muu tekst. Niide tuleb kokku koguda.</p><p>Karjatamist alustatakse hiljemalt 31. mail.'
    ' [RT I, 25.05.2024, 1 - jõust. 28.05.2024]</p></body></html>'
)


def fetcher(page, version=None):
    return lambda url: (html_to_text(page), version)


def test_finds_passages_despite_markup_amendment_markers_and_pdf_spacing():
    page = normalize(html_to_text(PAGE))
    assert found(DOC['passages'][0]['text'], page)
    assert found('Karjatamist alustatakse hiljemalt 31. mail.', page)
    assert found('kohapealsest kontrollist e-posti', normalize('kohapealsestkontrollist e -posti'))


def test_unchanged_then_changed_when_quoted_text_disappears():
    base = check_document(DOC, None, fetcher(PAGE))
    assert base.status == 'new' and base.not_matched == []
    baseline = {'page_hash': base.page_hash, 'not_matched': []}
    assert check_document(DOC, baseline, fetcher(PAGE)).status == 'unchanged'
    changed = check_document(DOC, baseline, fetcher(PAGE.replace('31. mail', '15. juunil')))
    assert changed.status == 'changed' and changed.missing == ['law-p2'] and changed.needs_review


def test_page_updated_when_only_other_text_changes():
    base = check_document(DOC, None, fetcher(PAGE))
    r = check_document(DOC, {'page_hash': base.page_hash, 'not_matched': []}, fetcher(PAGE.replace('Muu tekst.', 'Uus lõik lisati.')))
    assert r.status == 'page-updated' and r.needs_review


def test_new_version_of_an_act_is_flagged():
    base = {'page_hash': 'x', 'not_matched': [], 'version': '102052026008'}
    assert check_document(DOC, base, fetcher(PAGE, '103112026001')).status == 'new-version'


def test_known_differences_are_not_flagged_again():
    base = check_document(DOC, None, fetcher(PAGE.replace('31. mail', '30. mail')))
    assert base.not_matched == ['law-p2']
    r = check_document(DOC, {'page_hash': base.page_hash, 'not_matched': base.not_matched}, fetcher(PAGE.replace('31. mail', '30. mail')))
    assert r.status == 'unchanged'


def test_unreachable_source_is_reported_not_raised():
    def boom(url):
        raise TimeoutError('timed out')

    r = check_document(DOC, None, boom)
    assert r.status == 'unreachable' and 'timed out' in r.error and not r.needs_review


def test_run_and_baseline_round_trip(tmp_path):
    lib = tmp_path / 'documents.json'
    lib.write_text(json.dumps({'documents': [DOC]}), encoding='utf-8')
    bl = tmp_path / 'baseline.json'
    write_baseline(run(lib, bl, fetcher(PAGE)), bl)
    assert [r.status for r in run(lib, bl, fetcher(PAGE))] == ['unchanged']
