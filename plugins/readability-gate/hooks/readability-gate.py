#!/usr/bin/env python3
"""Stop hook: checks that the final message of a turn reads well for the owner.

The owner reads almost only the last assistant message of each turn. So that
message must explain the whole turn on its own; text from earlier in the same
turn does not count as read. What the owner has read is their own request and
the final messages of the last few turns, and the message should build on
those instead of repeating them.

Three checks, cheapest first:
- repetition: sentences that restate a recent final message (no model call)
- density: spaCy finds the hard-to-read constructions measured in Clark,
  Martin & Mahowald 2026, "Why is AI-generated language so hard to
  understand?" (no model call)
- references: a reader model, given what the owner has read, lists names,
  numbers and terms the message never explains
On any failure the stop is blocked and the findings go back to the model.
Fails open on any error, with a visible warning. Set READABILITY_GATE=off to skip.
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import time

MIN_CHARS = 80
# A first rewrite often still leaves a bare reference, so the rewrite is checked
# once more. Two blocks per turn bounds the added time.
MAX_BLOCKS_PER_TURN = 2
TIMEOUT_S = 90
# Haiku passed replies the owner called unreadable; sonnet caught them.
REVIEW_MODEL = 'sonnet'
# Final messages of earlier turns that count as read. Older ones are "ten pages
# back" and the owner will not remember them.
READ_TURNS = 3
# A sentence counts as repeated when this share of its content words appeared
# together in one sentence of a recent final message.
REPEAT_OVERLAP = 0.7
REPEAT_MIN_WORDS = 6
# Fail on repetition when this many sentences are repeats.
REPEAT_FAIL_COUNT = 2
# Dependency arcs longer than this many words are flagged.
LONG_DEP = 12
CLAUSE_DEPS = {'punct', 'ROOT', 'conj', 'cc', 'parataxis', 'advcl', 'ccomp', 'xcomp',
               'relcl', 'acl', 'appos', 'dep', 'prep', 'mark'}
# Density findings reported back, and the count that fails the message.
DENSITY_MAX_NOTES = 6
DENSITY_FAIL_COUNT = 3

STATE_DIR = os.path.join(os.path.expanduser('~'), '.claude', 'hook-state')
LOG_PATH = os.path.join(STATE_DIR, 'readability-gate.log')
TOKEN_PATH = os.path.join(os.path.expanduser('~'), '.claude', 'readability-gate.token')
# A raw Messages API call with this sk-ant-oat01 token gets HTTP 429 "Error" on
# every model; the claude CLI with CLAUDE_CODE_OAUTH_TOKEN works.

# Typed-looking user entries that the owner did not actually write.
NOT_OWNER_PREFIXES = (
    'Base directory for this skill',
    'Stop hook feedback',
    'This session is being continued',
    'A session-scoped Stop hook',
    '[Request interrupted',
    'Caveat:',
)

# Verbs that normally take a person as subject. An inanimate noun subject with
# one of these ("the check swallows the error") is one of the paper's markers.
ANIMATE_VERBS = {
    'want', 'think', 'believe', 'decide', 'refuse', 'complain', 'insist',
    'swallow', 'know', 'expect', 'prefer', 'hate', 'love', 'like', 'agree',
    'argue', 'claim', 'worry', 'care', 'ask', 'promise', 'try', 'pretend',
    'forget', 'remember', 'notice', 'realize', 'understand', 'feel', 'see',
}
PERSON_WORDS = {'user', 'owner', 'reviewer', 'agent', 'assistant', 'developer',
                'author', 'person', 'people', 'team', 'maintainer', 'you', 'claude'}

# The old gate audited ASD-STE100 grammar; its rewrites read like a translated
# manual. The gate after that made the reader forget every earlier turn, which
# forced each status update to re-explain everything. This reader knows what
# the owner actually read and checks only references.
READER_PROMPT = """You are the owner of a software project. An AI assistant works for you, often for a long time on its own. You read only the last message it sends at the end of each turn, for example as a phone notification. You never read the assistant's work in between.

