"""build_input: what the reader is told the owner has seen."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))
from gate_reader import build_input  # noqa: E402
from gate_transcript import Seen  # noqa: E402


class BuildInputTest(unittest.TestCase):
    def test_the_reader_sees_the_message_the_owner_replied_to(self):
        seen = Seen('u1', 'my request', False, 'old answer')
        text = build_input('new', seen, 'git')
        self.assertIn('THE LAST MESSAGE YOU REPLIED TO:\nold answer', text)
        self.assertIn('THE REQUEST YOU TYPED:\n> my request', text)
        self.assertTrue(text.endswith('THE NEW MESSAGE:\nnew'))

    def test_no_earlier_message_is_marked_none(self):
        text = build_input('new', Seen('e1', 'my request', True, ''), 'git')
        self.assertIn('THE LAST MESSAGE YOU REPLIED TO:\n(none)', text)
        self.assertIn('THE LAST REQUEST YOU TYPED (earlier;', text)


if __name__ == '__main__':
    unittest.main()
