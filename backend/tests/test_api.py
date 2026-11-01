import json
import time

from fastapi.testclient import TestClient

from app.main import create_app

from .conftest import FakeLLM


def ready_client(settings, retriever, llm):
    client = TestClient(create_app(settings, retriever, llm))
    client.__enter__()
    for _ in range(100):
        if client.get('/api/health').json()['ready']:
            return client
        time.sleep(0.05)
    raise AssertionError('API never became ready')


def parse_sse(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.replace('\r\n', '\n').strip().split('\n\n'):
        lines = dict(line.split(': ', 1) for line in block.split('\n') if ': ' in line)
        if 'event' in lines:
            out.append((lines['event'], json.loads(lines['data'])))
    return out


def test_health_and_streamed_answer(settings, retriever):
    client = ready_client(settings, retriever, FakeLLM())
    health = client.get('/api/health').json()
    assert health == {'ready': True, 'error': None, 'model': 'fake-model', 'passages': 47, 'store': 'MemoryStore'}

    r = client.post('/api/ask', json={'question': 'When must grazing start on a coastal meadow?', 'lang': 'en'})
    assert r.status_code == 200 and r.headers['content-type'].startswith('text/event-stream')
    events = parse_sse(r.text)
    assert events[0][0] == 'token' and events[-1][0] == 'done'
    assert events[-1][1]['citations'][0]['n'] == 1


def test_rejects_bad_input(settings, retriever):
    client = ready_client(settings, retriever, FakeLLM())
    assert client.post('/api/ask', json={'question': '', 'lang': 'en'}).status_code == 422
    assert client.post('/api/ask', json={'question': 'hi', 'lang': 'de'}).status_code == 422


def test_rate_limit_per_ip(settings, retriever):
    client = ready_client(settings, retriever, FakeLLM())  # settings.rate_limit = 3
    codes = [client.post('/api/ask', json={'question': 'What is a rest year?', 'lang': 'en'}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_not_ready_without_api_key(settings, retriever):
    settings.groq_api_key = ''
    client = TestClient(create_app(settings, retriever, None))
    client.__enter__()
    time.sleep(0.3)
    assert client.get('/api/health').json()['error'] == 'GROQ_API_KEY is not set.'
    assert client.post('/api/ask', json={'question': 'hi', 'lang': 'en'}).status_code == 503


def test_cors_allows_the_app_origin(settings, retriever):
    client = ready_client(settings, retriever, FakeLLM())
    r = client.options('/api/ask', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
    assert r.headers.get('access-control-allow-origin') == 'http://localhost:5173'
