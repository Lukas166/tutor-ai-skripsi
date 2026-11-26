from datetime import UTC, datetime, timedelta
from unittest import TestCase

from tutor_rag.learning.progress import learner_progress


class Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class Connection:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, _query, _params):
        return Result(self.rows)


def indicator(code, initial_score, **changes):
    row = {
        "id": code,
        "code": code,
        "topicId": "topic",
        "orderNumber": 1,
        "initialScore": initial_score,
        "currentScore": initial_score,
        "answeredCount": 0,
        "completedQuestions": 0,
        "lastCompletedAt": None,
        "availableQuestions": 2,
        "lessonDelivered": False,
        "lastLearnAt": None,
    }
    return {**row, **changes}


class LearningProgressTests(TestCase):
    def progress(self, rows):
        return learner_progress(Connection(rows), "student", "course", 0.5)

    def test_all_pretest_answers_correct_unlock_posttest_without_lessons_or_cards(self):
        result = self.progress([
            indicator("I1", 1, availableQuestions=0),
            indicator("I2", 1),
        ])

        self.assertTrue(result["posttestReady"])
        self.assertEqual(result["completedIndicators"], 2)
        self.assertIsNone(result["nextIndicatorId"])
        self.assertEqual([item["stage"] for item in result["indicators"]],
                         ["PRETEST_MET", "PRETEST_MET"])

    def test_only_wrong_pretest_indicator_remains_in_learning_plan(self):
        result = self.progress([
            indicator("I1", 1),
            indicator("I2", 0),
        ])

        self.assertFalse(result["posttestReady"])
        self.assertEqual(result["completedIndicators"], 1)
        self.assertEqual(result["nextIndicatorCode"], "I2")

    def test_wrong_pretest_indicator_needs_review_after_two_cards(self):
        completed_at = datetime.now(UTC)
        rows = [
            indicator("I1", 1),
            indicator("I2", 0, currentScore=0.3, answeredCount=2,
                      completedQuestions=2, availableQuestions=2,
                      lessonDelivered=True, lastCompletedAt=completed_at),
        ]
        pending = self.progress(rows)

        self.assertEqual(pending["indicators"][1]["stage"], "REVIEW_REQUIRED")
        self.assertFalse(pending["posttestReady"])

        rows[1]["lastLearnAt"] = completed_at + timedelta(seconds=1)
        reviewed = self.progress(rows)
        self.assertEqual(reviewed["indicators"][1]["stage"], "COMPLETED")
        self.assertTrue(reviewed["posttestReady"])

    def test_optional_practice_cannot_revoke_pretest_completion(self):
        result = self.progress([
            indicator("I1", 1, currentScore=0.4, answeredCount=2,
                      completedQuestions=2, lessonDelivered=True),
        ])

        self.assertEqual(result["indicators"][0]["stage"], "PRETEST_MET")
        self.assertFalse(result["indicators"][0]["reviewRequired"])
        self.assertTrue(result["posttestReady"])
