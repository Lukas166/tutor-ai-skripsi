QUESTION_OPTIONS = frozenset(("A", "B", "C", "D"))


def has_four_options(question: dict) -> bool:
    return (
        set(question["options"]) == QUESTION_OPTIONS
        and question["correctOption"] in QUESTION_OPTIONS
    )
