"""The reader check: a model plays the owner, lists what costs them effort in
the final message, and writes the message they wanted."""
import glob
import json
import os
import subprocess
import tempfile

from gate_verdict import judge

# Haiku passed replies the owner called unreadable; sonnet caught them.
REVIEW_MODEL = 'sonnet'
TIMEOUT_S = 90
LAST_READ_CHARS = 6000
REQUEST_CHARS = 3000

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPT_DIR = os.path.join(os.path.dirname(HOOKS_DIR), 'prompts')
CLAUDE_HOME = os.path.join(os.path.expanduser('~'), '.claude')
TOKEN_PATH = os.path.join(CLAUDE_HOME, 'readability-gate.token')
SKILL_GLOBS = ('skills/*/SKILL.md', 'plugins/cache/*/*/*/skills/*/SKILL.md')
TYPED_HEADING = 'THE REQUEST YOU TYPED:'
EVENT_HEADING = ('THE LAST REQUEST YOU TYPED (earlier; the assistant kept '
                 'working on its own since, so the message may be a later '
                 'update, not a direct answer):')
READER_INPUT = """YOUR OWN TOOLS AND PLUGINS (you know these): {tools}

{heading}
{request}

THE LAST MESSAGE YOU REPLIED TO:
{last_read}

THE NEW MESSAGE:
{message}"""
READER_ARGS = ['claude', '-p', '--model', REVIEW_MODEL, '--effort', 'low',
               '--tools', '', '--setting-sources', '', '--strict-mcp-config',
               '--no-session-persistence', '--disable-slash-commands']


def load_prompt(name):
    """The text of prompts/<name>.md."""
    with open(os.path.join(PROMPT_DIR, name + '.md'), encoding='utf-8') as f:
        return f.read().strip()


def enabled_plugins():
    settings = os.path.join(CLAUDE_HOME, 'settings.json')
    try:
        with open(settings, encoding='utf-8') as f:
            plugins = json.load(f).get('enabledPlugins', {})
    except (OSError, ValueError):
        return []
    return [key.split('@')[0] for key in plugins]


def own_tools():
    """Names of the owner's installed plugins and skills: things they know."""
    names = set(enabled_plugins())
    for pattern in SKILL_GLOBS:
        for path in glob.glob(os.path.join(CLAUDE_HOME, pattern)):
            names.add(os.path.basename(os.path.dirname(path)))
    return ', '.join(sorted(names))


def quoted(request):
    if not request:
        return '(none)'
    return '> ' + request[:REQUEST_CHARS].replace('\n', '\n> ')


def build_input(message, seen, tools):
    """The reader's input: what the owner knows, then the new message."""
    return READER_INPUT.format(
        tools=tools, message=message, request=quoted(seen.request),
        heading=EVENT_HEADING if seen.by_event else TYPED_HEADING,
        last_read=seen.last_read[:LAST_READ_CHARS] or '(none)')


def read_token():
    # The /login credential fails to refresh most days, because the desktop app
    # and the CLI share it. A `claude setup-token` token lasts a year.
    try:
        with open(TOKEN_PATH, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def reader_env():
    # READABILITY_GATE=off keeps the reader's own session from being judged.
    # The parent's settings export MAX_THINKING_TOKENS; thinking only adds
    # latency here. A raw Messages API call with the setup token gets HTTP
    # 429 on every model, so the token goes to the claude CLI instead.
    env = dict(os.environ, READABILITY_GATE='off', MAX_THINKING_TOKENS='0')
    token = read_token()
    if token:
        env['CLAUDE_CODE_OAUTH_TOKEN'] = token
    return env


def reader_command():
    return READER_ARGS + ['--system-prompt', load_prompt('reader')]


def ask_reader(reader_input):
    """Return the reader's reply text. Raises on failure."""
    # An empty cwd keeps project CLAUDE.md files out of the reader's context.
    # errors='replace': mis-decoded text in a message can hold lone
    # surrogates, which strict UTF-8 refuses to encode.
    with tempfile.TemporaryDirectory() as empty:
        r = subprocess.run(
            reader_command(), input=reader_input, capture_output=True,
            text=True, encoding='utf-8', errors='replace',
            timeout=TIMEOUT_S, env=reader_env(), cwd=empty)
    if r.returncode != 0:
        # The CLI prints auth failures to stdout, not stderr.
        detail = (r.stderr.strip() or r.stdout.strip())[:300]
        raise RuntimeError('reader exit %d: %s' % (r.returncode, detail))
    return r.stdout.strip()


def review(message, seen):
    """The reader's Review of the message; its reason is empty on a pass."""
    reply = ask_reader(build_input(message, seen, own_tools()))
    return judge(message, reply)
