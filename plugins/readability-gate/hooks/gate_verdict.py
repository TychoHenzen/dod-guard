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
    ends = [mark.start() for mark in marks[1:]] + [len(reply)]
    for mark, end in zip(marks, ends):
        text = reply[mark.end():end].strip()
        if text:
            found.setdefault(mark.group(1), text)
    return found


def prose_words(text):
    # ASSUMPTION: a code block is material the owner asked for, such as a
    # commit message or a command. The draft may copy it or drop it, so only
    # prose is counted and neither choice decides the verdict.
    return len(WORD.findall(CODE_BLOCK.sub('', text)))


def none_listed(problems):
    return problems.strip().strip('."').lower() == 'none'


def parse(reply):
    """The reply's sections and its last verdict. Raises when one is missing,
    so a garbled review is reported instead of passed."""
    parts = sections(reply)
    missing = [name for name in REQUIRED if name not in parts]
    verdicts = VERDICT.findall(reply)
    if missing or not verdicts:
        raise RuntimeError('review is missing %s: %r'
                           % (', '.join(missing) or 'a verdict', reply[:200]))
    return parts, verdicts[-1].upper()


def failures(verdict, before, after, problems):
    reasons = []
    if verdict == 'FAIL':
        reasons.append('cannot act on it')
    cut = before - after
    shorter = cut >= MIN_CUT_WORDS and cut >= MIN_CUT_SHARE * before
    # A reader that found no problems may write "unchanged" for the draft.
    if shorter and not none_listed(problems):
        reasons.append('too long')
    return reasons


def judge(message, reply):
    """Split the reader's reply and decide."""
    parts, verdict = parse(reply or '')
    before, after = prose_words(message), prose_words(parts['WANTED'])
    reasons = failures(verdict, before, after, parts['PROBLEMS'])
    notes = '\n\n'.join('%s:\n%s' % (name, parts[name])
                        for name in NOTES if name in parts)
    return Review(notes=notes, wanted=parts['WANTED'],
                  reason=' and '.join(reasons),
                  size='%d -> %d words' % (before, after))
