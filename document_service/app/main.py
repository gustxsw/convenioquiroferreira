from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.schemas import HealthResponse, RenderRequest

app = FastAPI(title="Document PDF Service", version="1.0.0")


def verify_key(x_document_service_key: str | None = Header(default=None)) -> None:
    expected = (settings.service_api_key or "").strip()
    if not expected:
        return
    if not x_document_service_key or x_document_service_key.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing service key")


@app.get("/v1/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.post("/v1/render")
def render_pdf(body: RenderRequest, _: None = Depends(verify_key)) -> Response:
    from app.render_engine import render_document_pdf

    try:
        pdf_bytes = render_document_pdf(body.document_type, body.payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar PDF: {e!s}") from e

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="document.pdf"'},
    )


@app.get("/")
def root() -> PlainTextResponse:
    return PlainTextResponse("document-service: use GET /v1/health or POST /v1/render")
