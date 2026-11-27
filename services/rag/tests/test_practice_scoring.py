from contextlib import nullcontext
from unittest import TestCase
from unittest.mock import Mock, patch

from tutor_rag.learning.practice import PracticeService


class Result:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class Connection:
    def __init__(self):
        self.calls = []

    def transaction(self):
        return nullcontext()

    def execute(self, query, params):
        self.calls.append((query, params))
        if "FROM practice_event" in query:
            return Result()
        if "FROM student_indicator_profile" in query:
            return Result({
                "id": "profile", "initialScore": 0, "initialStatus": "NEEDS_REINFORCEMENT",
                "currentScore": 0.0, "evidenceCount": 1,
            })
        return Result()


class PracticeScoringTests(TestCase):
    def score_answer(self, hint_count, answer_count=0, selected_option="A"):
        connection = Connection()
        service = PracticeService(connection, "student", "course", Mock())
        service.owned = Mock(return_value={
            "status": "ACTIVE", "hintCount": hint_count, "answerCount": answer_count,
            "indicatorId": "indicator", "questionSnapshot": {
                "options": {"A": "benar", "B": "salah", "C": "lain", "D": "lainnya"},
                "correctOption": "A",
            },
        })
        service.current = Mock(return_value={})
        service.assessment.configuration = Mock(return_value={
            "emaAlpha": 0.3, "developingThreshold": 0.5, "readyThreshold": 0.8,
        })
        with patch("tutor_rag.learning.practice.record_study"):
            service.interact("practice", "request", "ANSWER", selected_option)
        return connection.calls

    def test_first_correct_answer_with_hint_updates_ema_by_half_credit(self):
        calls = self.score_answer(hint_count=1)
        profile_update = next(params for query, params in calls
                              if "UPDATE student_indicator_profile" in query)
        event = next(params for query, params in calls
                     if "INSERT INTO practice_event" in query)

        self.assertAlmostEqual(profile_update[0], 0.15)
        self.assertFalse(event[6])  # Dibantu, walaupun skor diperbarui.
        self.assertEqual(event[8], 0.0)
        self.assertAlmostEqual(event[9], 0.15)

    def test_first_correct_answer_without_hint_gets_full_credit(self):
        calls = self.score_answer(hint_count=0)
        profile_update = next(params for query, params in calls
                              if "UPDATE student_indicator_profile" in query)
        event = next(params for query, params in calls
                     if "INSERT INTO practice_event" in query)

        self.assertAlmostEqual(profile_update[0], 0.3)
        self.assertTrue(event[6])

    def test_first_wrong_answer_with_hint_gets_zero(self):
        calls = self.score_answer(hint_count=1, selected_option="B")
        profile_update = next(params for query, params in calls
                              if "UPDATE student_indicator_profile" in query)
        event = next(params for query, params in calls
                     if "INSERT INTO practice_event" in query)

        self.assertEqual(profile_update[0], 0.0)
        self.assertFalse(event[6])
        self.assertEqual(event[9], 0.0)

    def test_retry_on_same_question_does_not_update_ema_again(self):
        calls = self.score_answer(hint_count=1, answer_count=1)

        self.assertFalse(any("UPDATE student_indicator_profile" in query
                             for query, _ in calls))

    def test_offer_uses_unused_question_without_two_card_cap(self):
        connection = Connection()
        service = PracticeService(connection, "student", "course", Mock())
        service.require_pretest = Mock()
        original_execute = connection.execute
        question_queries = []

        def execute(query, params):
            if "FROM ai_chat_session" in query:
                return Result({"id": "chat"})
            if "status IN ('OFFERED','ACTIVE')" in query:
                return Result()
            if "FROM question_bank_item" in query:
                question_queries.append(query)
                return Result({
                    "id": "extra-question", "options": {
                        "A": "a", "B": "b", "C": "c", "D": "d",
                    }, "correctOption": "A",
                })
            return original_execute(query, params)

        connection.execute = execute
        practice_id = service.offer("indicator", "chat")
        self.assertIsNotNone(practice_id)
        self.assertIn("NOT EXISTS", question_queries[0])
        self.assertIn('ORDER BY q."practiceNumber",q.code', question_queries[0])
