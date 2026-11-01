import asyncio

from app.llm import LLMError
from app.rag import RagService, Turn, cited_numbers, retrieval_query

from .conftest import FakeLLM


def run(rag, question, lang='en', history=()):
    async def go():
        return [ev async for ev in rag.answer(question, lang, list(history))]

    return asyncio.run(go())


def test_cited_numbers_handles_lists_ranges_and_bad_numbers():
    assert cited_numbers('a [1] b [3, 2] c [7] d [2–4]', 4) == [1, 2, 3, 4]
    assert cited_numbers('no citations here', 3) == []


def test_short_follow_up_is_searched_with_the_previous_question():
    h = [Turn('user', 'When must grazing start?'), Turn('assistant', 'By 31 May [1].')]
    assert retrieval_query('and on wooded meadows?', h) == 'When must grazing start? and on wooded meadows?'
    assert retrieval_query('When must grazing start on a coastal meadow this year?', h) == 'When must grazing start on a coastal meadow this year?'


def test_answer_streams_tokens_and_maps_citations(settings, retriever):
    llm = FakeLLM()
    events = run(RagService(settings, retriever, llm), 'When must grazing start on a coastal meadow?')
    tokens = ''.join(e['text'] for e in events if e['type'] == 'token')
    done = events[-1]
    assert done['type'] == 'done' and done['kind'] == 'answer'
    assert tokens.strip() == done['text'] == 'Grazing must start by 31 May [1].'
    assert done['citations'][0]['n'] == 1 and done['citations'][0]['passageId']
    # the sources the model saw are the ones retrieval returned
    prompt = llm.calls[0][-1]['content']
    assert prompt.startswith('SOURCES:') and 'QUESTION: When must grazing start' in prompt
    assert 'if unsure, use English' in llm.calls[0][0]['content']


def test_no_answer_sentinel_is_hidden_even_when_split_across_chunks(settings, retriever):
    llm = FakeLLM(answer='NO_ANSWER\nThe library does not cover this; ask PRIA.')
    events = run(RagService(settings, retriever, llm), 'What is the price of diesel in Tartu?')
    text = ''.join(e['text'] for e in events if e['type'] == 'token')
    assert 'NO_ANSWER' not in text
    assert events[-1]['kind'] == 'unknown' and events[-1]['citations'] == []
    assert events[-1]['text'] == 'The library does not cover this; ask PRIA.'


def test_small_talk_skips_retrieval(settings, retriever):
    llm = FakeLLM(answer='I answer questions about heritage meadow rules.', rewrite='NONE')
    events = run(RagService(settings, retriever, llm), 'what are u')
    prompt = llm.calls[0][-1]['content']
    assert 'none found for this question' in prompt and 'follow rule 1' in prompt
    assert events[-1]['kind'] == 'answer' and events[-1]['citations'] == []


def test_history_is_passed_to_the_model(settings, retriever):
    llm = FakeLLM()
    run(RagService(settings, retriever, llm), 'and in Estonian?', history=[Turn('user', 'What is a rest year?'), Turn('assistant', 'A rest year is [1].')])
    roles = [m['role'] for m in llm.calls[0]]
    assert roles == ['system', 'user', 'assistant', 'user']


def test_model_errors_become_an_error_event(settings, retriever):
    llm = FakeLLM()
    llm.error = LLMError('rate_limited', 'busy')
    events = run(RagService(settings, retriever, llm), 'What is a rest year?')
    assert events == [{'type': 'error', 'code': 'rate_limited', 'message': 'busy'}]


def test_small_talk_after_a_topic_question_is_judged_on_the_new_message(settings, retriever):
    llm = FakeLLM(answer='I answer questions about heritage meadow rules.', rewrite='NONE')
    history = [Turn('user', 'When can PRIA demand the support back?'), Turn('assistant', 'If false data were submitted [1].')]
    events = run(RagService(settings, retriever, llm), 'what are u', history=history)
    sent = llm.rewrite_calls[0][-1]['content']
    assert sent == 'Earlier question (context only): When can PRIA demand the support back?\nMessage: what are u'
    assert 'follow rule 1' in llm.calls[0][-1]['content']
    assert events[-1]['kind'] == 'answer'
