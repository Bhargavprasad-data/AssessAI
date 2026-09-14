import pytest
from app.services.adaptive_engine import is_response_fast, update_adaptive_counters


def test_is_response_fast_computation():
    # When per_question_time_limit_seconds is 60: threshold is 50% = 30 seconds (30,000 ms)
    assert is_response_fast(response_time_ms=15000, per_question_time_limit_seconds=60, fast_response_threshold_seconds=30) is True
    assert is_response_fast(response_time_ms=30000, per_question_time_limit_seconds=60, fast_response_threshold_seconds=30) is True
    assert is_response_fast(response_time_ms=31000, per_question_time_limit_seconds=60, fast_response_threshold_seconds=30) is False

    # When per_question_time_limit_seconds is None: uses fast_response_threshold_seconds (e.g. 25s = 25,000 ms)
    assert is_response_fast(response_time_ms=24000, per_question_time_limit_seconds=None, fast_response_threshold_seconds=25) is True
    assert is_response_fast(response_time_ms=26000, per_question_time_limit_seconds=None, fast_response_threshold_seconds=25) is False


def test_easy_level_adaptive_behavior():
    """
    EASY level:
    - Correct: Promotes to MEDIUM when promotion_threshold met, otherwise remains EASY.
    - Incorrect: Remains at EASY (never moves below EASY).
    - Timeout: Remains at EASY (never moves below EASY).
    """
    # 1. Correct with promotion_threshold = 2
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="easy", promotion_counter=0, demotion_counter=0,
        is_correct=True, is_fast=True, promotion_threshold=2
    )
    assert diff == "easy"
    assert prom == 1
    assert dem == 0

    diff, prom, dem = update_adaptive_counters(
        current_difficulty="easy", promotion_counter=1, demotion_counter=0,
        is_correct=True, is_fast=True, promotion_threshold=2
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 0

    # 2. Incorrect remains EASY
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="easy", promotion_counter=1, demotion_counter=0,
        is_correct=False, is_fast=True, demotion_threshold=2
    )
    assert diff == "easy"
    assert prom == 0
    assert dem == 0

    # 3. Timeout remains EASY
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="easy", promotion_counter=1, demotion_counter=0,
        is_correct=False, is_fast=False, is_timeout=True, demotion_threshold=2
    )
    assert diff == "easy"
    assert prom == 0
    assert dem == 0


def test_medium_level_adaptive_behavior():
    """
    MEDIUM level:
    - Correct + Fast: Increments promotion counter -> Promotes to HARD at threshold.
    - Correct + Slow (speed-adaptive enabled): Demotion event -> Demotes toward EASY.
    - Incorrect: Demotion event -> Demotes to EASY when demotion_threshold reached.
    - Timeout: Demotion event -> Demotes to EASY when demotion_threshold reached.
    """
    # 1. Correct + Fast -> Hard
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=0, demotion_counter=0,
        is_correct=True, is_fast=True, promotion_threshold=2
    )
    assert diff == "medium"
    assert prom == 1
    assert dem == 0

    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=1, demotion_counter=0,
        is_correct=True, is_fast=True, promotion_threshold=2
    )
    assert diff == "hard"
    assert prom == 0
    assert dem == 0

    # 2. Correct + Slow in speed-adaptive mode -> Demotion event
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=1, demotion_counter=0,
        is_correct=True, is_fast=False, enable_speed_adaptive=True, demotion_threshold=2
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 1

    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=0, demotion_counter=1,
        is_correct=True, is_fast=False, enable_speed_adaptive=True, demotion_threshold=2
    )
    assert diff == "easy"
    assert prom == 0
    assert dem == 0

    # 3. Incorrect -> Demotes to EASY
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=1, demotion_counter=0,
        is_correct=False, demotion_threshold=2
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 1

    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=0, demotion_counter=1,
        is_correct=False, demotion_threshold=2
    )
    assert diff == "easy"
    assert prom == 0
    assert dem == 0

    # 4. Timeout -> Demotes to EASY
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=1, demotion_counter=0,
        is_correct=False, is_timeout=True, demotion_threshold=1
    )
    assert diff == "easy"
    assert prom == 0
    assert dem == 0


def test_hard_level_adaptive_behavior():
    """
    HARD level:
    - Correct + Fast: Remains at HARD (max difficulty).
    - Correct + Slow (speed-adaptive enabled): Demotion event -> Demotes to MEDIUM at threshold.
    - Incorrect: Demotion event -> Demotes to MEDIUM at threshold.
    - Timeout: Demotion event -> Demotes to MEDIUM at threshold.
    """
    # 1. Correct + Fast remains HARD
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard", promotion_counter=0, demotion_counter=0,
        is_correct=True, is_fast=True, promotion_threshold=1
    )
    assert diff == "hard"
    assert prom == 0
    assert dem == 0

    # 2. Correct + Slow in speed-adaptive mode -> Demotes to MEDIUM
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard", promotion_counter=0, demotion_counter=0,
        is_correct=True, is_fast=False, enable_speed_adaptive=True, demotion_threshold=2
    )
    assert diff == "hard"
    assert dem == 1

    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard", promotion_counter=0, demotion_counter=1,
        is_correct=True, is_fast=False, enable_speed_adaptive=True, demotion_threshold=2
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 0

    # 3. Incorrect -> Demotes to MEDIUM
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard", promotion_counter=0, demotion_counter=0,
        is_correct=False, demotion_threshold=1
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 0

    # 4. Timeout -> Demotes to MEDIUM
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard", promotion_counter=0, demotion_counter=0,
        is_correct=False, is_timeout=True, demotion_threshold=1
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 0