You are given: your own tools, the request you typed, the last few end-of-turn messages you already read, and the new end-of-turn message. You remember what those earlier messages said. You will not open any issue, pull request, file, log or document.

Check one thing: can you follow the new message and act on it? Write three sections.

UNDERSTOOD:
In 2 to 4 plain sentences, say what you understood: what was done or found this turn, why it matters, and what you must do or decide, if anything. Where you cannot tell, say so.

GAPS:
One line per thing you could not understand, as: "<short quote>" | <what you could not tell> | explain or drop. "drop" means you do not need it at all. At most 6, most important first. A gap is:
- an issue, pull request, step or item number, or a made-up name or label ("the gate", "the helper", "Preflight checkpoint"), that neither this message nor the earlier messages you read say anything about
- a number that does not say what it counts or whether the change is good or bad
- a result or decision whose problem you were never told
- "it", "that" or "the earlier one" pointing at something you were never told
Not a gap: anything explained in the earlier messages you read, anything in your request, widely known tools, languages and terms (git, GitHub, CI, pull request), your own tools listed, and names from your own code when the sentence says what role they play. Do not ask for dates, time spans or file locations the point does not need. Write "none" if there are no gaps.

VERDICT:
Last line, exactly "VERDICT: PASS" or "VERDICT: FAIL". FAIL only when a gap stops you from following the point or acting on it."""

FEEDBACK = """Readability check on your last message. The owner reads only the final message of each turn, so it must explain what happened in this whole turn by itself. Earlier text in this turn does not count as read. The final messages of the last few turns do count, and should not be repeated.

%s

Send the full message again.
- Open with what changed or what you found this turn.
- Where a name or number matters, say what it is in plain words in the same sentence. Where it does not matter, leave it out.
- Do not restate what a recent final message already told the owner; at most refer to it in a few words.
- Write normal sentences, the way you would brief a colleague.
Do not mention this check."""


def log(msg):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')
    except OSError:
        pass


def command_text(text):
    """A slash-command turn arrives as <command-name>/x</command-name> plus
    <command-args>; return "/x args", or None for other tagged entries."""
    name = re.search(r'<command-name>(.*?)</command-name>', text, flags=re.S)
    if not name:
        return None
    args = re.search(r'<command-args>(.*?)</command-args>', text, flags=re.S)
    return (name.group(1).strip() + ' ' + (args.group(1).strip() if args else '')).strip()


def entry_text(entry):
    """Return the owner-typed text of a transcript user entry, or None."""
    if entry.get('type') != 'user' or entry.get('isMeta') or entry.get('isSidechain'):
        return None
    content = (entry.get('message') or {}).get('content')
    if isinstance(content, list):
        if any(isinstance(p, dict) and p.get('type') == 'tool_result' for p in content):
            return None
        content = '\n'.join(p.get('text', '') for p in content
                            if isinstance(p, dict) and p.get('type') == 'text')
    if not isinstance(content, str):
        return None
    text = re.sub(r'<(budget|system-reminder)[^>]*>.*?</\1[^>]*>', '', content, flags=re.S).strip()
    if text.startswith('<'):
        return command_text(text)
    if not text or text.startswith(NOT_OWNER_PREFIXES):
        return None
    return text


def starts_turn(entry):
    """True for any user entry that begins a turn: the owner's typing, but also
    task notifications and other events. Block feedback is isMeta, so a rewrite
    stays in the turn it rewrites."""
    if entry.get('type') != 'user' or entry.get('isMeta') or entry.get('isSidechain'):
        return False
    content = (entry.get('message') or {}).get('content')
    if isinstance(content, list):
        return not any(isinstance(p, dict) and p.get('type') == 'tool_result' for p in content)
    return isinstance(content, str)


def assistant_text(entry):
    if entry.get('type') != 'assistant' or entry.get('isSidechain'):
        return ''
    content = (entry.get('message') or {}).get('content')
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return '\n'.join(p.get('text', '') for p in content
                         if isinstance(p, dict) and p.get('type') == 'text').strip()
    return ''


def read_transcript(transcript_path):
    """(turn uuid, owner's latest typed text, whether an event started this turn,
    final messages of earlier turns the owner read, oldest first).
    In a dispatcher run the owner types once and events start every later turn,
    so the turn key must come from the event, not from the owner's message."""
    turn, request, by_event = '', '', False
    finals, last_text = [], ''
    try:
        with open(transcript_path, encoding='utf-8', errors='replace') as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                text = assistant_text(entry)
                if text:
                    last_text = text
                    continue
                if not starts_turn(entry):
                    continue
                # The last text before a new turn is the message the owner read.
                if last_text:
                    finals.append(last_text)
                    last_text = ''
                turn = entry.get('uuid', '')
                typed = entry_text(entry)
                by_event = not typed
                if typed:
                    request = typed
    except OSError:
        pass
    return turn, request, by_event, finals[-READ_TURNS:]


