#!/usr/bin/env python3
"""Stop hook: checks that the final message of a turn answers the owner in
plain spoken English.

The owner reads almost only the last assistant message of each turn, often as
a phone notification. That message must stand on its own. Text from earlier in
the same turn is unread, and so is every earlier final message except the one
the owner last replied to.

One check: a reader model plays the owner. It gets the owner's request, the
message the owner last replied to, and the new message. It judges the new
message on the rules of talk-normal (github.com/hexiecs/talk-normal) plus
references the owner has never seen:
- does it lead with the answer to what was asked
- does it use names, numbers or labels the owner has not seen
- is any sentence hard to follow on one read
- does it sound like a person talking, or like a report or a form
- can the owner make each decision it asks for from the message alone
- padding: filler, "not X but Y" frames, summary labels, offer menus
A failing message goes back once for a rewrite. At session start the same
rules go into Claude's context, so the first draft follows them. Fails open on
any error, with a visible warning. Set READABILITY_GATE=off to skip.
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
# A second block mostly brought new nitpicks instead of a better message, and
# each one costs the owner another wait.
MAX_BLOCKS_PER_TURN = 1
TIMEOUT_S = 90
# Haiku passed replies the owner called unreadable; sonnet caught them.
REVIEW_MODEL = 'sonnet'
LAST_READ_CHARS = 6000
REQUEST_CHARS = 3000

STATE_DIR = os.path.join(os.path.expanduser('~'), '.claude', 'hook-state')
LOG_PATH = os.path.join(STATE_DIR, 'readability-gate.log')
TOKEN_PATH = os.path.join(os.path.expanduser('~'), '.claude', 'readability-gate.token')
# A raw Messages API call with this sk-ant-oat01 token gets HTTP 429 "Error" on
# every model; the claude CLI with CLAUDE_CODE_OAUTH_TOKEN works, as in
# Reports/system-health/run.ps1.

# Typed-looking user entries that the owner did not actually write.
NOT_OWNER_PREFIXES = (
    'Base directory for this skill',
    'Stop hook feedback',
    'This session is being continued',
    'A session-scoped Stop hook',
    '[Request interrupted',
    'Caveat:',
)

# Earlier versions of this gate, and why they went:
# - An ASD-STE100 grammar audit. Its rewrites read like a translated manual.
# - A reader that forgot every earlier turn, so each update re-explained all.
# - A spaCy density check (noun stacks, dropped "that", long dependencies).
#   Over half its noun-stack findings were tokenizer noise ("dod-guard" split
#   in three, list markers), and its fixes made the text stiffer, not clearer.
# - A repetition check that counted the last three final messages as read.
#   It cut decision lists the owner had just asked to see again, and the
#   rewrites pointed at "items 1 to 5 of my last report" instead.
READER_PROMPT = """You are the owner of a software project. An AI assistant works for you, often for a long time on its own. You read only the last message it sends at the end of each turn, often as a phone notification. You read nothing it did in between.

You are given your own tools, the request you typed, the last message of the assistant that you replied to (if any), and the new message. You will not open any issue, pull request, file, log or document. You remember your request and the message you replied to. You have not read anything else the assistant saw or wrote.

Read the new message once, the way you would read a text from a colleague. Then write three sections.

UNDERSTOOD:
In 2 to 4 plain sentences, say what you took from it: what happened or what the answer is, and what you must do or decide, if anything. Where you cannot tell, say so.

PROBLEMS:
One line per problem, as: "<short quote>" | <what is wrong, in your own words>. Most important first, at most 6. Look for these:
1. Answer. Is what you asked for at the top, in full? A question should be answered in the first sentence. Something you asked to see should be there, not pointed at. Status, process or background placed before the answer is a problem.
2. Unread references. An issue, pull request, task, step, stage or group number, a file, a check, a script, or a made-up label that the message uses as if you knew it. It is a problem only when neither this message, your request, nor the message you replied to says what it is. Widely known tools and terms (git, GitHub, CI, pull request, test, branch) and your own tools listed above are fine.
3. Hard sentences. A sentence you had to read twice: packed with nouns, missing the small words, a chain of clauses, or a term carrying a whole idea. Say what you could not follow.
4. Voice. Does it sound like a person answering you, or like a report, a form or a legal document? Signs: field labels in place of sentences, lines that are all fragments, the actor left out, stiff formal wording where plain words would do. Headings are fine; judge the sentences under them.
5. Decisions. When it asks you to decide, can you decide from this message alone? You need to know what each choice does, and either which one the assistant recommends or why it is your call.
6. Padding. Filler openers, restating your question, a "not X, but Y" frame where a plain claim would do, a label announcing a summary, the same point said twice in other words, an offer menu at the end ("if you want, I can..."), bullets used as decoration rather than for a real list.
Write "none" if there are no problems.
Text in a code block is material for somewhere else: a file, a prompt, a command. Check only that the message says what it is for, and leave its wording alone.

