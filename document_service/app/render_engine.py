from io import BytesIO
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from xhtml2pdf import pisa

from .context import TEMPLATE_BY_TYPE, build_render_context


def _templates_dir() -> Path:
    return Path(__file__).resolve().parent / "templates"


def _link_callback(uri: str, rel: str) -> str:
    """Resolve caminhos relativos de imagens/fontes para xhtml2pdf."""
    if uri.startswith(("http://", "https://", "data:")):
        return uri
    path = _templates_dir() / uri
    return str(path) if path.exists() else uri


def render_document_pdf(document_type: str, payload: dict) -> bytes:
    template_name = TEMPLATE_BY_TYPE.get(document_type)
    if not template_name:
        raise ValueError(f"Tipo de documento desconhecido: {document_type}")

    context = build_render_context(document_type, payload)
    env = Environment(
        loader=FileSystemLoader(str(_templates_dir())),
        autoescape=select_autoescape(["html", "xml"]),
    )
    html_str = env.get_template(template_name).render(**context)

    output = BytesIO()
    result = pisa.CreatePDF(
        html_str,
        dest=output,
        link_callback=_link_callback,
        encoding="utf-8",
    )
    if result.err:
        raise RuntimeError(f"Falha ao gerar PDF: {result.err}")

    return output.getvalue()
