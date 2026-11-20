"""The Stop path: one block per turn, with the reader's notes in the reason.
The reader is replaced by a stub, so no model is called."""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HOOKS = os.path.join(os.path.dirname(__file__), '..', 'hooks')
sys.path.insert(0, HOOKS)
from gate_transcript import Seen  # noqa: E402

spec = importlib.util.spec_from_file_location(
    'readability_gate', os.path.join(HOOKS, 'readability-gate.py'))
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)

NOTES = 'PROBLEMS:\n"task 8.2" | never said what it is'


class GateTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.patch('STATE_DIR', tmp.name)
        self.patch('LOG_PATH', os.path.join(tmp.name, 'gate.log'))
        self.patch('review', mock.Mock(return_value=NOTES))

    def patch(self, name, value):
        patcher = mock.patch.object(entry, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_gate(self, turn):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            entry.gate('x' * 100, 'session1', Seen(turn, 'request'))
        return out.getvalue().strip()

    def test_a_failed_message_is_blocked_with_the_notes(self):
        reply = json.loads(self.run_gate('t1'))
        self.assertEqual(reply['decision'], 'block')
        self.assertIn(NOTES, reply['reason'])
        self.assertNotIn('{notes}', reply['reason'])

    def test_the_rewrite_in_the_same_turn_is_not_checked_again(self):
        self.run_gate('t1')
        self.assertEqual(self.run_gate('t1'), '')
        entry.review.assert_called_once()

    def test_a_new_turn_can_be_blocked_again(self):
        self.run_gate('t1')
        self.assertIn('"block"', self.run_gate('t2'))

    def test_a_passing_message_is_let_through(self):
        entry.review.return_value = ''
        self.assertEqual(self.run_gate('t1'), '')


if __name__ == '__main__':
    unittest.main()