VERDICT:
Last line, exactly "VERDICT: PASS" or "VERDICT: FAIL".
FAIL when the answer is missing or buried, when you cannot follow a point or make a decision it asks of you, or when most of the message reads like a report. Padding alone fails only at three or more cases. Otherwise PASS."""

# Positive instructions only: talk-normal found that a bad example quoted in a
# rule gets copied by the writer instead of avoided.
FEEDBACK = """The owner could not follow your last message. A reader who has seen only what the owner has seen (their request and the last message they replied to) reported this:

%s

Write the message again from the top, as a fresh answer to the owner rather than an edit of the old wording.
- Start with the answer to what the owner asked, or with what happened, in one or two plain sentences.
- Keep every fact and every decision. Where the reader got lost, explain that thing in place, in plain words: what it is and why it matters to the owner. A bare number or label can go, as long as the thing it named stays.
- For each decision, say what each choice does and which one you recommend. When the facts do not favor one, say it is the owner's call and why.
- Write sentences you would say out loud to the owner, with the small words left in.
- Use a list only for a real list. Keep any heading or format a skill requires.
Do not mention this check."""

# Injected at session start, so the first draft follows the same rules and the
# Stop check has less to send back. talk-normal works this way: a prompt read
# before writing, not a check after it.
GUIDE = """How to write the last message of each turn (readability-gate plugin):
The owner reads only the last message of each turn, often on a phone, and nothing you did in between. They remember their own request and the last message of yours that they replied to.
- Open with the answer to what they asked, or with what happened. Status and process come after, if at all.
- When they ask to see something, write it out in full.
- The first time you use an issue, task or step number, a file, a check, a script or a label, say what it is, unless their request or the message they replied to already did. Or describe the thing and leave the label out.
- Write the way you would say it to a colleague: full sentences with the small words kept, the actor named, plain words over formal ones.
- For each decision, say what each choice does and which one you recommend. When the facts do not favor one, say it is their call and why.
- State each claim directly. Use a list only for a real list. Stop when the content ends, with the next step if there is one.
Headings and formats that a skill requires stay; these rules apply to the sentences inside them."""


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
    stays in the turn it rewrites. A compaction summary lands in the middle of
    a turn, so it starts none."""
    if (entry.get('type') != 'user' or entry.get('isMeta') or entry.get('isSidechain')
            or entry.get('isCompactSummary')):
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
    the final message the owner last replied to).
    In a dispatcher run the owner types once and events start every later turn,
    so the turn key must come from the event, not from the owner's message.
    A final message counts as read only when the owner typed a reply after it:
    finals that ended event-started turns may never have been opened."""
    turn, request, by_event, last_read = '', '', False, ''
    last_text = ''
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
                turn = entry.get('uuid', '')
                typed = entry_text(entry)
                by_event = not typed
                if typed:
                    request = typed
                    if last_text:
                        last_read = last_text
                last_text = ''
    except OSError:
        pass
    return turn, request, by_event, last_read


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


def build_input(message, request, by_event, last_read, tools):
    heading = ('THE LAST REQUEST YOU TYPED (earlier; the assistant kept working on its own since, '
               'so the message may be a later update, not a direct answer):'
               if by_event else 'THE REQUEST YOU TYPED:')
    quoted = ('> ' + request[:REQUEST_CHARS].replace('\n', '\n> ')) if request else '(none)'
    return ('YOUR OWN TOOLS AND PLUGINS (you know these): ' + tools
            + '\n\n' + heading + '\n' + quoted
            + '\n\nTHE LAST MESSAGE YOU REPLIED TO:\n' + (last_read[:LAST_READ_CHARS] or '(none)')
            + '\n\nTHE NEW MESSAGE:\n' + message)


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
    # errors='replace': mis-decoded text in a message can hold lone surrogates,
    # which strict UTF-8 refuses to encode.
    with tempfile.TemporaryDirectory() as empty:
        r = subprocess.run(cmd, input=reader_input, capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=TIMEOUT_S,
                           env=env, cwd=empty)
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


def review(message, request, by_event, last_read):
    """The reader's notes as one feedback body, or '' when the message passes."""
    return notes_from(ask_reader(build_input(message, request, by_event, last_read, own_tools())))


def handle_stop(data):
    message = (data.get('last_assistant_message') or '').strip()
    session_id = data.get('session_id', '')
    transcript = data.get('transcript_path', '')
    if len(message) < MIN_CHARS or not session_id or not transcript:
        return

    turn, request, by_event, last_read = read_transcript(transcript)
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
    notes = review(message, request, by_event, last_read)
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
        event = data.get('hook_event_name')
        if event == 'SessionStart':
            print(json.dumps({'hookSpecificOutput': {'hookEventName': 'SessionStart',
                                                     'additionalContext': GUIDE}}))
        elif event == 'Stop':
            handle_stop(data)
    except Exception as e:  # fail open: never trap the session on a gate error
        log('error: %r' % (e,))
        # Failing open silently made a dead gate look like a passing one.
        hint = '' if os.path.exists(TOKEN_PATH) else (
            ' Fix: run `claude setup-token` and save the token in ' + TOKEN_PATH + '.')
        print(json.dumps({'systemMessage': 'Readability check did not run: %s%s' % (e, hint)}))


if __name__ == '__main__':
    main()
