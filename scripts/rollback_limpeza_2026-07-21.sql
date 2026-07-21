-- Snapshot ANTES da remocao — 2026-07-21T20:29:40.401Z
-- Restauracao: rode este arquivo. Os tres objetos estavam VAZIOS (0 linhas),
-- entao nao ha dado a recuperar, so estrutura.

-- Tabela appointments (14 colunas, 0 linhas)
CREATE TABLE appointments (
  id integer NOT NULL DEFAULT nextval('appointments_id_seq'::regclass),
  professional_id integer NOT NULL,
  private_patient_id integer,
  client_id integer,
  dependent_id integer,
  service_id integer,
  appointment_date date NOT NULL,
  appointment_time time without time zone NOT NULL,
  location_id integer,
  notes text,
  value numeric NOT NULL,
  status character varying(20) DEFAULT 'scheduled'::character varying,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN subscription_expires_at timestamp without time zone;
ALTER TABLE users ADD COLUMN password_reset_code character varying(6);

-- Coluna dependente, removida junto (0 preenchidos em 101 prontuarios, 0 refs no codigo)
ALTER TABLE medical_records ADD COLUMN appointment_id integer REFERENCES appointments(id);
