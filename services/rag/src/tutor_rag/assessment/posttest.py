from uuid import uuid4

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from tutor_rag.assessment.scoring import has_four_options
from tutor_rag.assessment.service import AssessmentService


class PosttestService(AssessmentService):
    def __init__(self, connection, student_id: str, course_id: str):
        super().__init__(connection, student_id, course_id, kind="POST")

    def start(self) -> dict:
        self.require_access()
        with self.connection.transaction():
            self.connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (self.course_id,))
            existing = self.attempt()
            if existing:
                return self.public_attempt(existing)
            eligibility = self.posttest_availability()
            if not eligibility["available"]:
                raise HTTPException(409, eligibility["reason"])
            # Salin snapshot PRE, bukan versi terbaru bank soal: item, urutan, opsi identik.
            pretest = self.connection.execute(
                'SELECT id,"totalQuestions" FROM assessment_attempt WHERE "studentId"=%s '
                "AND \"courseId\"=%s AND kind='PRE' AND status='SUBMITTED'",
                (self.student_id, self.course_id),
            ).fetchone()
            assert pretest is not None
            items = self.connection.execute(
                'SELECT * FROM assessment_item WHERE "attemptId"=%s', (pretest["id"],)
            ).fetchall()
            if any(not has_four_options(item["questionSnapshot"]) for item in items):
                raise HTTPException(
                    409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D."
                )
            attempt = self.connection.execute(
                'INSERT INTO assessment_attempt (id,"studentId","courseId",kind,"totalQuestions") '
                "VALUES (%s,%s,%s,'POST',%s) RETURNING *",
                (str(uuid4()), self.student_id, self.course_id, pretest["totalQuestions"]),
            ).fetchone()
            assert attempt is not None
            for item in items:
                self.connection.execute(
                    'INSERT INTO assessment_item (id,"attemptId","questionId","indicatorId",'
                    '"orderNumber","questionSnapshot") VALUES (%s,%s,%s,%s,%s,%s)',
                    (
                        str(uuid4()),
                        attempt["id"],
                        item["questionId"],
                        item["indicatorId"],
                        item["orderNumber"],
                        Jsonb(item["questionSnapshot"]),
                    ),
                )
            return self.public_attempt(attempt)

    def comparison(self) -> dict:
        self.require_access()
        attempts = self.connection.execute(
            'SELECT id,kind,status,"correctCount","totalQuestions",percentage,"submittedAt" '
            'FROM assessment_attempt WHERE "studentId"=%s AND "courseId"=%s',
            (self.student_id, self.course_id),
        ).fetchall()
        pre = next((row for row in attempts if row["kind"] == "PRE"), None)
        post = next((row for row in attempts if row["kind"] == "POST"), None)
        completed = bool(pre and post and pre["status"] == post["status"] == "SUBMITTED")
        result: dict = {
            "pretest": pre,
            "posttest": post,
            "completed": completed,
            "delta": None,
            "topics": [],
        }
        if not completed:
            return result
        assert pre is not None and post is not None
        result["delta"] = post["percentage"] - pre["percentage"]
        # Perbandingan indikator baru terbuka setelah seluruh rangkaian POST difinalisasi.
        rows = self.connection.execute(
            'SELECT t.id AS "topicId",t.code AS "topicCode",t.title,i.id,i.code,i.description,'
            'b."isCorrect" AS "preCorrect",a."isCorrect" AS "postCorrect" '
            'FROM assessment_item a JOIN assessment_item b ON b."indicatorId"=a."indicatorId" '
            'JOIN domain_indicator i ON i.id=a."indicatorId" '
            'JOIN domain_topic t ON t.id=i."topicId" '
            'WHERE a."attemptId"=%s AND b."attemptId"=%s ORDER BY t."orderNumber",i.code',
            (post["id"], pre["id"]),
        ).fetchall()
        topics: dict[str, dict] = {}
        for row in rows:
            topic = topics.setdefault(
                row["topicId"],
                {
                    "id": row["topicId"],
                    "code": row["topicCode"],
                    "title": row["title"],
                    "indicators": [],
                    "preCorrect": 0,
                    "postCorrect": 0,
                },
            )
            topic["indicators"].append(
                {
                    key: row[key]
                    for key in ["id", "code", "description", "preCorrect", "postCorrect"]
                }
            )
            topic["preCorrect"] += int(row["preCorrect"])
            topic["postCorrect"] += int(row["postCorrect"])
        result["topics"] = list(topics.values())
        return result
