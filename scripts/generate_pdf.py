#!/usr/bin/env python3
"""
Gerador de PDF standalone para documentos médicos — chamado pelo Node.js via execFile.
Usa reportlab (sem WeasyPrint/xhtml2pdf) — mesmo padrão do projeto dermato.

Uso: python generate_pdf.py <in.json> <out.pdf>
  in.json: {"document_type": "...", "payload": {...}}
"""
from __future__ import annotations

import io
import json
import sys
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ascii_safe(s: str | None) -> str:
    if not s:
        return "—"
    out = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode("ascii")
    return out.strip() or "—"


def multiline(s: str | None) -> str:
    if not s:
        return "—"
    return ascii_safe(s).replace("\n", "<br/>")


def get(payload: dict, *keys: str, default: str = "") -> str:
    for k in keys:
        v = payload.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return default


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

def build_styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            name="DocTitle",
            parent=base["Heading1"],
            fontSize=16,
            spaceAfter=6,
            textColor=colors.HexColor("#7f1d1d"),
        ),
        "subtitle": ParagraphStyle(
            name="DocSubtitle",
            parent=base["Normal"],
            fontSize=10,
            spaceAfter=2,
            textColor=colors.HexColor("#991b1b"),
        ),
        "h2": ParagraphStyle(
            name="DocH2",
            parent=base["Heading2"],
            fontSize=11,
            spaceBefore=10,
            spaceAfter=4,
            textColor=colors.HexColor("#7f1d1d"),
        ),
        "normal": ParagraphStyle(
            name="DocNormal",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
        ),
        "small": ParagraphStyle(
            name="DocSmall",
            parent=base["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#44403c"),
        ),
        "label": ParagraphStyle(
            name="DocLabel",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#44403c"),
        ),
    }


# ---------------------------------------------------------------------------
# Shared blocks
# ---------------------------------------------------------------------------

def _fetch_logo(url: str) -> io.BytesIO | None:
    if not url or not url.startswith("http"):
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
        return io.BytesIO(data)
    except Exception:
        return None


