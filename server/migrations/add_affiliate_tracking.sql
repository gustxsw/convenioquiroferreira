/*
  # Affiliate Tracking System

  1. New Tables
    - `affiliate_referrals`
      - `id` (serial, primary key)
      - `affiliate_id` (integer) - ID do afiliado que compartilhou o link
      - `visitor_identifier` (text) - Identificador único do visitante (cookie/fingerprint)
      - `user_id` (integer, nullable) - ID do usuário quando ele se registrar
      - `converted` (boolean) - Se o usuário pagou/converteu
      - `converted_at` (timestamp, nullable) - Data da conversão
      - `referral_code` (text) - Código de afiliado usado
      - `metadata` (jsonb) - Dados extras (IP, user agent, etc)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Changes to existing tables
    - Add `referred_by_affiliate_id` to `users` table
    - Add `affiliate_referral_id` to `users` table for tracking the original referral

  3. Security
    - Enable RLS on `affiliate_referrals` table
    - Policies for affiliates to view their referrals
    - Policies for admins to view all referrals
*/

-- Create affiliate_referrals table
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id SERIAL PRIMARY KEY,
  affiliate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_identifier TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  converted BOOLEAN DEFAULT false,
  converted_at TIMESTAMP WITH TIME ZONE,
  referral_code TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id ON affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_visitor_identifier ON affiliate_referrals(visitor_identifier);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_user_id ON affiliate_referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referral_code ON affiliate_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_converted ON affiliate_referrals(converted);

-- Add columns to users table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'referred_by_affiliate_id'
  ) THEN
    ALTER TABLE users ADD COLUMN referred_by_affiliate_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_referred_by_affiliate_id ON users(referred_by_affiliate_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'affiliate_referral_id'
  ) THEN
    ALTER TABLE users ADD COLUMN affiliate_referral_id INTEGER REFERENCES affiliate_referrals(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_affiliate_referral_id ON users(affiliate_referral_id);
  END IF;
END $$;

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to update updated_at
DROP TRIGGER IF EXISTS update_affiliate_referrals_updated_at ON affiliate_referrals;
CREATE TRIGGER update_affiliate_referrals_updated_at
  BEFORE UPDATE ON affiliate_referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Affiliates can view their own referrals" ON affiliate_referrals;
DROP POLICY IF EXISTS "Admins can view all referrals" ON affiliate_referrals;
DROP POLICY IF EXISTS "Public can insert referrals" ON affiliate_referrals;
DROP POLICY IF EXISTS "Affiliates can update their own referrals" ON affiliate_referrals;
DROP POLICY IF EXISTS "Admins can update all referrals" ON affiliate_referrals;

-- Policies for affiliates to view their referrals
CREATE POLICY "Affiliates can view their own referrals"
  ON affiliate_referrals
  FOR SELECT
  USING (affiliate_id IN (SELECT id FROM users WHERE id = current_setting('app.current_user_id', TRUE)::INTEGER));

-- Policies for admins to view all referrals
CREATE POLICY "Admins can view all referrals"
  ON affiliate_referrals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = current_setting('app.current_user_id', TRUE)::INTEGER
      AND 'admin' = ANY(roles)
    )
  );

-- Allow public insert for tracking (will be restricted by application logic)
CREATE POLICY "Public can insert referrals"
  ON affiliate_referrals
  FOR INSERT
  WITH CHECK (true);

-- Affiliates can update their own referrals
CREATE POLICY "Affiliates can update their own referrals"
  ON affiliate_referrals
  FOR UPDATE
  USING (affiliate_id IN (SELECT id FROM users WHERE id = current_setting('app.current_user_id', TRUE)::INTEGER));

-- Admins can update all referrals
CREATE POLICY "Admins can update all referrals"
  ON affiliate_referrals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = current_setting('app.current_user_id', TRUE)::INTEGER
      AND 'admin' = ANY(roles)
    )
  );
