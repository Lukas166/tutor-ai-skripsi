POSITIVE = "INITIAL_POSITIVE_EVIDENCE"
REINFORCEMENT = "NEEDS_REINFORCEMENT"
QUESTION_OPTIONS = frozenset(("A", "B", "C", "D"))


def has_four_options(question: dict) -> bool:
    return (
        set(question["options"]) == QUESTION_OPTIONS
        and question["correctOption"] in QUESTION_OPTIONS
    )


def grade_responses(items: list[dict], expected_total: int) -> tuple[int, float, list[int]]:
    # Penilaian deterministik, tanpa LLM dan tanpa menerima nilai/kunci dari browser.
    if (
        expected_total <= 0
        or len(items) != expected_total
        or len({i["indicatorId"] for i in items}) != expected_total
    ):
        raise ValueError("Paket pre-test harus mencakup satu soal per indikator.")
    if any(not has_four_options(item["questionSnapshot"]) for item in items):
        raise ValueError("Paket soal lama perlu diperbarui menjadi empat opsi A-D.")
    if any(item["selectedOption"] not in QUESTION_OPTIONS for item in items):
        raise ValueError("Lengkapi seluruh jawaban sebelum mengirim.")
    scores = [int(i["selectedOption"] == i["questionSnapshot"]["correctOption"]) for i in items]
    correct = sum(scores)
    return correct, correct / expected_total * 100, scores
