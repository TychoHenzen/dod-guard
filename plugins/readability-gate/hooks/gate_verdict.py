"""The reader's reply, split into its sections, and the verdict on it.

The reader writes the message the owner wanted. Code compares its length with
the real message, because a reader asked "is this readable?" said yes to long,
report-style messages that it had just listed three or four problems in.
"""
import re
from dataclasses import dataclass

# Measured on real final messages, three runs each: the drafts for messages
# the owner rejected cut 36-70% and 105 words or more; the drafts for messages
# the owner accepts cut under 30 words.
MIN_CUT_WORDS = 60
MIN_CUT_SHARE = 0.30
REQUIRED = ('PROBLEMS', 'WANTED')
NOTES = ('UNDERSTOOD', 'PROBLEMS')
# Case-sensitive, so a "Problems:" line inside the draft is not a heading.
SECTION = re.compile(r'^\W*(UNDERSTOOD|PROBLEMS|WANTED|VERDICT):', re.M)
VERDICT = re.compile(r'^\W*VERDICT:\W*(PASS|FAIL)\b', re.M | re.I)
CODE_BLOCK = re.compile(r'^\s*```.*?^\s*```', re.M | re.S)
WORD = re.compile(r"[A-Za-z0-9']+")


@dataclass
class Review:
    notes: str   # what the reader understood and the problems it found
    wanted: str  # the reader's draft of the message the owner wanted
    reason: str  # why the message fails; empty when it passes
    size: str    # the word counts of the message and the draft


def sections(reply):
    """{name: text} for each section heading; the first one that has text
    wins."""
    found = {}
    marks = list(SECTION.finditer(reply))
    for mark, after in zip(marks, marks[1:] + [None]):
        text = reply[mark.end():after.start() if after else len(reply)]
        if text.strip():
            found.setdefault(mark.group(1), text.strip())
    return found


def prose_words(text):
    # ASSUMPTION: a code block is material the owner asked for, such as a
    # commit message or a command. The draft may copy it or drop it, so only
    # prose is counted and neither choice decides the verdict.
    return len(WORD.findall(CODE_BLOCK.sub('', text)))


def none_listed(problems):
    return problems.strip().strip('."').lower() == 'none'


def judge(message, reply):
    """Split the reader's reply and decide. Raises when a section is missing,
    so a garbled review is reported instead of passed."""
    reply = reply or ''
    parts = sections(reply)
    missing = [name for name in REQUIRED if name not in parts]
    verdicts = VERDICT.findall(reply)
    if missing or not verdicts:
        raise RuntimeError('review is missing %s: %r'
                           % (', '.join(missing) or 'a verdict', reply[:200]))
    before, after = prose_words(message), prose_words(parts['WANTED'])
    cut = before - after
    reasons = []
    if verdicts[-1].upper() == 'FAIL':
        reasons.append('cannot act on it')
    # A reader that found no problems may write "unchanged" for the draft.
    shorter = cut >= MIN_CUT_WORDS and cut >= MIN_CUT_SHARE * before
    if shorter and not none_listed(parts['PROBLEMS']):
        reasons.append('too long')
    notes = '\n\n'.join('%s:\n%s' % (name, parts[name])
                        for name in NOTES if parts.get(name))
    return Review(notes=notes, wanted=parts['WANTED'],
                  reason=' and '.join(reasons),
                  size='%d -> %d words' % (before, after))