def render_header(story: list, styles: dict, payload: dict, doc_title: str) -> None:
    logo_url = get(payload, "logoUrl", "logo_url")
    if logo_url:
        logo_data = _fetch_logo(logo_url)
        if logo_data:
            try:
                img = Image(logo_data)
                max_w = 6 * cm
                max_h = 2.5 * cm
                ratio = min(max_w / img.imageWidth, max_h / img.imageHeight)
                img.drawWidth = img.imageWidth * ratio
                img.drawHeight = img.imageHeight * ratio
                img.hAlign = "LEFT"
                story.append(img)
                story.append(Spacer(1, 0.2 * cm))
            except Exception:
                pass

    prof_name = get(payload, "professionalName", "professional_name", default="Profissional de Saude")
    specialty = get(payload, "professionalSpecialty", "professional_specialty")
    crm = get(payload, "crm")

    story.append(Paragraph(ascii_safe(prof_name), styles["title"]))
    if specialty:
        story.append(Paragraph(ascii_safe(specialty), styles["subtitle"]))
    if crm:
        story.append(Paragraph(f"CRM/CREFITO: {ascii_safe(crm)}", styles["subtitle"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(f"<b>{ascii_safe(doc_title).upper()}</b>", styles["h2"]))
    story.append(Spacer(1, 0.1 * cm))


def render_patient_block(story: list, styles: dict, payload: dict) -> None:
    patient_name = get(payload, "patientName", "patient_name", default="Paciente")
    patient_cpf = get(payload, "patientCpf", "patient_cpf")
    current_date = get(
        payload, "currentDate", "current_date",
        default=datetime.now().strftime("%d/%m/%Y"),
    )

    story.append(Paragraph(f"<b>Paciente:</b> {ascii_safe(patient_name)}", styles["normal"]))
    if patient_cpf:
        story.append(Paragraph(f"<b>CPF:</b> {ascii_safe(patient_cpf)}", styles["normal"]))
    story.append(Paragraph(f"<b>Data:</b> {ascii_safe(current_date)}", styles["normal"]))
    story.append(Spacer(1, 0.3 * cm))


def render_footer(story: list, styles: dict, payload: dict) -> None:
    prof_name = get(payload, "professionalName", "professional_name")
    specialty = get(payload, "professionalSpecialty", "professional_specialty")
    crm = get(payload, "crm")

    story.append(Spacer(1, 1.2 * cm))

    parts: list[str] = []
    if prof_name:
        parts.append(ascii_safe(prof_name))
    if specialty:
        parts.append(ascii_safe(specialty))
    if crm:
        parts.append(f"CRM/CREFITO: {ascii_safe(crm)}")

    if parts:
        story.append(Paragraph("<br/>".join(parts), styles["normal"]))
        story.append(Spacer(1, 0.15 * cm))

    story.append(Paragraph("_" * 42 + "<br/><i>Assinatura do profissional</i>", styles["small"]))
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("<i>Documento validado eletronicamente</i>", styles["small"]))


# ---------------------------------------------------------------------------
# Renderers por tipo de documento
# ---------------------------------------------------------------------------

def render_medical_record(story: list, styles: dict, payload: dict) -> None:
    """
    Renderiza prontuário médico.
    O payload.content é texto com seções separadas por \\n\\n.
    Seções com header são detectadas pela ausência de ':' na primeira linha.
    """
    content = get(payload, "content")

    if not content or content == "—":
        story.append(Paragraph("Prontuario sem informacoes clinicas detalhadas registradas.", styles["normal"]))
        return

    blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
    for block in blocks:
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue

        first = lines[0]
        rest = lines[1:]

        if rest:
            # Multi-line block: first line is section header
            story.append(Paragraph(f"<b>{ascii_safe(first)}</b>", styles["h2"]))
            for ln in rest:
                story.append(Paragraph(multiline(ln), styles["normal"]))
        else:
            # Single line: render as-is (may be "Label: value")
            if ":" in first:
                parts = first.split(":", 1)
                label = ascii_safe(parts[0].strip())
                value = ascii_safe(parts[1].strip()) if len(parts) > 1 else ""
                if value and value != "—":
                    story.append(Paragraph(f"<b>{label}:</b> {value}", styles["normal"]))
                else:
                    story.append(Paragraph(f"<b>{ascii_safe(first)}</b>", styles["h2"]))
            else:
                story.append(Paragraph(f"<b>{ascii_safe(first)}</b>", styles["h2"]))

        story.append(Spacer(1, 0.15 * cm))


def render_certificate(story: list, styles: dict, payload: dict) -> None:
    description = get(payload, "description")
    days = get(payload, "days", default="1")
    cid = get(payload, "cid")
    current_date = get(
        payload, "currentDate", "current_date",
        default=datetime.now().strftime("%d/%m/%Y"),
    )

    body = (
        f"Atesto, para os devidos fins, que o(a) paciente acima identificado(a) "
        f"esteve sob meus cuidados profissionais e necessita de afastamento de suas "
        f"atividades habituais pelo periodo de <b>{ascii_safe(days)} dia(s)</b> "
        f"a partir de <b>{ascii_safe(current_date)}</b>."
    )
    if description and description != "—":
        body += f"<br/><br/><b>Descricao:</b><br/>{multiline(description)}"
    if cid and cid != "—":
        body += f"<br/><br/><b>CID:</b> {ascii_safe(cid)}"

    story.append(Paragraph(body, styles["normal"]))


def render_prescription(story: list, styles: dict, payload: dict) -> None:
    prescription = get(payload, "prescription")
    if prescription and prescription != "—":
        story.append(Paragraph(multiline(prescription), styles["normal"]))
    else:
        story.append(Paragraph("Sem itens prescritos.", styles["normal"]))


def render_consent_form(story: list, styles: dict, payload: dict) -> None:
    procedure = get(payload, "procedure")
    description = get(payload, "description")
    risks = get(payload, "risks")

    if procedure and procedure != "—":
        story.append(Paragraph("<b>Procedimento a ser realizado:</b>", styles["h2"]))
        story.append(Paragraph(ascii_safe(procedure), styles["normal"]))
        story.append(Spacer(1, 0.2 * cm))

    if description and description != "—":
        story.append(Paragraph("<b>Descricao do Procedimento:</b>", styles["h2"]))
        story.append(Paragraph(multiline(description), styles["normal"]))
        story.append(Spacer(1, 0.2 * cm))

    if risks and risks != "—":
        story.append(Paragraph("<b>Riscos e Beneficios:</b>", styles["h2"]))
        story.append(Paragraph(multiline(risks), styles["normal"]))
        story.append(Spacer(1, 0.3 * cm))

    consent_text = (
        "Declaro que fui devidamente informado(a) sobre o procedimento acima descrito, "
        "seus riscos, beneficios e alternativas. Todas as minhas duvidas foram "
        "esclarecidas e consinto com a realizacao do procedimento.<br/><br/>"
        "Estou ciente de que nenhum procedimento e 100% isento de riscos e que "
        "complicacoes podem ocorrer mesmo com todos os cuidados tecnicos adequados.<br/><br/>"
        "Autorizo o profissional de saude a realizar o procedimento proposto e declaro "
        "que este consentimento e dado de forma livre e esclarecida."
    )
    story.append(Paragraph("<b>Declaracao de Consentimento:</b>", styles["h2"]))
    story.append(Paragraph(consent_text, styles["normal"]))

    # Dual signature area
    story.append(Spacer(1, 1.2 * cm))
    patient_name = get(payload, "patientName", "patient_name", default="Paciente")
    prof_name = get(payload, "professionalName", "professional_name")
    specialty = get(payload, "professionalSpecialty", "professional_specialty")
    crm = get(payload, "crm")

    prof_parts = [ascii_safe(prof_name)]
    if specialty:
        prof_parts.append(ascii_safe(specialty))
    if crm:
        prof_parts.append(f"CRM/CREFITO: {ascii_safe(crm)}")

    sig_data = [
        [
            Paragraph(
                f"_____________________<br/><b>Paciente ou Responsavel</b><br/>{ascii_safe(patient_name)}",
                styles["small"],
            ),
            Paragraph(
                f"_____________________<br/><b>Profissional Responsavel</b><br/>{'<br/>'.join(prof_parts)}",
                styles["small"],
            ),
        ]
    ]
    sig_table = Table(sig_data, colWidths=[8 * cm, 8 * cm])
    sig_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(sig_table)
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("<i>Documento validado eletronicamente</i>", styles["small"]))
    return  # skip default footer (already rendered above)


