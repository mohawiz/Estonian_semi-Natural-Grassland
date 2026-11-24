import json

import httpx
import numpy as np
import pytest

from app.embeddings import EmbeddingError, GeminiEmbedder


def fake_client(calls: list, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append((request, body))
        if status != 200:
            return httpx.Response(status, json={'error': {'message': 'API key not valid'}})
        n = len(body['requests'])
        return httpx.Response(200, json={'embeddings': [{'values': [float(i + 1), 0.0, 1.0, 0.0]} for i in range(n)]})

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_gemini_batches_normalises_and_keeps_key_out_of_url():
    calls: list = []
    e = GeminiEmbedder('secret-key', dim=4, client=fake_client(calls))
    vecs = e.embed_passages([f'passage {i}' for i in range(120)])
    assert vecs.shape == (120, 4)
    assert np.allclose(np.linalg.norm(vecs, axis=1), 1)
    assert [len(b['requests']) for _, b in calls] == [50, 50, 20]
    req, body = calls[0]
    assert 'secret-key' not in str(req.url)
    assert req.headers['x-goog-api-key'] == 'secret-key'
    assert body['requests'][0]['taskType'] == 'RETRIEVAL_DOCUMENT'
    assert body['requests'][0]['outputDimensionality'] == 4


def test_gemini_query_uses_query_task():
    calls: list = []
    e = GeminiEmbedder('k', dim=4, client=fake_client(calls))
    assert e.embed_query('millal niita?').shape == (4,)
    assert calls[0][1]['requests'][0]['taskType'] == 'RETRIEVAL_QUERY'
    assert e.model_name == 'gemini:gemini-embedding-001@4'


def test_gemini_error_names_reason_not_key():
    e = GeminiEmbedder('secret-key', dim=4, client=fake_client([], status=400))
    with pytest.raises(EmbeddingError) as err:
        e.embed_query('x')
    assert 'API key not valid' in str(err.value)
    assert 'secret-key' not in str(err.value)


def test_gemini_needs_a_key():
    with pytest.raises(EmbeddingError):
        GeminiEmbedder('')
