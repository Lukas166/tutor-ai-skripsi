"""Kemajuan alur belajar dihitung dari bukti yang sudah tersimpan di LMS."""

from typing import Any

from psycopg import Connection

PRACTICE_QUESTIONS_PER_INDICATOR = 2


def learner_progress(
    connection: Connection[dict[str, Any]], student_id: str, course_id: str,
    developing_threshold: float,
) -> dict:
    # Urutan materi berasal dari Domain Model course, bukan kode RPL di aplikasi.
    # Agregasi dilakukan di database dalam satu perjalanan jaringan. Mengambil
    # seluruh riwayat chat/latihan ke Python hanya untuk menghitung status akan
    # memperlambat kartu pre-test dan panel progres pada database jarak jauh.
    indicators = connection.execute(
        """
        WITH practice_totals AS (
            SELECT "indicatorId",
                   COUNT(*)::int AS "answeredCount",
                   COUNT(*) FILTER (WHERE status='COMPLETED')::int AS "completedQuestions",
                   MAX("updatedAt") FILTER (WHERE status='COMPLETED') AS "lastCompletedAt"
            FROM practice_session
            WHERE "studentId"=%s AND "courseId"=%s AND "firstAnsweredAt" IS NOT NULL
            GROUP BY "indicatorId"
        ), question_totals AS (
            SELECT "indicatorId", COUNT(*)::int AS "availableQuestions"
            FROM question_bank_item
            WHERE "courseId"=%s AND kind='PRACTICE'
            GROUP BY "indicatorId"
        ), sourced_messages AS (
            SELECT m."createdAt", m."ragSources"->'adaptive'->>'indicatorId' AS "indicatorId",
                   m."ragSources"->'adaptive'->>'action' AS action
            FROM ai_chat_message m
            JOIN ai_chat_session s ON s.id=m."aiChatSessionId"
            WHERE s."userId"=%s AND s."courseId"=%s AND m."senderType"='ai'
              AND jsonb_array_length(COALESCE(m."ragSources"->'sources','[]'::jsonb))>0
              AND m."ragSources"->'adaptive'->>'indicatorId' IS NOT NULL
        ), lesson_totals AS (
            SELECT "indicatorId",
                   BOOL_OR(action IN ('LEARN','PRACTICE_FOLLOWUP')) AS "lessonDelivered",
                   MAX("createdAt") FILTER (WHERE action='LEARN') AS "lastLearnAt"
            FROM sourced_messages GROUP BY "indicatorId"
        )
        SELECT i.id, i.code, i."topicId", t."orderNumber",
               p."initialScore", p."currentScore",
               COALESCE(pt."answeredCount",0) AS "answeredCount",
               COALESCE(pt."completedQuestions",0) AS "completedQuestions",
               pt."lastCompletedAt",
               COALESCE(qt."availableQuestions",0) AS "availableQuestions",
               COALESCE(lt."lessonDelivered",false) AS "lessonDelivered",
               lt."lastLearnAt"
        FROM domain_indicator i
        JOIN domain_topic t ON t.id=i."topicId"
        LEFT JOIN student_indicator_profile p ON p."indicatorId"=i.id
          AND p."studentId"=%s AND p."courseId"=%s
        LEFT JOIN practice_totals pt ON pt."indicatorId"=i.id
        LEFT JOIN question_totals qt ON qt."indicatorId"=i.id
        LEFT JOIN lesson_totals lt ON lt."indicatorId"=i.id
        WHERE i."courseId"=%s
        ORDER BY t."orderNumber",i.code
        """,
        (student_id, course_id, course_id, student_id, course_id,
         student_id, course_id, course_id),
    ).fetchall()

    progress = []
    for indicator in indicators:
        required = PRACTICE_QUESTIONS_PER_INDICATOR
        lesson_delivered = indicator["lessonDelivered"]
        practice_done = indicator["completedQuestions"] >= required
        review_required = bool(
            indicator["initialScore"] != 1 and practice_done
            and indicator["currentScore"] is not None
            and indicator["currentScore"] < developing_threshold
        )
        # Tinjauan ulang memerlukan balasan belajar bersumber setelah kedua
        # kartu selesai; balasan otomatis penilaian tidak dihitung sebagai review.
        review_done = bool(
            indicator["lastCompletedAt"] and indicator["lastLearnAt"]
            and indicator["lastLearnAt"] > indicator["lastCompletedAt"]
        )
        if indicator["initialScore"] == 1:
            stage = "PRETEST_MET"
        elif indicator["availableQuestions"] < required:
            stage = "UNAVAILABLE"
        elif not lesson_delivered:
            stage = "LESSON_REQUIRED" if indicator["answeredCount"] else "NOT_STARTED"
        elif not practice_done:
            stage = "PRACTICING"
        elif review_required and not review_done:
            stage = "REVIEW_REQUIRED"
        else:
            stage = "COMPLETED"
        progress.append({
            "indicatorId": indicator["id"],
            "indicatorCode": indicator["code"],
            "topicId": indicator["topicId"],
            "orderNumber": indicator["orderNumber"],
            "initialScore": indicator["initialScore"],
            "currentScore": indicator["currentScore"],
            "lessonDelivered": lesson_delivered,
            "completedQuestions": indicator["completedQuestions"],
            "requiredQuestions": required,
            "reviewRequired": review_required,
            "reviewDone": review_done,
            "stage": stage,
        })

    # Dalam satu materi, kebutuhan penguatan awal dipelajari lebih dahulu.
    order = sorted(progress, key=lambda item: (
        item["orderNumber"],
        item["initialScore"] if item["initialScore"] is not None else 2,
        item["indicatorCode"],
    ))
    met_stages = {"PRETEST_MET", "COMPLETED"}
    next_indicator = next((item for item in order if item["stage"] not in met_stages), None)
    return {
        "totalIndicators": len(progress),
        "completedIndicators": sum(item["stage"] in met_stages for item in progress),
        "posttestReady": bool(progress) and all(
            item["stage"] in met_stages for item in progress
        ),
        "reviewPendingCount": sum(item["stage"] == "REVIEW_REQUIRED" for item in progress),
        "nextIndicatorId": next_indicator["indicatorId"] if next_indicator else None,
        "nextIndicatorCode": next_indicator["indicatorCode"] if next_indicator else None,
        "indicators": progress,
    }
