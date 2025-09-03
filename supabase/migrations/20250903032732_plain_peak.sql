/*
  # Add cancellation fields to consultations table

  1. New Columns
    - `cancellation_reason` (text, optional) - Motivo do cancelamento
    - `cancelled_at` (timestamp, optional) - Data/hora do cancelamento
    - `cancelled_by` (integer, optional) - ID do usuário que cancelou

  2. Changes
    - Adiciona campos para rastrear cancelamentos
    - Permite armazenar motivo opcional do cancelamento
    - Registra quem e quando cancelou a consulta

  3. Security
    - Campos opcionais para não quebrar dados existentes
    - Foreign key para rastrear responsável pelo cancelamento
*/

-- Add cancellation tracking fields to consultations table
DO $$
BEGIN
  -- Add cancellation_reason column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consultations' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE consultations ADD COLUMN cancellation_reason TEXT;
  END IF;

  -- Add cancelled_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consultations' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE consultations ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;

  -- Add cancelled_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consultations' AND column_name = 'cancelled_by'
  ) THEN
    ALTER TABLE consultations ADD COLUMN cancelled_by INTEGER REFERENCES users(id);
  END IF;
END $$;