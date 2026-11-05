import re
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid4, uuid5

from psycopg import Connection, sql
from psycopg.types.json import Jsonb

from tutor_rag.domain.workbook import QUESTION_OPTIONS, codes, read_workbook


def scoped_id(course_id: str, code: str) -> str:
    # Kode sumber tetap utuh; UUID internal berbeda untuk setiap mata kuliah.
    return str(uuid5(NAMESPACE_URL, f"learning:{course_id}:{code}"))


def integer_cell(value: str, field: str) -> int:
    # Excel menyimpan bilangan bulat sebagai 1 atau 1.0; pecahan tetap ditolak.
    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"{field} harus bilangan bulat: {value}") from error
    if not number.is_finite() or number != number.to_integral_value():
        raise ValueError(f"{field} harus bilangan bulat: {value}")
    return int(number)


def upsert(connection: Connection[dict[str, Any]], table: str, row: dict) -> None:
    fields = list(row)
    connection.execute(
        sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT (id) DO UPDATE SET {}").format(
            sql.Identifier(table),
            sql.SQL(",").join(map(sql.Identifier, fields)),
            sql.SQL(",").join(sql.Placeholder() for _ in fields),
            sql.SQL(",").join(
                sql.SQL("{}=EXCLUDED.{}").format(sql.Identifier(f), sql.Identifier(f))
                for f in fields
                if f != "id"
            ),
        ),
        list(row.values()),
    )


