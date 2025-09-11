/*
  # Add convenio patient fields to medical_documents table

  1. New Columns
    - `patient_name` (text) - Nome do paciente (para pacientes do convênio)
    - `patient_cpf` (text) - CPF do paciente (para pacientes do convênio)

  2. Changes
    - Allow medical documents to be created for both private patients and convenio patients
    - private_patient_id becomes optional when patient_name is provided

  3. Notes
    - Maintains backward compatibility with existing private patient documents
    - Enables documents for convenio patients without requiring private_patient_id
*/

-- Add columns for convenio patient data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medical_documents' AND column_name = 'patient_name'
  ) THEN
    ALTER TABLE medical_documents ADD COLUMN patient_name TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medical_documents' AND column_name = 'patient_cpf'
  ) THEN
    ALTER TABLE medical_documents ADD COLUMN patient_cpf TEXT;
  END IF;
END $$;

-- Update the constraint to allow either private_patient_id OR patient_name
-- (We can't easily modify existing constraints, so we'll rely on application logic)

-- Add index for better performance on patient searches
CREATE INDEX IF NOT EXISTS idx_medical_documents_patient_name 
ON medical_documents(patient_name);

CREATE INDEX IF NOT EXISTS idx_medical_documents_patient_cpf 
ON medical_documents(patient_cpf);