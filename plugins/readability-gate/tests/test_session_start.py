"""The SessionStart hook: the writing guide goes into Claude's context."""
import json
import os
import subprocess
import sys
import unittest

HOOKS = os.path.join(os.path.dirname(__file__), '..', 'hooks')
sys.path.insert(0, HOOKS)
from gate_reader import load_prompt  # noqa: E402

HOOK = os.path.join(HOOKS, 'readability-gate.py')
START = json.dumps({'hook_event_name': 'SessionStart', 'source': 'startup'})


def run_hook(env):
    return subprocess.run(
        [sys.executable, '-B', HOOK], input=START, capture_output=True,
        text=True, encoding='utf-8', timeout=30, env=dict(os.environ, **env))


class SessionStartTest(unittest.TestCase):
    def test_session_start_adds_the_writing_guide_to_context(self):
        out = json.loads(run_hook({}).stdout)['hookSpecificOutput']
        self.assertEqual(out['hookEventName'], 'SessionStart')
        self.assertEqual(out['additionalContext'], load_prompt('guide'))

    def test_turning_the_gate_off_also_drops_the_guide(self):
        result = run_hook({'READABILITY_GATE': 'off'})
        self.assertEqual(result.stdout.strip(), '')


if __name__ == '__main__':
    unittest.main()