def import_dataset(connection: Connection[dict[str, Any]], path: Path, course_id: str) -> dict:
    data = read_workbook(path)
    with connection.transaction():
        courses = connection.execute("SELECT * FROM course WHERE id=%s", (course_id,)).fetchall()
        if len(courses) != 1:
            raise ValueError("Course tujuan impor tidak ditemukan.")
        course = courses[0]
        # Impor dan pembentukan paket pre-test tidak boleh berjalan bersamaan pada course ini.
        connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (course["id"],))
        for row in data["RPS RPL"]:
            match = re.search(r"Sub-CPMK\s+(\d+\.\d+)", row["Sub-CPMK"])
            if not match:
                raise ValueError("Kode Sub-CPMK tidak ditemukan.")
            upsert(
                connection,
                "learning_outcome",
                {
                    "id": scoped_id(course["id"], match[1]),
                    "courseId": course["id"],
                    "code": match[1],
                    "cpmk": row["CPMK"],
                    "description": row["Sub-CPMK"],
                },
            )
        for row in data["Materi RPL"]:
            number = integer_cell(row["Pertemuan"], "Pertemuan")

            # Urutan LMS dapat berbeda dari workbook. Prioritaskan PDF yang sudah diunggah.
            def normalized_file(value: str) -> str:
                value = re.sub(r"^\d+[.\s]+", "", value.lower()).replace("modelling", "modeling")
                return re.sub(r"[^a-z0-9]", "", value.replace(".pdf", ""))

            expected_file = normalized_file(row["Nama File PDF"])
            uploaded = connection.execute(
                'SELECT m."courseSessionId" AS id,m."fileName" FROM material m '
                'JOIN course_session s ON s.id=m."courseSessionId" WHERE s."courseId"=%s',
                (course["id"],),
            ).fetchall()
            matches = {m["id"] for m in uploaded if normalized_file(m["fileName"]) == expected_file}
            session = (
                {"id": next(iter(matches))}
                if len(matches) == 1
                else connection.execute(
                    'SELECT id FROM course_session WHERE "courseId"=%s AND "orderNumber"=%s',
                    (course["id"], number),
                ).fetchone()
            )
            if session is None:
                session = connection.execute(
                    'INSERT INTO course_session (id,"courseId","createdBy",title,"orderNumber",'
                    '"updatedAt") VALUES (%s,%s,%s,%s,%s,NOW()) RETURNING id',
                    (
                        str(uuid4()),
                        course["id"],
                        course["createdBy"],
                        f"Minggu {number} - {row['Judul Materi']}",
                        number,
                    ),
                ).fetchone()
            assert session is not None
            upsert(
                connection,
                "domain_topic",
                {
                    "id": scoped_id(course["id"], row["ID Materi"]),
                    "code": row["ID Materi"],
                    "courseId": course["id"],
                    "courseSessionId": session["id"],
                    "title": row["Judul Materi"],
                    "orderNumber": number,
                    "cpmkCodes": codes(row["CPMK"]),
                    "subCpmkCodes": codes(row["Sub-CPMK"]),
                    "sourcePdf": row["Nama File PDF"],
                    "sourcePages": row["Halaman PDF"],
                },
            )
            for outcome in codes(row["Sub-CPMK"]):
                connection.execute(
                    'INSERT INTO domain_topic_outcome ("topicId","outcomeId") VALUES (%s,%s) '
                    "ON CONFLICT DO NOTHING",
                    (scoped_id(course["id"], row["ID Materi"]), scoped_id(course["id"], outcome)),
                )
        for row in data["Indikator RPL"]:
            concept_id = row["ID Indikator"].replace("RPL-I", "RPL-C")
            upsert(
                connection,
                "domain_concept",
                {
                    "id": scoped_id(course["id"], concept_id),
                    "code": concept_id,
                    "topicId": scoped_id(course["id"], row["ID Materi"]),
                    "name": row["Konsep"],
                },
            )
            upsert(
                connection,
                "domain_indicator",
                {
                    "id": scoped_id(course["id"], row["ID Indikator"]),
                    "courseId": course["id"],
                    "code": row["ID Indikator"],
                    "topicId": scoped_id(course["id"], row["ID Materi"]),
                    "conceptId": scoped_id(course["id"], concept_id),
                    "description": row["Indikator Kemampuan"],
                    "cpmkCodes": codes(row["CPMK"]),
                    "subCpmkCodes": codes(row["Sub-CPMK"]),
                    "sourcePdf": row["Sumber PDF"],
                    "sourcePages": row["Halaman PDF"],
                },
            )
        for sheet, kind in [("Soal Pre-Post RPL", "PRE_POST"), ("Soal Latihan RPL", "PRACTICE")]:
            for row in data[sheet]:
                upsert(
                    connection,
                    "question_bank_item",
                    {
                        "id": scoped_id(course["id"], row["ID Soal"]),
                        "courseId": course["id"],
                        "code": row["ID Soal"],
                        "topicId": scoped_id(course["id"], row["ID Materi"]),
                        "indicatorId": scoped_id(course["id"], row["ID Indikator"]),
                        "kind": kind,
                        "question": row["Pertanyaan"],
                        "options": Jsonb(
                            {letter: row[f"Opsi {letter}"] for letter in QUESTION_OPTIONS}
                        ),
                        "correctOption": row["Kunci"],
                        "explanation": row["Penjelasan Jawaban"],
                        "cognitiveLevel": row["Tingkat Kognitif"],
                        "practiceNumber": (
                            integer_cell(row["Latihan Ke"], "Latihan Ke")
                            if kind == "PRACTICE"
                            else None
                        ),
                        "sourcePdf": row["Sumber PDF"],
                        "sourcePages": row["Halaman PDF"],
                    },
                )
        connection.execute(
            'INSERT INTO course_learning_config ("courseId","pretestQuestionCount","datasetName",'
            '"datasetChecksum") VALUES (%s,%s,%s,%s) ON CONFLICT ("courseId") DO UPDATE SET '
            '"pretestQuestionCount"=EXCLUDED."pretestQuestionCount",'
            '"datasetName"=EXCLUDED."datasetName","datasetChecksum"=EXCLUDED."datasetChecksum"',
            (
                course["id"],
                len(data["Soal Pre-Post RPL"]),
                path.name,
                sha256(path.read_bytes()).hexdigest(),
            ),
        )
    return {"courseId": course["id"], "topics": 7, "indicators": 14, "prePost": 14, "practice": 28}