def test_accessibility_mode_speed_adaptive_disabled():
    """
    When enable_speed_adaptive = False:
    - Speed does NOT influence difficulty.
    - Slow-but-correct answer is a PROMOTION event, NOT a demotion event.
    - Incorrect answer and timeout are still demotion events.
    """
    # Slow correct answer on easy promotes to medium
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="easy", promotion_counter=0, demotion_counter=0,
        is_correct=True, is_fast=False, enable_speed_adaptive=False, promotion_threshold=1
    )
    assert diff == "medium"
    assert prom == 0
    assert dem == 0

    # Slow correct answer on medium promotes to hard
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=0, demotion_counter=0,
        is_correct=True, is_fast=False, enable_speed_adaptive=False, promotion_threshold=1
    )
    assert diff == "hard"
    assert prom == 0
    assert dem == 0

    # Timeout in accessibility mode is still a demotion event
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium", promotion_counter=0, demotion_counter=0,
        is_correct=False, is_fast=False, is_timeout=True, enable_speed_adaptive=False, demotion_threshold=1
    )
    assert diff == "easy"
    assert prom == 0
    assert dem == 0


def test_strict_difficulty_boundaries_and_shuffling_transitions():
    """
    Direct verification of user specification:
    EASY + CORRECT -> Stay EASY or promote to MEDIUM
    EASY + WRONG -> Stay EASY
    EASY + TIMEOUT -> Stay EASY
    EASY is minimum difficulty and MUST never decrease below EASY.

    MEDIUM + CORRECT + FAST -> Promotion event -> Promote to HARD
    MEDIUM + WRONG -> Demotion event -> Demote to EASY
    MEDIUM + TIMEOUT -> Demotion event -> Demote to EASY

    HARD + CORRECT + FAST -> Remain HARD (HARD is maximum)
    HARD + WRONG -> Demotion event -> Demote to MEDIUM
    HARD + TIMEOUT -> Demotion event -> Demote to MEDIUM

    Boundaries:
    EASY cannot decrease
    MEDIUM can increase or decrease
    HARD cannot increase
    """
    # EASY Boundary Tests
    for wrong_scenario in [{"is_correct": False, "is_timeout": False}, {"is_correct": False, "is_timeout": True}]:
        diff, prom, dem = update_adaptive_counters(
            current_difficulty="easy",
            promotion_counter=1,
            demotion_counter=0,
            is_correct=wrong_scenario["is_correct"],
            is_timeout=wrong_scenario["is_timeout"]
        )
        assert diff == "easy", "EASY cannot decrease on WRONG or TIMEOUT"
        assert prom == 0, "Promotion counter must reset to 0 on WRONG/TIMEOUT"
        assert dem == 0, "Demotion counter on EASY must stay 0"

    # EASY + CORRECT (slow or fast) always progresses
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="easy",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=True,
        is_fast=False,
        enable_speed_adaptive=True,
        promotion_threshold=1
    )
    assert diff == "medium", "EASY + CORRECT must promote to MEDIUM at threshold"

    # MEDIUM Boundary Tests
    # MEDIUM + CORRECT + FAST -> HARD
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=True,
        is_fast=True,
        promotion_threshold=1
    )
    assert diff == "hard"

    # MEDIUM + WRONG -> EASY
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=False,
        is_timeout=False,
        demotion_threshold=1
    )
    assert diff == "easy"

    # MEDIUM + TIMEOUT -> EASY
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="medium",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=False,
        is_timeout=True,
        demotion_threshold=1
    )
    assert diff == "easy"

    # HARD Boundary Tests
    # HARD + CORRECT + FAST -> HARD (capped)
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=True,
        is_fast=True,
        promotion_threshold=1
    )
    assert diff == "hard", "HARD cannot increase above HARD"
    assert prom == 0

    # HARD + WRONG -> MEDIUM
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=False,
        is_timeout=False,
        demotion_threshold=1
    )
    assert diff == "medium"

    # HARD + TIMEOUT -> MEDIUM
    diff, prom, dem = update_adaptive_counters(
        current_difficulty="hard",
        promotion_counter=0,
        demotion_counter=0,
        is_correct=False,
        is_timeout=True,
        demotion_threshold=1
    )
    assert diff == "medium"

