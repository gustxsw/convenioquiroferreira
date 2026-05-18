/**
 * Allowlists for medical_records.specialty_fields — must stay aligned with src/config/specialtyTemplates.ts
 */

export const SPECIALTY_CODES = [
  "physiotherapist",
  "occupational_therapist",
  "psychologist",
  "dentist",
  "massage_therapist",
  "chiropractor",
];

/** @type {Record<string, Set<string>>} */
const SPECIALTY_FIELD_KEYS = {
  physiotherapist: new Set([
    "injury_history",
    "pain_location",
    "pain_vas",
    "goals",
    "exercises",
    "manual_therapy",
    "session_response",
  ]),
  occupational_therapist: new Set([
    "roles_routines",
    "adl_baseline",
    "smart_goals",
    "adaptations",
    "home_work_barriers",
  ]),
  psychologist: new Set([
    "demand",
    "life_history",
    "mental_status",
    "clinical_hypothesis",
    "therapeutic_plan",
    "interventions",
    "risk_safety",
  ]),
  dentist: new Set([
    "dental_chief_complaint",
    "oral_habits",
    "extraoral",
    "intraoral",
    "periodontal",
    "radiographic",
    "dental_diagnosis",
    "treatment_phases",
    "procedures_done",
  ]),
  massage_therapist: new Set([
    "soft_tissue_complaint",
    "contraindications",
    "palpation_findings",
    "techniques_used",
    "regions",
    "post_session_notes",
  ]),
  chiropractor: new Set([
    "chiro_history",
    "inspection",
    "orthopedic_neuro",
    "subluxation_findings",
    "adjustment_plan",
    "rehab_advice",
    "functional_goals",
  ]),
};

const SPECIALTY_LABELS = {
  physiotherapist: "Fisioterapeuta",
  occupational_therapist: "Terapeuta ocupacional",
  psychologist: "Psicólogo",
  dentist: "Dentista",
  massage_therapist: "Massoterapeuta",
  chiropractor: "Quiropraxista",
};

/** @type {Record<string, Record<string, string>>} */
const SPECIALTY_FIELD_LABELS = {
  physiotherapist: {
    injury_history: "História da lesão / doença",
    pain_location: "Localização da dor",
    pain_vas: "Dor (EVA 0–10)",
    goals: "Objetivos",
    exercises: "Exercícios / conduta",
    manual_therapy: "Terapia manual / recursos",
    session_response: "Resposta / evolução da sessão",
  },
  occupational_therapist: {
    roles_routines: "Papéis e rotinas",
    adl_baseline: "AVD — linha de base",
    smart_goals: "Metas (SMART)",
    adaptations: "Adaptações / recomendações",
    home_work_barriers: "Barreiras no ambiente (casa/trabalho)",
  },
  psychologist: {
    demand: "Demanda apresentada",
    life_history: "Histórico relevante",
    mental_status: "Observação / mental status",
    clinical_hypothesis: "Hipótese clínica",
    therapeutic_plan: "Plano terapêutico",
    interventions: "Intervenções",
    risk_safety: "Riscos e segurança",
  },
  dentist: {
    dental_chief_complaint: "Motivo da consulta",
    oral_habits: "Hábitos orais",
    extraoral: "Exame extraoral",
    intraoral: "Exame intraoral",
    periodontal: "Periodontal",
    radiographic: "Exames de imagem",
    dental_diagnosis: "Diagnóstico odontológico",
    treatment_phases: "Plano / fases de tratamento",
    procedures_done: "Procedimentos realizados",
  },
  massage_therapist: {
    soft_tissue_complaint: "Queixa / foco",
    contraindications: "Contraindicações",
    palpation_findings: "Achados à palpação",
    techniques_used: "Técnicas utilizadas",
    regions: "Regiões trabalhadas",
    post_session_notes: "Após a sessão",
  },
  chiropractor: {
    chiro_history: "História clínica",
    inspection: "Inspeção",
    orthopedic_neuro: "Testes ortopédicos / neuro",
    subluxation_findings: "Achados clínicos",
    adjustment_plan: "Plano de ajuste / cuidado",
    rehab_advice: "Orientações / reabilitação",
    functional_goals: "Objetivos funcionais",
  },
};

export function isValidSpecialtyCode(code) {
  return typeof code === "string" && SPECIALTY_CODES.includes(code);
}

export function getAllowedSpecialtyFieldKeys(specialtyCode) {
  return SPECIALTY_FIELD_KEYS[specialtyCode] || null;
}

export function getSpecialtyLabelPt(code) {
  return SPECIALTY_LABELS[code] || code || "";
}

export function getSpecialtyFieldLabel(specialtyCode, fieldKey) {
  return SPECIALTY_FIELD_LABELS[specialtyCode]?.[fieldKey] || fieldKey;
}

/**
 * Returns a plain object with only allowed keys; coerces values to string/number.
 * @param {string} specialtyCode
 * @param {unknown} raw
 */
export function sanitizeSpecialtyFields(specialtyCode, raw) {
  const allowed = SPECIALTY_FIELD_KEYS[specialtyCode];
  if (!allowed) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  /** @type {Record<string, string | number>} */
  const out = {};
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) continue;
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    } else if (typeof v === "string") {
      const t = v.trim();
      if (t) out[key] = t;
    } else if (typeof v === "boolean") {
      out[key] = v ? "sim" : "não";
    }
  }
  return out;
}
