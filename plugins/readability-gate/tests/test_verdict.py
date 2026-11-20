"""notes_from: turning the reader's reply into a verdict and its notes."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))
from gate_reader import notes_from  # noqa: E402

NOTES = 'UNDERSTOOD:\nlost\n\nPROBLEMS:\n"task 8.2" | never said what it is'


class NotesFromTest(unittest.TestCase):
    def test_pass_returns_no_notes(self):
        self.assertEqual(notes_from('UNDERSTOOD:\nfine\n\nVERDICT: PASS'), '')

    def test_fail_returns_everything_before_the_verdict(self):
        self.assertEqual(notes_from(NOTES + '\n\nVERDICT: FAIL'), NOTES)

    def test_a_reply_without_a_verdict_raises(self):
        with self.assertRaises(RuntimeError):
            notes_from('UNDERSTOOD:\nsomething')


if __name__ == '__main__':
    unittest.main()
