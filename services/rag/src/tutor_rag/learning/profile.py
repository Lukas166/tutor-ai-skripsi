from typing import Any


def operational_status(profile: dict[str, Any] | None, config: dict) -> str:
    # Status operasional memandu bantuan; baseline asli tetap tersimpan secara terpisah.
    if not profile or profile.get("initialScore") is None:
        return "NOT_ASSESSED"
    if profile["evidenceCount"] == 1:
        return profile["initialStatus"]
    if profile["currentScore"] >= config["readyThreshold"]:
        return "READY_TO_ADVANCE"
    if profile["currentScore"] >= config["developingThreshold"]:
        return "DEVELOPING"
    return "NEEDS_REINFORCEMENT"
