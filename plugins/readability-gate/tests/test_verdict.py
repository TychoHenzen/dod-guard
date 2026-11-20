"""judge: splitting the reader's reply and deciding from its draft."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))
from gate_verdict import judge  # noqa: E402

PROBLEM = '"task 8.2" | never said what it is'


def words(n):
    return ' '.join(['word'] * n)


def reply(wanted, verdict='PASS', problems=PROBLEM):
    return ('UNDERSTOOD:\nthe gist\n\nPROBLEMS:\n%s\n\nWANTED:\n%s\n\n'
            'VERDICT: %s' % (problems, wanted, verdict))


class JudgeTest(unittest.TestCase):
    def test_a_message_the_draft_cuts_in_half_is_too_long(self):
        review = judge(words(200), reply(words(100)))
        self.assertEqual(review.reason, 'too long')
        self.assertEqual(review.size, '200 -> 100 words')

    def test_a_draft_about_as_long_passes(self):
        self.assertEqual(judge(words(200), reply(words(180))).reason, '')

    def test_a_short_message_passes_on_a_small_cut(self):
        # Half of a 64-word reply is still under the word floor.
        self.assertEqual(judge(words(64), reply(words(32))).reason, '')

    def test_a_message_the_owner_cannot_act_on_fails_at_any_length(self):
        review = judge(words(40), reply(words(45), verdict='FAIL'))
        self.assertEqual(review.reason, 'cannot act on it')

    def test_both_reasons_are_given(self):
        review = judge(words(200), reply(words(50), verdict='FAIL'))
        self.assertEqual(review.reason, 'cannot act on it and too long')

    def test_a_code_block_the_draft_drops_is_not_counted(self):
        message = words(50) + '\n\n```\n' + words(300) + '\n```\n'
        self.assertEqual(judge(message, reply(words(45))).reason, '')

    def test_no_problems_listed_passes_a_draft_that_says_unchanged(self):
        review = judge(words(200), reply('(unchanged)', problems='none'))
        self.assertEqual(review.reason, '')

    def test_the_notes_hold_what_was_understood_and_the_problems(self):
        review = judge(words(200), reply('the draft'))
        self.assertEqual(review.notes,
                         'UNDERSTOOD:\nthe gist\n\nPROBLEMS:\n' + PROBLEM)
        self.assertEqual(review.wanted, 'the draft')

    def test_a_problems_line_inside_the_draft_stays_in_the_draft(self):
        draft = 'Fixed it.\nProblems: none left.'
        self.assertEqual(judge(words(10), reply(draft)).wanted, draft)

    def test_the_last_verdict_line_counts(self):
        two = 'VERDICT: PASS or FAIL?\nVERDICT: FAIL'
        text = reply(words(10)).replace('VERDICT: PASS', two)
        self.assertEqual(judge(words(10), text).reason, 'cannot act on it')

    def test_a_reply_without_a_draft_raises(self):
        no_draft = 'UNDERSTOOD:\nx\n\nPROBLEMS:\nnone\n\nVERDICT: PASS'
        with self.assertRaises(RuntimeError):
            judge(words(10), no_draft)

    def test_a_reply_without_a_verdict_raises(self):
        with self.assertRaises(RuntimeError):
            judge(words(10), 'PROBLEMS:\nnone\n\nWANTED:\nfine')


if __name__ == '__main__':
    unittest.main()
