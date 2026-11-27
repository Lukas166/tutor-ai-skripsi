from tutor_rag.contracts.rag import PrepareRequest, RetrievedChunk
from tutor_rag.core.config import (
    MAX_CONTEXT_CHARS,
    MAX_HISTORY_MESSAGE_CHARS,
    MAX_HISTORY_MESSAGES,
)
from tutor_rag.rag.templates import (
    AVATAR_INSTRUCTION,
    CHAT_INSTRUCTION,
    FOLLOWUP_INSTRUCTION,
    SYSTEM_INSTRUCTION,
    WELCOME_INSTRUCTION,
)


def truncate_text(value: str, limit: int) -> str:
    # Pembatasan ini berbasis karakter, bukan token; tujuannya membatasi panjang konteks.
    return value if len(value) <= limit else value[:limit].strip() + "..."


def build_system_instruction(request: PrepareRequest) -> str:
    instruction = SYSTEM_INSTRUCTION.format(
        course_title=request.course.title,
        student_context=(
            f"Mahasiswa bernama {request.user.name}."
            if request.purpose == "welcome" and request.user.name else ""
        ),
    )
    instruction += "\n\n" + (
        AVATAR_INSTRUCTION if request.response_mode == "avatar" else CHAT_INSTRUCTION
    )
    if request.purpose == "welcome":
        instruction += "\n\n" + WELCOME_INSTRUCTION
    elif request.purpose == "practice_followup":
        instruction += "\n\n" + FOLLOWUP_INSTRUCTION
    return instruction


def build_context(
    chunks: list[RetrievedChunk], *, max_content_chars: int = MAX_CONTEXT_CHARS
) -> str:
    # Setiap potongan menyertakan sumber dan nomor halaman agar jawaban dapat ditelusuri.
    blocks = []
    for index, chunk in enumerate(chunks, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[Sumber {index}]",
                    f"Materi: {chunk.material_title}",
                    f"File: {chunk.file_name}",
                    f"Sesi: {chunk.session_title}",
                    f"Halaman: {chunk.page_number}",
                    f"Konten: {truncate_text(chunk.content, max_content_chars)}",
                ]
            )
        )
    return "\n\n".join(blocks)


def build_prompt(request: PrepareRequest, chunks: list[RetrievedChunk]) -> str:
    # Riwayat datang berurutan dari LMS dan tidak memuat pertanyaan yang sedang dijawab.
    history = (
        "\n".join(
            f"{'User' if message.sender_type == 'user' else 'Tutor AI'}: "
            f"{truncate_text(message.content, MAX_HISTORY_MESSAGE_CHARS)}"
            for message in request.history[-MAX_HISTORY_MESSAGES:]
        )
        or "Belum ada riwayat sebelumnya."
    )
    materials = (
        "\n".join(
            f"{index}. {material.title} ({material.file_name})"
            for index, material in enumerate(request.active_materials, start=1)
        )
        or "Tidak ada materi aktif."
    )
    # Materi dan riwayat menjadi konteks; pesan terakhir tetap menjadi fokus jawaban.
    lines = [f"Course: {request.course.title}"]
    if request.course.description:
        lines.append(f"Deskripsi course: {request.course.description}")
    lines.extend(
        [
            "",
            "Materi PDF yang diunggah dan aktif saat ini:",
            materials,
            "",
            "Riwayat percakapan terakhir:",
            history,
            "",
            "Konteks PDF yang ditemukan:",
            build_context(chunks) or "Tidak ada potongan PDF yang relevan.",
            "",
            (
                "Pesan mahasiswa yang harus dijawab:"
                if request.purpose == "answer"
                else "Peristiwa aplikasi yang perlu ditanggapi:"
            ),
            request.question,
        ]
    )
    return "\n".join(lines)
