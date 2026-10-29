import re

from tutor_rag.contracts.rag import AvatarExpression, AvatarExpressionRequest, GenerateRequest
from tutor_rag.infrastructure.gemini import GeminiProvider

EXPRESSION_INSTRUCTION = """Kamu memilih ekspresi wajah avatar tutor berdasarkan konteks percakapan.
Balas hanya satu kata: neutral, happy, atau concerned.

Gunakan:
- concerned: HANYA jika user jelas memarahi avatar, menghina, kesal, kecewa berat, atau komplain keras kepada tutor.
- happy: jika user jelas memuji, berterima kasih dengan hangat, atau menunjukkan puas/berhasil paham.
- neutral: untuk semua kondisi biasa, termasuk sapaan, penjelasan normal, tutor tidak menemukan jawaban, konteks tidak cukup, atau tutor memberi batasan kemampuan.

Jika ragu, pilih neutral."""  # noqa: E501


def choose_expression(
    request: AvatarExpressionRequest, provider: GeminiProvider
) -> AvatarExpression:
    # Ekspresi adalah metadata tampilan; pemilihannya tidak mengubah isi jawaban RAG.
    if request.response_mode != "avatar":
        return "neutral"
    positive = re.search(
        r"\b(terima kasih|makasih|thanks|thank you|bagus|hebat|keren|mantap|pintar|cerdas|"
        r"membantu|sangat membantu|luar biasa|good job|nice|top)\b",
        request.question,
        re.I,
    )
    if positive:
        return "happy"
    upset = re.search(
        r"\b(marah|kesal|kecewa|buruk|jelek|payah|ngawur|bodoh|tolol|goblok|salah banget|"
        r"tidak membantu|ga membantu|gak membantu|mengecewakan|percuma)\b",
        request.question,
        re.I,
    )
    missing_context = re.search(
        r"\b(konteks|materi|pdf|belum cukup|tidak cukup|belum bisa|tidak membahas|"
        r"tidak menemukan|tidak tersedia)\b",
        request.answer,
        re.I,
    )
    if missing_context and not upset:
        return "neutral"
    try:
        # Gunakan LLM hanya jika aturan sederhana di atas belum menentukan ekspresi.
        expression = (
            provider.generate(
                GenerateRequest(
                    system_instruction=EXPRESSION_INSTRUCTION,
                    prompt="\n".join(
                        [
                            "Pertanyaan user:",
                            request.question,
                            "",
                            "Jawaban tutor:",
                            request.answer,
                            "",
                            "Ekspresi avatar:",
                        ]
                    ),
                )
            )
            .lower()
            .strip()
        )
        if "concerned" in expression or "sad" in expression:
            return "concerned"
        if "happy" in expression:
            return "happy"
    except Exception:
        # Kegagalan metadata ekspresi tidak boleh membatalkan jawaban yang sudah berhasil.
        return "neutral"
    return "neutral"