def render_exam_request(story: list, styles: dict, payload: dict) -> None:
    content = get(payload, "content")
    story.append(Paragraph("<b>Exames Solicitados:</b>", styles["h2"]))
    if content and content != "—":
        story.append(Paragraph(multiline(content), styles["normal"]))
    else:
        story.append(Paragraph("Sem exames informados.", styles["normal"]))


def render_generic(story: list, styles: dict, payload: dict) -> None:
    content = get(payload, "content") or get(payload, "description")
    if content and content != "—":
        story.append(Paragraph(multiline(content), styles["normal"]))
    else:
        story.append(Paragraph("Sem conteudo informado.", styles["normal"]))


# ---------------------------------------------------------------------------
# Relatorio de Atendimento (WhatsApp) — Secoes 7 e 8
# ---------------------------------------------------------------------------

_INTENT_LABELS = {
    "AGENDAR": "Agendamento",
    "REAGENDAR": "Reagendamento",
    "CANCELAR": "Cancelamento",
    "CONVENIO": "Duvida (convenio)",
    "SAUDACAO": "Saudacao",
    "DESCONHECIDA": "Desconhecida",
}


def _report_table(story: list, header: list, rows: list) -> None:
    data = [header] + (rows if rows else [["Sem dados", ""][: len(header)]])
    table = Table(data, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7f1d1d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 0.3 * cm))


