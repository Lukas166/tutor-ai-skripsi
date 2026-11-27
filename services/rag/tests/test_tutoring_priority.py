import json
from contextlib import nullcontext
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from tutor_rag.learning.tutoring import AdaptiveTutoring


class Result:
    def __init__(self, value):
        self.value = value

    def fetchone(self):
        return self.value

    def fetchall(self):
        return self.value


class Connection:
    indicators = [
        {"id": "old", "code": "RPL-I01", "description": "Dasar RPL",
         "concept": "Dasar RPL", "topic": "Pengantar", "courseSessionId": "first",
         "orderNumber": 1, "initialScore": 1, "currentScore": 1,
         "evidenceCount": 1, "initialStatus": "INITIAL_POSITIVE_EVIDENCE"},
        {"id": "active", "code": "RPL-I11", "description": "Kategori diagram UML",
         "concept": "Kategori diagram UML", "topic": "Unified Modeling Language",
         "courseSessionId": "sixth", "orderNumber": 6, "initialScore": 0,
         "currentScore": 0, "evidenceCount": 1,
         "initialStatus": "NEEDS_REINFORCEMENT"},
    ]

    def execute(self, query, _params):
        if "FROM domain_indicator" in query:
            return Result(self.indicators)
        if "FROM ai_chat_session" in query:
            return Result({"id": "chat"})
        if "FROM practice_session" in query:
            return Result(None)
        raise AssertionError(query)


class TutoringPriorityTests(TestCase):
    def context(self, question):
        connection = Connection()
        assessment = Mock()
        assessment.configuration.return_value = {
            "developingThreshold": 0.5, "readyThreshold": 0.8,
        }
        assessment.posttest_availability.return_value = {"available": False}
        provider = Mock()
        provider.generate_structured.return_value = json.dumps({
            "intent": "LEARN", "indicator_id": "old",
            "retrieval_query": "Dasar RPL", "offer_practice": False,
        })
        progress = {
            "nextIndicatorId": "active", "nextIndicatorCode": "RPL-I11",
            "indicators": [
                {"indicatorId": "old", "stage": "PRETEST_MET"},
                {"indicatorId": "active", "stage": "PRACTICING"},
            ],
        }
        request = SimpleNamespace(
            user=SimpleNamespace(id="student"), course=SimpleNamespace(id="course"),
            chat_session_id="chat", purpose="answer", question=question, history=[],
        )
        with (
            patch("tutor_rag.learning.tutoring.connect_database",
                  return_value=nullcontext(connection)),
            patch("tutor_rag.learning.tutoring.AssessmentService", return_value=assessment),
            patch("tutor_rag.learning.tutoring.PracticeService"),
            patch("tutor_rag.learning.tutoring.learner_progress", return_value=progress),
        ):
            return AdaptiveTutoring(None, provider).context(request)

    def test_generic_start_follows_active_indicator_even_if_model_suggests_old_one(self):
        result = self.context("Mulai dari prioritas sekarang")

        self.assertEqual(result["indicatorCode"], "RPL-I11")
        self.assertEqual(result["sessionId"], "sixth")
        self.assertEqual(result["retrievalQuery"], "Kategori diagram UML: Kategori diagram UML")

    def test_explicit_request_can_still_choose_completed_indicator(self):
        result = self.context("Mulai dari RPL-I01")

        self.assertEqual(result["indicatorCode"], "RPL-I01")
