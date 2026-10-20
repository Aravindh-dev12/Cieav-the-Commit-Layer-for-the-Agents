"""
Tests for Multilingual Engine, Autonomous Video Studio, and Desktop GUI Agent.
=============================================================================
Verifies:
1. Unicode script and keyword language detection across 8+ languages.
2. Multilingual intent normalization (Hindi, Telugu, Kannada, Arabic, French, Chinese, Japanese).
3. Synthetic video generation and media inspection.
4. Video trimming and rendering.
5. Hands-free desktop GUI video editing mission execution.
"""

import os
import pytest

from commit_layer.multilingual import multilingual_engine
from commit_layer.tools.media_studio import media_studio
from commit_layer.gui_agent import gui_agent


def test_multilingual_language_detection():
    """Engine must detect Unicode scripts for Hindi, Telugu, Arabic, Chinese, and Japanese."""
    assert multilingual_engine.detect_language("नमस्ते") == "HINDI"
    assert multilingual_engine.detect_language("నమస్కారం") == "TELUGU"
    assert multilingual_engine.detect_language("ನಮಸ್ಕಾರ") == "KANNADA"
    assert multilingual_engine.detect_language("നമസ്കാരം") == "MALAYALAM"
    assert multilingual_engine.detect_language("مرحبا") == "ARABIC"
    assert multilingual_engine.detect_language("你好") == "CHINESE"
    assert multilingual_engine.detect_language("こんにちは") == "JAPANESE"
    assert multilingual_engine.detect_language("bonjour tout le monde") == "FRENCH"
    assert multilingual_engine.detect_language("hello world") == "ENGLISH"


def test_multilingual_intent_matching():
    """Engine must match multilingual phrases to canonical tool actions."""
    intent_hi, lang_hi = multilingual_engine.match_multilingual_intent("क्रोम खोलो")
    assert intent_hi == "OPEN_CHROME"
    assert lang_hi == "HINDI"

    intent_fr, lang_fr = multilingual_engine.match_multilingual_intent("ouvre chrome")
    assert intent_fr == "OPEN_CHROME"
    assert lang_fr == "FRENCH"

    intent_zh, lang_zh = multilingual_engine.match_multilingual_intent("清理临时文件")
    assert intent_zh == "CLEAN_TEMP"
    assert lang_zh == "CHINESE"

    intent_ja, lang_ja = multilingual_engine.match_multilingual_intent("システム診断")
    assert intent_ja == "SYSTEM_DIAGNOSTICS"
    assert lang_ja == "JAPANESE"

    intent_ar, lang_ar = multilingual_engine.match_multilingual_intent("تعديل الفيديو")
    assert intent_ar == "VIDEO_EDIT"
    assert lang_ar == "ARABIC"


def test_media_studio_synthetic_video_and_trim():
    """Media Studio must produce valid MP4 video and trim without errors."""
    test_out = "test_synth_clip.mp4"
    trimmed_out = "test_trimmed_clip.mp4"

    try:
        # Create 3-second test clip
        gen_res = media_studio.create_synthetic_demo_video(output_path=test_out, duration_sec=3, title="Pytest Studio")
        assert gen_res["status"] == "success"
        assert os.path.exists(test_out)
        assert gen_res["total_frames"] == 90

        # Inspect media
        meta = media_studio.inspect_media(test_out)
        assert meta["status"] == "success"
        assert meta["resolution"] == "1280x720"
        assert meta["duration_sec"] >= 2.9

        # Trim video
        trim_res = media_studio.trim_video(test_out, start_time="00:00:00", end_time="00:00:02", output_path=trimmed_out)
        assert trim_res["status"] == "success"
        assert os.path.exists(trimmed_out)
        assert trim_res["duration_sec"] > 0
    finally:
        if os.path.exists(test_out):
            os.remove(test_out)
        if os.path.exists(trimmed_out):
            os.remove(trimmed_out)


def test_gui_agent_video_mission_execution():
    """Desktop GUI Agent must execute a complete hands-free video editing sequence."""
    res = gui_agent.execute_video_editing_mission("edit video cut from 00:00:01 to 00:00:03", output_video="test_gui_out.mp4")
    assert res["status"] == "success"
    assert len(res["steps"]) == 4
    assert res["screen"]["width"] > 0
    assert os.path.exists("test_gui_out.mp4")

    card = gui_agent.render_gui_mission_card(res)
    assert "HANDS-FREE TOOL CONTROL" in card

    if os.path.exists("test_gui_out.mp4"):
        os.remove("test_gui_out.mp4")
    if os.path.exists("source_footage.mp4"):
        os.remove("source_footage.mp4")
