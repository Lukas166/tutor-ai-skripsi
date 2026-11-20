"""Akses assessment yang masih dibutuhkan oleh Adaptive Engine Python."""

from typing import Any

from fastapi import HTTPException
from psycopg import Connection

from tutor_rag.learning.progress import learner_progress


class AssessmentService:
    def __init__(self, connection: Connection[dict[str, Any]], student_id: str, course_id: str):
        self.connection = connection
        self.student_id = student_id
        self.course_id = course_id

    def require_access(self) -> None:
        # LMS memverifikasi sesi; Python juga memeriksa enrollment sebelum beradaptasi.
        row = self.connection.execute(
            'SELECT u.id FROM "user" u JOIN enrollment e ON e."userId"=u.id '
            'JOIN course c ON c.id=e."courseId" '
            "WHERE u.id=%s AND u.role='mahasiswa' AND e.\"courseId\"=%s "
            'AND e."isActive"=true AND c."isActive"=true',
            (self.student_id, self.course_id),
        ).fetchone()
        if row is None:
            raise HTTPException(403, "Anda tidak memiliki akses ke mata kuliah ini.")

    def configuration(self) -> dict | None:
        return self.connection.execute(
            'SELECT * FROM course_learning_config WHERE "courseId"=%s',
            (self.course_id,),
        ).fetchone()

    def attempt(self) -> dict | None:
        return self.connection.execute(
            'SELECT * FROM assessment_attempt WHERE "studentId"=%s AND "courseId"=%s '
            "AND kind='PRE'",
            (self.student_id, self.course_id),
        ).fetchone()

    def posttest_availability(self) -> dict:
        config = self.configuration()
        post = self.connection.execute(
            'SELECT id,status FROM assessment_attempt WHERE "studentId"=%s '
            "AND \"courseId\"=%s AND kind='POST'",
            (self.student_id, self.course_id),
        ).fetchone()
        pre = self.attempt()
        if not pre or pre["status"] != "SUBMITTED":
            return {"available": bool(post), "status": post["status"] if post else "NOT_STARTED",
                    "reason": None if post else "Selesaikan pre-test dahulu."}
        progress = learner_progress(
            self.connection, self.student_id, self.course_id,
            (config or {}).get("developingThreshold", 0.5),
        )
        complete = bool(config and progress["posttestReady"])
        return {
            "available": complete or bool(post),
            "status": post["status"] if post else "NOT_STARTED",
            "completedIndicators": progress["completedIndicators"],
            "totalIndicators": progress["totalIndicators"],
            "reviewPendingCount": progress["reviewPendingCount"],
            "reason": None if complete or post else "Selesaikan pembelajaran indikator dahulu.",
        }