def own_tools():
    """Names of the owner's installed plugins and skills: things they know."""
    names = set()
    home = os.path.expanduser('~/.claude')
    try:
        with open(os.path.join(home, 'settings.json'), encoding='utf-8') as f:
            names.update(k.split('@')[0] for k in json.load(f).get('enabledPlugins', {}))
    except (OSError, ValueError):
        pass
    for pattern in ('skills/*/SKILL.md', 'plugins/cache/*/*/*/skills/*/SKILL.md'):
        names.update(os.path.basename(os.path.dirname(p))
                     for p in glob.glob(os.path.join(home, pattern)))
    return ', '.join(sorted(names))


def prose(text):
    """Message text with code blocks, inline code and links' URLs removed, so
    the sentence checks see only what is read as English."""
    text = re.sub(r'```.*?```', ' ', text, flags=re.S)
    text = re.sub(r'`[^`]*`', 'X', text)
    # Quoted examples are cited, not written in the message's own voice.
    text = re.sub(r'"[^"\n]*"', 'X', text)
    text = re.sub(r'\]\([^)]*\)', ']', text)
    return text


SENT_SPLIT = re.compile(r'(?<=[.!?])\s+|\n+')
WORD = re.compile(r"[a-z0-9#']+")
STOP = set('the a an and or but of to in on for with is are was were be been it this that '
           'these those i you we they he she as at by from so not no do does did has have had '
           'will would can could should its it\'s there here than then now just also all any'.split())


def content_words(sentence):
    return {w for w in WORD.findall(sentence.lower()) if w not in STOP}


def repetition_notes(message, finals):
    """Sentences of the message that restate a sentence of a recent final message."""
    earlier = [content_words(s) for f in finals for s in SENT_SPLIT.split(prose(f))]
    earlier = [s for s in earlier if len(s) >= REPEAT_MIN_WORDS]
    notes = []
    for sent in SENT_SPLIT.split(prose(message)):
        words = content_words(sent)
        if len(words) < REPEAT_MIN_WORDS:
            continue
        if any(len(words & e) / len(words) >= REPEAT_OVERLAP for e in earlier):
            notes.append(sent.strip())
    return notes


_NLP = None


def nlp():
    global _NLP
    if _NLP is None:
        import spacy  # deferred: costs about a second, and only on long messages
        _NLP = spacy.load('en_core_web_sm', disable=['ner', 'lemmatizer'])
    return _NLP


def noun_stack(tok):
    """Length of the compound-noun chain ending at tok ("release speed function" = 3)."""
    n = 1
    kids = [c for c in tok.children if c.dep_ == 'compound' and c.pos_ in ('NOUN', 'PROPN')]
    while kids:
        n += 1
        tok = kids[0]
        kids = [c for c in tok.children if c.dep_ == 'compound' and c.pos_ in ('NOUN', 'PROPN')]
    return n


