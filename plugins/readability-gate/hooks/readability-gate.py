#!/usr/bin/env python3
"""Stop hook: checks that the final message of a turn answers the owner in
plain spoken English.

The owner reads almost only the last assistant message of each turn, often as
a phone notification. That message must stand on its own. Text from earlier in
the same turn is unread, and so is every earlier final message except the one
the owner last replied to.

One check: a reader model plays the owner (gate_reader.py, with the rules in
prompts/reader.md). It judges the new message on the rules of talk-normal
(github.com/hexiecs/talk-normal) plus references the owner has never seen.
A failing message goes back once for a rewrite. At session start the same
rules go into Claude's context (prompts/guide.md), so the first draft follows
them. Fails open on any error, with a visible warning. Set
READABILITY_GATE=off to skip.
"""
import json
import os
import sys
import time

from gate_reader import TOKEN_PATH, load_prompt, review
from gate_transcript import read_transcript

MIN_CHARS = 80
# A second block mostly brought new nitpicks instead of a better message, and
# each one costs the owner another wait.
MAX_BLOCKS_PER_TURN = 1

STATE_DIR = os.path.join(os.path.expanduser('~'), '.claude', 'hook-state')
LOG_PATH = os.path.join(STATE_DIR, 'readability-gate.log')


def log(msg):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')
    except OSError:
        pass


def state_path(session_id):
    return os.path.join(STATE_DIR, session_id + '.gate.json')


def load_state(session_id, turn):
    """The block count for this turn; a new turn starts at zero."""
    try:
        with open(state_path(session_id)) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    if state.get('turn') != turn:
        return {'turn': turn, 'blocks': 0}
    return state


def save_state(session_id, state):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(state_path(session_id), 'w') as f:
        json.dump(state, f)


def gate(message, session_id, seen):
    """Block the stop at most MAX_BLOCKS_PER_TURN times when the reader
    fails the message."""
    state = load_state(session_id, seen.turn)
    if state['blocks'] >= MAX_BLOCKS_PER_TURN:
        return
    tag = '%s turn=%s' % (session_id[:8], seen.turn[:8])
    started = time.time()
    notes = review(message, seen)
    if not notes:
        log('passed %s in %.1fs' % (tag, time.time() - started))
        return
    state['blocks'] += 1
    save_state(session_id, state)
    log('blocked %s #%d: %s'
        % (tag, state['blocks'], notes.replace('\n', ' | ')[:500]))
    feedback = load_prompt('feedback').replace('{notes}', notes)
    print(json.dumps({'decision': 'block', 'reason': feedback}))


def handle_stop(data):
    message = (data.get('last_assistant_message') or '').strip()
    session_id = data.get('session_id', '')
    transcript = data.get('transcript_path', '')
    if len(message) >= MIN_CHARS and session_id and transcript:
        gate(message, session_id, read_transcript(transcript))


def handle_session_start(_data):
    """Put the writing rules in Claude's context before the first draft:
    talk-normal works this way, a prompt read before writing."""
    context = dict(
        hookEventName='SessionStart', additionalContext=load_prompt('guide'))
    print(json.dumps({'hookSpecificOutput': context}))


HANDLERS = {'SessionStart': handle_session_start, 'Stop': handle_stop}


def fail_open(error):
    log('error: %r' % (error,))
    # Failing open silently made a dead gate look like a passing one.
    hint = ''
    if not os.path.exists(TOKEN_PATH):
        hint = ' Fix: run `claude setup-token` and save the token in %s.' % (
            TOKEN_PATH)
    notice = 'Readability check did not run: %s%s' % (error, hint)
    print(json.dumps({'systemMessage': notice}))


def main():
    if os.environ.get('READABILITY_GATE', '').lower() == 'off':
        return
    try:
        data = json.loads(sys.stdin.read().lstrip(chr(0xFEFF)))
        handler = HANDLERS.get(data.get('hook_event_name'))
        if handler:
            handler(data)
    except Exception as e:  # fail open: never trap the session on a gate error
        fail_open(e)


if __name__ == '__main__':
    main()