def render_whatsapp_report(story: list, styles: dict, payload: dict) -> None:
    report = payload.get("report") or {}
    periodo = report.get("periodo") or {}
    scope_label = ascii_safe(payload.get("scope_label") or "Convenio (agregado)")

    story.append(
        Paragraph(
            f"Periodo: {ascii_safe(periodo.get('start'))} a {ascii_safe(periodo.get('end'))} "
            f"&nbsp;|&nbsp; Escopo: {scope_label}",
            styles["subtitle"],
        )
    )
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph(f"<b>Total de atendimentos:</b> {report.get('total_atendimentos', 0)}", styles["normal"]))
    novos = report.get("novos_pacientes") or {}
    story.append(
        Paragraph(
            f"<b>Novos pacientes captados:</b> {novos.get('conveniados', 0)} conveniado(s), "
            f"{novos.get('particulares', 0)} particular(es)",
            styles["normal"],
        )
    )
    story.append(Spacer(1, 0.3 * cm))

    # Conversas por tipo de fluxo
    story.append(Paragraph("Conversas por tipo de fluxo", styles["h2"]))
    _report_table(
        story,
        ["Tipo", "Qtd", "%"],
        [
            [_INTENT_LABELS.get(r.get("intent"), ascii_safe(r.get("intent"))), str(r.get("n", 0)), f"{r.get('pct', 0)}%"]
            for r in report.get("por_tipo_fluxo") or []
        ],
    )

    # Horario de pico
    story.append(Paragraph("Horario de pico (mensagens recebidas por hora)", styles["h2"]))
    _report_table(
        story,
        ["Hora", "Mensagens"],
        [[f"{int(r.get('hora', 0)):02d}h", str(r.get("n", 0))] for r in report.get("horario_pico") or []],
    )

    # Conversas transferidas para humano
    transf = report.get("transferidos_humano") or {}
    story.append(Paragraph(f"Conversas transferidas para humano (total: {transf.get('total', 0)})", styles["h2"]))
    _report_table(
        story,
        ["Motivo", "Qtd"],
        [[ascii_safe(r.get("motivo")), str(r.get("n", 0))] for r in transf.get("por_motivo") or []],
    )

    # Custo da IA
    custo = report.get("custo_ia") or {}
    story.append(Paragraph("Custo da Inteligencia Artificial", styles["h2"]))
    _report_table(
        story,
        ["Indicador", "Valor"],
        [
            ["Conversas com IA", str(custo.get("conversas", 0))],
            ["Tokens de entrada", str(custo.get("input_tokens", 0))],
            ["Tokens de saida", str(custo.get("output_tokens", 0))],
            ["Custo (US$)", f"US$ {custo.get('custo_usd', 0):.4f}"],
            ["Custo (R$)", f"R$ {custo.get('custo_brl', 0):.2f}".replace(".", ",")],
            ["Cotacao USD->BRL usada", str(custo.get("usd_brl_rate", "—"))],
        ],
    )
    story.append(
        Paragraph(
            "* O custo em reais e uma estimativa baseada na cotacao configurada.",
            styles["small"],
        )
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

TITLE_MAP: dict[str, str] = {
    "certificate": "Atestado",
    "prescription": "Receituario",
    "consent_form": "Termo de Consentimento Livre e Esclarecido",
    "exam_request": "Solicitacao de Exames",
    "declaration": "Declaracao",
    "lgpd": "Termo LGPD",
    "medical_record": "Prontuario",
    "other": "Documento",
}


def main() -> None:
    if len(sys.argv) < 3:
        print("Uso: generate_pdf.py <in.json> <out.pdf>", file=sys.stderr)
        sys.exit(1)

    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    out_path = Path(sys.argv[2])

    document_type = str(data.get("document_type") or "other").lower()
    payload: dict = data.get("payload") or {}

    title = get(payload, "title") or TITLE_MAP.get(document_type, "Documento")

    styles = build_styles()
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    story: list = []

    render_header(story, styles, payload, title)
    if document_type != "whatsapp_report":
        render_patient_block(story, styles, payload)

    skip_footer = False

    if document_type == "whatsapp_report":
        render_whatsapp_report(story, styles, payload)
        skip_footer = True
    elif document_type == "medical_record":
        render_medical_record(story, styles, payload)
    elif document_type == "certificate":
        render_certificate(story, styles, payload)
    elif document_type == "prescription":
        render_prescription(story, styles, payload)
    elif document_type == "consent_form":
        render_consent_form(story, styles, payload)
        skip_footer = True
    elif document_type == "exam_request":
        render_exam_request(story, styles, payload)
    else:
        render_generic(story, styles, payload)

    if not skip_footer:
        render_footer(story, styles, payload)

    doc.build(story)


if __name__ == "__main__":
    main()
