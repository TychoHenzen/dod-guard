"""What the reader is given: the owner's tools, request, the message they
replied to, and the new message."""
import glob
import json
import os

LAST_READ_CHARS = 6000
REQUEST_CHARS = 3000
CLAUDE_HOME = os.path.join(os.path.expanduser('~'), '.claude')
SKILL_GLOBS = ('skills/*/SKILL.md', 'plugins/cache/*/*/*/skills/*/SKILL.md')
# Keyed by Seen.by_event: whether an event, not the owner, started the turn.
HEADINGS = {
    False: 'THE REQUEST YOU TYPED:',
    True: ('THE LAST REQUEST YOU TYPED (earlier; the assistant kept working '
           'on its own since, so the message may be a later update, not a '
           'direct answer):'),
}
READER_INPUT = """YOUR OWN TOOLS AND PLUGINS (you know these): {tools}

{heading}
{request}

THE LAST MESSAGE YOU REPLIED TO:
{last_read}

THE NEW MESSAGE:
{message}"""


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
        heading=HEADINGS[bool(seen.by_event)],
        last_read=seen.last_read[:LAST_READ_CHARS] or '(none)')
