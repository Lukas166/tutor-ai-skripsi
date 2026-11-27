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


class HintGuidanceTests(TestCase):
    def generate_hint(self, generated, reviews, chunk_count=1):
        connection = Mock()
        connection.execute.side_effect = [
            Mock(fetchone=Mock(return_value={
                "description": "Mengenali proses pengembangan",
                "courseSessionId": "session",
            })),
            Mock(fetchall=Mock(return_value=[{"id": "material"}])),
        ]
        service = PracticeService(connection, "student", "course", Mock())
        row = {
            "indicatorId": "indicator",
            "concept": "Pengembangan perangkat lunak",
            "questionSnapshot": {
                "question": "Pendekatan mana yang digunakan?",
                "options": {"A": "Incremental", "B": "Waterfall"},
                "correctOption": "A",
            },
        }
        chunks = []
        for index in range(chunk_count):
            chunk = Mock()
            chunk.material_title = "Materi RPL"
            chunk.file_name = "materi.pdf"
            chunk.session_title = "Minggu 2"
            chunk.page_number = index + 2
            chunk.content = (
                "Awal potongan. " + "x" * 1600 + " Ciri penting di akhir potongan PDF."
                if index == 0 else f"Detail dari potongan ke-{index + 1}."
            )
            chunk.model_dump.return_value = {
                "fileName": "materi.pdf", "pageNumber": index + 2,
            }
            chunks.append(chunk)
        with (
            patch("tutor_rag.learning.practice.GeminiProvider") as provider_class,
            patch("tutor_rag.learning.practice.ChunkRepository") as repository_class,
        ):
            provider = provider_class.return_value
            provider.generate.side_effect = generated
            provider.generate_structured.side_effect = reviews
            repository_class.return_value.retrieve.return_value = chunks
            hint, sources = service.guidance(row)
            prompts = [call.args[0].prompt for call in provider.generate.call_args_list]
        return hint, sources, prompts

    def test_rejected_hint_is_revised_with_specific_feedback(self):
        hint, sources, prompts = self.generate_hint(
            ["Incremental adalah jawabannya.", "Perhatikan cara kerja bertahap."],
            [
                '{"reveals_answer": true, "has_direct_help": true}',
                '{"reveals_answer": false, "has_direct_help": true}',
            ],
        )
        self.assertEqual(hint, "Perhatikan cara kerja bertahap.")
        self.assertEqual(sources, [{"fileName": "materi.pdf", "pageNumber": 2}])
        self.assertIn("Ciri penting di akhir potongan PDF.", prompts[0])
        self.assertNotIn("Incremental adalah jawabannya.", prompts[1])
        self.assertIn("berpotensi membocorkan jawaban", prompts[1])

    def test_unhelpful_hint_is_shown_to_generator_for_revision(self):
        hint, _, prompts = self.generate_hint(
            ["Baca PDF dulu.", "Perhatikan cara kerja bertahap."],
            [
                '{"reveals_answer": false, "has_direct_help": false}',
                '{"reveals_answer": false, "has_direct_help": true}',
            ],
        )
        self.assertEqual(hint, "Perhatikan cara kerja bertahap.")
        self.assertIn("Baca PDF dulu.", prompts[1])
        self.assertIn("belum memberi bantuan konsep", prompts[1])

    def test_two_rejections_return_safe_reasoning_hint(self):
        hint, sources, prompts = self.generate_hint(
            ["Incremental adalah jawabannya.", "Jawab Incremental."],
            ['{"reveals_answer": true, "has_direct_help": true}'] * 2,
        )
        self.assertEqual(len(prompts), 2)
        self.assertIn("bandingkan ciri setiap pilihan", hint)
        self.assertNotIn("Incremental", hint)
        self.assertEqual(sources, [{"fileName": "materi.pdf", "pageNumber": 2}])

    def test_hint_receives_relevant_chunk_after_the_first_three(self):
        hint, sources, prompts = self.generate_hint(
            ["Ciri apa yang membedakan proses ini?"],
            ['{"reveals_answer": false, "has_direct_help": true}'],
            chunk_count=4,
        )
        self.assertEqual(hint, "Ciri apa yang membedakan proses ini?")
        self.assertIn("Detail dari potongan ke-4.", prompts[0])
        self.assertEqual(len(sources), 4)
