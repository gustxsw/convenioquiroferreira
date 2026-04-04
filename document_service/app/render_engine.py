from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.context import TEMPLATE_BY_TYPE, build_render_context


def _templates_dir() -> Path:
    return Path(__file__).resolve().parent / "templates"


def render_document_pdf(document_type: str, payload: dict) -> bytes:
    template_name = TEMPLATE_BY_TYPE.get(document_type)
    if not template_name:
        raise ValueError(f"Tipo de documento desconhecido: {document_type}")

    context = build_render_context(document_type, payload)
    env = Environment(
        loader=FileSystemLoader(str(_templates_dir())),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template(template_name)
    html_str = template.render(**context)
    return HTML(string=html_str, base_url=str(_templates_dir())).write_pdf()