def density_notes(message):
    """Hard-to-read constructions, each as '"<phrase>" | <what to change>'."""
    notes = []
    # Parse line by line: spaCy otherwise joins list items into one sentence.
    for line in prose(message).splitlines():
        if line.strip():
            notes.extend(line_density_notes(nlp()(line)))
    seen, unique = set(), []
    for n in notes:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    return unique


def line_density_notes(doc):
    notes = []
    for tok in doc:
        if tok.pos_ in ('NOUN', 'PROPN') and tok.dep_ != 'compound' and noun_stack(tok) >= 3:
            start = min(t.i for t in tok.subtree if t.dep_ == 'compound' or t is tok)
            notes.append('"%s" | %d nouns stacked; say it with a verb or "of"'
                         % (doc[start:tok.i + 1].text, noun_stack(tok)))
        elif tok.dep_ == 'relcl' and tok.head.pos_ in ('NOUN', 'PROPN'):
            has_rel = any(c.tag_ in ('WDT', 'WP', 'WP$') or c.lower_ == 'that'
                          for c in tok.children)
            has_subj = any(c.dep_ in ('nsubj', 'nsubjpass') for c in tok.children)
            if not has_rel and has_subj:
                notes.append('"%s %s" | dropped "that"; add it back'
                             % (tok.head.text, doc[tok.left_edge.i:tok.i + 1].text))
        elif (tok.dep_ == 'nsubj' and tok.pos_ == 'NOUN'
              and tok.lower_ not in PERSON_WORDS
              and tok.head.pos_ == 'VERB' and tok.head.lower_.rstrip('s') in ANIMATE_VERBS):
            notes.append('"%s %s" | a thing doing what a person does; say what actually happens'
                         % (tok.text, tok.head.text))
        # Links between whole clauses span the clause by nature; only arcs inside
        # one clause make the reader hold a word in mind.
        if tok.dep_ not in CLAUSE_DEPS and abs(tok.i - tok.head.i) > LONG_DEP:
            lo, hi = sorted((tok.i, tok.head.i))
            notes.append('"%s ... %s" | %d words between words that belong together; split the sentence'
                         % (doc[lo].text, doc[hi].text, hi - lo))
    return notes


def build_input(message, request, by_event, finals):
    heading = ('THE LAST REQUEST YOU TYPED (earlier; the assistant kept working on its own since, '
               'so the message may be a later update, not a direct answer):'
               if by_event else 'THE REQUEST YOU TYPED:')
    earlier = ('\n\n'.join('--- earlier message %d ---\n%s' % (i + 1, f[:4000])
                           for i, f in enumerate(finals)) or '(none)')
    return ('YOUR OWN TOOLS AND PLUGINS (you know these): ' + own_tools()
            + '\n\n' + heading + '\n' + ('> ' + request[:3000].replace('\n', '\n> ')
                                         if request else '(none)')
            + '\n\nEND-OF-TURN MESSAGES YOU ALREADY READ, OLDEST FIRST:\n' + earlier
            + '\n\nTHE NEW END-OF-TURN MESSAGE:\n' + message)


