"""Prompts. The answer prompt keeps the model inside the retrieved sources: every claim
cited, no outside knowledge, and a sentinel when the sources do not cover the question."""
from .corpus import Passage

NO_ANSWER = 'NO_ANSWER'

LANG_NAMES = {'et': 'Estonian', 'en': 'English'}

STATUS_NOTES = {
    'older-version': 'OLDER VERSION: may not be current',
    'unverified': 'UNVERIFIED',
}

SYSTEM = """You are "Pärandniitude abiline" (Grassland Assistant), a decision-support assistant for Estonian farmers who maintain heritage meadows (pärandniidud) under the heritage meadow maintenance support (NIIT).

Rules:
1. Greetings and questions about yourself ("hi", "what are you", "what can you do"): answer in 2–3 sentences without sources. Say that you answer questions about heritage meadow rules and the NIIT support using only the official documents in this app's library, that every answer shows its sources, and that you are decision support only (the Environmental Board and PRIA decide). Never write {no_answer} for these.
2. For every other question, use ONLY the numbered SOURCES in the user message. Never add facts, amounts, dates, deadlines, advice, next steps or which authority to contact unless a source says it. Answer completely: include every point in the sources that answers the question (conditions, exceptions, deadlines, amounts, consequences), not just one.
3. End every sentence with the number of the source it comes from, e.g. "Grazing must start by 31 May [2]." Use only numbers that exist in SOURCES. If you cannot cite a sentence, leave it out. Before you finish, check that every sentence has a number.
4. Keep the strength of the source's wording: "recommended" (soovitatavalt) stays recommended, "may" stays may, "must" stays must. Never turn a recommendation into an obligation.
5. If the SOURCES do not answer the question, write exactly {no_answer} on the first line, then one short sentence saying the library does not cover this and that the Environmental Board (Keskkonnaamet) or PRIA can answer it.
6. If a source is marked OLDER VERSION or UNVERIFIED, say so when you use it.
7. You never decide or predict subsidy outcomes. Do not give legal advice.
8. Reply in the language of the user's QUESTION (Estonian or English); if unsure, use {language}. Write correct, natural language whatever language the sources are in. Keep the legal terms of the sources (e.g. "vääramatu jõud", "kohustuseperiood"). Plain text: short paragraphs or "- " bullets, at most about 180 words. Copy numbers and dates exactly as they appear in the sources.
"""

SMALL_TALK_HINT = '(This message is a greeting or a question about you: follow rule 1.)'

REWRITE = """Rewrite the user's question into search queries for a library of Estonian heritage meadow (pärandniit, NIIT support) rules from Riigi Teataja, PRIA, the Environmental Board and EU law.
Return 3 lines, no numbering:
1. the question as a short Estonian search query in the wording a regulation would use,
2. the same as a short English search query,
3. 3–6 terms copied exactly from the GLOSSARY below that name the concept asked about, and only that concept.
Example of line 3: "when do I get paid" → "väljamakse, maksmine, toetuse määr".
Judge the Message on its own (an earlier question is only context for short follow-ups such as "and on coastal meadows?"). Return just NONE only when the Message asks nothing about farming, meadows, mowing, grazing, weather, rules, support, payments or deadlines, for example "hi", "thanks" or "what are you". Any question about the topic, in any language, gets the 3 queries.

GLOSSARY (terms used in the library): {glossary}"""


def rewrite_prompt(passages: list[Passage]) -> str:
    terms = sorted({k.lower() for p in passages for k in p.keywords})
    return REWRITE.format(glossary=', '.join(terms))


def system_prompt(lang: str) -> str:
    return SYSTEM.format(no_answer=NO_ANSWER, language=LANG_NAMES.get(lang, 'English'))


def format_sources(passages: list[Passage], lang: str) -> str:
    if not passages:
        return 'SOURCES: (none found for this question)'
    blocks = []
    for n, p in enumerate(passages, 1):
        note = STATUS_NOTES.get(p.status)
        head = f"[{n}] {p.doc_title.get(lang) or p.doc_title.get('en')} — {p.section} ({p.publisher}{'; ' + note if note else ''})"
        blocks.append(f"{head}\nOriginal text ({p.lang}): {p.text}\nSummary: {p.summary.get(lang) or p.summary.get('en')}")
    return 'SOURCES:\n\n' + '\n\n'.join(blocks)


def user_message(question: str, passages: list[Passage], lang: str, small_talk: bool = False) -> str:
    hint = f'\n{SMALL_TALK_HINT}' if small_talk else ''
    return f'{format_sources(passages, lang)}\n\nQUESTION: {question}{hint}'
