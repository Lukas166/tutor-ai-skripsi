import re

from tutor_rag.contracts.rag import PrepareRequest, RetrievedChunk
from tutor_rag.core.config import MAX_CONTEXT_CHARS, MAX_HISTORY_MESSAGES
from tutor_rag.rag.templates import AVATAR_INSTRUCTION, CHAT_INSTRUCTION, SYSTEM_TEMPLATE


def truncate_text(value: str, limit: int) -> str:
    # Pembatasan ini berbasis karakter, bukan token; tujuannya membatasi panjang konteks.
    return value if len(value) <= limit else value[:limit].strip() + "..."


def build_system_instruction(request: PrepareRequest) -> str:
    # Gaya akademik berasal dari konfigurasi admin LMS; tidak menambah mekanisme adaptasi.
    level = request.user.academic_level if request.user.academic_level in ("S2", "S3") else "S1"
    replacements = {
        "{{user_name}}": request.user.name or "Mahasiswa",
        "{{user_role}}": request.user.role,
        "{{academic_level}}": level,
        "{{response_instruction}}": (
            AVATAR_INSTRUCTION if request.response_mode == "avatar" else CHAT_INSTRUCTION
        ),
        "{{academic_style}}": request.academic_style,
    }
    # Substitusi satu kali menjaga teks pengguna/LaTeX tidak dianggap placeholder baru.
    pattern = "|".join(re.escape(key) for key in replacements)
    return re.sub(pattern, lambda match: replacements[match.group()], SYSTEM_TEMPLATE)


def build_context(chunks: list[RetrievedChunk]) -> str:
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
                    f"Konten: {truncate_text(chunk.content, MAX_CONTEXT_CHARS)}",
                ]
            )
        )
    return "\n\n".join(blocks)


def build_prompt(request: PrepareRequest, chunks: list[RetrievedChunk]) -> str:
    # Riwayat datang berurutan dari LMS dan tidak memuat pertanyaan yang sedang dijawab.
    history = (
        "\n".join(
            f"{'User' if message.sender_type == 'user' else 'Tutor AI'}: "
            f"{truncate_text(message.content, 700)}"
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
    # Mode avatar hanya mengubah penyajian jawaban; sumber retrieval tetap sama.
    answer_instruction = (
        "Tulis jawaban Tutor AI yang natural, singkat, maksimal 45 kata, "
        "jujur terhadap batas konteks, dan tidak bertele-tele."
        if request.response_mode == "avatar"
        else "Tulis jawaban Tutor AI yang jelas, lengkap, terstruktur, "
        "jujur terhadap batas konteks, dan sertakan rujukan sumber jika relevan."
    )
    # Urutan prompt: course → daftar materi → riwayat → sumber → pertanyaan → arahan jawaban.
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
            "Konteks retrieved dari PDF:",
            build_context(chunks),
            "",
            "Pertanyaan user saat ini:",
            request.question,
            "",
            answer_instruction,
        ]
    )
    return "\n".join(lines)
