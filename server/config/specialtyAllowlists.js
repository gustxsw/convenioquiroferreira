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

export function isValidSpecialtyCode(code) {
  return typeof code === "string" && SPECIALTY_CODES.includes(code);
}

export function getAllowedSpecialtyFieldKeys(specialtyCode) {
  return SPECIALTY_FIELD_KEYS[specialtyCode] || null;
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
