import pytest

from app.context import build_render_context


def test_certificate_requires_description():
    with pytest.raises(ValueError, match="Descrição"):
        build_render_context(
            "certificate",
            {"patientName": "A", "days": "1"},
        )


def test_certificate_requires_valid_days():
    with pytest.raises(ValueError, match="dias"):
        build_render_context(
            "certificate",
            {"patientName": "A", "description": "x", "days": "abc"},
        )


def test_generic_builds():
    ctx = build_render_context(
        "other",
        {
            "patientName": "Maria",
            "content": "Texto do documento",
            "title": "Declaração",
        },
    )
    assert ctx["patient_name"] == "Maria"
    assert "Texto" in ctx["content"]