def read_token():
    # The /login credential fails to refresh most days, because the desktop app
    # and the CLI share it. A `claude setup-token` token lasts a year.
    try:
        with open(TOKEN_PATH, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def ask_reader(reader_input):
    """Return the reader's reply text. Raises on failure."""
    token = read_token()
    # The parent's settings export MAX_THINKING_TOKENS; thinking only adds latency here.
    env = dict(os.environ, READABILITY_GATE='off', MAX_THINKING_TOKENS='0')
    if token:
        env['CLAUDE_CODE_OAUTH_TOKEN'] = token
    cmd = ['claude', '-p', '--model', REVIEW_MODEL, '--effort', 'low', '--tools', '',
           '--setting-sources', '', '--strict-mcp-config',
           '--no-session-persistence', '--disable-slash-commands',
           '--system-prompt', READER_PROMPT]
    # An empty cwd keeps project CLAUDE.md files out of the reader's context.
    with tempfile.TemporaryDirectory() as empty:
        r = subprocess.run(cmd, input=reader_input, capture_output=True, text=True,
                           encoding='utf-8', timeout=TIMEOUT_S, env=env, cwd=empty)
    if r.returncode != 0:
        # The CLI prints auth failures to stdout, not stderr.
        detail = (r.stderr.strip() or r.stdout.strip())[:300]
        raise RuntimeError('reader exit %d: %s' % (r.returncode, detail))
    return r.stdout.strip()


def notes_from(reply):
    """Empty string on PASS, else the reader's notes.
    Raises when the reply has no verdict, so a garbled review is reported."""
    m = re.search(r'^\W*VERDICT:\W*(PASS|FAIL)\b', reply or '', flags=re.M | re.I)
    if not m:
        raise RuntimeError('review had no VERDICT line: %r' % (reply or '')[:200])
    if m.group(1).upper() == 'PASS':
        return ''
    return reply[:m.start()].strip()


def review(message, request, by_event, finals):
    """All findings as one feedback body, or '' when the message passes."""
    sections = []
    repeats = repetition_notes(message, finals)
    if len(repeats) >= REPEAT_FAIL_COUNT:
        sections.append('REPEATED FROM A RECENT FINAL MESSAGE (cut or shorten to a few words):\n'
                        + '\n'.join('- "%s"' % s[:160] for s in repeats))
    try:
        dense = density_notes(message)
    # spaCy missing raises ImportError; spaCy without en_core_web_sm raises OSError.
    except (ImportError, OSError) as e:
        dense = []
        log('density check skipped: %r' % (e,))
    if len(dense) >= DENSITY_FAIL_COUNT:
        sections.append('HARD TO READ (rewrite these phrases):\n'
                        + '\n'.join('- ' + n for n in dense[:DENSITY_MAX_NOTES]))
    gaps = notes_from(ask_reader(build_input(message, request, by_event, finals)))
    if gaps:
        sections.append(gaps)
    return '\n\n'.join(sections)


def handle_stop(data):
    message = (data.get('last_assistant_message') or '').strip()
    session_id = data.get('session_id', '')
    transcript = data.get('transcript_path', '')
    if len(message) < MIN_CHARS or not session_id or not transcript:
        return

    turn, request, by_event, finals = read_transcript(transcript)
    state_path = os.path.join(STATE_DIR, session_id + '.gate.json')
    try:
        with open(state_path) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    if state.get('turn') != turn:
        state = {'turn': turn, 'blocks': 0}
    if state['blocks'] >= MAX_BLOCKS_PER_TURN:
        return

    started = time.time()
    notes = review(message, request, by_event, finals)
    if not notes:
        log('passed %s turn=%s in %.1fs' % (session_id[:8], turn[:8], time.time() - started))
        return

    state['blocks'] += 1
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(state_path, 'w') as f:
        json.dump(state, f)
    log('blocked %s turn=%s #%d: %s' % (session_id[:8], turn[:8], state['blocks'],
                                        notes.replace('\n', ' | ')[:500]))
    print(json.dumps({'decision': 'block', 'reason': FEEDBACK % notes}))


def main():
    if os.environ.get('READABILITY_GATE', '').lower() == 'off':
        return
    try:
        data = json.loads(sys.stdin.read().lstrip(chr(0xFEFF)))
        if data.get('hook_event_name') == 'Stop':
            handle_stop(data)
    except Exception as e:  # fail open: never trap the session on a gate error
        log('error: %r' % (e,))
        # Failing open silently made a dead gate look like a passing one.
        hint = '' if os.path.exists(TOKEN_PATH) else (
            ' Fix: run `claude setup-token` and save the token in ' + TOKEN_PATH + '.')
        print(json.dumps({'systemMessage': 'Readability check did not run: %s%s' % (e, hint)}))


if __name__ == '__main__':
    main()
