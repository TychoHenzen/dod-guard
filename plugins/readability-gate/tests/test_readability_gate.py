"""Tests for the transcript reading and verdict parsing of readability-gate.py.
No model call: run with `python -m unittest discover plugins/readability-gate/tests`."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

HOOK = os.path.join(os.path.dirname(__file__), '..', 'hooks', 'readability-gate.py')
spec = importlib.util.spec_from_file_location('readability_gate', HOOK)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def typed(uuid, text):
    return {'type': 'user', 'uuid': uuid, 'message': {'role': 'user', 'content': text}}


def said(text):
    return {'type': 'assistant', 'message': {'role': 'assistant',
                                             'content': [{'type': 'text', 'text': text}]}}


def tool_result():
    return {'type': 'user', 'message': {'role': 'user',
                                        'content': [{'type': 'tool_result', 'content': 'ok'}]}}


class ReadTranscriptTest(unittest.TestCase):
    def read(self, entries):
        with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False,
                                         encoding='utf-8') as f:
            f.writelines(json.dumps(e) + '\n' for e in entries)
        try:
            return gate.read_transcript(f.name)
        finally:
            os.unlink(f.name)

    def test_the_message_the_owner_replied_to_counts_as_read(self):
        turn, request, by_event, last_read = self.read([
            typed('u1', 'first request'), said('first answer'),
            typed('u2', 'second request'), said('working'), tool_result(),
        ])
        self.assertEqual((turn, request, by_event, last_read),
                         ('u2', 'second request', False, 'first answer'))

    def test_a_final_message_without_an_owner_reply_counts_as_unread(self):
        turn, request, by_event, last_read = self.read([
            typed('u1', 'start the run'), said('stage one report'),
            typed('e1', '<task-notification>stage two done</task-notification>'),
            said('stage two report'),
        ])
        self.assertEqual((turn, request, by_event, last_read),
                         ('e1', 'start the run', True, ''))

    def test_a_compaction_summary_stays_in_the_turn_it_interrupts(self):
        summary = typed('c1', 'This session is being continued from a previous conversation.')
        summary['isCompactSummary'] = True
        turn, request, by_event, last_read = self.read([
            typed('u1', 'first request'), said('decision list'),
            typed('u2', 'write the list out in full'), summary, said('the full list'),
        ])
        self.assertEqual((turn, request, by_event, last_read),
                         ('u2', 'write the list out in full', False, 'decision list'))

    def test_block_feedback_stays_in_the_turn_it_rewrites(self):
        feedback = typed('m1', 'Stop hook feedback: rewrite')
        feedback['isMeta'] = True
        turn, _, by_event, _ = self.read([
            typed('u1', 'request'), said('draft'), feedback, said('rewrite'),
        ])
        self.assertEqual((turn, by_event), ('u1', False))


class NotesFromTest(unittest.TestCase):
    def test_pass_returns_no_notes(self):
        self.assertEqual(gate.notes_from('UNDERSTOOD:\nfine\n\nVERDICT: PASS'), '')

    def test_fail_returns_everything_before_the_verdict(self):
        reply = 'UNDERSTOOD:\nlost\n\nPROBLEMS:\n"task 8.2" | never said what it is\n\nVERDICT: FAIL'
        self.assertEqual(gate.notes_from(reply),
                         'UNDERSTOOD:\nlost\n\nPROBLEMS:\n"task 8.2" | never said what it is')

    def test_a_reply_without_a_verdict_raises(self):
        with self.assertRaises(RuntimeError):
            gate.notes_from('UNDERSTOOD:\nsomething')


class BuildInputTest(unittest.TestCase):
    def test_the_reader_sees_the_message_the_owner_replied_to(self):
        text = gate.build_input('new', 'my request', False, 'old answer', 'git')
        self.assertIn('THE LAST MESSAGE YOU REPLIED TO:\nold answer', text)
        self.assertIn('THE REQUEST YOU TYPED:\n> my request', text)

    def test_no_earlier_message_is_marked_none(self):
        text = gate.build_input('new', 'my request', True, '', 'git')
        self.assertIn('THE LAST MESSAGE YOU REPLIED TO:\n(none)', text)
        self.assertIn('THE LAST REQUEST YOU TYPED (earlier;', text)


class SessionStartTest(unittest.TestCase):
    def run_hook(self, payload, env=None):
        return subprocess.run([sys.executable, '-B', HOOK], input=json.dumps(payload),
                              capture_output=True, text=True, encoding='utf-8', timeout=30,
                              env=dict(os.environ, **(env or {})))

    def test_session_start_adds_the_writing_guide_to_context(self):
        r = self.run_hook({'hook_event_name': 'SessionStart', 'source': 'startup'})
        out = json.loads(r.stdout)['hookSpecificOutput']
        self.assertEqual(out['hookEventName'], 'SessionStart')
        self.assertEqual(out['additionalContext'], gate.GUIDE)

    def test_turning_the_gate_off_also_drops_the_guide(self):
        r = self.run_hook({'hook_event_name': 'SessionStart', 'source': 'startup'},
                          env={'READABILITY_GATE': 'off'})
        self.assertEqual(r.stdout.strip(), '')


if __name__ == '__main__':
    unittest.main()
