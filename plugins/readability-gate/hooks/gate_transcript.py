"""Reads a Claude Code transcript the way the owner lived it: which turn is
running, what the owner last typed, and which final message they have read."""
import json
import re
from dataclasses import dataclass

# Typed-looking user entries that the owner did not actually write.
NOT_OWNER_PREFIXES = (
    'Base directory for this skill',
    'Stop hook feedback',
    'This session is being continued',
    'A session-scoped Stop hook',
    '[Request interrupted',
    'Caveat:',
)
INJECTED = re.compile(r'<(budget|system-reminder)[^>]*>.*?</\1[^>]*>', re.S)
COMMAND_NAME = re.compile(r'<command-name>(.*?)</command-name>', re.S)
COMMAND_ARGS = re.compile(r'<command-args>(.*?)</command-args>', re.S)


def is_main_user_entry(entry):
    """A user entry in the main thread that is not hook feedback."""
    return (entry.get('type') == 'user' and not entry.get('isMeta')
            and not entry.get('isSidechain'))


def content_of(entry):
    return (entry.get('message') or {}).get('content')


def parts_of(content, kind):
    return [p for p in content if isinstance(p, dict) and p.get('type') == kind]


def has_tool_result(content):
    return isinstance(content, list) and bool(parts_of(content, 'tool_result'))


def joined_text(content):
    """The text of a string or list content; '' for anything else."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(p.get('text', '') for p in parts_of(content, 'text'))
    return ''


def command_text(text):
    """A slash-command turn arrives as <command-name>/x</command-name> plus
    <command-args>; return "/x args", or None for other tagged entries."""
    name = COMMAND_NAME.search(text)
    if not name:
        return None
    args = ''.join(COMMAND_ARGS.findall(text)[:1])
    return (name.group(1).strip() + ' ' + args.strip()).strip()


def entry_text(entry):
    """Return the owner-typed text of a transcript user entry, or None."""
    content = content_of(entry)
    if not is_main_user_entry(entry) or has_tool_result(content):
        return None
    return owner_text(INJECTED.sub('', joined_text(content)).strip())


def owner_text(text):
    """The text when the owner typed it, a slash command as "/x args", or
    None for text that only looks typed."""
    if text.startswith('<'):
        return command_text(text)
    if not text or text.startswith(NOT_OWNER_PREFIXES):
        return None
    return text


def starts_turn(entry):
    """True for any user entry that begins a turn: the owner's typing, but also
    task notifications and other events. Block feedback is isMeta, so a rewrite
    stays in the turn it rewrites. A compaction summary lands in the middle of
    a turn, so it starts none."""
    if not is_main_user_entry(entry) or entry.get('isCompactSummary'):
        return False
    content = content_of(entry)
    return isinstance(content, (str, list)) and not has_tool_result(content)


def assistant_text(entry):
    if entry.get('type') != 'assistant' or entry.get('isSidechain'):
        return ''
    return joined_text(content_of(entry)).strip()


@dataclass
class Seen:
    """What the owner has seen when a turn ends.

    turn is the uuid of the entry that started the turn. In a dispatcher run
    the owner types once and events start every later turn, so the key must
    come from the event, not from the owner's message. request is what the
    owner last typed, and by_event is True when an event started this turn.
    last_read is the final message the owner last replied to: finals that
    ended event-started turns may never have been opened."""
    turn: str = ''
    request: str = ''
    by_event: bool = False
    last_read: str = ''

    def start_turn(self, entry, last_text):
        """Record a user entry that starts a turn. last_text is the final
        message of the turn that just ended; a typed reply means it was read."""
        typed = entry_text(entry)
        self.turn = entry.get('uuid', '')
        self.by_event = not typed
        if typed:
            self.request = typed
            self.last_read = last_text or self.last_read


def parse_line(line):
    try:
        return json.loads(line)
    except ValueError:
        return None


def read_entries(transcript_path):
    """The entries of a JSONL transcript; a missing file reads empty."""
    try:
        with open(transcript_path, encoding='utf-8', errors='replace') as f:
            yield from (e for e in map(parse_line, f) if isinstance(e, dict))
    except OSError:
        return


def read_transcript(transcript_path):
    seen, last_text = Seen(), ''
    for entry in read_entries(transcript_path):
        text = assistant_text(entry)
        if text:
            last_text = text
        elif starts_turn(entry):
            seen.start_turn(entry, last_text)
            last_text = ''
    return seen
