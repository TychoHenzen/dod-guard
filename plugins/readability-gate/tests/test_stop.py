"""The Stop path: one block per turn, with the reader's notes and draft in
the reason. The reader is replaced by a stub, so no model is called."""
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
import gate_state  # noqa: E402
from gate_transcript import Seen  # noqa: E402
from gate_verdict import Review  # noqa: E402

spec = importlib.util.spec_from_file_location(
    'readability_gate', os.path.join(HOOKS, 'readability-gate.py'))
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)

NOTES = 'PROBLEMS:\n"task 8.2" | never said what it is'
DRAFT = 'I fixed the bug. Nothing is pushed yet.'
FAILED = Review(notes=NOTES, wanted=DRAFT, reason='too long',
                size='200 -> 9 words')
PASSED = Review(notes='', wanted=DRAFT, reason='', size='9 -> 9 words')


class GateTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.patch(gate_state, 'STATE_DIR', tmp.name)
        self.patch(gate_state, 'LOG_PATH', os.path.join(tmp.name, 'gate.log'))
        self.patch(entry, 'review', mock.Mock(return_value=FAILED))

    def patch(self, module, name, value):
        patcher = mock.patch.object(module, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_gate(self, turn):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            entry.gate('x' * 100, 'session1', Seen(turn, 'request'))
        return out.getvalue().strip()

    def test_a_failed_message_is_blocked_with_the_notes_and_draft(self):
        reply = json.loads(self.run_gate('t1'))
        self.assertEqual(reply['decision'], 'block')
        self.assertIn(NOTES, reply['reason'])
        self.assertIn(DRAFT, reply['reason'])
        self.assertNotIn('{notes}', reply['reason'])
        self.assertNotIn('{wanted}', reply['reason'])

    def test_the_rewrite_in_the_same_turn_is_not_checked_again(self):
        self.run_gate('t1')
        self.assertEqual(self.run_gate('t1'), '')
        entry.review.assert_called_once()

    def test_a_new_turn_can_be_blocked_again(self):
        self.run_gate('t1')
        self.assertIn('"block"', self.run_gate('t2'))

    def test_a_passing_message_is_let_through(self):
        entry.review.return_value = PASSED
        self.assertEqual(self.run_gate('t1'), '')


if __name__ == '__main__':
    unittest.main()
