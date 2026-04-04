/**
 * Normaliza professional_type do banco: apenas agenda_only é distinto;
 * qualquer outro valor (null, convenio, legado) é tratado como convênio completo.
 */
export function normalizeProfessionalType(raw) {
  return raw === "agenda_only" ? "agenda_only" : "convenio";
}

export function isAgendaOnlyProfessional(req) {
  return normalizeProfessionalType(req.user?.professional_type) === "agenda_only";
}

/** Consulta é de paciente particular (não convênio titular/dependente) */
export function isPrivateConsultationRow(row) {
  return row?.private_patient_id != null;
}

export const AGENDA_ONLY_CONVENIO_FORBIDDEN_MESSAGE =
  "Profissionais apenas da agenda não podem acessar dados de clientes do convênio.";

export function respondAgendaOnlyConvenioForbidden(res) {
  return res.status(403).json({ message: AGENDA_ONLY_CONVENIO_FORBIDDEN_MESSAGE });
}

/** Prontuário que não é exclusivamente particular (convênio ou legado sem vínculo) */
export function isConvenioMedicalRecordRow(row) {
  if (row?.private_patient_id != null) return false;
  if (row?.patient_type === "private") return false;
  return true;
}
