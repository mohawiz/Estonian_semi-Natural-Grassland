"""Tokenising for the keyword half of hybrid search. Diacritics are folded and words
cut to a 5-letter prefix, a cheap stand-in for Estonian stemming (niitmine, niitmise,
niitmist → niitm)."""
import re
import unicodedata

STOPWORDS = set(
    (
        # English
        'the and for from with are was were been being does did can could should would will shall may might must '
        'what which who whom when where why how then than not yes there their they them his her about into over '
        'under any all some more most much many very just also only have has had get got tell explain please you your this that these those '
        # Estonian
        'ning või kas mis mida mille milline millised kuidas kus kui see seda selle need neid mina meie sina teie tema '
        'nad nemad oli olid olema olen oled oleme olete pole ole aga siis veel juba mul minu mulle meil oma kes keda '
        'kelle kuhu millal miks palun mitte nii väga ainult siin seal üks üle alla saab saan saame tuleb peab pean peame '
        'võib võin võime kohta'
    ).split()
)


def fold(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKD', s.lower()) if not unicodedata.combining(c))


_FOLDED_STOP = {fold(w) for w in STOPWORDS}


def tokens(s: str) -> list[str]:
    out: list[str] = []
    for w in re.findall(r'[a-z0-9]+', fold(s)):
        if len(w) < 3 or w in _FOLDED_STOP:
            continue
        stem = w[:5]
        if stem not in out:
            out.append(stem)
    return out


def index_text(s: str) -> str:
    """The text stored for full-text search: folded, stemmed tokens joined by spaces."""
    return ' '.join(tokens(s))
