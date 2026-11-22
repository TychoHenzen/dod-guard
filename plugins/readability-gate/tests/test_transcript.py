"""read_transcript: what the owner has seen when a turn ends.
Run with `python -m unittest discover plugins/readability-gate/tests`."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))
from gate_transcript import Seen, read_transcript  # noqa: E402


def typed(uuid, text):
    message = {'role': 'user', 'content': text}
    return {'type': 'user', 'uuid': uuid, 'message': message}


def said(text):
    message = {'role': 'assistant', 'content': [{'type': 'text', 'text': text}]}
    return {'type': 'assistant', 'message': message}


def tool_result():
    part = {'type': 'tool_result', 'content': 'ok'}
    return {'type': 'user', 'message': {'role': 'user', 'content': [part]}}


def read(entries):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'transcript.jsonl')
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(json.dumps(e) + '\n' for e in entries)
        return read_transcript(path)


class ReadTranscriptTest(unittest.TestCase):
    def test_the_message_the_owner_replied_to_counts_as_read(self):
        entries = [
            typed('u1', 'first request'), said('first answer'),
            typed('u2', 'second request'), said('working'), tool_result(),
        ]
        expected = Seen('u2', 'second request', False, 'first answer')
        self.assertEqual(read(entries), expected)

    def test_a_final_message_without_an_owner_reply_counts_as_unread(self):
        event = '<task-notification>stage two done</task-notification>'
        entries = [
            typed('u1', 'start the run'), said('stage one report'),
            typed('e1', event), said('stage two report'),
        ]
        self.assertEqual(read(entries), Seen('e1', 'start the run', True, ''))

    def test_a_compaction_summary_stays_in_the_turn_it_interrupts(self):
        summary = typed('c1', 'This session is being continued from ...')
        summary['isCompactSummary'] = True
        entries = [
            typed('u1', 'first request'), said('decision list'),
            typed('u2', 'write the list out in full'), summary,
            said('the full list'),
        ]
        expected = Seen(
            turn='u2', request='write the list out in full',
            last_read='decision list')
        self.assertEqual(read(entries), expected)

    def test_block_feedback_stays_in_the_turn_it_rewrites(self):
        feedback = typed('m1', 'Stop hook feedback: rewrite')
        feedback['isMeta'] = True
        entries = [typed('u1', 'request'), said('draft'), feedback,
                   said('rewrite')]
        seen = read(entries)
        self.assertEqual((seen.turn, seen.by_event), ('u1', False))

    def test_a_missing_transcript_reads_as_nothing_seen(self):
        self.assertEqual(read_transcript('no-such-file.jsonl'), Seen())


if __name__ == '__main__':
    unittest.main()
