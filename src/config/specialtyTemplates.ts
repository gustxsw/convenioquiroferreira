export type SpecialtyFieldType = "text" | "textarea" | "number";

export type SpecialtyFieldDef = {
  key: string;
  label: string;
  type: SpecialtyFieldType;
  /** legacy column on medical_records */
  storage: "legacy" | "specialty";
  required?: boolean;
  min?: number;
  max?: number;
};

export type SpecialtySection = {
  id: string;
  title: string;
  fields: SpecialtyFieldDef[];
};

export type SpecialtyTemplate = {
  code: string;
  labelPt: string;
  sections: SpecialtySection[];
};

export const SPECIALTY_CODES = [
  "physiotherapist",
  "occupational_therapist",
  "psychologist",
  "psychoanalyst",
  "psychiatrist",
  "dentist",
  "massage_therapist",
  "chiropractor",
  "services",
] as const;

export type SpecialtyCode = (typeof SPECIALTY_CODES)[number];

const physiotherapist: SpecialtyTemplate = {
  code: "physiotherapist",
  labelPt: "Fisioterapeuta",
  sections: [
    {
      id: "queixa",
      title: "Queixa e história",
      fields: [
        {
          key: "chief_complaint",
          label: "Queixa principal",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "injury_history",
          label: "História da lesão / doença",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "history_present_illness",
          label: "História da doença atual",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "dor",
      title: "Dor e avaliação",
      fields: [
        {
          key: "pain_vas",
          label: "Dor (EVA 0–10)",
          type: "number",
          storage: "specialty",
          min: 0,
          max: 10,
        },
        {
          key: "pain_location",
          label: "Localização da dor",
          type: "text",
          storage: "specialty",
        },
        {
          key: "physical_examination",
          label: "Exame físico / avaliação",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "plano",
      title: "Diagnóstico e plano",
      fields: [
        {
          key: "diagnosis",
          label: "Diagnóstico cinético-funcional",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "goals",
          label: "Objetivos",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "treatment_plan",
          label: "Plano de tratamento",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "exercises",
          label: "Exercícios / conduta",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "manual_therapy",
          label: "Terapia manual / recursos",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "session_response",
          label: "Resposta / evolução da sessão",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História médica pregressa",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const occupational_therapist: SpecialtyTemplate = {
  code: "occupational_therapist",
  labelPt: "Terapeuta ocupacional",
  sections: [
    {
      id: "ocupacao",
      title: "Ocupação e rotinas",
      fields: [
        {
          key: "chief_complaint",
          label: "Demanda / queixa",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "roles_routines",
          label: "Papéis e rotinas",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "adl_baseline",
          label: "AVD — linha de base",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "home_work_barriers",
          label: "Barreiras no ambiente (casa/trabalho)",
          type: "textarea",
          storage: "specialty",
        },
      ],
    },
    {
      id: "intervencao",
      title: "Intervenção",
      fields: [
        {
          key: "adaptations",
          label: "Adaptações / recomendações",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "smart_goals",
          label: "Metas (SMART)",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "treatment_plan",
          label: "Plano de intervenção",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História relevante",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const psychologist: SpecialtyTemplate = {
  code: "psychologist",
  labelPt: "Psicólogo",
  sections: [
    {
      id: "demanda",
      title: "Demanda e histórico",
      fields: [
        {
          key: "demand",
          label: "Demanda apresentada",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "life_history",
          label: "Histórico relevante",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "chief_complaint",
          label: "Queixa (resumo)",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "avaliacao",
      title: "Avaliação",
      fields: [
        {
          key: "mental_status",
          label: "Observação / mental status",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "clinical_hypothesis",
          label: "Hipótese clínica",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "risk_safety",
          label: "Riscos e segurança",
          type: "textarea",
          storage: "specialty",
        },
      ],
    },
    {
      id: "plano",
      title: "Plano",
      fields: [
        {
          key: "therapeutic_plan",
          label: "Plano terapêutico",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "interventions",
          label: "Intervenções",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "diagnosis",
          label: "Diagnóstico / formulação (se aplicável)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "treatment_plan",
          label: "Plano (campo legado)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História médica / contexto",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const dentist: SpecialtyTemplate = {
  code: "dentist",
  labelPt: "Dentista",
  sections: [
    {
      id: "motivo",
      title: "Motivo e hábitos",
      fields: [
        {
          key: "dental_chief_complaint",
          label: "Motivo da consulta",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "chief_complaint",
          label: "Queixa (resumo)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "oral_habits",
          label: "Hábitos orais",
          type: "textarea",
          storage: "specialty",
        },
      ],
    },
    {
      id: "exame",
      title: "Exame clínico",
      fields: [
        {
          key: "extraoral",
          label: "Exame extraoral",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "intraoral",
          label: "Exame intraoral",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "periodontal",
          label: "Periodontal",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "physical_examination",
          label: "Exame (notas gerais)",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "dx",
      title: "Exames complementares e plano",
      fields: [
        {
          key: "radiographic",
          label: "Exames de imagem",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "dental_diagnosis",
          label: "Diagnóstico odontológico",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "diagnosis",
          label: "Diagnóstico (legado)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "treatment_phases",
          label: "Plano / fases de tratamento",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "treatment_plan",
          label: "Plano de tratamento (legado)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "procedures_done",
          label: "Procedimentos realizados",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História médica",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const massage_therapist: SpecialtyTemplate = {
  code: "massage_therapist",
  labelPt: "Massoterapeuta",
  sections: [
    {
      id: "sessao",
      title: "Sessão",
      fields: [
        {
          key: "soft_tissue_complaint",
          label: "Queixa / foco",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "chief_complaint",
          label: "Queixa (resumo)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "contraindications",
          label: "Contraindicações",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "regions",
          label: "Regiões trabalhadas",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "palpation_findings",
          label: "Achados à palpação",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "techniques_used",
          label: "Técnicas utilizadas",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "post_session_notes",
          label: "Após a sessão",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História relevante",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const chiropractor: SpecialtyTemplate = {
  code: "chiropractor",
  labelPt: "Quiropraxista",
  sections: [
    {
      id: "anamnese",
      title: "Anamnese",
      fields: [
        {
          key: "chief_complaint",
          label: "Queixa principal",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "chiro_history",
          label: "História clínica",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "history_present_illness",
          label: "História da doença atual",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "exame",
      title: "Exame",
      fields: [
        {
          key: "inspection",
          label: "Inspeção",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "orthopedic_neuro",
          label: "Testes ortopédicos / neuro",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "physical_examination",
          label: "Exame físico (geral)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "subluxation_findings",
          label: "Achados clínicos",
          type: "textarea",
          storage: "specialty",
        },
      ],
    },
    {
      id: "plano",
      title: "Plano e objetivos",
      fields: [
        {
          key: "diagnosis",
          label: "Diagnóstico / impressão clínica",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "adjustment_plan",
          label: "Plano de ajuste / cuidado",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "rehab_advice",
          label: "Orientações / reabilitação",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "functional_goals",
          label: "Objetivos funcionais",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "treatment_plan",
          label: "Plano de tratamento",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História médica pregressa",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const psychoanalyst: SpecialtyTemplate = {
  code: "psychoanalyst",
  labelPt: "Psicanalista",
  sections: [
    {
      id: "demanda",
      title: "Demanda e histórico",
      fields: [
        {
          key: "chief_complaint",
          label: "Queixa apresentada",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "life_context",
          label: "Contexto de vida / história",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "family_dynamics",
          label: "Dinâmica familiar",
          type: "textarea",
          storage: "specialty",
        },
      ],
    },
    {
      id: "material",
      title: "Material clínico",
      fields: [
        {
          key: "free_associations",
          label: "Associações livres / sonhos",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "transference",
          label: "Transferência / contratransferência",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "defenses",
          label: "Mecanismos de defesa observados",
          type: "textarea",
          storage: "specialty",
        },
      ],
    },
    {
      id: "avaliacao",
      title: "Avaliação e plano",
      fields: [
        {
          key: "psychoanalytic_hypothesis",
          label: "Hipótese psicanalítica",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "theoretical_framework",
          label: "Orientação teórica",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "therapeutic_goals",
          label: "Objetivos terapêuticos",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "diagnosis",
          label: "Diagnóstico / formulação",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "treatment_plan",
          label: "Plano de tratamento",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História médica / contexto",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const psychiatrist: SpecialtyTemplate = {
  code: "psychiatrist",
  labelPt: "Psiquiatra",
  sections: [
    {
      id: "anamnese",
      title: "Anamnese psiquiátrica",
      fields: [
        {
          key: "chief_complaint",
          label: "Queixa principal",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "psychiatric_history",
          label: "História psiquiátrica pregressa",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "family_psychiatric_history",
          label: "Histórico familiar psiquiátrico",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "history_present_illness",
          label: "História da doença atual",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "exame",
      title: "Exame do estado mental",
      fields: [
        {
          key: "mental_state_exam",
          label: "Exame do estado mental",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "risk_assessment",
          label: "Avaliação de risco (suicídio / autoagressão)",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "physical_examination",
          label: "Exame físico geral",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "plano",
      title: "Diagnóstico e tratamento",
      fields: [
        {
          key: "psychiatric_diagnosis",
          label: "Diagnóstico (CID / DSM)",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "diagnosis",
          label: "Diagnóstico (legado)",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "pharmacological_treatment",
          label: "Tratamento farmacológico",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "psychosocial_interventions",
          label: "Intervenções psicossociais",
          type: "textarea",
          storage: "specialty",
        },
        {
          key: "treatment_plan",
          label: "Plano terapêutico",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História médica pregressa",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos em uso",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const services: SpecialtyTemplate = {
  code: "services",
  labelPt: "Serviços",
  sections: [
    {
      id: "atendimento",
      title: "Atendimento",
      fields: [
        {
          key: "chief_complaint",
          label: "Queixa / motivo do atendimento",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "history_present_illness",
          label: "Histórico / contexto",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "physical_examination",
          label: "Avaliação",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "conduta",
      title: "Conduta",
      fields: [
        {
          key: "diagnosis",
          label: "Impressão / avaliação",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "treatment_plan",
          label: "Serviço realizado / conduta",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "notes",
          label: "Observações",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
    {
      id: "gerais",
      title: "Dados gerais",
      fields: [
        {
          key: "past_medical_history",
          label: "História / contexto relevante",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "medications",
          label: "Medicamentos",
          type: "textarea",
          storage: "legacy",
        },
        {
          key: "allergies",
          label: "Alergias",
          type: "textarea",
          storage: "legacy",
        },
      ],
    },
  ],
};

const TEMPLATES: Record<SpecialtyCode, SpecialtyTemplate> = {
  physiotherapist,
  occupational_therapist,
  psychologist,
  psychoanalyst,
  psychiatrist,
  dentist,
  massage_therapist,
  chiropractor,
  services,
};

export function getSpecialtyTemplate(
  code: string | null | undefined
): SpecialtyTemplate | null {
  if (!code || !(code in TEMPLATES)) return null;
  return TEMPLATES[code as SpecialtyCode];
}

export function getSpecialtyLabelPt(code: string | null | undefined): string {
  const t = getSpecialtyTemplate(code);
  return t?.labelPt || "";
}
