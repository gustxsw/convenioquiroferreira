/**
 * Build payload for medical_record PDF and persist pdf_url on medical_records.
 */
import { pool } from "../db.js";
import { generateDocumentPDF } from "./documentGenerator.js";
import { getSpecialtyLabelPt, getSpecialtyFieldLabel } from "../config/specialtyAllowlists.js";

/**
 * @param {import('pg').PoolClient | import('pg').Pool} db
 * @param {object} record - row from medical_records (with patient_name, vital_signs, etc.)
 * @param {object} professional - { name, category_name?, crm?, signature_url? }
 */
export function buildMedicalRecordPdfPayload(record, professional) {
  const medicalSections = [
    { title: "Queixa Principal", value: record.chief_complaint },
    { title: "História da Doença Atual", value: record.history_present_illness },
    { title: "História Médica Pregressa", value: record.past_medical_history },
    { title: "Medicamentos em Uso", value: record.medications },
    { title: "Alergias", value: record.allergies },
    { title: "Exame Físico", value: record.physical_examination },
    { title: "Diagnóstico", value: record.diagnosis },
    { title: "Plano de Tratamento", value: record.treatment_plan },
    { title: "Observações Gerais", value: record.notes },
  ]
    .filter((item) => item.value && String(item.value).trim())
    .map((item) => `${item.title}: ${item.value}`)
    .join("\n\n");

  const vitalSigns = record.vital_signs || {};
  const vitalSignsText = [
    ["Pressão Arterial", vitalSigns.blood_pressure],
    ["Freq. Cardíaca", vitalSigns.heart_rate],
    ["Temperatura", vitalSigns.temperature],
    ["Freq. Respiratória", vitalSigns.respiratory_rate],
    ["Sat. O₂", vitalSigns.oxygen_saturation],
    ["Peso", vitalSigns.weight],
    ["Altura", vitalSigns.height],
  ]
    .filter(([, value]) => value && String(value).trim())
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  let specialtyBlock = "";
  const sf = record.specialty_fields;
  const specCode = record.specialty_code;
  if (sf && typeof sf === "object" && !Array.isArray(sf)) {
    const lines = Object.entries(sf)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `${getSpecialtyFieldLabel(specCode, k)}: ${v}`);
    if (lines.length) {
      const specialtyName = getSpecialtyLabelPt(specCode) || "Campos específicos da área";
      specialtyBlock = `${specialtyName}\n${lines.join("\n")}`;
    }
  }

  const fullContent = [
    vitalSignsText ? `Sinais Vitais\n${vitalSignsText}` : "",
    medicalSections,
    specialtyBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const patientName = record.patient_name || "Paciente";
  const dateRef = record.created_at
    ? new Date(record.created_at).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  return {
    title: `Prontuário Médico - ${patientName}`,
    content:
      fullContent ||
      "Prontuário médico sem informações clínicas detalhadas registradas.",
    patientName,
    patientCpf: record.patient_cpf || "",
    professionalName: professional.name || "Profissional de Saúde",
    professionalSpecialty: professional.category_name || "",
    crm: professional.crm || "",
    signatureUrl: professional.signature_url || null,
    currentDate: dateRef,
    date: dateRef,
  };
}

/**
 * Regenerates PDF for a medical record and updates pdf_url / pdf_generated_at.
 * @param {number} recordId
 * @param {number} professionalId
 */
export async function regenerateMedicalRecordPdf(recordId, professionalId) {
  const recordResult = await pool.query(
    `SELECT mr.*,
            COALESCE(pp.name, mr.patient_name) AS patient_name,
            COALESCE(pp.cpf, mr.patient_cpf) AS patient_cpf
     FROM medical_records mr
     LEFT JOIN private_patients pp ON mr.private_patient_id = pp.id
     WHERE mr.id = $1 AND mr.professional_id = $2`,
    [recordId, professionalId]
  );

  if (recordResult.rows.length === 0) {
    throw new Error("Prontuário não encontrado");
  }

  const record = recordResult.rows[0];

  const userResult = await pool.query(
    `SELECT u.name, u.crm, u.signature_url, c.name AS category_name
     FROM users u
     LEFT JOIN categories c ON u.category_id = c.id
     WHERE u.id = $1`,
    [professionalId]
  );

  const prof = userResult.rows[0] || {};
  const payload = buildMedicalRecordPdfPayload(record, {
    name: prof.name,
    crm: prof.crm,
    signature_url: prof.signature_url,
    category_name: prof.category_name,
  });

  const documentData = await generateDocumentPDF("medical_record", payload);

  await pool.query(
    `UPDATE medical_records
     SET pdf_url = $1, pdf_generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND professional_id = $3`,
    [documentData.url, recordId, professionalId]
  );

  return documentData.url;
}
