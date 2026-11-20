"""The gate's log and its per-session block count."""
import json
import os
import time

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
