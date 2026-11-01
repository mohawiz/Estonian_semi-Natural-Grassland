# The AI assistant (RAG backend)

The assistant answers rule questions with a language model that may use **only** passages retrieved from the official documents in `src/data/documents.json`. Every factual sentence carries a source number, and the app shows the verbatim passage behind each number. When the documents do not cover a question, it says so.

```
 App (browser)  ── POST /api/ask (question, language, last 6 messages) ──▶  backend/ (FastAPI)
      ▲                                                                       │
      │  Server-Sent Events: token … token … done {kind, text, citations}     │ 1. rewrite: a small Groq model turns the
      └───────────────────────────────────────────────────────────────────────┤    question into ET + EN search queries,
                                                                              │    using the library's own legal terms
                                                                              │ 2. hybrid search in Postgres + pgvector:
                                                                              │    vector similarity + full-text boost
                                                                              │ 3. answer: Groq model, temperature 0.2,
                                                                              │    sources only, cite [n], or NO_ANSWER
```

| Part | Choice | Why |
| --- | --- | --- |
| API | FastAPI, Server-Sent Events | Streams the answer word by word, same contract as the old local assistant |
| Database | Postgres + pgvector (`passages`, `passage_vectors`, `rag_meta`) | A real database with vector and full-text search; free on Neon |
| Embeddings | `paraphrase-multilingual-MiniLM-L12-v2` via fastembed, run in the backend | Estonian and English in one vector space; 0.22 GB, fits a free server; no API key |
| Retrieval | 4 vectors per passage (EN summary, ET summary, keywords, verbatim text), best match per passage, plus a keyword boost; the question and 3 rewritten queries merged by reciprocal rank fusion; top 6 | On the 17 test questions in `backend/tests/eval_cases.json`, search alone finds an expected passage for 15; with rewriting, 16–17 (rewriting varies slightly between runs) |
| Generation | Groq `openai/gpt-oss-120b`, temperature 0.2, medium reasoning, max 2000 tokens (reasoning included); rewriting with `openai/gpt-oss-20b` | Low temperature keeps wording close to the sources. Both models are on the free tier; the model list differs per key, so the API checks at start-up that both exist |
| Guardrails | System prompt: sources only, cite every sentence, keep the source's strength of wording ("recommended" stays recommended), answer in the question's language, `NO_ANSWER` sentinel, flag older versions, never decide outcomes; greetings get a short self-introduction; per-IP rate limit; question length limit | The model cannot add rules that are not in the library; one visitor cannot use up the free quota |
| Fallback | If the backend is unreachable, busy or not configured, the app uses its built-in keyword search and says so | The app never breaks because the server sleeps |

Re-indexing is automatic: on start-up the backend hashes the passages and the embedding model name, and rebuilds the index only when that changes. Edit `documents.json`, redeploy, done.

## Settings (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`. Never commit `.env` (it is in `.gitignore`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `GROQ_API_KEY` | — | Required. Free at https://console.groq.com/keys |
| `DATABASE_URL` | empty | Postgres URL. Empty = in-memory index, rebuilt on every start (fine for a try-out) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Answer model. If `/api/health` says a model is not available, pick one your key lists at https://console.groq.com |
| `REWRITE_MODEL` | `openai/gpt-oss-20b` | Query rewriting; empty turns it off |
| `REASONING_EFFORT` | `medium` | gpt-oss only: `low` is faster, `high` more careful |
| `TEMPERATURE` / `TOP_P` / `MAX_TOKENS` | 0.2 / 1.0 / 2000 | Generation settings (`MAX_TOKENS` includes reasoning) |
| `TOP_K` / `MIN_SIMILARITY` | 6 / 0.30 | Passages sent to the model, and the similarity floor |
| `ALLOWED_ORIGINS` | localhost | Web addresses allowed to call the API (comma-separated) |
| `RATE_LIMIT` | 30 | Questions per IP per 10 minutes |

## Run it on your computer (no Docker needed)

You need Python 3.11+ and Node 20+. In PowerShell:

```powershell
cd D:\Hive-Mind\grassland-assistant\backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env        # then open .env and paste your GROQ_API_KEY (and DATABASE_URL if you have one)
.venv\Scripts\python -m uvicorn app.main:app --port 8787
```

The first start downloads the embedding model (about 220 MB) and indexes the passages (about a minute). `http://localhost:8787/api/health` shows `"ready": true` when it is done.

For a local Postgres database, Docker Desktop can run one (the `.env.example` URL is empty, so set `DATABASE_URL=postgresql://grassland:grassland@localhost:5433/grassland` in `.env`):

```powershell
docker run -d --name grassland-db -e POSTGRES_USER=grassland -e POSTGRES_PASSWORD=grassland -e POSTGRES_DB=grassland -p 5433:5432 -v grassland-pgdata:/var/lib/postgresql/data pgvector/pgvector:pg17
```

In a second PowerShell window:

```powershell
cd D:\Hive-Mind\grassland-assistant
Set-Content -Encoding ascii .env.local "VITE_ASSISTANT_API_URL=http://localhost:8787"
npm run dev
```

Open http://localhost:5173 and ask the assistant a question. Tests: `.venv\Scripts\python -m pytest` in `backend`, `npm test` in the root.

With Docker instead: set `GROQ_API_KEY` in `backend/.env`, then `docker compose up --build` and open http://localhost:8080 (API on http://localhost:8787). This also starts Postgres with pgvector.

Port 8787 is used because port 8000 is often taken by other local projects.

## Deploy online (free: Neon + Render + Vercel)

1. **Database (Neon).** Sign up at https://neon.tech, create a project (region: Frankfurt), and copy the connection string (`postgresql://…?sslmode=require`). pgvector is built in; the backend creates the extension and tables itself.
2. **API (Render).** Sign up at https://render.com with GitHub → **New → Blueprint** → pick this repository. Render reads `render.yaml`. When asked, paste `GROQ_API_KEY` and `DATABASE_URL`. Wait for the deploy, then open `https://<service>.onrender.com/api/health` until it shows `"ready": true`.
3. **Web app (Vercel).** In the Vercel project → Settings → Environment Variables, add `VITE_ASSISTANT_API_URL` = `https://<service>.onrender.com`, then redeploy. If your site address is not `https://estonia-grasslands.vercel.app`, add it to `ALLOWED_ORIGINS` in Render.

Render's free instance sleeps after 15 minutes without traffic. The first question after a pause takes about 30–60 seconds; meanwhile the app answers with keyword search and says so. Free instances have 512 MB of memory, which this backend fits; if Render reports out-of-memory, use the Starter plan or set `EMBED_MODEL` to a smaller model.

## Privacy

Only the question text and the last few chat messages are sent: never parcels, entries or photos. The backend does not store questions. Groq processes them to generate the answer (see Groq's privacy policy). The app's Privacy page says this when the AI assistant is switched on.

## Known limits

- Answers are only as complete as the 47 passages in the library; anything else gets "the library does not cover this".
- The model writes understandable Estonian but makes occasional grammar slips (for example "niitamist" instead of "niitmist"). The verbatim source text is always one click away.
- Rarely, the model still writes a sentence without a citation. Every cited passage is shown in full, so claims can be checked.

## Checking quality

`backend/tests/eval_cases.json` holds questions with the passages that must be found. To compare embedding models:

```powershell
cd backend
.venv\Scripts\python eval_retrieval.py sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

With `GROQ_API_KEY` set it also measures the full pipeline including query rewriting.

Add a case whenever a real question gets a poor answer.
