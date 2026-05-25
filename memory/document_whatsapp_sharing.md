---
name: document-whatsapp-sharing
description: How PDF proxy, popup blocking fix, and WhatsApp (Business + wa.me) sharing work for documents and medical records
metadata:
  type: project
---

# Document & WhatsApp Sharing Architecture

## PDF Proxy Endpoints
- Medical records: `GET /api/medical-records/:id/pdf` (in server/index.js) — fetches Cloudinary URL server-side
- Documents: `GET /api/documents/:id/pdf` (in server/routes/documents.js) — checks medical_documents, fallback saved_documents

## Frontend Helpers (src/utils/apiHelpers.ts)
- `fetchMedicalRecordPdf(recordId)` — authenticated proxy for prontuários
- `fetchDocumentPdf(documentId)` — authenticated proxy for documents (added May 2026)

## Popup Blocking Fix Pattern
`window.open('', '_blank')` MUST be called synchronously before any `await` inside the click handler.
Pre-open the blank window, then after async work:
- navigator.share succeeded → `win?.close()`
- Business API succeeded → `win?.close()`
- wa.me fallback → `win!.location.href = data.whatsapp_url`
- Any error → `win?.close()`, show error

**Why:** Browsers block `window.open` called after async operations (user gesture context expires after first `await`).

## WhatsApp Flow (3 tiers)
1. `navigator.share()` with PDF file (mobile) — tries direct Cloudinary fetch, falls back to proxy if CORS fails
2. WhatsApp Business Cloud API (`POST /api/.../whatsapp/send-document`) — Meta Graph API v21.0, requires WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID env vars
3. wa.me fallback — opens WhatsApp with pre-filled message containing public Cloudinary URL

## For Regular WhatsApp Professionals (no Business API)
wa.me link includes the Cloudinary `secure_url` which is public (uploaded without `type: "authenticated"`). Patients can access it directly in browser/WhatsApp.

## Feature Flag
`GET /api/professional/features` returns `whatsappBusinessDocumentSend: isWhatsappCloudConfigured()` — determines if tier 2 is available.
