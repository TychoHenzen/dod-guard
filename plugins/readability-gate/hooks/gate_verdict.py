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
REQUIRED = ('PROBLEMS', 'WANTED', 'VERDICT')
NOTES = ('UNDERSTOOD', 'PROBLEMS')
# Case-sensitive, so a "Problems:" line inside the draft is not a heading.
# The lead-in, such as "**", stays on the heading's own line, so a match never
# starts on a blank line above it.
SECTION = re.compile(
    r'^[^\w\n]*(UNDERSTOOD|PROBLEMS|WANTED|VERDICT):', re.M)
VERDICT = re.compile(r'^[^\w\n]*VERDICT:\W*(PASS|FAIL)\b', re.M | re.I)
# A Markdown fence of backticks or tildes, closed by the same fence.
CODE_BLOCK = re.compile(r'^[ \t]*(`{3,}|~{3,}).*?^[ \t]*\1', re.M | re.S)
NOT_NEWLINE = re.compile(r'[^\n]')
WORD = re.compile(r"[A-Za-z0-9']+")


@dataclass
class Review:
    notes: str   # what the reader understood and the problems it found
    wanted: str  # the reader's draft of the message the owner wanted
    reason: str  # why the message fails; empty when it passes
    size: str    # the word counts of the message and the draft


def blanked(text):
    """The text with every code block blanked out at the same length, so a
    heading or verdict line that the draft copies inside one is not read as
    the reader's own."""
    return CODE_BLOCK.sub(lambda m: NOT_NEWLINE.sub(' ', m.group()), text)


def sections(reply):
    """{name: text} for each section heading; the first one that has text
    wins."""
    found = {}
    marks = list(SECTION.finditer(blanked(reply)))
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
    """The reply's sections, with VERDICT holding every verdict line. Raises
    when one is missing, so a garbled review is reported instead of passed."""
    parts = dict(sections(reply), VERDICT=VERDICT.findall(blanked(reply)))
    missing = [name for name in REQUIRED if not parts.get(name)]
    if missing:
        raise RuntimeError('review is missing %s: %r'
                           % (', '.join(missing), reply[:200]))
    return parts


def too_long(before, after, problems):
    cut = before - after
    shorter = cut >= MIN_CUT_WORDS and cut >= MIN_CUT_SHARE * before
    # A reader that found no problems may write "unchanged" for the draft.
    return shorter and not none_listed(problems)


def notes_of(parts):
    return '\n\n'.join('%s:\n%s' % (name, parts[name])
                       for name in NOTES if name in parts)


def judge(message, reply):
    """Split the reader's reply and decide."""
    parts = parse(reply or '')
    before, after = prose_words(message), prose_words(parts['WANTED'])
    failed = [name for name, hit in (
        ('cannot act on it', parts['VERDICT'][-1].upper() == 'FAIL'),
        ('too long', too_long(before, after, parts['PROBLEMS']))) if hit]
    return Review(notes=notes_of(parts), wanted=parts['WANTED'],
                  reason=' and '.join(failed),
                  size='%d -> %d words' % (before, after))
