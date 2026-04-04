"""Build Jinja context from API payload (camelCase or snake_case)."""

from __future__ import annotations

from datetime import date
from typing import Any


def _get(d: dict[str, Any], *keys: str, default: str = "") -> str:
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return default


def build_render_context(document_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    today = date.today().strftime("%d/%m/%Y")
    current = _get(payload, "currentDate", "current_date", default=today)

    ctx = {
        "doc_title": _get(payload, "title", default="Documento Médico"),
        "patient_name": _get(payload, "patientName", "patient_name", default="Nome não informado"),
        "patient_cpf": _get(payload, "patientCpf", "patient_cpf"),
        "professional_name": _get(
            payload, "professionalName", "professional_name", default="Profissional de Saúde"
        ),
        "professional_specialty": _get(payload, "professionalSpecialty", "professional_specialty"),
        "crm": _get(payload, "crm"),
        "signature_url": _get(payload, "signatureUrl", "signature_url"),
        "current_date": current,
        "title": _get(payload, "title", default="Documento Médico"),
        "content": _get(payload, "content"),
        "description": _get(payload, "description"),
        "days": _get(payload, "days", default="1"),
        "cid": _get(payload, "cid"),
        "prescription": _get(payload, "prescription"),
        "procedure": _get(payload, "procedure"),
        "procedure_description": _get(payload, "description", "procedure_description"),
        "risks": _get(payload, "risks"),
    }

    if document_type == "certificate":
        if not ctx["description"]:
            raise ValueError("Descrição do atestado é obrigatória")
        days_s = str(ctx["days"]).strip()
        if not days_s.isdigit() or int(days_s) < 1:
            raise ValueError("Número de dias deve ser um valor numérico válido")

    if document_type == "prescription" and not ctx["prescription"]:
        raise ValueError("Conteúdo da prescrição é obrigatório")

    if document_type == "consent_form":
        if not ctx["procedure"] or not ctx["procedure_description"] or not ctx["risks"]:
            raise ValueError("Procedimento, descrição e riscos são obrigatórios para o termo de consentimento")

    if document_type == "exam_request" and not ctx["content"]:
        raise ValueError("Conteúdo dos exames solicitados é obrigatório")

    if document_type == "declaration" and not ctx["content"]:
        raise ValueError("Conteúdo da declaração é obrigatório")

    if document_type in ("other", "medical_record") and not ctx["content"]:
        raise ValueError("Conteúdo do documento é obrigatório")

    return ctx


TEMPLATE_BY_TYPE: dict[str, str] = {
    "certificate": "certificate.html.j2",
    "prescription": "prescription.html.j2",
    "consent_form": "consent_form.html.j2",
    "exam_request": "exam_request.html.j2",
    "declaration": "declaration.html.j2",
    "lgpd": "lgpd.html.j2",
    "other": "other.html.j2",
    "medical_record": "medical_record.html.j2",
}
