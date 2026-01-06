import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { authenticate, authorize } from "./middleware/auth.js";
import createUpload from "./middleware/upload.js";
import { generateDocumentPDF } from "./utils/documentGenerator.js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import documentsRoutes from "./routes/documents.js";
import pdfRoutes from "./routes/pdf.js";
import affiliateTrackingRoutes from "./routes/affiliateTracking.js";
import {
  checkSchedulingAccess,
  getSchedulingAccessStatus,
} from "./middleware/schedulingAccess.js";

import {
  toUTCString,
  formatToBrazilDate,
  formatToBrazilTimeOnly,
} from "./utils/dateHelpers.js";
import {
  scheduleExpiryCheck,
  checkExpiredSubscriptionsNow,
} from "./jobs/checkExpiredSubscriptions.js";

// ES6 module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for production
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://cartaoquiroferreira.com.br",
    "https://www.cartaoquiroferreira.com.br",
    "https://testes-quiro-ferreira.onrender.com",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Import route modules
app.use("/api/documents", documentsRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/affiliate-tracking", affiliateTrackingRoutes);

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));
}

if (process.env.NODE_ENV === "production") {
  process.env.TZ = "America/Sao_Paulo";
}

console.log("🔍 Checking required environment variables...");
const requiredEnvVars = ["JWT_SECRET", "MP_ACCESS_TOKEN", "DATABASE_URL"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingVars.join(", ")
  );
  console.error("💡 Please check your .env file or environment configuration");
  process.exit(1);
}
console.log("✅ All required environment variables present");

// Initialize MercadoPago SDK v2
console.log("🔄 Initializing MercadoPago SDK v2...");

const isSandboxMode = process.env.MP_SANDBOX_MODE === 'true';
const mpAccessToken = process.env.MP_ACCESS_TOKEN;

if (isSandboxMode) {
  console.log("⚠️  SANDBOX MODE ENABLED - Using test credentials");
  if (mpAccessToken && mpAccessToken.startsWith('TEST-')) {
    console.log("✅ TEST Access Token detected");
  } else {
    console.warn("⚠️  WARNING: SANDBOX_MODE is true but token doesn't start with 'TEST-'");
  }
} else {
  console.log("🔴 PRODUCTION MODE - Using live credentials");
  if (mpAccessToken && mpAccessToken.startsWith('TEST-')) {
    console.error("❌ ERROR: Using TEST credentials in production mode!");
  }
}

const client = new MercadoPagoConfig({
  accessToken: mpAccessToken,
  options: {
    timeout: 5000,
  },
});

console.log("✅ MercadoPago SDK v2 initialized");

// Database initialization and table creation
const initializeDatabase = async () => {
  try {
    console.log("🔄 Initializing database tables...");

    // Users table with all necessary columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(8),
        password VARCHAR(255) NOT NULL,
        roles TEXT[] DEFAULT ARRAY['client'],
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        photo_url TEXT,
        signature_url TEXT,
        category_name VARCHAR(100),
        percentage DECIMAL(5,2) DEFAULT 50.00,
        crm VARCHAR(20),
        professional_type VARCHAR(20) DEFAULT 'convenio',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Service categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Services table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES service_categories(id),
        is_base_service BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        birth_date DATE,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        billing_amount DECIMAL(10,2) DEFAULT 50.00,
        payment_reference VARCHAR(255),
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Private patients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11),
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attendance locations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_locations (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(8),
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Consultations table - MAIN AGENDA TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        service_id INTEGER REFERENCES services(id) NOT NULL,
        location_id INTEGER REFERENCES attendance_locations(id),
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        cancelled_at TIMESTAMP,
        cancelled_by INTEGER REFERENCES users(id),
        cancellation_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settled_at TIMESTAMP,
        CONSTRAINT consultations_patient_type_check CHECK (
          (user_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL)
        )
      )
    `);

    // Blocked slots table - for blocking specific time slots
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        date DATE NOT NULL,
        time_slot VARCHAR(5) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(professional_id, date, time_slot)
      )
    `);

    // Add missing columns to existing consultations table if they don't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'consultations' AND column_name = 'status'
        ) THEN
          ALTER TABLE consultations ADD COLUMN status VARCHAR(20) DEFAULT 'scheduled';
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'consultations' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE consultations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'consultations' AND column_name = 'cancelled_at'
        ) THEN
          ALTER TABLE consultations ADD COLUMN cancelled_at TIMESTAMP;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'consultations' AND column_name = 'cancelled_by'
        ) THEN
          ALTER TABLE consultations ADD COLUMN cancelled_by INTEGER REFERENCES users(id);
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'consultations' AND column_name = 'cancellation_reason'
        ) THEN
          ALTER TABLE consultations ADD COLUMN cancellation_reason TEXT;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'signature_url'
        ) THEN
          ALTER TABLE users ADD COLUMN signature_url TEXT;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'professional_type'
        ) THEN
          ALTER TABLE users ADD COLUMN professional_type VARCHAR(20) DEFAULT 'convenio';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'consultations' AND column_name = 'settled_at'
        ) THEN
          ALTER TABLE consultations ADD COLUMN settled_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // Create saved_documents table for PDF storage
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_documents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        patient_name VARCHAR(255) NOT NULL,
        patient_cpf VARCHAR(11),
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        document_url TEXT NOT NULL,
        document_metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Medical records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
        patient_name VARCHAR(255),
        patient_cpf VARCHAR(11),
        patient_type VARCHAR(20) DEFAULT 'private',
        chief_complaint TEXT,
        history_present_illness TEXT,
        past_medical_history TEXT,
        medications TEXT,
        allergies TEXT,
        physical_examination TEXT,
        diagnosis TEXT,
        treatment_plan TEXT,
        notes TEXT,
        vital_signs JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Medical documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
        patient_name VARCHAR(255),
        patient_cpf VARCHAR(11),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        template_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT medical_documents_patient_check CHECK (
          (private_patient_id IS NOT NULL) OR 
          (patient_name IS NOT NULL)
        )
      )
    `);

    // Drop old constraints and add new ones for medical_documents
    await pool.query(`
      DO $$
      BEGIN
        -- Drop old constraints that are too restrictive
        BEGIN
          ALTER TABLE medical_documents DROP CONSTRAINT IF EXISTS medical_documents_patient_type_check;
        EXCEPTION
          WHEN undefined_object THEN NULL;
        END;
        
        BEGIN
          ALTER TABLE medical_documents DROP CONSTRAINT IF EXISTS medical_documents_patient_check;
        EXCEPTION
          WHEN undefined_object THEN NULL;
        END;
        
        BEGIN
          ALTER TABLE medical_documents DROP CONSTRAINT IF EXISTS medical_documents_check;
        EXCEPTION
          WHEN undefined_object THEN NULL;
        END;
        
        -- Add new flexible constraint
        BEGIN
          ALTER TABLE medical_documents ADD CONSTRAINT medical_documents_patient_check CHECK (
            (private_patient_id IS NOT NULL) OR (patient_name IS NOT NULL)
          );
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END;
      END $$;
    `);

    // Drop old constraints and add new ones for medical_records
    await pool.query(`
      DO $$
      BEGIN
        -- Drop any existing patient-related constraints
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'medical_records' AND constraint_name = 'medical_records_patient_check'
        ) THEN
          ALTER TABLE medical_records DROP CONSTRAINT medical_records_patient_check;
        END IF;
        
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'medical_records' AND constraint_name = 'medical_records_check'
        ) THEN
          ALTER TABLE medical_records DROP CONSTRAINT medical_records_check;
        END IF;
        
        -- Add missing columns if they don't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'medical_records' AND column_name = 'patient_name'
        ) THEN
          ALTER TABLE medical_records ADD COLUMN patient_name VARCHAR(255);
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'medical_records' AND column_name = 'patient_cpf'
        ) THEN
          ALTER TABLE medical_records ADD COLUMN patient_cpf VARCHAR(11);
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'medical_records' AND column_name = 'patient_type'
        ) THEN
          ALTER TABLE medical_records ADD COLUMN patient_type VARCHAR(20) DEFAULT 'private';
        END IF;
      END $$;
    `);

    // Scheduling access table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_access (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        granted_by INTEGER REFERENCES users(id),
        starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        reason TEXT,
        is_active BOOLEAN DEFAULT true,
        schedule_balance INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Payment tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_preference_id VARCHAR(255),
        mp_payment_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER REFERENCES dependents(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_preference_id VARCHAR(255),
        mp_payment_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_preference_id VARCHAR(255),
        mp_payment_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        duration_days INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_preference_id VARCHAR(255),
        mp_payment_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_statements (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        payment_id INTEGER REFERENCES professional_payments(id),
        mp_payment_id VARCHAR(255),
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        consultations_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100),
        record_id INTEGER,
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // System settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
      CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);
      CREATE INDEX IF NOT EXISTS idx_dependents_user_id ON dependents(user_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_professional_id ON consultations(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
      CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
      CREATE INDEX IF NOT EXISTS idx_scheduling_access_professional_id ON scheduling_access(professional_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_medical_documents_patient_name ON medical_documents(patient_name);
      CREATE INDEX IF NOT EXISTS idx_medical_documents_patient_cpf ON medical_documents(patient_cpf);
      CREATE INDEX IF NOT EXISTS idx_medical_records_patient_name ON medical_records(patient_name);
      CREATE INDEX IF NOT EXISTS idx_medical_records_patient_cpf ON medical_records(patient_cpf);
    `);

    // Insert default service categories if they don't exist
    await pool.query(`
      INSERT INTO service_categories (name, description) 
      SELECT 'Fisioterapia', 'Serviços de fisioterapia e reabilitação'
      WHERE NOT EXISTS (SELECT 1 FROM service_categories WHERE name = 'Fisioterapia')
    `);

    await pool.query(`
      INSERT INTO service_categories (name, description) 
      SELECT 'Psicologia', 'Serviços de psicologia e terapia'
      WHERE NOT EXISTS (SELECT 1 FROM service_categories WHERE name = 'Psicologia')
    `);

    await pool.query(`
      INSERT INTO service_categories (name, description) 
      SELECT 'Nutrição', 'Serviços de nutrição e dietética'
      WHERE NOT EXISTS (SELECT 1 FROM service_categories WHERE name = 'Nutrição')
    `);

    // Insert default services if they don't exist
    const fisioCategory = await pool.query(
      `SELECT id FROM service_categories WHERE name = 'Fisioterapia'`
    );
    if (fisioCategory.rows.length > 0) {
      await pool.query(
        `
        INSERT INTO services (name, description, base_price, category_id, is_base_service) 
        SELECT 'Consulta Fisioterapêutica', 'Consulta inicial de fisioterapia', 80.00, $1, true
        WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Consulta Fisioterapêutica')
      `,
        [fisioCategory.rows[0].id]
      );
    }

    // Insert default system settings
    await pool.query(`
      INSERT INTO system_settings (key, value, description)
      SELECT 'subscription_price', '600.0', 'Preço da assinatura mensal'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'subscription_price')
    `);

    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      SELECT 'dependent_price', '100.0', 'Preço da ativação de dependente'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'dependent_price')
    `);

    await pool.query(`
      INSERT INTO system_settings (key, value, description)
      SELECT 'agenda_access_price', '24.99', 'Preço do acesso à agenda'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'agenda_access_price')
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_type VARCHAR(20) DEFAULT 'fixed',
        discount_value DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_usage (
        id SERIAL PRIMARY KEY,
        coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        payment_reference VARCHAR(255),
        discount_applied DECIMAL(10,2) NOT NULL,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO coupons (code, discount_type, discount_value, is_active, description)
      SELECT 'QUIRO70', 'fixed', 530.00, true, 'Cupom de desconto de R$ 530,00 para assinatura do titular (R$600 → R$70)'
      WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE code = 'QUIRO70')
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'coupons' AND column_name = 'coupon_type'
        ) THEN
          ALTER TABLE coupons ADD COLUMN coupon_type VARCHAR(20) DEFAULT 'titular';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'coupons' AND column_name = 'unlimited_use'
        ) THEN
          ALTER TABLE coupons ADD COLUMN unlimited_use BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    await pool.query(`
      INSERT INTO coupons (code, discount_type, discount_value, is_active, description, coupon_type, unlimited_use)
      SELECT 'REIS60', 'fixed', 40.00, true, 'Cupom de desconto de R$ 40,00 para ativação de dependentes (R$100 → R$60, uso ilimitado)', 'dependente', true
      WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE code = 'REIS60')
    `);

    // Add missing columns to coupons table for admin panel
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'coupons' AND column_name = 'valid_from'
        ) THEN
          ALTER TABLE coupons ADD COLUMN valid_from TIMESTAMP;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'coupons' AND column_name = 'valid_until'
        ) THEN
          ALTER TABLE coupons ADD COLUMN valid_until TIMESTAMP;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'coupons' AND column_name = 'final_price'
        ) THEN
          ALTER TABLE coupons ADD COLUMN final_price DECIMAL(10,2);
        END IF;
      END $$;
    `);

    // Add affiliate_code column to users table
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'affiliate_code'
        ) THEN
          ALTER TABLE users ADD COLUMN affiliate_code VARCHAR(20);
        END IF;
      END $$;
    `);

    // Create affiliates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(20) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add user_id column to existing affiliates table
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'affiliates' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE affiliates ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Create affiliate_commissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliate_commissions (
        id SERIAL PRIMARY KEY,
        affiliate_id INTEGER REFERENCES affiliates(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP
      )
    `);

    // Create affiliate_referrals table for persistent tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliate_referrals (
        id SERIAL PRIMARY KEY,
        affiliate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        visitor_identifier TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        converted BOOLEAN DEFAULT false,
        converted_at TIMESTAMP,
        referral_code TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for affiliate_referrals
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id ON affiliate_referrals(affiliate_id);
      CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_visitor_identifier ON affiliate_referrals(visitor_identifier);
      CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_user_id ON affiliate_referrals(user_id);
      CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referral_code ON affiliate_referrals(referral_code);
      CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_converted ON affiliate_referrals(converted);
    `);

    // Add affiliate tracking columns to users table
    await pool.query(`
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
    `);

    // Create updated_at trigger function
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Add trigger to affiliate_referrals
    await pool.query(`
      DROP TRIGGER IF EXISTS update_affiliate_referrals_updated_at ON affiliate_referrals;
      CREATE TRIGGER update_affiliate_referrals_updated_at
        BEFORE UPDATE ON affiliate_referrals
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    throw error;
  }
};

// Utility functions
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      currentRole: user.currentRole,
      roles: user.roles,
    },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "24h" }
  );
};

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      currentRole: user.currentRole,
      roles: user.roles,
    },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "7d" }
  );
};

const generateRefreshToken = () => {
  return jwt.sign(
    { type: "refresh" },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "30d" }
  );
};

const hashRefreshToken = async (token) => {
  return await bcrypt.hash(token, 10);
};

const saveRefreshToken = async (userId, token) => {
  const tokenHash = await hashRefreshToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
};

const validateCPF = (cpf) => {
  const cleanCPF = cpf.replace(/\D/g, "");
  return cleanCPF.length === 11 && /^\d{11}$/.test(cleanCPF);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const logAudit = async (
  userId,
  action,
  tableName,
  recordId,
  oldValues,
  newValues,
  req
) => {
  try {
    await pool.query(
      `
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        userId,
        action,
        tableName,
        recordId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req.ip,
        req.get("User-Agent"),
      ]
    );
  } catch (error) {
    console.error("Error logging audit action:", error);
  }
};

// Get production URLs
const getProductionUrls = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const baseUrl = isProduction
    ? "https://www.cartaoquiroferreira.com.br"
    : "http://localhost:5173";

  return {
    client: {
      success: `${baseUrl}/client?payment=success`,
      failure: `${baseUrl}/client?payment=failure`,
      pending: `${baseUrl}/client?payment=pending`,
    },
    dependent: {
      success: `${baseUrl}/client?payment=success&type=dependent`,
      failure: `${baseUrl}/client?payment=failure&type=dependent`,
      pending: `${baseUrl}/client?payment=pending&type=dependent`,
    },
    professional: {
      success: `${baseUrl}/professional?payment=success`,
      failure: `${baseUrl}/professional?payment=failure`,
      pending: `${baseUrl}/professional?payment=pending`,
    },
    agenda: {
      success: `${baseUrl}/professional?payment=success&type=agenda`,
      failure: `${baseUrl}/professional?payment=failure&type=agenda`,
      pending: `${baseUrl}/professional?payment=pending&type=agenda`,
    },
    webhook: isProduction
      ? "https://www.cartaoquiroferreira.com.br/api/webhooks/payment-success"
      : "http://localhost:3001/api/webhooks/payment-success",
    // Webhook alternativo para mobile
    webhookAlt: isProduction
      ? "https://www.cartaoquiroferreira.com.br/api/webhooks/payment"
      : "http://localhost:3001/api/webhook/payment",
    isProduction,
  };
};

// ===== AUTHENTICATION ROUTES =====

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      cpf,
      email,
      phone,
      birth_date,
      address,
      address_number,
      address_complement,
      neighborhood,
      city,
      state,
      password,
      affiliate_code,
    } = req.body;

    console.log("🔄 Registration attempt for CPF:", cpf);

    // Validate required fields
    if (!name || !cpf || !password) {
      return res
        .status(400)
        .json({ message: "Nome, CPF e senha são obrigatórios" });
    }

    // Validate CPF format
    if (!validateCPF(cpf)) {
      return res.status(400).json({ message: "CPF inválido" });
    }

    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: "Email inválido" });
    }

    // Validate password length
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Senha deve ter pelo menos 6 caracteres" });
    }

    const cleanCPF = cpf.replace(/\D/g, "");

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cleanCPF]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "CPF já cadastrado" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Check if affiliate_code is provided and get affiliate_id
    let referredByAffiliateId = null;
    if (affiliate_code) {
      const affiliateResult = await pool.query(
        "SELECT user_id FROM affiliates WHERE user_id = $1 AND status = 'active'",
        [affiliate_code]
      );

      if (affiliateResult.rows.length > 0) {
        referredByAffiliateId = affiliateResult.rows[0].user_id;
        console.log("✅ User will be linked to affiliate:", referredByAffiliateId);
      } else {
        console.log("⚠️ Affiliate code provided but not found or inactive:", affiliate_code);
      }
    }

    // Create user
    const userResult = await pool.query(
      `
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        affiliate_code, referred_by_affiliate_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, name, cpf, email, roles, subscription_status
    `,
      [
        name.trim(),
        cleanCPF,
        email?.trim() || null,
        phone?.replace(/\D/g, "") || null,
        birth_date || null,
        address?.trim() || null,
        address_number?.trim() || null,
        address_complement?.trim() || null,
        neighborhood?.trim() || null,
        city?.trim() || null,
        state || null,
        hashedPassword,
        ["client"],
        affiliate_code || null,
        referredByAffiliateId,
      ]
    );

    const user = userResult.rows[0];

    console.log("✅ User registered successfully:", user.id);

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: {
        id: user.id,
        name: user.name,
        roles: user.roles,
        subscription_status: user.subscription_status,
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { cpf, password } = req.body;

    console.log("🔄 Login attempt for CPF:", cpf);

    if (!cpf || !password) {
      return res.status(400).json({ message: "CPF e senha são obrigatórios" });
    }

    if (!validateCPF(cpf)) {
      return res.status(400).json({ message: "CPF inválido" });
    }

    const cleanCPF = cpf.replace(/\D/g, "");

    // Find user by CPF
    const userResult = await pool.query(
      `
      SELECT id, name, cpf, email, password, roles, subscription_status, subscription_expiry
      FROM users 
      WHERE cpf = $1
    `,
      [cleanCPF]
    );

    if (userResult.rows.length === 0) {
      console.log("❌ User not found for CPF:", cleanCPF);
      return res.status(401).json({ message: "CPF ou senha incorretos" });
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("❌ Invalid password for user:", user.id);
      return res.status(401).json({ message: "CPF ou senha incorretos" });
    }

    console.log("✅ Login successful for user:", user.id);
    console.log("🎯 User roles:", user.roles);

    // Return user data without password
    const userData = {
      id: user.id,
      name: user.name,
      roles: user.roles,
      subscription_status: user.subscription_status,
      subscription_expiry: user.subscription_expiry,
    };

    res.json({
      message: "Login realizado com sucesso",
      user: userData,
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    console.log("🔄 Session validation for user:", req.user.id);

    const userResult = await pool.query(
      `SELECT id, name, cpf, email, roles, subscription_status, subscription_expiry
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = userResult.rows[0];

    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      email: user.email,
      roles: user.roles || [],
      currentRole: req.user.currentRole || user.roles[0],
      subscriptionStatus: user.subscription_status,
      subscriptionExpiry: user.subscription_expiry
    };

    console.log("✅ Session validated for user:", user.id, "with role:", userData.currentRole);

    res.json({ user: userData });
  } catch (error) {
    console.error("❌ Session validation error:", error);
    res.status(500).json({ message: "Erro ao validar sessão" });
  }
});

app.post("/api/auth/select-role", async (req, res) => {
  try {
    const { userId, role } = req.body;

    console.log("🎯 Role selection:", { userId, role });

    if (!userId || !role) {
      return res
        .status(400)
        .json({ message: "ID do usuário e role são obrigatórios" });
    }

    // Get user data
    const userResult = await pool.query(
      `
      SELECT id, name, roles, subscription_status, subscription_expiry
      FROM users 
      WHERE id = $1
    `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = userResult.rows[0];

    // Verify user has the requested role
    if (!user.roles.includes(role)) {
      return res
        .status(403)
        .json({ message: "Role não autorizada para este usuário" });
    }

    // Generate tokens with selected role
    const userData = {
      id: user.id,
      name: user.name,
      roles: user.roles,
      currentRole: role,
      subscription_status: user.subscription_status,
      subscription_expiry: user.subscription_expiry,
    };

    const accessToken = generateAccessToken(userData);
    const refreshToken = generateRefreshToken();

    await saveRefreshToken(user.id, refreshToken);

    res.cookie("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
    });

    console.log("✅ Role selected successfully:", role);

    res.json({
      message: "Role selecionada com sucesso",
      accessToken,
      refreshToken,
      user: userData,
    });
  } catch (error) {
    console.error("❌ Role selection error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post(
  "/api/auth/switch-role",
  authenticate,
  authorize(["professional", "admin", "client"]),
  async (req, res) => {
    try {
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ message: "Role é obrigatória" });
      }

      // Verify user has the requested role
      if (!req.user.roles.includes(role)) {
        return res
          .status(403)
          .json({ message: "Role não autorizada para este usuário" });
      }

      // Generate new token with new role
      const userData = {
        ...req.user,
        currentRole: role,
      };

      const token = generateToken(userData);

      // Set cookie
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      console.log("✅ Role switched successfully to:", role);

      res.json({
        message: "Role alterada com sucesso",
        token,
        user: userData,
      });
    } catch (error) {
      console.error("❌ Role switch error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  }
);

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token não fornecido" });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || "your-secret-key");
    } catch (error) {
      console.log("❌ Invalid or expired refresh token");
      return res.status(401).json({ message: "Refresh token inválido ou expirado" });
    }

    const storedTokens = await pool.query(
      `SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, rt.revoked,
              u.name, u.roles, u.subscription_status, u.subscription_expiry
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.revoked = false AND rt.expires_at > NOW()
       ORDER BY rt.created_at DESC`
    );

    let matchedToken = null;
    for (const row of storedTokens.rows) {
      const isMatch = await bcrypt.compare(refreshToken, row.token_hash);
      if (isMatch) {
        matchedToken = row;
        break;
      }
    }

    if (!matchedToken) {
      console.log("❌ Refresh token not found in database");
      return res.status(401).json({ message: "Refresh token inválido" });
    }

    const userResult = await pool.query(
      `SELECT id, name, roles, subscription_status, subscription_expiry
       FROM users WHERE id = $1`,
      [matchedToken.user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = userResult.rows[0];

    const currentRoleResult = await pool.query(
      `SELECT current_role FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    const currentRole = currentRoleResult.rows.length > 0
      ? currentRoleResult.rows[0].current_role
      : user.roles[0];

    const userData = {
      id: user.id,
      name: user.name,
      roles: user.roles,
      currentRole: currentRole,
      subscription_status: user.subscription_status,
      subscription_expiry: user.subscription_expiry,
    };

    const newAccessToken = generateAccessToken(userData);
    const newRefreshToken = generateRefreshToken();

    await pool.query(
      `UPDATE refresh_tokens SET revoked = true WHERE id = $1`,
      [matchedToken.id]
    );

    await saveRefreshToken(user.id, newRefreshToken);

    res.cookie("token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
    });

    console.log("✅ Tokens refreshed successfully for user:", user.id);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userData,
    });
  } catch (error) {
    console.error("❌ Token refresh error:", error);
    res.status(500).json({ message: "Erro ao renovar token" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const userId = req.body.userId;

    res.clearCookie("token");

    if (userId) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
        [userId]
      );
      console.log("✅ Refresh tokens revoked for user:", userId);
    }

    console.log("✅ User logged out successfully");

    res.json({ message: "Logout realizado com sucesso" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// ===== USER MANAGEMENT ROUTES =====

app.get("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    console.log("🔄 Fetching all users");

    const usersResult = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, subscription_status,
        subscription_expiry, photo_url, category_name, percentage, crm, professional_type, created_at
      FROM users 
      ORDER BY created_at DESC
    `);

    console.log("✅ Users fetched:", usersResult.rows.length);

    res.json(usersResult.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: "Erro ao carregar usuários" });
  }
});

app.get("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own data unless they're admin
    if (
      req.user.currentRole !== "admin" &&
      req.user.id !== Number.parseInt(id)
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const userResult = await pool.query(
      `
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, subscription_status,
        subscription_expiry, photo_url, category_name, percentage, crm, professional_type, created_at
      FROM users 
      WHERE id = $1
    `,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error("❌ Error fetching user:", error);
    res.status(500).json({ message: "Erro ao carregar usuário" });
  }
});

app.get(
  "/api/users/:id/subscription-status",
  authenticate,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Users can only access their own data unless they're admin
      if (
        req.user.currentRole !== "admin" &&
        req.user.id !== Number.parseInt(id)
      ) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const userResult = await pool.query(
        `
      SELECT subscription_status, subscription_expiry
      FROM users 
      WHERE id = $1
    `,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      res.json(userResult.rows[0]);
    } catch (error) {
      console.error("❌ Error fetching subscription status:", error);
      res
        .status(500)
        .json({ message: "Erro ao verificar status da assinatura" });
    }
  }
);

app.post("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const {
      name,
      cpf,
      email,
      phone,
      birth_date,
      address,
      address_number,
      address_complement,
      neighborhood,
      city,
      state,
      roles,
      password,
      subscription_status,
      subscription_expiry,
      category_name,
      percentage,
      crm,
      professional_type,
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Nome é obrigatório" });
    }

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res
        .status(400)
        .json({ message: "Pelo menos uma role deve ser selecionada" });
    }

    // Validate CPF format
    const cleanCpf = cpf.replace(/\D/g, "");
    if (!/^\d{11}$/.test(cleanCpf)) {
      return res
        .status(400)
        .json({ message: "CPF deve conter 11 dígitos numéricos" });
    }

    // Check if CPF already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cleanCpf]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "CPF já cadastrado no sistema" });
    }

    // Generate password if not provided
    let finalPassword = password;
    let temporaryPassword = null;

    if (!finalPassword) {
      temporaryPassword = Math.random().toString(36).slice(-8);
      finalPassword = temporaryPassword;
    }

    // Validate password length
    if (finalPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Senha deve ter pelo menos 6 caracteres" });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 12);

    // Clean phone
    const cleanPhone = phone ? phone.replace(/\D/g, "") : null;

    // Insert user
    const userResult = await pool.query(
      `
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        subscription_status, subscription_expiry, category_name,
        percentage, crm, professional_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id, name, cpf, email, roles
    `,
      [
        name.trim(),
        cleanCpf,
        email?.trim() || null,
        cleanPhone,
        birth_date || null,
        address?.trim() || null,
        address_number?.trim() || null,
        address_complement?.trim() || null,
        neighborhood?.trim() || null,
        city?.trim() || null,
        state || null,
        hashedPassword,
        roles,
        subscription_status || "pending",
        subscription_expiry || null,
        category_name?.trim() || null,
        percentage || null,
        crm?.trim() || null,
        professional_type || "convenio",
      ]
    );

    const user = userResult.rows[0];
    console.log("✅ User created successfully:", user.id);

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: {
        ...user,
        temporaryPassword,
      },
    });
  } catch (error) {
    console.error("❌ Error creating user:", error);

    if (error.code === "23505") {
      return res.status(409).json({ message: "CPF já cadastrado no sistema" });
    }

    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar usuário" });
  }
});

app.put("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      birth_date,
      address,
      address_number,
      address_complement,
      neighborhood,
      city,
      state,
      roles,
      subscription_status,
      subscription_expiry,
      category_name,
      percentage,
      crm,
      currentPassword,
      newPassword,
      professional_type,
    } = req.body;

    // Users can only update their own data unless they're admin
    if (
      req.user.currentRole !== "admin" &&
      req.user.id !== Number.parseInt(id)
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    // Get current user data
    const currentUserResult = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );
    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const currentUser = currentUserResult.rows[0];
    const updateData = { ...currentUser };

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ message: "Senha atual é obrigatória para alterar a senha" });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        currentUser.password
      );
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
      }

      updateData.password = await bcrypt.hash(newPassword, 12);
    }

    // Update other fields
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined)
      updateData.phone = phone?.replace(/\D/g, "") || null;
    if (birth_date !== undefined)
      updateData.birth_date =
        birth_date && birth_date.trim() !== "" ? birth_date : null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (address_number !== undefined)
      updateData.address_number = address_number?.trim() || null;
    if (address_complement !== undefined)
      updateData.address_complement = address_complement?.trim() || null;
    if (neighborhood !== undefined)
      updateData.neighborhood = neighborhood?.trim() || null;
    if (city !== undefined) updateData.city = city?.trim() || null;
    if (state !== undefined) updateData.state = state || null;

    // Admin-only fields
    if (req.user.currentRole === "admin") {
      if (roles !== undefined) updateData.roles = roles;
      if (subscription_status !== undefined)
        updateData.subscription_status = subscription_status;
      if (subscription_expiry !== undefined)
        updateData.subscription_expiry =
          subscription_expiry && subscription_expiry.trim() !== ""
            ? subscription_expiry
            : null;
      if (category_name !== undefined)
        updateData.category_name = category_name?.trim() || null;
      if (percentage !== undefined) updateData.percentage = percentage;
      if (crm !== undefined) updateData.crm = crm?.trim() || null;
      if (professional_type !== undefined)
        updateData.professional_type = professional_type || "convenio";
    }

    updateData.updated_at = new Date();

    // Update user
    const updatedUserResult = await pool.query(
      `
      UPDATE users SET 
        name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
        address_number = $6, address_complement = $7, neighborhood = $8,
        city = $9, state = $10, password = $11, roles = $12, subscription_status = $13,
        subscription_expiry = $14, category_name = $15, percentage = $16, crm = $17, 
        professional_type = $18, updated_at = $19
      WHERE id = $20
      RETURNING id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, subscription_status, 
        subscription_expiry, photo_url, category_name, percentage, crm, professional_type, created_at, updated_at
    `,
      [
        updateData.name,
        updateData.email,
        updateData.phone,
        updateData.birth_date,
        updateData.address,
        updateData.address_number,
        updateData.address_complement,
        updateData.neighborhood,
        updateData.city,
        updateData.state,
        updateData.password,
        updateData.roles,
        updateData.subscription_status,
        updateData.subscription_expiry,
        updateData.category_name,
        updateData.percentage,
        updateData.crm,
        updateData.professional_type,
        updateData.updated_at,
        id,
      ]
    );

    const updatedUser = updatedUserResult.rows[0];

    console.log("✅ User updated successfully:", updatedUser.id);

    res.json({
      message: "Usuário atualizado com sucesso",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ message: "Erro ao atualizar usuário" });
  }
});

app.delete(
  "/api/users/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      console.log("🔄 Deleting user:", id);

      // Prevent admin from deleting themselves
      if (Number.parseInt(id) === req.user.id) {
        return res
          .status(403)
          .json({ message: "Você não pode excluir sua própria conta" });
      }

      // Check if user exists
      const userCheck = await client.query(
        "SELECT id, name FROM users WHERE id = $1",
        [id]
      );
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const userName = userCheck.rows[0].name;

      // Start transaction
      await client.query("BEGIN");

      console.log("🔄 Starting user deletion transaction for:", userName);

      // Delete in correct order to respect foreign key constraints
      await client.query(
        "DELETE FROM medical_documents WHERE professional_id = $1",
        [id]
      );
      await client.query(
        "DELETE FROM medical_records WHERE professional_id = $1",
        [id]
      );
      await client.query(
        "DELETE FROM consultations WHERE professional_id = $1 OR user_id = $1",
        [id]
      );
      await client.query(
        "DELETE FROM private_patients WHERE professional_id = $1",
        [id]
      );
      await client.query(
        "DELETE FROM attendance_locations WHERE professional_id = $1",
        [id]
      );
      await client.query(
        "DELETE FROM scheduling_access WHERE professional_id = $1",
        [id]
      );
      await client.query("DELETE FROM dependents WHERE user_id = $1", [id]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [id]);

      // Finally delete the user
      const deleteResult = await client.query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [id]
      );

      if (deleteResult.rows.length === 0) {
        throw new Error("Falha ao excluir usuário");
      }

      // Commit transaction
      await client.query("COMMIT");

      console.log("✅ User deleted successfully:", userName);

      res.json({
        message: "Usuário excluído com sucesso",
        deletedUser: { id: Number.parseInt(id), name: userName },
      });
    } catch (error) {
      // Rollback transaction on error
      await client.query("ROLLBACK");
      console.error("❌ Error deleting user:", error);
      res
        .status(500)
        .json({ message: "Erro interno do servidor ao excluir usuário" });
    } finally {
      client.release();
    }
  }
);

// ===== CONSULTATIONS ROUTES (MAIN AGENDA SYSTEM) =====

// Get consultations for professional agenda (by date)
app.get(
  "/api/consultations/agenda",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { date } = req.query;
      const professionalId = req.user.id;

      console.log(
        "🔄 [AGENDA-QUERY] Fetching consultations for agenda - Professional:",
        professionalId,
        "Date:",
        date
      );

      let query = `
      SELECT 
        c.id,
        c.date,
        c.value,
        c.status,
        c.notes,
        c.created_at,
        s.name as service_name,
        al.name as location_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE 'Paciente não identificado'
        END as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'convenio'
        END as patient_type
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE c.professional_id = $1 AND c.status != 'cancelled'
    `;

      const params = [professionalId];

      if (date) {
        console.log("🔍 [AGENDA-QUERY] Filtering by date:", date);

        const startDateTime = `${date}T00:00:00Z`;
        const endDateTime = `${date}T23:59:59Z`;

        console.log("🔍 [AGENDA-QUERY] Date range (UTC):", {
          startDateTime,
          endDateTime,
        });

        // Use timestamptz for correct timezone handling
        query += " AND c.date >= $2::timestamptz AND c.date <= $3::timestamptz";
        params.push(startDateTime, endDateTime);
      }

      query += " ORDER BY c.date";

      console.log("🔍 [AGENDA-QUERY] Final query:", query);
      console.log("🔍 [AGENDA-QUERY] Query params:", params);

      const result = await pool.query(query, params);

      console.log(
        "✅ [AGENDA-QUERY] Consultations loaded for agenda:",
        result.rows.length
      );

      result.rows.forEach((consultation, index) => {
        console.log(`🔍 [AGENDA-QUERY] Consultation ${index + 1}:`, {
          id: consultation.id,
          client_name: consultation.client_name,
          date_utc: consultation.date,
          // Display formatting done on frontend
        });
      });

      // ✅ Ajusta o fuso horário para America/Sao_Paulo
      const consultationsWithBrazilTZ = result.rows.map((row) => ({
        ...row,
        date: row.date
          ? new Date(row.date).toLocaleString("sv-SE", {
              timeZone: "America/Sao_Paulo",
            })
          : null,
      }));

      res.json(consultationsWithBrazilTZ);
    } catch (error) {
      console.error(
        "❌ [AGENDA-QUERY] Error fetching consultations for agenda:",
        error
      );
      res.status(500).json({ message: "Erro ao carregar consultas da agenda" });
    }
  }
);

// ===== ADMIN ROUTES =====

// Get all dependents (admin only)
app.get(
  "/api/admin/dependents",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      console.log("🔄 Fetching all dependents for admin");

      const result = await pool.query(
        `
        SELECT
          d.*,
          u.name as client_name
        FROM dependents d
        LEFT JOIN users u ON d.user_id = u.id
        ORDER BY d.created_at DESC
      `
      );

      console.log("✅ Dependents fetched:", result.rows.length);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching dependents:", error);
      res.status(500).json({ message: "Erro ao buscar dependentes" });
    }
  }
);

// Get revenue report (admin only)
app.get(
  "/api/reports/revenue",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;

      console.log("📊 Generating admin revenue report");
      console.log("📅 Date range:", start_date, end_date);

      if (!start_date || !end_date) {
        return res
          .status(400)
          .json({ message: "Datas inicial e final são obrigatórias" });
      }

      // Get revenue by professional
      const professionalRevenueResult = await pool.query(
        `
        SELECT
          u.id as professional_id,
          u.name as professional_name,
          u.percentage as professional_percentage,
          COUNT(c.id) as consultation_count,
          COALESCE(SUM(c.value), 0) as revenue,
          COALESCE(
            SUM(
              CASE
                WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL
                THEN c.value * (u.percentage / 100)
                ELSE c.value
              END
            ), 0
          ) as professional_payment,
          COALESCE(
            SUM(
              CASE
                WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL
                THEN c.value * (1 - u.percentage / 100)
                ELSE 0
              END
            ), 0
          ) as clinic_revenue
        FROM users u
        LEFT JOIN consultations c ON c.professional_id = u.id
          AND c.date BETWEEN $1::timestamptz AND $2::timestamptz
          AND c.status != 'cancelled'
        WHERE 'professional' = ANY(u.roles)
        GROUP BY u.id, u.name, u.percentage
        ORDER BY revenue DESC
      `,
        [`${start_date}T00:00:00Z`, `${end_date}T23:59:59Z`]
      );

      // Get revenue by service
      const serviceRevenueResult = await pool.query(
        `
        SELECT
          s.name as service_name,
          COUNT(c.id) as consultation_count,
          COALESCE(SUM(c.value), 0) as revenue
        FROM services s
        LEFT JOIN consultations c ON c.service_id = s.id
          AND c.date BETWEEN $1::timestamptz AND $2::timestamptz
          AND c.status != 'cancelled'
        GROUP BY s.id, s.name
        HAVING COUNT(c.id) > 0
        ORDER BY revenue DESC
      `,
        [`${start_date}T00:00:00Z`, `${end_date}T23:59:59Z`]
      );

      // Calculate total clinic revenue (only what the clinic receives)
      const totalClinicRevenue = professionalRevenueResult.rows.reduce(
        (sum, row) => sum + Number.parseFloat(row.clinic_revenue || 0),
        0
      );

      // Calculate total revenue from all consultations (for reference)
      const totalConsultationsValue = professionalRevenueResult.rows.reduce(
        (sum, row) => sum + Number.parseFloat(row.revenue || 0),
        0
      );

      res.json({
        total_revenue: totalClinicRevenue,
        total_consultations_value: totalConsultationsValue,
        revenue_by_professional: professionalRevenueResult.rows.map((row) => ({
          professional_name: row.professional_name,
          professional_percentage: Number.parseFloat(
            row.professional_percentage || 50
          ),
          revenue: Number.parseFloat(row.revenue || 0),
          consultation_count: Number.parseInt(row.consultation_count || 0),
          professional_payment: Number.parseFloat(
            row.professional_payment || 0
          ),
          clinic_revenue: Number.parseFloat(row.clinic_revenue || 0),
        })),
        revenue_by_service: serviceRevenueResult.rows.map((row) => ({
          service_name: row.service_name,
          revenue: Number.parseFloat(row.revenue || 0),
          consultation_count: Number.parseInt(row.consultation_count || 0),
        })),
      });

      console.log("✅ Admin revenue report generated");
    } catch (error) {
      console.error("❌ Error generating admin revenue report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório de receitas" });
    }
  }
);

// Get clients by city report (admin only)
app.get(
  "/api/reports/clients-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      console.log("📊 Generating clients by city report");

      const result = await pool.query(
        `
        SELECT
          COALESCE(city, 'Não informado') as city,
          COALESCE(state, '') as state,
          COUNT(*) as client_count,
          COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_clients,
          COUNT(CASE WHEN subscription_status = 'pending' THEN 1 END) as pending_clients,
          COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END) as expired_clients
        FROM users
        WHERE 'client' = ANY(roles)
        GROUP BY city, state
        ORDER BY client_count DESC
      `
      );

      console.log("✅ Clients by city report generated");
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error generating clients by city report:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar relatório de clientes por cidade" });
    }
  }
);

// Get professionals by city report (admin only)
app.get(
  "/api/reports/professionals-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      console.log("📊 Generating professionals by city report");

      const result = await pool.query(
        `
        SELECT
          COALESCE(u.city, 'Não informado') as city,
          COALESCE(u.state, '') as state,
          COUNT(*) as total_professionals,
          json_agg(
            json_build_object(
              'category_name', COALESCE(u.category_name, 'Sem categoria'),
              'count', 1
            )
          ) as categories
        FROM users u
        WHERE 'professional' = ANY(u.roles)
        GROUP BY u.city, u.state
        ORDER BY total_professionals DESC
      `
      );

      // Process the data to group categories
      const processedData = result.rows.map((row) => {
        const categoryCounts = {};
        (row.categories || []).forEach((cat) => {
          const categoryName = cat.category_name;
          categoryCounts[categoryName] =
            (categoryCounts[categoryName] || 0) + 1;
        });

        return {
          city: row.city,
          state: row.state,
          total_professionals: Number.parseInt(row.total_professionals),
          categories: Object.entries(categoryCounts).map(([name, count]) => ({
            category_name: name,
            count: count,
          })),
        };
      });

      console.log("✅ Professionals by city report generated");
      res.json(processedData);
    } catch (error) {
      console.error("❌ Error generating professionals by city report:", error);
      res.status(500).json({
        message: "Erro ao gerar relatório de profissionais por cidade",
      });
    }
  }
);

// ===== PROFESSIONAL REVENUE REPORT (FOR HOMEPAGE) =====
app.get(
  "/api/reports/professional-revenue",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const professionalId = req.user.id;
      const { start_date, end_date } = req.query;

      console.log("📊 Generating revenue report for:", professionalId);
      console.log("📅 Date range:", start_date, end_date);

      if (!start_date || !end_date) {
        return res
          .status(400)
          .json({ message: "Datas inicial e final são obrigatórias" });
      }

      // Get consultations with details
      const consultationsResult = await pool.query(
        `
        SELECT
          c.id,
          c.date,
          c.value,
          c.status,
          c.user_id,
          c.dependent_id,
          c.private_patient_id,
          s.name as service_name,
          CASE
            WHEN c.user_id IS NOT NULL THEN u.name
            WHEN c.dependent_id IS NOT NULL THEN d.name
            WHEN c.private_patient_id IS NOT NULL THEN pp.name
            ELSE 'Desconhecido'
          END as client_name
        FROM consultations c
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN dependents d ON c.dependent_id = d.id
        LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
        WHERE c.professional_id = $1
          AND c.date BETWEEN $2::timestamptz AND $3::timestamptz
          AND c.status != 'cancelled'
        ORDER BY c.date DESC
      `,
        [professionalId, `${start_date}T00:00:00Z`, `${end_date}T23:59:59Z`]
      );

      // Calculate summary
      const profData = await pool.query(
        `SELECT percentage FROM users WHERE id = $1`,
        [professionalId]
      );

      const percentage = profData.rows[0]?.percentage || 50;
      let totalRevenue = 0;
      let convenioRevenue = 0;
      let privateRevenue = 0;
      let convenioCount = 0;
      let privateCount = 0;

      const consultationsWithAmounts = consultationsResult.rows.map((c) => {
        const value = Number.parseFloat(c.value);
        const isConvenio = c.user_id || c.dependent_id;

        totalRevenue += value;

        if (isConvenio) {
          convenioRevenue += value;
          convenioCount++;
        } else {
          privateRevenue += value;
          privateCount++;
        }

        // Cálculo correto:
        // - Convênio: o profissional deve pagar ao convênio = valor total - sua parte
        //   Se ele recebe 50%, deve pagar 50% ao convênio
        // - Particular: o profissional não paga nada (recebe tudo)
        const professionalReceives = isConvenio
          ? value * (percentage / 100)
          : value;
        const amountToPay = isConvenio ? value - professionalReceives : 0;

        return {
          ...c,
          amount_to_pay: amountToPay,
          total_value: value,
        };
      });

      const professionalShare =
        convenioRevenue * (percentage / 100) + privateRevenue;
      const totalAmountToPay = totalRevenue - professionalShare;

      // Get approved payments in the period
      const approvedPaymentsResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount), 0) as total_paid
        FROM professional_payments
        WHERE professional_id = $1
          AND status = 'approved'
          AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
      `,
        [professionalId, `${start_date}T00:00:00Z`, `${end_date}T23:59:59Z`]
      );

      const totalPaid = Number.parseFloat(
        approvedPaymentsResult.rows[0]?.total_paid || 0
      );
      const amountToPayAfterPayments = Math.max(
        0,
        totalAmountToPay - totalPaid
      );

      res.json({
        consultations: consultationsWithAmounts,
        summary: {
          total_consultations: consultationsResult.rows.length,
          convenio_consultations: convenioCount,
          private_consultations: privateCount,
          total_revenue: totalRevenue,
          convenio_revenue: convenioRevenue,
          private_revenue: privateRevenue,
          professional_percentage: percentage,
          professional_share: professionalShare,
          amount_to_pay: amountToPayAfterPayments,
          total_paid: totalPaid,
        },
      });
    } catch (error) {
      console.error("❌ Error generating revenue report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório de receitas" });
    }
  }
);

// ===== PROFESSIONAL REPORT DETAILED =====
app.get(
  "/api/reports/professional-detailed",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const professionalId = req.user.id;
      const { start_date, end_date } = req.query;

      console.log("📊 Generating detailed report for:", professionalId);
      console.log("📅 Date range:", start_date, end_date);

      if (!start_date || !end_date) {
        return res
          .status(400)
          .json({ message: "Datas inicial e final são obrigatórias" });
      }

      const result = await pool.query(
        `
        SELECT
          COUNT(*) AS total_consultations,
          SUM(CASE WHEN (user_id IS NOT NULL OR dependent_id IS NOT NULL) THEN 1 ELSE 0 END) AS convenio_consultations,
          SUM(CASE WHEN private_patient_id IS NOT NULL THEN 1 ELSE 0 END) AS private_consultations,
          COALESCE(SUM(value), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN (user_id IS NOT NULL OR dependent_id IS NOT NULL) THEN value ELSE 0 END), 0) AS convenio_revenue,
          COALESCE(SUM(CASE WHEN private_patient_id IS NOT NULL THEN value ELSE 0 END), 0) AS private_revenue
        FROM consultations
        WHERE professional_id = $1
          AND date BETWEEN $2::timestamptz AND $3::timestamptz
          AND status != 'cancelled'
      `,
        [professionalId, `${start_date}T00:00:00Z`, `${end_date}T23:59:59Z`]
      );

      const summary = result.rows[0];

      // Busca porcentagem e repasse
      const profData = await pool.query(
        `SELECT percentage FROM users WHERE id = $1`,
        [professionalId]
      );

      const percentage = profData.rows[0]?.percentage || 50;
      const convenioRevenue = Number.parseFloat(summary.convenio_revenue || 0);
      const privateRevenue = Number.parseFloat(summary.private_revenue || 0);
      const totalRevenue = Number.parseFloat(summary.total_revenue || 0);

      const professionalShare =
        convenioRevenue * (percentage / 100) + privateRevenue;
      const amountToPay = totalRevenue - professionalShare;

      // Get approved payments in the period
      const approvedPaymentsResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount), 0) as total_paid
        FROM professional_payments
        WHERE professional_id = $1
          AND status = 'approved'
          AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
      `,
        [professionalId, `${start_date}T00:00:00Z`, `${end_date}T23:59:59Z`]
      );

      const totalPaid = Number.parseFloat(
        approvedPaymentsResult.rows[0]?.total_paid || 0
      );
      const amountToPayAfterPayments = Math.max(0, amountToPay - totalPaid);

      res.json({
        summary: {
          total_consultations: Number.parseInt(
            summary.total_consultations || 0
          ),
          convenio_consultations: Number.parseInt(
            summary.convenio_consultations || 0
          ),
          private_consultations: Number.parseInt(
            summary.private_consultations || 0
          ),
          total_revenue: totalRevenue,
          convenio_revenue: convenioRevenue,
          private_revenue: privateRevenue,
          professional_percentage: percentage,
          amount_to_pay: amountToPayAfterPayments,
          total_paid: totalPaid,
        },
      });
    } catch (error) {
      console.error("❌ Error generating detailed report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório detalhado" });
    }
  }
);

// Create new consultation (RegisterConsultationPage - no scheduling access required)
app.post(
  "/api/consultations",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const {
        user_id,
        dependent_id,
        private_patient_id,
        service_id,
        location_id,
        value,
        date,
        notes,
        status = "scheduled",
      } = req.body;

      console.log("🔄 Creating consultation:", req.body);

      // Validate required fields
      if (!service_id || !value || !date) {
        return res
          .status(400)
          .json({ message: "Serviço, valor e data são obrigatórios" });
      }

      if (isNaN(Number.parseFloat(value)) || Number.parseFloat(value) <= 0) {
        return res
          .status(400)
          .json({ message: "Valor deve ser um número maior que zero" });
      }

      // Validate patient type (exactly one must be provided)
      const patientCount = [user_id, dependent_id, private_patient_id].filter(
        Boolean
      ).length;
      if (patientCount !== 1) {
        console.log("❌ Patient validation failed:", {
          user_id,
          dependent_id,
          private_patient_id,
          patientCount,
        });
        return res.status(400).json({
          message: "Exatamente um tipo de paciente deve ser especificado",
          debug: { user_id, dependent_id, private_patient_id, patientCount },
        });
      }

      // Validate service exists
      const serviceResult = await pool.query(
        "SELECT * FROM services WHERE id = $1",
        [service_id]
      );
      if (serviceResult.rows.length === 0) {
        return res.status(404).json({ message: "Serviço não encontrado" });
      }

      // If it's a convenio patient, validate subscription status
      if (user_id || dependent_id) {
        let subscriptionValid = false;

        if (user_id) {
          const clientResult = await pool.query(
            `
          SELECT subscription_status FROM users WHERE id = $1 AND 'client' = ANY(roles)
        `,
            [user_id]
          );

          if (
            clientResult.rows.length > 0 &&
            clientResult.rows[0].subscription_status === "active"
          ) {
            subscriptionValid = true;
          }
        } else if (dependent_id) {
          const dependentResult = await pool.query(
            `
          SELECT subscription_status FROM dependents WHERE id = $1
        `,
            [dependent_id]
          );

          if (
            dependentResult.rows.length > 0 &&
            dependentResult.rows[0].subscription_status === "active"
          ) {
            subscriptionValid = true;
          }
        }

        if (!subscriptionValid) {
          return res
            .status(400)
            .json({ message: "Paciente não possui assinatura ativa" });
        }
      }

      console.log("🔄 Date received from frontend:", date);
      console.log("🔄 Date type:", typeof date);

      const dateTimeForStorage = toUTCString(date);

      console.log(
        "🔄 [CREATE] DateTime for storage (UTC):",
        dateTimeForStorage
      );

      const conflictCheck = await pool.query(
        `
      SELECT 
        c.id,
        c.date,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE 'Paciente não identificado'
        END as client_name
      FROM consultations c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 
        AND c.date = $2::timestamptz
        AND c.status != 'cancelled'
    `,
        [req.user.id, dateTimeForStorage]
      );

      if (conflictCheck.rows.length > 0) {
        const conflict = conflictCheck.rows[0];

        // Format date and time for Brazil timezone using utility functions
        const formattedDate = formatToBrazilDate(conflict.date);
        const formattedTime = formatToBrazilTimeOnly(conflict.date);

        console.log("⚠️ [CONFLICT] Scheduling conflict detected:", {
          requestedTime: dateTimeForStorage,
          existingConsultation: conflict.id,
          existingClient: conflict.client_name,
          dbDate: conflict.date,
          formattedDate,
          formattedTime,
        });

        return res.status(409).json({
          message: `O horário ${formattedTime} do dia ${formattedDate} já está agendado para ${conflict.client_name}.`,
          conflict: true,
          conflictDetails: {
            date: formattedDate,
            time: formattedTime,
            clientName: conflict.client_name,
            consultationId: conflict.id,
          },
        });
      }

      // Create consultation
      const consultationResult = await pool.query(
        `
      INSERT INTO consultations (
        user_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, status, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
        [
          user_id || null,
          dependent_id || null,
          private_patient_id || null,
          req.user.id,
          service_id,
          location_id || null,
          Number.parseFloat(value),
          dateTimeForStorage,
          status,
          notes?.trim() || null,
        ]
      );

      const consultation = consultationResult.rows[0];

      console.log("✅ Consultation created with date:", consultation.date);
      console.log("✅ Consultation created:", consultation.id);
      console.log("✅ Saved date:", consultation.date);

      res.status(201).json({
        message: "Consulta criada com sucesso",
        consultation,
      });
    } catch (error) {
      console.error("❌ Error creating consultation:", error);
      res.status(500).json({ message: "Erro ao criar consulta" });
    }
  }
);

// POST /api/consultations/recurring - Create recurring consultations
app.post(
  "/api/consultations/recurring",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const {
        user_id,
        dependent_id,
        private_patient_id,
        service_id,
        location_id,
        value,
        start_date,
        start_time,
        recurrence_type,
        recurrence_interval = 1,
        weekly_count,
        selected_weekdays = [],
        occurrences = 10,
        notes,
      } = req.body;

      console.log("🔄 [RECURRING] Creating recurring consultations:", req.body);

      // Validate required fields
      if (!service_id || !value || !start_date || !start_time) {
        return res.status(400).json({
          message: "Serviço, valor, data de início e horário são obrigatórios",
        });
      }

      // Validate patient type
      const patientCount = [user_id, dependent_id, private_patient_id].filter(
        Boolean
      ).length;
      if (patientCount !== 1) {
        return res.status(400).json({
          message: "Exatamente um tipo de paciente deve ser especificado",
        });
      }

      // Validate recurrence type
      if (!["daily", "weekly", "monthly"].includes(recurrence_type)) {
        return res.status(400).json({
          message: "Tipo de recorrência inválido",
        });
      }

      // For daily recurrence, validate weekdays
      if (
        recurrence_type === "daily" &&
        (!selected_weekdays || selected_weekdays.length === 0)
      ) {
        return res.status(400).json({
          message:
            "Para recorrência diária, selecione pelo menos um dia da semana",
        });
      }

      // Generate consultation dates based on recurrence pattern
      const consultationDates = [];
      const startDateTime = new Date(`${start_date}T${start_time}`);

      console.log("🔄 [RECURRING] Start date/time:", startDateTime);
      console.log("🔄 [RECURRING] Recurrence type:", recurrence_type);

      if (recurrence_type === "daily") {
        // Daily recurrence with specific weekdays
        const currentDate = new Date(startDateTime);
        let count = 0;

        while (count < occurrences) {
          const dayOfWeek = currentDate.getDay();

          if (selected_weekdays.includes(dayOfWeek)) {
            consultationDates.push(new Date(currentDate));
            count++;
          }

          currentDate.setDate(currentDate.getDate() + 1);

          // Safety limit
          if (consultationDates.length > 365) break;
        }
      } else if (recurrence_type === "weekly") {
        // Weekly recurrence for N weeks
        const weeksToCreate = weekly_count || 4;

        for (let i = 0; i < weeksToCreate; i++) {
          const consultationDate = new Date(startDateTime);
          consultationDate.setDate(consultationDate.getDate() + i * 7);
          consultationDates.push(consultationDate);
        }
      } else if (recurrence_type === "monthly") {
        // Monthly recurrence
        for (let i = 0; i < occurrences; i++) {
          const consultationDate = new Date(startDateTime);
          consultationDate.setMonth(
            consultationDate.getMonth() + i * recurrence_interval
          );
          consultationDates.push(consultationDate);
        }
      }

      console.log("🔄 [RECURRING] Generated dates:", consultationDates.length);

      const conflicts = [];
      const validDates = [];

      for (const consultationDate of consultationDates) {
        const dateTimeUTC = consultationDate.toISOString();

        const conflictCheck = await pool.query(
          `
          SELECT 
            c.id,
            c.date,
            CASE 
              WHEN c.user_id IS NOT NULL THEN u.name
              WHEN c.dependent_id IS NOT NULL THEN d.name
              WHEN c.private_patient_id IS NOT NULL THEN pp.name
              ELSE 'Paciente não identificado'
            END as client_name
          FROM consultations c
          LEFT JOIN users u ON c.user_id = u.id
          LEFT JOIN dependents d ON c.dependent_id = d.id
          LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
          WHERE c.professional_id = $1 
            AND c.date = $2::timestamptz
            AND c.status != 'cancelled'
        `,
          [req.user.id, dateTimeUTC]
        );

        if (conflictCheck.rows.length > 0) {
          const conflict = conflictCheck.rows[0];

          // Format date and time for Brazil timezone using utility functions
          const formattedDate = formatToBrazilDate(conflict.date);
          const formattedTime = formatToBrazilTimeOnly(conflict.date);

          conflicts.push({
            date: formattedDate,
            time: formattedTime,
            clientName: conflict.client_name,
          });

          console.log("⚠️ [RECURRING-CONFLICT] Conflict detected:", {
            date: formattedDate,
            time: formattedTime,
            client: conflict.client_name,
            dbDate: conflict.date,
          });
        } else {
          validDates.push(dateTimeUTC);
        }
      }

      // If there are conflicts, return them to the frontend
      if (conflicts.length > 0) {
        console.log(
          `⚠️ [RECURRING-CONFLICT] Found ${conflicts.length} conflict(s)`
        );

        return res.status(409).json({
          message: `${conflicts.length} horário(s) já está(ão) ocupado(s). Por favor, entre em contato com os clientes para reagendar.`,
          conflict: true,
          conflicts: conflicts,
          validDatesCount: validDates.length,
        });
      }

      // Create all consultations
      const createdConsultations = [];

      for (const dateTimeUTC of validDates) {
        const consultationResult = await pool.query(
          `
          INSERT INTO consultations (
            user_id, dependent_id, private_patient_id, professional_id,
            service_id, location_id, value, date, status, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
          [
            user_id || null,
            dependent_id || null,
            private_patient_id || null,
            req.user.id,
            service_id,
            location_id || null,
            Number.parseFloat(value),
            dateTimeUTC,
            "scheduled",
            notes?.trim() || null,
          ]
        );

        createdConsultations.push(consultationResult.rows[0]);
      }

      console.log(
        `✅ [RECURRING] Created ${createdConsultations.length} consultation(s)`
      );

      res.status(201).json({
        message: `${createdConsultations.length} consulta(s) criada(s) com sucesso`,
        created_count: createdConsultations.length,
        consultations: createdConsultations,
      });
    } catch (error) {
      console.error(
        "❌ [RECURRING] Error creating recurring consultations:",
        error
      );
      res.status(500).json({ message: "Erro ao criar consultas recorrentes" });
    }
  }
);

// Update consultation status
app.put(
  "/api/consultations/:id/status",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log("🔄 Updating consultation status:", id, "to:", status);

      if (!status) {
        return res.status(400).json({ message: "Status é obrigatório" });
      }

      // Validate status value
      const validStatuses = [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }

      const result = await pool.query(
        `
      UPDATE consultations 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND professional_id = $3
      RETURNING *
    `,
        [status, id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      console.log("✅ Consultation status updated:", id);

      res.json({
        message: "Status da consulta atualizado com sucesso",
        consultation: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error updating consultation status:", error);
      res.status(500).json({ message: "Erro ao atualizar status da consulta" });
    }
  }
);

// Update consultation (full update)
app.put(
  "/api/consultations/:id",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { service_id, location_id, value, date, status, notes } = req.body;

      console.log("🔄 Updating consultation:", id);

      // Get current consultation
      const currentResult = await pool.query(
        "SELECT * FROM consultations WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      if (currentResult.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      if (service_id !== undefined) {
        updateFields.push(`service_id = $${paramCount++}`);
        updateValues.push(service_id);
      }

      if (location_id !== undefined) {
        updateFields.push(`location_id = $${paramCount++}`);
        updateValues.push(location_id);
      }

      if (value !== undefined) {
        if (isNaN(Number.parseFloat(value)) || Number.parseFloat(value) <= 0) {
          return res
            .status(400)
            .json({ message: "Valor deve ser um número maior que zero" });
        }
        updateFields.push(`value = $${paramCount++}`);
        updateValues.push(Number.parseFloat(value));
      }

      if (date !== undefined) {
        const dateTimeForStorage = toUTCString(date);
        updateFields.push(`date = $${paramCount++}`);
        updateValues.push(dateTimeForStorage);

        console.log(
          "🔄 [UPDATE] DateTime for storage (UTC):",
          dateTimeForStorage
        );
      }

      if (status !== undefined) {
        const validStatuses = [
          "scheduled",
          "confirmed",
          "completed",
          "cancelled",
        ];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: "Status inválido" });
        }
        updateFields.push(`status = $${paramCount++}`);
        updateValues.push(status);
      }

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramCount++}`);
        updateValues.push(notes?.trim() || null);
      }

      // Always update updated_at
      updateFields.push(`updated_at = $${paramCount++}`);
      updateValues.push(new Date());

      // Add consultation ID and professional ID for WHERE clause
      updateValues.push(id, req.user.id);

      const updateQuery = `
      UPDATE consultations 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount} AND professional_id = $${paramCount + 1}
      RETURNING *
    `;

      const result = await pool.query(updateQuery, updateValues);

      console.log("✅ Consultation updated:", id);

      res.json({
        message: "Consulta atualizada com sucesso",
        consultation: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error updating consultation:", error);
      res.status(500).json({ message: "Erro ao atualizar consulta" });
    }
  }
);

// GET /api/consultations/:id/whatsapp - Get WhatsApp URL for consultation
app.get(
  "/api/consultations/:id/whatsapp",
  authenticate,
  authorize(["professional", "admin"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const consultationId = req.params.id;

      console.log("🔄 Getting WhatsApp URL for consultation:", consultationId);

      // Get consultation details with patient info
      const consultationResult = await pool.query(
        `SELECT 
        c.*,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          WHEN c.dependent_id IS NOT NULL THEN cu.name
          ELSE u.name
        END as patient_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN pp.phone
          WHEN c.dependent_id IS NOT NULL THEN cu.phone
          ELSE u.phone
        END as patient_phone,
        s.name as service_name,
        prof.name as professional_name
       FROM consultations c
       LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
       LEFT JOIN dependents d ON c.dependent_id = d.id
       LEFT JOIN users cu ON d.user_id = cu.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN services s ON c.service_id = s.id
       LEFT JOIN users prof ON c.professional_id = prof.id
       WHERE c.id = $1 AND c.professional_id = $2`,
        [consultationId, req.user.id]
      );

      if (consultationResult.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      const consultation = consultationResult.rows[0];

      if (!consultation.patient_phone) {
        return res
          .status(400)
          .json({ message: "Telefone do paciente não encontrado" });
      }

      // Format phone number (remove non-numeric characters and add country code)
      const cleanPhone = consultation.patient_phone.replace(/\D/g, "");
      const formattedPhone = cleanPhone.startsWith("55")
        ? cleanPhone
        : `55${cleanPhone}`;

      // Format date and time - Convert from UTC (database) to Brazil local time for WhatsApp
      console.log("🔄 Consultation date from DB:", consultation.date);

      const formattedDate = formatToBrazilDate(consultation.date);
      const formattedTime = formatToBrazilTimeOnly(consultation.date);

      console.log("🔄 [WHATSAPP] Formatted for Brazil:", {
        date: formattedDate,
        time: formattedTime,
      });

      const message = `Olá ${
        consultation.patient_name
      }, gostaria de confirmar o seu agendamento com o profissional ${
        req.user.name
      } no dia ${formattedDate} às ${new Date(
        new Date("1970-01-01T" + formattedTime + ":00Z").getTime() -
          3 * 60 * 60 * 1000
      )
        .toISOString()
        .substring(11, 16)}`;

      const encodedMessage = encodeURIComponent(message);

      // Generate WhatsApp URL
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

      console.log("✅ WhatsApp URL generated:", whatsappUrl);
      res.json({ whatsapp_url: whatsappUrl });
    } catch (error) {
      console.error("❌ Error generating WhatsApp URL:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  }
);

// Cancel consultation
app.put(
  "/api/consultations/:id/cancel",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { cancellation_reason } = req.body;

      console.log("🔄 Cancelling consultation:", id);

      const result = await pool.query(
        `
      UPDATE consultations 
      SET 
        status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        cancelled_by = $1,
        cancellation_reason = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND professional_id = $1
      RETURNING *
    `,
        [req.user.id, cancellation_reason?.trim() || null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      console.log("✅ Consultation cancelled:", id);

      res.json({
        message: "Consulta cancelada com sucesso",
        consultation: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error cancelling consultation:", error);
      res.status(500).json({ message: "Erro ao cancelar consulta" });
    }
  }
);

// Delete consultation
app.delete(
  "/api/consultations/:id",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { id } = req.params;

      console.log("🔄 Deleting consultation:", id);

      const result = await pool.query(
        "DELETE FROM consultations WHERE id = $1 AND professional_id = $2 RETURNING *",
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      console.log("✅ Consultation deleted:", id);

      res.json({ message: "Consulta excluída com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting consultation:", error);
      res.status(500).json({ message: "Erro ao excluir consulta" });
    }
  }
);

// Get all consultations (Admin only)
app.get(
  "/api/consultations",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const consultationsResult = await pool.query(`
      SELECT 
        c.id, c.value, c.date, c.status, c.notes, c.created_at,
        s.name as service_name,
        u.name as professional_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u2.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
        END as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent,
        al.name as location_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users u2 ON c.user_id = u2.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE c.status != 'cancelled'
      ORDER BY c.date DESC
    `);

      console.log(
        "✅ All consultations fetched:",
        consultationsResult.rows.length
      );

      res.json(consultationsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching consultations:", error);
      res.status(500).json({ message: "Erro ao carregar consultas" });
    }
  }
);

// Get consultations for client
app.get(
  "/api/consultations/client/:clientId",
  authenticate,
  async (req, res) => {
    try {
      const { clientId } = req.params;

      // Clients can only access their own consultations
      if (
        req.user.currentRole === "client" &&
        req.user.id !== Number.parseInt(clientId)
      ) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const consultationsResult = await pool.query(
        `
      SELECT 
        c.id, c.value, c.date, c.status, c.notes, c.created_at,
        s.name as service_name,
        u.name as professional_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u2.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
        END as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent,
        al.name as location_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users u2 ON c.user_id = u2.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE (c.user_id = $1 OR c.dependent_id IN (
        SELECT id FROM dependents WHERE user_id = $1
      )) AND c.status != 'cancelled'
      ORDER BY c.date DESC
    `,
        [clientId]
      );

      console.log(
        "✅ Client consultations fetched:",
        consultationsResult.rows.length
      );

      res.json(consultationsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching client consultations:", error);
      res
        .status(500)
        .json({ message: "Erro ao carregar consultas do cliente" });
    }
  }
);

// ===== CLIENT LOOKUP ROUTES =====

app.get(
  "/api/clients/lookup",
  authenticate,
  authorize(["professional", "admin"]),
  async (req, res) => {
    try {
      const { cpf } = req.query;

      if (!cpf) {
        return res.status(400).json({ message: "CPF é obrigatório" });
      }

      if (!validateCPF(cpf)) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const cleanCPF = cpf.replace(/\D/g, "");

      const clientResult = await pool.query(
        `
      SELECT id, name, cpf, subscription_status, subscription_expiry
      FROM users 
      WHERE cpf = $1 AND 'client' = ANY(roles)
    `,
        [cleanCPF]
      );

      if (clientResult.rows.length === 0) {
        return res.status(404).json({ message: "Cliente não encontrado" });
      }

      const client = clientResult.rows[0];

      res.json(client);
    } catch (error) {
      console.error("❌ Error looking up client:", error);
      res.status(500).json({ message: "Erro ao buscar cliente" });
    }
  }
);

// ===== DEPENDENTS ROUTES =====

// Get dependents with optional filtering
app.get(
  "/api/dependents",
  authenticate,
  authorize(["professional", "admin", "client"]),
  async (req, res) => {
    try {
      const { client_id, status } = req.query;

      console.log("🔄 Fetching dependents with filters:", {
        client_id,
        status,
      });

      let query = `
      SELECT 
        id, user_id, name, cpf, birth_date, subscription_status, subscription_expiry,
        billing_amount, payment_reference, activated_at, created_at,
        subscription_status as status
      FROM dependents 
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      // Filter by client_id if provided
      if (client_id) {
        paramCount++;
        query += ` AND user_id = $${paramCount}`;
        params.push(client_id);

        // Clients can only access their own dependents
        if (
          req.user.currentRole === "client" &&
          req.user.id !== Number.parseInt(client_id)
        ) {
          return res.status(403).json({ message: "Acesso negado" });
        }
      }

      // Filter by status if provided (maps to subscription_status)
      if (status) {
        paramCount++;
        query += ` AND subscription_status = $${paramCount}`;
        params.push(status);
      }

      query += " ORDER BY created_at DESC";

      const dependentsResult = await pool.query(query, params);

      console.log("✅ Dependents fetched:", dependentsResult.rows.length);
      res.json(dependentsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching dependents:", error);
      res.status(500).json({ message: "Erro ao carregar dependentes" });
    }
  }
);

// Search dependent by CPF
app.get(
  "/api/dependents/search",
  authenticate,
  authorize(["professional", "admin"]),
  async (req, res) => {
    try {
      const { cpf } = req.query;

      if (!cpf) {
        return res.status(400).json({ message: "CPF é obrigatório" });
      }

      if (!validateCPF(cpf)) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const cleanCPF = cpf.replace(/\D/g, "");

      console.log("🔄 Searching dependent by CPF:", cleanCPF);

      const dependentResult = await pool.query(
        `
      SELECT 
        d.id, d.name, d.cpf, d.subscription_status as status,
        d.user_id, u.name as client_name, u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.cpf = $1
    `,
        [cleanCPF]
      );

      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: "Dependente não encontrado" });
      }

      const dependent = dependentResult.rows[0];

      console.log(
        "✅ Dependent found:",
        dependent.name,
        "Status:",
        dependent.status
      );
      res.json(dependent);
    } catch (error) {
      console.error("❌ Error searching dependent:", error);
      res.status(500).json({ message: "Erro ao buscar dependente" });
    }
  }
);

app.get("/api/dependents/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Clients can only access their own dependents
    if (
      req.user.currentRole === "client" &&
      req.user.id !== Number.parseInt(clientId)
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const dependentsResult = await pool.query(
      `
      SELECT 
        id, name, cpf, birth_date, subscription_status, subscription_expiry,
        billing_amount, payment_reference, activated_at, created_at,
        subscription_status as current_status
      FROM dependents 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `,
      [clientId]
    );

    console.log(
      "✅ Dependents fetched for client:",
      clientId,
      "Count:",
      dependentsResult.rows.length
    );

    res.json(dependentsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching dependents:", error);
    res.status(500).json({ message: "Erro ao carregar dependentes" });
  }
});

app.get(
  "/api/dependents/lookup",
  authenticate,
  authorize(["professional", "admin"]),
  async (req, res) => {
    try {
      const { cpf } = req.query;

      if (!cpf) {
        return res.status(400).json({ message: "CPF é obrigatório" });
      }

      if (!validateCPF(cpf)) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const cleanCPF = cpf.replace(/\D/g, "");

      console.log("🔄 Looking up dependent by CPF:", cleanCPF);

      const dependentResult = await pool.query(
        `
      SELECT 
        d.id, d.name, d.cpf, d.subscription_status as status,
        d.user_id, u.name as client_name, u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.cpf = $1
    `,
        [cleanCPF]
      );

      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: "Dependente não encontrado" });
      }

      const dependent = dependentResult.rows[0];

      console.log(
        "✅ Dependent lookup result:",
        dependent.name,
        "Status:",
        dependent.status
      );
      res.json(dependent);
    } catch (error) {
      console.error("❌ Error looking up dependent:", error);
      res.status(500).json({ message: "Erro ao buscar dependente" });
    }
  }
);

app.post("/api/dependents", authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    console.log("🔄 Creating dependent:", {
      client_id,
      name,
      cpf,
      professional_id: req.user.id,
    });

    // Allow clients to create dependents for themselves OR admins to create for any client
    if (req.user.currentRole === "client" && req.user.id !== client_id) {
      return res.status(403).json({
        message: "Você só pode criar dependentes para sua própria conta.",
      });
    }

    // Admins can create dependents for any client
    if (req.user.currentRole !== "client" && req.user.currentRole !== "admin") {
      return res.status(403).json({
        message: "Apenas clientes e administradores podem criar dependentes.",
      });
    }

    // Validate required fields
    if (!client_id || !name || !cpf) {
      return res
        .status(400)
        .json({ message: "ID do cliente, nome e CPF são obrigatórios" });
    }

    if (!validateCPF(cpf)) {
      return res.status(400).json({ message: "CPF inválido" });
    }

    const cleanCPF = cpf.replace(/\D/g, "");

    // Check if CPF already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cleanCPF]
    );
    const existingDependent = await pool.query(
      "SELECT id FROM dependents WHERE cpf = $1",
      [cleanCPF]
    );

    if (existingUser.rows.length > 0 || existingDependent.rows.length > 0) {
      return res.status(409).json({ message: "CPF já cadastrado" });
    }

    // Check dependent limit (max 10 per client)
    const dependentCount = await pool.query(
      "SELECT COUNT(*) FROM dependents WHERE user_id = $1",
      [client_id]
    );
    if (Number.parseInt(dependentCount.rows[0].count) >= 10) {
      return res
        .status(400)
        .json({ message: "Limite máximo de 10 dependentes atingido" });
    }

    const dependentResult = await pool.query(
      `INSERT INTO dependents (user_id, name, cpf, birth_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [client_id, name.trim(), cleanCPF, birth_date || null]
    );

    const dependent = dependentResult.rows[0];

    console.log("✅ Dependent created successfully:", dependent.id);

    res.status(201).json({
      message: "Dependente criado com sucesso",
      dependent,
    });
  } catch (error) {
    console.error("❌ Error creating dependent:", error);
    res.status(500).json({ message: "Erro ao criar dependente" });
  }
});

app.put(
  "/api/dependents/:id",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, birth_date } = req.body;

      // Get current dependent data
      const currentDependentResult = await pool.query(
        `
      SELECT * FROM dependents WHERE id = $1 AND user_id = $2
    `,
        [id, req.user.id]
      );

      if (currentDependentResult.rows.length === 0) {
        return res.status(404).json({ message: "Dependente não encontrado" });
      }

      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      const updatedDependentResult = await pool.query(
        `
      UPDATE dependents 
      SET name = $1, birth_date = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `,
        [name.trim(), birth_date || null, id, req.user.id]
      );

      const updatedDependent = updatedDependentResult.rows[0];

      console.log("✅ Dependent updated successfully:", id);

      res.json({
        message: "Dependente atualizado com sucesso",
        dependent: updatedDependent,
      });
    } catch (error) {
      console.error("❌ Error updating dependent:", error);
      res.status(500).json({ message: "Erro ao atualizar dependente" });
    }
  }
);

app.delete(
  "/api/dependents/:id",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get dependent data before deletion
      const dependentResult = await pool.query(
        `
      SELECT * FROM dependents WHERE id = $1 AND user_id = $2
    `,
        [id, req.user.id]
      );

      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: "Dependente não encontrado" });
      }

      // Delete dependent
      await pool.query(
        "DELETE FROM dependents WHERE id = $1 AND user_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Dependent deleted successfully:", id);

      res.json({ message: "Dependente excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting dependent:", error);
      res.status(500).json({ message: "Erro ao excluir dependente" });
    }
  }
);

// ===== BLOCKED SLOTS ROUTES =====

// Get blocked slots for a specific date
app.get("/api/blocked-slots", authenticate, async (req, res) => {
  try {
    const { date } = req.query;
    const professionalId = req.user.id;

    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    const result = await pool.query(
      `SELECT * FROM blocked_slots
       WHERE professional_id = $1 AND date = $2
       ORDER BY time_slot`,
      [professionalId, date]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching blocked slots:", error);
    res.status(500).json({ error: "Erro ao carregar horários bloqueados" });
  }
});

// Block a time slot
app.post("/api/blocked-slots", authenticate, async (req, res) => {
  try {
    const { date, time_slot, reason } = req.body;
    const professionalId = req.user.id;

    if (!date || !time_slot) {
      return res.status(400).json({ error: "Date and time_slot are required" });
    }

    // Check if slot already has a consultation
    const consultationCheck = await pool.query(
      `SELECT id FROM consultations
       WHERE professional_id = $1
       AND DATE(date) = $2
       AND TO_CHAR(date, 'HH24:MI') = $3
       AND status != 'cancelled'`,
      [professionalId, date, time_slot]
    );

    if (consultationCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Não é possível bloquear um horário que já possui consulta agendada"
      });
    }

    const result = await pool.query(
      `INSERT INTO blocked_slots (professional_id, date, time_slot, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [professionalId, date, time_slot, reason || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error blocking slot:", error);

    // Check if it's a unique constraint violation
    if (error.code === "23505") {
      return res.status(400).json({ error: "Este horário já está bloqueado" });
    }

    res.status(500).json({ error: "Erro ao bloquear horário" });
  }
});

// Unblock a time slot
app.delete("/api/blocked-slots/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    // Verify ownership
    const checkResult = await pool.query(
      "SELECT id FROM blocked_slots WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Bloqueio não encontrado" });
    }

    await pool.query("DELETE FROM blocked_slots WHERE id = $1", [id]);

    res.status(204).send();
  } catch (error) {
    console.error("Error unblocking slot:", error);
    res.status(500).json({ error: "Erro ao desbloquear horário" });
  }
});

// ===== SERVICES ROUTES =====

app.get("/api/services", authenticate, async (req, res) => {
  try {
    const servicesResult = await pool.query(`
      SELECT 
        s.*, sc.name as category_name
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY sc.name, s.name
    `);

    res.json(servicesResult.rows);
  } catch (error) {
    console.error("❌ Error fetching services:", error);
    res.status(500).json({ message: "Erro ao carregar serviços" });
  }
});

app.get("/api/service-categories", authenticate, async (req, res) => {
  try {
    const categoriesResult = await pool.query(`
      SELECT * FROM service_categories ORDER BY name
    `);

    res.json(categoriesResult.rows);
  } catch (error) {
    console.error("❌ Error fetching service categories:", error);
    res
      .status(500)
      .json({ message: "Erro ao carregar categorias de serviços" });
  }
});

app.post(
  "/api/service-categories",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      const categoryResult = await pool.query(
        `
      INSERT INTO service_categories (name, description)
      VALUES ($1, $2)
      RETURNING *
    `,
        [name.trim(), description?.trim() || null]
      );

      const category = categoryResult.rows[0];

      console.log("✅ Service category created:", category.id);

      res.status(201).json({
        message: "Categoria criada com sucesso",
        category,
      });
    } catch (error) {
      console.error("❌ Error creating service category:", error);
      res.status(500).json({ message: "Erro ao criar categoria" });
    }
  }
);

app.post(
  "/api/services",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { name, description, base_price, category_id, is_base_service } =
        req.body;

      if (!name || !base_price) {
        return res
          .status(400)
          .json({ message: "Nome e preço base são obrigatórios" });
      }

      if (
        isNaN(Number.parseFloat(base_price)) ||
        Number.parseFloat(base_price) <= 0
      ) {
        return res
          .status(400)
          .json({ message: "Preço base deve ser um número maior que zero" });
      }

      const serviceResult = await pool.query(
        `
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
        [
          name.trim(),
          description?.trim() || null,
          Number.parseFloat(base_price),
          category_id || null,
          is_base_service || false,
        ]
      );

      const service = serviceResult.rows[0];

      console.log("✅ Service created:", service.id);

      res.status(201).json({
        message: "Serviço criado com sucesso",
        service,
      });
    } catch (error) {
      console.error("❌ Error creating service:", error);
      res.status(500).json({ message: "Erro ao criar serviço" });
    }
  }
);

app.put(
  "/api/services/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, base_price, category_id, is_base_service } =
        req.body;

      // Get current service data
      const currentServiceResult = await pool.query(
        "SELECT * FROM services WHERE id = $1",
        [id]
      );
      if (currentServiceResult.rows.length === 0) {
        return res.status(404).json({ message: "Serviço não encontrado" });
      }

      if (!name || !base_price) {
        return res
          .status(400)
          .json({ message: "Nome e preço base são obrigatórios" });
      }

      if (
        isNaN(Number.parseFloat(base_price)) ||
        Number.parseFloat(base_price) <= 0
      ) {
        return res
          .status(400)
          .json({ message: "Preço base deve ser um número maior que zero" });
      }

      const updatedServiceResult = await pool.query(
        `
      UPDATE services 
      SET name = $1, description = $2, base_price = $3, category_id = $4, is_base_service = $5
      WHERE id = $6
      RETURNING *
    `,
        [
          name.trim(),
          description?.trim() || null,
          Number.parseFloat(base_price),
          category_id || null,
          is_base_service || false,
          id,
        ]
      );

      const updatedService = updatedServiceResult.rows[0];

      console.log("✅ Service updated:", id);

      res.json({
        message: "Serviço atualizado com sucesso",
        service: updatedService,
      });
    } catch (error) {
      console.error("❌ Error updating service:", error);
      res.status(500).json({ message: "Erro ao atualizar serviço" });
    }
  }
);

app.delete(
  "/api/services/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get service data before deletion
      const serviceResult = await pool.query(
        "SELECT * FROM services WHERE id = $1",
        [id]
      );
      if (serviceResult.rows.length === 0) {
        return res.status(404).json({ message: "Serviço não encontrado" });
      }

      // Check if service is being used in consultations
      const consultationCount = await pool.query(
        "SELECT COUNT(*) FROM consultations WHERE service_id = $1",
        [id]
      );
      if (Number.parseInt(consultationCount.rows[0].count) > 0) {
        return res.status(400).json({
          message:
            "Não é possível excluir serviço que possui consultas registradas",
        });
      }

      await pool.query("DELETE FROM services WHERE id = $1", [id]);

      console.log("✅ Service deleted:", id);

      res.json({ message: "Serviço excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting service:", error);
      res.status(500).json({ message: "Erro ao excluir serviço" });
    }
  }
);

// ===== PROFESSIONALS ROUTES =====

app.get("/api/professionals", authenticate, async (req, res) => {
  try {
    const professionalsResult = await pool.query(`
      SELECT 
        id, name, email, phone, address, address_number, address_complement,
        neighborhood, city, state, category_name, photo_url, crm, percentage, professional_type
      FROM users 
      WHERE 'professional' = ANY(roles) AND professional_type = 'convenio'
      ORDER BY name
    `);

    console.log("✅ Professionals fetched:", professionalsResult.rows.length);

    res.json(professionalsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching professionals:", error);
    res.status(500).json({ message: "Erro ao carregar profissionais" });
  }
});

// Professional signature routes
app.post(
  "/api/professionals/:id/signature",
  authenticate,
  createUpload().single("signature"),
  async (req, res) => {
    try {
      const professionalId = Number.parseInt(req.params.id);
      const userId = req.user.id;

      // Verify that the user is updating their own signature
      if (professionalId !== userId) {
        return res
          .status(403)
          .json({ message: "Você só pode alterar sua própria assinatura" });
      }

      // Verify that user has professional role
      if (!req.user.roles || !req.user.roles.includes("professional")) {
        return res.status(403).json({
          message: "Apenas profissionais podem ter assinatura digital",
        });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Arquivo de assinatura é obrigatório" });
      }

      console.log(
        "🔄 [SIGNATURE] Uploading signature for professional:",
        professionalId
      );
      console.log("🔄 [SIGNATURE] File info:", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path, // Cloudinary URL is in req.file.path
      });

      // Update user with signature URL (Cloudinary URL is in req.file.path)
      const result = await pool.query(
        "UPDATE users SET signature_url = $1, updated_at = NOW() WHERE id = $2 RETURNING signature_url",
        [req.file.path, professionalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      console.log(
        "✅ [SIGNATURE] Signature saved successfully:",
        result.rows[0].signature_url
      );

      res.json({
        message: "Assinatura digital salva com sucesso",
        signature_url: result.rows[0].signature_url,
      });
    } catch (error) {
      console.error("❌ [SIGNATURE] Error uploading signature:", error);
      res
        .status(500)
        .json({ message: "Erro interno do servidor ao salvar assinatura" });
    }
  }
);

app.get("/api/professionals/:id/signature", authenticate, async (req, res) => {
  try {
    const professionalId = Number.parseInt(req.params.id);
    const userId = req.user.id;

    // Verify that the user is accessing their own signature or is admin
    if (professionalId !== userId && !req.user.roles?.includes("admin")) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    console.log(
      "🔄 [SIGNATURE] Fetching signature for professional:",
      professionalId
    );

    const result = await pool.query(
      "SELECT signature_url FROM users WHERE id = $1 AND $2 = ANY(roles)",
      [professionalId, "professional"]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    console.log("✅ [SIGNATURE] Signature fetched successfully");

    res.json({
      signature_url: result.rows[0].signature_url,
    });
  } catch (error) {
    console.error("❌ [SIGNATURE] Error fetching signature:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar assinatura" });
  }
});

app.delete(
  "/api/professionals/:id/signature",
  authenticate,
  async (req, res) => {
    try {
      const professionalId = Number.parseInt(req.params.id);
      const userId = req.user.id;

      // Verify that the user is removing their own signature
      if (professionalId !== userId) {
        return res
          .status(403)
          .json({ message: "Você só pode remover sua própria assinatura" });
      }

      console.log(
        "🔄 [SIGNATURE] Removing signature for professional:",
        professionalId
      );

      // Remove signature URL from database
      const result = await pool.query(
        "UPDATE users SET signature_url = NULL, updated_at = NOW() WHERE id = $1 RETURNING id",
        [professionalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      console.log("✅ [SIGNATURE] Signature removed successfully");

      res.json({
        message: "Assinatura digital removida com sucesso",
      });
    } catch (error) {
      console.error("❌ [SIGNATURE] Error removing signature:", error);
      res
        .status(500)
        .json({ message: "Erro interno do servidor ao remover assinatura" });
    }
  }
);

app.post(
  "/api/upload-image",
  authenticate,
  createUpload().single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhuma imagem foi enviada" });
      }

      const userId = req.user.id;

      console.log("🔄 [UPLOAD] Uploading photo for user:", userId);
      console.log("📁 [UPLOAD] File info:", {
        filename: req.file.filename,
        size: req.file.size,
        path: req.file.path, // Cloudinary URL is in req.file.path
      });

      // Save photo URL to database
      const result = await pool.query(
        "UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, photo_url",
        [req.file.path, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const photoUrl = result.rows[0].photo_url;

      console.log("✅ [UPLOAD] Photo uploaded successfully:", photoUrl);

      res.json({
        message: "Foto de perfil atualizada com sucesso",
        photo_url: photoUrl,
      });
    } catch (error) {
      console.error("❌ [UPLOAD] Error uploading photo:", error);
      res.status(500).json({ message: "Erro ao fazer upload da foto" });
    }
  }
);

// ===== PRIVATE PATIENTS ROUTES =====

app.get(
  "/api/private-patients",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const locationsResult = await pool.query(
        `
      SELECT * FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY name
    `,
        [req.user.id]
      );

      res.json(locationsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching private patients:", error);
      res
        .status(500)
        .json({ message: "Erro ao carregar pacientes particulares" });
    }
  }
);

app.post(
  "/api/private-patients",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const {
        name,
        cpf,
        email,
        phone,
        birth_date,
        address,
        address_number,
        address_complement,
        neighborhood,
        city,
        state,
        zip_code,
      } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      // Validate CPF if provided
      if (cpf && !validateCPF(cpf)) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      // Validate email if provided
      if (email && !validateEmail(email)) {
        return res.status(400).json({ message: "Email inválido" });
      }

      const cleanCPF = cpf ? cpf.replace(/\D/g, "") : null;

      // Check if CPF already exists (if provided)
      if (cleanCPF) {
        const existingPatient = await pool.query(
          `
        SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2
      `,
          [cleanCPF, req.user.id]
        );

        if (existingPatient.rows.length > 0) {
          return res
            .status(409)
            .json({ message: "CPF já cadastrado para este profissional" });
        }
      }

      const patientResult = await pool.query(
        `
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address,
        address_number, address_complement, neighborhood, city, state, zip_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
        [
          req.user.id,
          name.trim(),
          cleanCPF,
          email?.trim() || null,
          phone?.replace(/\D/g, "") || null,
          birth_date || null,
          address?.trim() || null,
          address_number?.trim() || null,
          address_complement?.trim() || null,
          neighborhood?.trim() || null,
          city?.trim() || null,
          state || null,
          zip_code?.replace(/\D/g, "") || null,
        ]
      );

      const patient = patientResult.rows[0];

      console.log("✅ Private patient created:", patient.id);

      res.status(201).json({
        message: "Paciente criado com sucesso",
        patient,
      });
    } catch (error) {
      console.error("❌ Error creating private patient:", error);
      res.status(500).json({ message: "Erro ao criar paciente particular" });
    }
  }
);

app.put(
  "/api/private-patients/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        phone,
        birth_date,
        address,
        address_number,
        address_complement,
        neighborhood,
        city,
        state,
        zip_code,
      } = req.body;

      // Get current patient data
      const currentPatientResult = await pool.query(
        `
      SELECT * FROM private_patients WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (currentPatientResult.rows.length === 0) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      // Validate email if provided
      if (email && !validateEmail(email)) {
        return res.status(400).json({ message: "Email inválido" });
      }

      const updatedPatientResult = await pool.query(
        `
      UPDATE private_patients 
      SET 
        name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
        address_number = $6, address_complement = $7, neighborhood = $8,
        city = $9, state = $10, zip_code = $11, updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 AND professional_id = $13
      RETURNING *
    `,
        [
          name.trim(),
          email?.trim() || null,
          phone?.replace(/\D/g, "") || null,
          birth_date || null,
          address?.trim() || null,
          address_number?.trim() || null,
          address_complement?.trim() || null,
          neighborhood?.trim() || null,
          city?.trim() || null,
          state || null,
          zip_code?.replace(/\D/g, "") || null,
          id,
          req.user.id,
        ]
      );

      const updatedPatient = updatedPatientResult.rows[0];

      console.log("✅ Private patient updated:", id);

      res.json({
        message: "Paciente atualizado com sucesso",
        patient: updatedPatient,
      });
    } catch (error) {
      console.error("❌ Error updating private patient:", error);
      res
        .status(500)
        .json({ message: "Erro ao atualizar paciente particular" });
    }
  }
);

app.delete(
  "/api/private-patients/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get patient data before deletion
      const patientResult = await pool.query(
        `
      SELECT * FROM private_patients WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      // Check if patient has consultations
      const consultationCount = await pool.query(
        `
      SELECT COUNT(*) FROM consultations WHERE private_patient_id = $1
    `,
        [id]
      );

      if (Number.parseInt(consultationCount.rows[0].count) > 0) {
        return res.status(400).json({
          message:
            "Não é possível excluir paciente que possui consultas registradas",
        });
      }

      await pool.query(
        "DELETE FROM private_patients WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Private patient deleted:", id);

      res.json({ message: "Paciente excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting private patient:", error);
      res.status(500).json({ message: "Erro ao excluir paciente particular" });
    }
  }
);

// ===== ATTENDANCE LOCATIONS ROUTES =====

app.get(
  "/api/attendance-locations",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const locationsResult = await pool.query(
        `
      SELECT * FROM attendance_locations 
      WHERE professional_id = $1 
      ORDER BY is_default DESC, name
    `,
        [req.user.id]
      );

      res.json(locationsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching attendance locations:", error);
      res
        .status(500)
        .json({ message: "Erro ao carregar locais de atendimento" });
    }
  }
);

app.post(
  "/api/attendance-locations",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const {
        name,
        address,
        address_number,
        address_complement,
        neighborhood,
        city,
        state,
        zip_code,
        phone,
        is_default,
      } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      // If setting as default, remove default from other locations
      if (is_default) {
        await pool.query(
          `
        UPDATE attendance_locations SET is_default = false WHERE professional_id = $1
      `,
          [req.user.id]
        );
      }

      const locationResult = await pool.query(
        `
      INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `,
        [
          req.user.id,
          name.trim(),
          address?.trim() || null,
          address_number?.trim() || null,
          address_complement?.trim() || null,
          neighborhood?.trim() || null,
          city?.trim() || null,
          state || null,
          zip_code?.replace(/\D/g, "") || null,
          phone?.replace(/\D/g, "") || null,
          is_default || false,
        ]
      );

      const location = locationResult.rows[0];

      console.log("✅ Attendance location created:", location.id);

      res.status(201).json({
        message: "Local de atendimento criado com sucesso",
        location,
      });
    } catch (error) {
      console.error("❌ Error creating attendance location:", error);
      res.status(500).json({ message: "Erro ao criar local de atendimento" });
    }
  }
);

app.put(
  "/api/attendance-locations/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        address,
        address_number,
        address_complement,
        neighborhood,
        city,
        state,
        zip_code,
        phone,
        is_default,
      } = req.body;

      // Get current location data
      const currentLocationResult = await pool.query(
        `
      SELECT * FROM attendance_locations WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (currentLocationResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Local de atendimento não encontrado" });
      }

      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      // If setting as default, remove default from other locations
      if (is_default) {
        await pool.query(
          `
        UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2
      `,
          [req.user.id, id]
        );
      }

      const updatedLocationResult = await pool.query(
        `
      UPDATE attendance_locations 
      SET 
        name = $1, address = $2, address_number = $3, address_complement = $4,
        neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9, is_default = $10
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `,
        [
          name.trim(),
          address?.trim() || null,
          address_number?.trim() || null,
          address_complement?.trim() || null,
          neighborhood?.trim() || null,
          city?.trim() || null,
          state || null,
          zip_code?.replace(/\D/g, "") || null,
          phone?.replace(/\D/g, "") || null,
          is_default || false,
          id,
          req.user.id,
        ]
      );

      const updatedLocation = updatedLocationResult.rows[0];

      console.log("✅ Attendance location updated:", id);

      res.json({
        message: "Local de atendimento atualizado com sucesso",
        location: updatedLocation,
      });
    } catch (error) {
      console.error("❌ Error updating attendance location:", error);
      res
        .status(500)
        .json({ message: "Erro ao atualizar local de atendimento" });
    }
  }
);

app.delete(
  "/api/attendance-locations/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get location data before deletion
      const locationResult = await pool.query(
        `
      SELECT * FROM attendance_locations WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (locationResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Local de atendimento não encontrado" });
      }

      await pool.query(
        "DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Attendance location deleted:", id);

      res.json({ message: "Local de atendimento excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting attendance location:", error);
      res.status(500).json({ message: "Erro ao excluir local de atendimento" });
    }
  }
);

// ===== MEDICAL RECORDS ROUTES =====

app.get(
  "/api/medical-records",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const recordsResult = await pool.query(
        `
      SELECT 
        mr.*,
        COALESCE(pp.name, mr.patient_name) as patient_name,
        COALESCE(pp.cpf, mr.patient_cpf) as patient_cpf
      FROM medical_records mr
      LEFT JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC
    `,
        [req.user.id]
      );

      res.json(recordsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching medical records:", error);
      res.status(500).json({ message: "Erro ao carregar prontuários" });
    }
  }
);

app.post(
  "/api/medical-records",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const {
        patient_type = "private",
        patient_name,
        patient_cpf,
        private_patient_id,
        chief_complaint,
        history_present_illness,
        past_medical_history,
        medications,
        allergies,
        physical_examination,
        diagnosis,
        treatment_plan,
        notes,
        vital_signs,
      } = req.body;

      // Validate patient data based on type
      if (patient_type === "private") {
        if (!private_patient_id) {
          return res
            .status(400)
            .json({ message: "Paciente particular é obrigatório" });
        }

        // Validate patient belongs to professional
        const patientResult = await pool.query(
          `SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2`,
          [private_patient_id, req.user.id]
        );

        if (patientResult.rows.length === 0) {
          return res.status(404).json({ message: "Paciente não encontrado" });
        }
      } else {
        // Convenio patient
        if (!patient_name) {
          return res
            .status(400)
            .json({ message: "Nome do paciente é obrigatório" });
        }
      }

      const recordResult = await pool.query(
        `
      INSERT INTO medical_records (
        professional_id, private_patient_id, patient_name, patient_cpf, patient_type,
        chief_complaint, history_present_illness, past_medical_history, medications, 
        allergies, physical_examination, diagnosis, treatment_plan, notes, vital_signs
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `,
        [
          req.user.id,
          private_patient_id || null,
          patient_name?.trim() || null,
          patient_cpf?.replace(/\D/g, "") || null,
          patient_type,
          chief_complaint?.trim() || null,
          history_present_illness?.trim() || null,
          past_medical_history?.trim() || null,
          medications?.trim() || null,
          allergies?.trim() || null,
          physical_examination?.trim() || null,
          diagnosis?.trim() || null,
          treatment_plan?.trim() || null,
          notes?.trim() || null,
          vital_signs ? JSON.stringify(vital_signs) : null,
        ]
      );

      const record = recordResult.rows[0];

      console.log("✅ Medical record created:", record.id);

      res.status(201).json({
        message: "Prontuário criado com sucesso",
        record,
      });
    } catch (error) {
      console.error("❌ Error creating medical record:", error);
      res.status(500).json({ message: "Erro ao criar prontuário" });
    }
  }
);

app.put(
  "/api/medical-records/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        patient_type,
        patient_name,
        patient_cpf,
        private_patient_id,
        chief_complaint,
        history_present_illness,
        past_medical_history,
        medications,
        allergies,
        physical_examination,
        diagnosis,
        treatment_plan,
        notes,
        vital_signs,
      } = req.body;

      // Get current record data
      const currentRecordResult = await pool.query(
        `
      SELECT * FROM medical_records WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (currentRecordResult.rows.length === 0) {
        return res.status(404).json({ message: "Prontuário não encontrado" });
      }

      const updatedRecordResult = await pool.query(
        `
      UPDATE medical_records 
      SET 
        patient_type = COALESCE($1, patient_type),
        patient_name = COALESCE($2, patient_name),
        patient_cpf = COALESCE($3, patient_cpf),
        private_patient_id = COALESCE($4, private_patient_id),
        chief_complaint = $5, 
        history_present_illness = $6, 
        past_medical_history = $7,
        medications = $8, 
        allergies = $9, 
        physical_examination = $10,
        diagnosis = $11, 
        treatment_plan = $12, 
        notes = $13, 
        vital_signs = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15 AND professional_id = $16
      RETURNING *
    `,
        [
          patient_type || null,
          patient_name?.trim() || null,
          patient_cpf?.trim() || null,
          private_patient_id || null,
          chief_complaint?.trim() || null,
          history_present_illness?.trim() || null,
          past_medical_history?.trim() || null,
          medications?.trim() || null,
          allergies?.trim() || null,
          physical_examination?.trim() || null,
          diagnosis?.trim() || null,
          treatment_plan?.trim() || null,
          notes?.trim() || null,
          vital_signs ? JSON.stringify(vital_signs) : null,
          id,
          req.user.id,
        ]
      );

      const updatedRecord = updatedRecordResult.rows[0];

      console.log("✅ Medical record updated:", id);

      res.json({
        message: "Prontuário atualizado com sucesso",
        record: updatedRecord,
      });
    } catch (error) {
      console.error("❌ Error updating medical record:", error);
      res.status(500).json({ message: "Erro ao atualizar prontuário" });
    }
  }
);

app.delete(
  "/api/medical-records/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get record data before deletion
      const recordResult = await pool.query(
        `
      SELECT * FROM medical_records WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (recordResult.rows.length === 0) {
        return res.status(404).json({ message: "Prontuário não encontrado" });
      }

      await pool.query(
        "DELETE FROM medical_records WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Medical record deleted:", id);

      res.json({ message: "Prontuário excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting medical record:", error);
      res.status(500).json({ message: "Erro ao excluir prontuário" });
    }
  }
);

// Generate medical record document
app.post(
  "/api/medical-records/generate-document",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { record_id, template_data } = req.body;

      if (!record_id || !template_data) {
        return res.status(400).json({
          message: "ID do prontuário e dados do template são obrigatórios",
        });
      }

      // Validate record belongs to professional
      const recordResult = await pool.query(
        `
      SELECT mr.*, pp.name as patient_name, pp.cpf as patient_cpf
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.id = $1 AND mr.professional_id = $2
    `,
        [record_id, req.user.id]
      );

      if (recordResult.rows.length === 0) {
        return res.status(404).json({ message: "Prontuário não encontrado" });
      }

      const record = recordResult.rows[0];

      // Generate document
      const documentData = await generateDocumentPDF("medical_record", {
        ...template_data,
        patientName: record.patient_name,
        patientCpf: record.patient_cpf,
        ...record,
      });

      // Save document reference
      const documentResult = await pool.query(
        `
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url, template_data
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
        [
          req.user.id,
          record.private_patient_id,
          `Prontuário - ${record.patient_name}`,
          "medical_record",
          documentData.url,
          JSON.stringify(template_data),
        ]
      );

      console.log(
        "✅ Medical record document generated:",
        documentResult.rows[0].id
      );

      res.json({
        message: "Documento gerado com sucesso",
        documentUrl: documentData.url,
        document: documentResult.rows[0],
      });
    } catch (error) {
      console.error("❌ Error generating medical record document:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar documento do prontuário" });
    }
  }
);

// ===== MEDICAL DOCUMENTS ROUTES =====

app.get(
  "/api/documents/medical",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const professionalId = req.user.id;

      console.log(
        "🔄 Fetching medical documents for professional:",
        professionalId
      );

      const result = await pool.query(
        `SELECT 
        md.id,
        md.title,
        md.document_type,
        md.document_url,
        md.created_at,
        COALESCE(pp.name, md.patient_name) as patient_name,
        COALESCE(pp.cpf, md.patient_cpf) as patient_cpf
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC`,
        [professionalId]
      );

      console.log("✅ Medical documents loaded:", result.rows.length);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching medical documents:", error);
      res.status(500).json({
        message: "Erro ao carregar documentos médicos",
        error: error.message,
      });
    }
  }
);

app.post(
  "/api/documents/medical",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const {
        title,
        document_type,
        private_patient_id,
        patient_name,
        patient_cpf,
        template_data,
      } = req.body;
      const professionalId = req.user.id;

      console.log("🔄 Creating medical document:", {
        title,
        document_type,
        private_patient_id,
        patient_name,
        patient_cpf,
        professionalId,
      });

      // Validate required fields
      if (!title || !document_type || !template_data) {
        console.log("❌ Missing required fields");
        return res.status(400).json({
          message:
            "Título, tipo de documento e dados do template são obrigatórios",
        });
      }

      // Validate patient data - either private_patient_id OR patient_name is required
      if (!private_patient_id && !patient_name) {
        return res.status(400).json({
          message:
            "É necessário informar um paciente particular ou dados do paciente do convênio",
        });
      }

      let patientData = { name: "", cpf: "" };

      if (private_patient_id) {
        // Verify patient belongs to professional
        const patientCheck = await pool.query(
          "SELECT id, name, cpf FROM private_patients WHERE id = $1 AND professional_id = $2",
          [private_patient_id, professionalId]
        );

        if (patientCheck.rows.length === 0) {
          console.log("❌ Patient not found or not owned by professional");
          return res.status(404).json({ message: "Paciente não encontrado" });
        }

        patientData = patientCheck.rows[0];
      } else {
        // Convenio patient data
        patientData = {
          name: patient_name,
          cpf: patient_cpf || "",
        };
      }

      console.log("✅ Patient data:", patientData.name);

      // Generate document using the document generator
      try {
        const { generateDocumentPDF } = await import(
          "./utils/documentGenerator.js"
        );

        // Prepare complete template data
        const completeTemplateData = {
          ...template_data,
          patientName: patientData.name,
          patientCpf: patientData.cpf || "",
          professionalName: template_data.professionalName || req.user.name,
          professionalSpecialty: template_data.professionalSpecialty || "",
          crm: template_data.crm || "",
        };

        console.log("🔄 Generating document with data:", completeTemplateData);
        const documentResult = await generateDocumentPDF(
          document_type,
          completeTemplateData
        );
        console.log("✅ Document generated:", documentResult.url);

        // Save document record to database
        console.log("🔄 Saving document to database with data:", {
          professionalId,
          private_patient_id: private_patient_id || null,
          patient_name: patientData.name,
          patient_cpf: patientData.cpf || null,
          title,
          document_type,
        });

        const result = await pool.query(
          `INSERT INTO medical_documents (
          professional_id, private_patient_id, patient_name, patient_cpf, title, document_type, 
          document_url, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) 
        RETURNING *`,
          [
            professionalId,
            private_patient_id || null,
            patientData.name,
            patientData.cpf || null,
            title,
            document_type,
            documentResult.url,
          ]
        );

        console.log("✅ Medical document saved to database:", result.rows[0]);
        res.status(201).json({
          document: result.rows[0],
          title,
          documentUrl: documentResult.url,
        });
      } catch (docError) {
        console.error("❌ Error generating document:", docError);
        res.status(500).json({
          message: "Erro ao gerar documento",
          error: docError.message,
        });
      }
    } catch (error) {
      console.error("❌ Error creating medical document:", error);
      res.status(500).json({
        message: "Erro ao criar documento médico",
        error: error.message,
      });
    }
  }
);

app.delete(
  "/api/documents/medical/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const professionalId = req.user.id;

      console.log("🔄 Deleting medical document:", id);

      const result = await pool.query(
        "DELETE FROM medical_documents WHERE id = $1 AND professional_id = $2 RETURNING *",
        [id, professionalId]
      );

      if (result.rows.length === 0) {
        console.log("❌ Medical document not found");
        return res.status(404).json({ message: "Documento não encontrado" });
      }

      console.log("✅ Medical document deleted:", result.rows[0]);
      res.json({ message: "Documento excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting medical document:", error);
      res
        .status(500)
        .json({ message: "Erro ao excluir documento", error: error.message });
    }
  }
);

// ===== SCHEDULING ACCESS ROUTES =====

// Get scheduling access status for current professional
app.get(
  "/api/professional/scheduling-access",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const professionalId = req.user.id;

      console.log(
        "🔍 [ACCESS-CHECK] Checking scheduling access for professional:",
        professionalId
      );

      const accessStatus = await getSchedulingAccessStatus(professionalId);

      console.log("✅ [ACCESS-CHECK] Access status:", accessStatus);

      res.json(accessStatus);
    } catch (error) {
      console.error("❌ [ACCESS-CHECK] Error checking access:", error);
      res.status(500).json({ message: "Erro ao verificar acesso à agenda" });
    }
  }
);

app.get(
  "/api/admin/professionals-scheduling-access",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const professionalsResult = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.category_name,
        sa.expires_at as access_expires_at,
        sa.reason as access_reason,
        sa.created_at as access_granted_at,
        granted_by_user.name as access_granted_by,
        CASE 
          WHEN sa.expires_at > CURRENT_TIMESTAMP AND sa.is_active = true THEN true
          ELSE false
        END as has_scheduling_access
      FROM users u
      LEFT JOIN scheduling_access sa ON u.id = sa.professional_id AND sa.is_active = true
      LEFT JOIN users granted_by_user ON sa.granted_by = granted_by_user.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

      res.json(professionalsResult.rows);
    } catch (error) {
      console.error(
        "❌ Error fetching professionals scheduling access:",
        error
      );
      res.status(500).json({
        message: "Erro ao carregar acesso à agenda dos profissionais",
      });
    }
  }
);

app.post(
  "/api/admin/grant-scheduling-access",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { professional_id, expires_at, reason } = req.body;

      if (!professional_id || !expires_at) {
        return res.status(400).json({
          message: "ID do profissional e data de expiração são obrigatórios",
        });
      }

      // Validate professional exists
      const professionalResult = await pool.query(
        `
      SELECT id, name FROM users WHERE id = $1 AND 'professional' = ANY(roles)
    `,
        [professional_id]
      );

      if (professionalResult.rows.length === 0) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      // Deactivate any existing access
      await pool.query(
        `
      UPDATE scheduling_access SET is_active = false WHERE professional_id = $1
    `,
        [professional_id]
      );

      // Grant new access
      const accessResult = await pool.query(
        `
      INSERT INTO scheduling_access (professional_id, granted_by, expires_at, reason)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
        [professional_id, req.user.id, expires_at, reason?.trim() || null]
      );

      const access = accessResult.rows[0];

      console.log("✅ Scheduling access granted:", access.id);

      // Create notification for professional
      await pool.query(
        `
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
    `,
        [
          professional_id,
          "Acesso à Agenda Concedido",
          `Você recebeu acesso à agenda até ${new Date(
            expires_at
          ).toLocaleDateString("pt-BR")}. ${reason ? `Motivo: ${reason}` : ""}`,
          "success",
        ]
      );

      res.json({
        message: "Acesso à agenda concedido com sucesso",
        access,
      });
    } catch (error) {
      console.error("❌ Error granting scheduling access:", error);
      res.status(500).json({ message: "Erro ao conceder acesso à agenda" });
    }
  }
);

app.post(
  "/api/admin/revoke-scheduling-access",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { professional_id } = req.body;

      if (!professional_id) {
        return res
          .status(400)
          .json({ message: "ID do profissional é obrigatório" });
      }

      // Revoke access
      const revokeResult = await pool.query(
        `
      UPDATE scheduling_access 
      SET is_active = false 
      WHERE professional_id = $1 AND is_active = true
      RETURNING *
    `,
        [professional_id]
      );

      if (revokeResult.rows.length === 0) {
        return res.status(404).json({
          message: "Acesso ativo não encontrado para este profissional",
        });
      }

      console.log(
        "✅ Scheduling access revoked for professional:",
        professional_id
      );

      // Create notification for professional
      await pool.query(
        `
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
    `,
        [
          professional_id,
          "Acesso à Agenda Revogado",
          "Seu acesso à agenda foi revogado pelo administrador.",
          "warning",
        ]
      );

      res.json({ message: "Acesso à agenda revogado com sucesso" });
    } catch (error) {
      console.error("❌ Error revoking scheduling access:", error);
      res.status(500).json({ message: "Erro ao revogar acesso à agenda" });
    }
  }
);

// ===== PAYMENT ROUTES (MERCADOPAGO SDK V2) =====

app.get(
  "/api/validate-coupon/:code",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
    try {
      const { code } = req.params;
      const { type } = req.query;

      const couponResult = await pool.query(
        `SELECT id, code, discount_type, discount_value, is_active, coupon_type, unlimited_use, valid_until
         FROM coupons
         WHERE UPPER(code) = UPPER($1)`,
        [code]
      );

      if (couponResult.rows.length === 0) {
        return res.status(404).json({
          valid: false,
          message: "Cupom inválido",
        });
      }

      const coupon = couponResult.rows[0];

      if (!coupon.is_active) {
        return res.status(400).json({
          valid: false,
          message: "Cupom inválido",
        });
      }

      // Check if coupon is expired
      if (coupon.valid_until) {
        const expiryDate = new Date(coupon.valid_until);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (expiryDate < today) {
          return res.status(400).json({
            valid: false,
            message: "Este cupom expirou",
          });
        }
      }

      if (type && coupon.coupon_type !== type) {
        return res.status(400).json({
          valid: false,
          message: `Este cupom é válido apenas para ${coupon.coupon_type === 'titular' ? 'assinatura do titular' : 'ativação de dependentes'}`,
        });
      }

      res.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: parseFloat(coupon.discount_value),
          coupon_type: coupon.coupon_type,
          unlimited_use: coupon.unlimited_use,
        },
      });
    } catch (error) {
      console.error("❌ Error validating coupon:", error);
      res.status(500).json({ message: "Erro ao validar cupom" });
    }
  }
);

app.post(
  "/api/create-subscription",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
    try {
      const { user_id, coupon_code } = req.body;

      // Validate user can only create subscription for themselves
      if (req.user.id !== user_id) {
        return res.status(403).json({
          message: "Você só pode criar assinatura para sua própria conta",
        });
      }

      // Get user data
      const userResult = await pool.query(
        `
      SELECT * FROM users WHERE id = $1
    `,
        [user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const user = userResult.rows[0];

      // Check if user already has active subscription
      if (user.subscription_status === "active") {
        return res
          .status(400)
          .json({ message: "Usuário já possui assinatura ativa" });
      }

      let finalPrice = 600.0;
      let couponId = null;
      let discountApplied = 0;

      if (coupon_code) {
        const couponResult = await pool.query(
          `SELECT id, code, discount_type, discount_value, is_active
           FROM coupons
           WHERE UPPER(code) = UPPER($1) AND is_active = true`,
          [coupon_code]
        );

        if (couponResult.rows.length > 0) {
          const coupon = couponResult.rows[0];
          couponId = coupon.id;

          if (coupon.discount_type === 'fixed') {
            discountApplied = parseFloat(coupon.discount_value);
            finalPrice = Math.max(0, finalPrice - discountApplied);
          }

          console.log(`✅ Coupon ${coupon_code} applied: R$ ${discountApplied} discount`);
        }
      }

      console.log("🔄 Creating subscription payment for user:", user_id);
      console.log("💰 Final price:", finalPrice);

      const preference = new Preference(client);
      const urls = getProductionUrls();

      const preferenceData = {
        items: [
          {
            title: "Assinatura Cartão Quiro Ferreira",
            description: coupon_code
              ? `Ativação da assinatura anual do cartão de convênio (Cupom ${coupon_code} aplicado)`
              : "Ativação da assinatura anual do cartão de convênio",
            quantity: 1,
            unit_price: finalPrice,
            currency_id: "BRL",
          },
        ],
        back_urls: {
          success: urls.client.success,
          failure: urls.client.failure,
          pending: urls.client.pending,
        },
        notification_url: urls.webhook,
        external_reference: `subscription_${user_id}_${Date.now()}`,
        statement_descriptor: "QUIRO FERREIRA",
        expires: false,
        payer: {
          name: user.name,
          email: user.email || `user${user_id}@temp.com`,
          identification: {
            type: "CPF",
            number: user.cpf,
          },
        },
      };

      // Only add auto_return in production (sandbox doesn't accept localhost URLs)
      if (urls.isProduction) {
        preferenceData.auto_return = "approved";
      }

      const subscriptionResult = await preference.create({
        body: preferenceData,
      });

      console.log(
        "📦 MercadoPago response (subscription):",
        subscriptionResult
      );

      const preferenceId =
        subscriptionResult?.body?.id ?? subscriptionResult?.id ?? null;

      const initPoint =
        subscriptionResult?.body?.init_point ??
        subscriptionResult?.body?.sandbox_init_point ??
        subscriptionResult?.init_point ??
        null;

      console.log("✅ Subscription preference created:", {
        preferenceId,
        initPoint,
      });

      const paymentReference = `subscription_${user_id}_${Date.now()}`;

      // Save payment record
      await pool.query(
        `
      INSERT INTO client_payments (user_id, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5)
    `,
        [
          user_id,
          finalPrice,
          "pending",
          preferenceId,
          paymentReference,
        ]
      );

      if (couponId && discountApplied > 0) {
        await pool.query(
          `INSERT INTO coupon_usage (coupon_id, user_id, payment_reference, discount_applied)
           VALUES ($1, $2, $3, $4)`,
          [couponId, user_id, paymentReference, discountApplied]
        );
        console.log(`✅ Coupon usage recorded for user ${user_id}`);
      }

      res.json({
        preference_id: preferenceId,
        init_point: initPoint,
      });
    } catch (error) {
      console.error("❌ Error creating subscription:", error);
      res
        .status(500)
        .json({ message: "Erro ao criar pagamento da assinatura" });
    }
  }
);

app.post(
  "/api/dependents/:id/create-payment",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
    try {
      const { id: dependent_id } = req.params;
      const { coupon_code } = req.body;

      const dependentResult = await pool.query(
        `
      SELECT d.*, u.name as client_name, u.email as client_email, u.cpf as client_cpf
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1 AND d.user_id = $2
    `,
        [dependent_id, req.user.id]
      );

      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: "Dependente não encontrado" });
      }

      const dependent = dependentResult.rows[0];

      if (dependent.subscription_status === "active") {
        return res
          .status(400)
          .json({ message: "Dependente já possui assinatura ativa" });
      }

      let finalPrice = 100.0;
      let couponId = null;
      let discountApplied = 0;

      if (coupon_code) {
        const couponResult = await pool.query(
          `SELECT id, code, discount_type, discount_value, is_active, coupon_type, unlimited_use
           FROM coupons
           WHERE UPPER(code) = UPPER($1) AND is_active = true AND coupon_type = 'dependente'`,
          [coupon_code]
        );

        if (couponResult.rows.length > 0) {
          const coupon = couponResult.rows[0];
          couponId = coupon.id;

          if (coupon.discount_type === 'fixed') {
            discountApplied = parseFloat(coupon.discount_value);
            finalPrice = Math.max(0, finalPrice - discountApplied);
          }

          console.log(`✅ Coupon ${coupon_code} applied to dependent: R$ ${discountApplied} discount`);
        }
      }

      console.log("🔄 Creating dependent payment for dependent:", dependent_id);
      console.log("💰 Final price:", finalPrice);

      const preference = new Preference(client);
      const urls = getProductionUrls();

      const preferenceData = {
        items: [
          {
            title: `Ativação de Dependente - ${dependent.name}`,
            description: coupon_code
              ? `Ativação de dependente no cartão de convênio (Cupom ${coupon_code} aplicado)`
              : "Ativação de dependente no cartão de convênio",
            quantity: 1,
            unit_price: finalPrice,
            currency_id: "BRL",
          },
        ],
        back_urls: {
          success: urls.dependent.success,
          failure: urls.dependent.failure,
          pending: urls.dependent.pending,
        },
        notification_url: urls.webhook,
        external_reference: `dependent_${dependent_id}_${Date.now()}`,
        statement_descriptor: "QUIRO FERREIRA",
        expires: false,
        payer: {
          name: dependent.client_name,
          email:
            dependent.client_email || `client${dependent.user_id}@temp.com`,
          identification: {
            type: "CPF",
            number: dependent.client_cpf,
          },
        },
      };

      // Only add auto_return in production (sandbox doesn't accept localhost URLs)
      if (urls.isProduction) {
        preferenceData.auto_return = "approved";
      }

      const dependentPaymentResult = await preference.create({
        body: preferenceData,
      });

      console.log(
        "📦 MercadoPago response (dependent):",
        dependentPaymentResult
      );

      const preferenceId =
        dependentPaymentResult?.body?.id ?? dependentPaymentResult?.id ?? null;

      const initPoint =
        dependentPaymentResult?.body?.init_point ??
        dependentPaymentResult?.body?.sandbox_init_point ??
        dependentPaymentResult?.init_point ??
        null;

      console.log("✅ Dependent preference created:", {
        preferenceId,
        initPoint,
      });

      const paymentReference = `dependent_${dependent_id}_${Date.now()}`;

      await pool.query(
        `
      INSERT INTO dependent_payments (dependent_id, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5)
    `,
        [
          dependent_id,
          finalPrice,
          "pending",
          preferenceId,
          paymentReference,
        ]
      );

      if (couponId && discountApplied > 0) {
        await pool.query(
          `INSERT INTO coupon_usage (coupon_id, user_id, payment_reference, discount_applied)
           VALUES ($1, $2, $3, $4)`,
          [couponId, req.user.id, paymentReference, discountApplied]
        );
        console.log(`✅ Coupon usage recorded for dependent ${dependent_id}`);
      }

      res.json({
        preference_id: preferenceId,
        init_point: initPoint,
      });
    } catch (error) {
      console.error("❌ Error creating dependent payment:", error);
      res
        .status(500)
        .json({ message: "Erro ao criar pagamento do dependente" });
    }
  }
);

app.post(
  "/api/professional/create-payment",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res
          .status(400)
          .json({ message: "Valor deve ser maior que zero" });
      }

      console.log("🔄 Creating professional payment for amount:", amount);

      const preference = new Preference(client);
      const urls = getProductionUrls();

      const preferenceData = {
        items: [
          {
            title: "Repasse ao Convênio Quiro Ferreira",
            description: "Pagamento de repasse mensal ao convênio",
            quantity: 1,
            unit_price: Number.parseFloat(amount),
            currency_id: "BRL",
          },
        ],
        back_urls: {
          success: urls.professional.success,
          failure: urls.professional.failure,
          pending: urls.professional.pending,
        },
        notification_url: urls.webhook,
        external_reference: `professional_${req.user.id}_${Date.now()}`,
        statement_descriptor: "QUIRO FERREIRA",
        expires: false,
        payer: {
          name: req.user.name,
          email: req.user.email || `professional${req.user.id}@temp.com`,
        },
      };

      // Only add auto_return in production (sandbox doesn't accept localhost URLs)
      if (urls.isProduction) {
        preferenceData.auto_return = "approved";
      }

      const professionalResult = await preference.create({
        body: preferenceData,
      });

      console.log(
        "📦 MercadoPago response (professional):",
        professionalResult
      );

      const preferenceId =
        professionalResult?.body?.id ?? professionalResult?.id ?? null;

      const initPoint =
        professionalResult?.body?.init_point ??
        professionalResult?.body?.sandbox_init_point ??
        professionalResult?.init_point ??
        null;

      console.log("✅ Professional preference created:", {
        preferenceId,
        initPoint,
      });

      // Save payment record
      await pool.query(
        `
      INSERT INTO professional_payments (professional_id, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5)
    `,
        [
          req.user.id,
          Number.parseFloat(amount),
          "pending",
          preferenceId,
          `professional_${req.user.id}_${Date.now()}`,
        ]
      );

      res.json({
        preference_id: preferenceId,
        init_point: initPoint,
      });
    } catch (error) {
      console.error("❌ Error creating professional payment:", error);
      res
        .status(500)
        .json({ message: "Erro ao criar pagamento do profissional" });
    }
  }
);

app.post(
  "/api/professional/create-agenda-payment",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      // Agenda payment is always for 1 MONTH (30 days)
      const duration_days = 30; // Always 1 month

      console.log("🔄 Creating agenda payment for 1 MONTH (30 days)");

      const preference = new Preference(client);
      const urls = getProductionUrls();

      const preferenceData = {
        items: [
          {
            title: "Acesso à Agenda - Quiro Ferreira",
            description:
              "Assinatura mensal do sistema de agendamentos (30 dias)",
            quantity: 1,
            unit_price: 24.99,
            currency_id: "BRL",
          },
        ],
        back_urls: {
          success: urls.agenda.success,
          failure: urls.agenda.failure,
          pending: urls.agenda.pending,
        },
        notification_url: urls.webhook,
        external_reference: `agenda_${
          req.user.id
        }_${duration_days}_${Date.now()}`,
        statement_descriptor: "QUIRO FERREIRA",
        expires: false,
        // Adicionar URLs de notificação alternativas para mobile
        additional_info: JSON.stringify({
          webhook_urls: [urls.webhook, urls.webhookAlt],
        }),
        payer: {
          name: req.user.name,
          email: req.user.email || `professional${req.user.id}@temp.com`,
        },
      };

      // Only add auto_return in production (sandbox doesn't accept localhost URLs)
      if (urls.isProduction) {
        preferenceData.auto_return = "approved";
      }

      const agendaResult = await preference.create({ body: preferenceData });

      console.log("📦 MercadoPago response (agenda):", agendaResult);

      const preferenceId = agendaResult?.body?.id ?? agendaResult?.id ?? null;

      const initPoint =
        agendaResult?.body?.init_point ??
        agendaResult?.body?.sandbox_init_point ??
        agendaResult?.init_point ??
        null;

      console.log("✅ Agenda preference created:", { preferenceId, initPoint });

      // Save payment record
      await pool.query(
        `
      INSERT INTO agenda_payments (professional_id, duration_days, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
        [
          req.user.id,
          duration_days,
          24.99,
          "pending",
          preferenceId,
          `agenda_${req.user.id}_${duration_days}_${Date.now()}`,
        ]
      );

      res.json({
        preference_id: preferenceId,
        init_point: initPoint,
      });
    } catch (error) {
      console.error("❌ Error creating agenda payment:", error);
      res.status(500).json({ message: "Erro ao criar pagamento da agenda" });
    }
  }
);

// Add webhook logging middleware
app.use("/api/webhooks", (req, res, next) => {
  console.log("🔔 [WEBHOOK-MIDDLEWARE] Incoming webhook request");
  console.log("🔔 [WEBHOOK-MIDDLEWARE] Method:", req.method);
  console.log("🔔 [WEBHOOK-MIDDLEWARE] URL:", req.url);
  console.log(
    "🔔 [WEBHOOK-MIDDLEWARE] Headers:",
    JSON.stringify(req.headers, null, 2)
  );
  console.log("🔔 [WEBHOOK-MIDDLEWARE] User-Agent:", req.get("User-Agent"));
  console.log("🔔 [WEBHOOK-MIDDLEWARE] Content-Type:", req.get("Content-Type"));
  console.log(
    "🔔 [WEBHOOK-MIDDLEWARE] Content-Length:",
    req.get("Content-Length")
  );
  next();
});

// ===== MERCADOPAGO WEBHOOK =====

app.use("/api/webhook*", (req, res, next) => {
  console.log("🔔 [WEBHOOK-MIDDLEWARE] Incoming webhook request");
  console.log("🔔 [WEBHOOK-MIDDLEWARE] Method:", req.method);
  console.log("🔔 [WEBHOOK-MIDDLEWARE] URL:", req.url);
  console.log(
    "🔔 [WEBHOOK-MIDDLEWARE] Headers:",
    JSON.stringify(req.headers, null, 2)
  );
  console.log("🔔 [WEBHOOK-MIDDLEWARE] User-Agent:", req.get("User-Agent"));
  console.log("🔔 [WEBHOOK-MIDDLEWARE] Content-Type:", req.get("Content-Type"));
  next();
});

app.post("/api/webhooks/payment-success", express.json(), async (req, res) => {
  try {
    console.log("🔔 [WEBHOOK] MercadoPago webhook received");
    console.log("🔔 [WEBHOOK] Query params:", req.query);
    console.log("🔔 [WEBHOOK] Body:", req.body);
    console.log("🔔 [WEBHOOK] Headers:", req.headers);

    let paymentId = null;
    let topic = null;

    if (req.query.id) {
      paymentId = req.query.id;
      topic = req.query.topic || "payment";
      console.log("💰 [WEBHOOK] Payment ID from query params:", paymentId);
    } else if (req.query["data.id"]) {
      paymentId = req.query["data.id"];
      topic = req.query.type || "payment";
      console.log("💰 [WEBHOOK] Payment ID from data.id:", paymentId);
    } else if (req.body?.data?.id) {
      paymentId = req.body.data.id;
      topic = req.body.type || "payment";
      console.log("💰 [WEBHOOK] Payment ID from body:", paymentId);
    }

    if (!paymentId) {
      console.log("⚠️ [WEBHOOK] No payment ID found, ignoring");
      return res.status(200).json({ received: true });
    }

    if (topic !== "payment") {
      console.log(`ℹ️ [WEBHOOK] Non-payment topic: ${topic}, ignoring`);
      return res.status(200).json({ received: true });
    }

    console.log(`💰 [WEBHOOK] Processing payment ID: ${paymentId}`);

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      }
    );

    if (!paymentResponse.ok) {
      console.error(
        `❌ [WEBHOOK] Failed to fetch payment from MP API: ${paymentResponse.status}`
      );
      return res.status(200).json({ received: true });
    }

    const payment = await paymentResponse.json();
    console.log("💰 [WEBHOOK] Payment details:", {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      external_reference: payment.external_reference,
      metadata: payment.metadata,
      transaction_amount: payment.transaction_amount,
    });

    const { status, external_reference, metadata } = payment;

    if (!external_reference) {
      console.error("❌ [WEBHOOK] No external_reference found");
      return res.status(200).json({ received: true });
    }

    if (status === "approved") {
      console.log(`✅ [WEBHOOK] Payment approved for: ${external_reference}`);

      if (external_reference.startsWith("subscription_")) {
        const userId = Number.parseInt(
          external_reference.replace("subscription_", "")
        );
        await processClientPayment(userId, payment);
      } else if (external_reference.startsWith("dependent_")) {
        const dependentId = Number.parseInt(
          external_reference.replace("dependent_", "")
        );
        await processDependentPayment(dependentId, payment);
      } else if (external_reference.startsWith("agenda_")) {
        const professionalId = Number.parseInt(
          external_reference.split("_")[1]
        );
        await processAgendaPayment(professionalId, payment);
      } else if (external_reference.startsWith("professional_")) {
        const professionalId = Number.parseInt(
          external_reference.split("_")[1]
        );
        await processProfessionalPayment(professionalId, payment);
      } else {
        console.warn(
          `⚠️ [WEBHOOK] Unknown payment type: ${external_reference}`
        );
      }
    } else {
      console.log(`⚠️ [WEBHOOK] Payment not approved. Status: ${status}`);
      await updatePaymentStatusOnly(external_reference, status, payment.id);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ [WEBHOOK] Error:", error.message);
    console.error("❌ [WEBHOOK] Stack:", error.stack);
    return res.status(200).json({ received: true });
  }
});

async function processClientPayment(userId, payment) {
  try {
    console.log(`🔄 [PAGAMENTO] Processando pagamento de Cliente #${userId}`);
    console.log(`💰 [PAGAMENTO] Payment ID: ${payment.id}`);
    console.log(`💰 [PAGAMENTO] Valor: R$ ${payment.transaction_amount}`);

    // 1. Atualizar status do pagamento
    await pool.query(
      `UPDATE client_payments
       SET status = $1,
           mp_payment_id = $2,
           processed_at = NOW()
       WHERE user_id = $3 AND status = 'pending'`,
      ["approved", payment.id.toString(), userId]
    );
    console.log(`✅ [PAGAMENTO] Pagamento marcado como aprovado no banco`);

    // 2. Ativar assinatura por 1 ano
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    await pool.query(
      `UPDATE users
       SET subscription_status = 'active',
           subscription_active = true,
           subscription_expiry = $1
       WHERE id = $2`,
      [expirationDate, userId]
    );

    // 2.5. Marcar referência como convertida (novo sistema de tracking de afiliados)
    try {
      await pool.query(
        `UPDATE affiliate_referrals
         SET converted = true,
             converted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND converted = false`,
        [userId]
      );
      console.log(`✅ [AFFILIATE] Referência marcada como convertida para usuário ${userId}`);
    } catch (affiliateError) {
      console.error(`⚠️ [AFFILIATE] Erro ao marcar referência como convertida:`, affiliateError);
      // Não bloquear o processamento do pagamento se houver erro no tracking
    }

    // 3. Registrar comissão de afiliado (se houver)
    const userResult = await pool.query(
      "SELECT affiliate_code FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows[0]?.affiliate_code) {
      const affiliateCode = userResult.rows[0].affiliate_code;

      const affiliateResult = await pool.query(
        "SELECT id FROM affiliates WHERE code = $1 AND status = 'active'",
        [affiliateCode]
      );

      if (affiliateResult.rows.length > 0) {
        const affiliateId = affiliateResult.rows[0].id;
        const commissionAmount = 10.00;

        await pool.query(
          `INSERT INTO affiliate_commissions (affiliate_id, client_id, amount, status)
           VALUES ($1, $2, $3, 'pending')`,
          [affiliateId, userId, commissionAmount]
        );

        console.log(`💰 [COMISSÃO] Registrada comissão de R$ ${commissionAmount} para afiliado ${affiliateCode}`);
      }
    }

    console.log(
      `✅ [PAGAMENTO] Cliente atualizado e ações aplicadas com sucesso`
    );
    console.log(
      `📅 [PAGAMENTO] Assinatura válida até: ${expirationDate.toLocaleDateString(
        "pt-BR"
      )}`
    );
  } catch (error) {
    console.error(
      `❌ [PAGAMENTO] Erro ao processar pagamento de cliente:`,
      error.message
    );
    throw error;
  }
}

async function processDependentPayment(dependentId, payment) {
  try {
    console.log(
      `🔄 [PAGAMENTO] Processando pagamento de Dependente #${dependentId}`
    );
    console.log(`💰 [PAGAMENTO] Payment ID: ${payment.id}`);
    console.log(`💰 [PAGAMENTO] Valor: R$ ${payment.transaction_amount}`);

    // 1. Atualizar status do pagamento
    await pool.query(
      `UPDATE dependent_payments
       SET status = $1,
           mp_payment_id = $2,
           processed_at = NOW()
       WHERE dependent_id = $3 AND status = 'pending'`,
      ["approved", payment.id.toString(), dependentId]
    );
    console.log(`✅ [PAGAMENTO] Pagamento marcado como aprovado no banco`);

    // 2. Ativar assinatura por 1 ano
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    await pool.query(
      `UPDATE dependents
       SET subscription_status = 'active',
           subscription_active = true,
           subscription_expiry = $1
       WHERE id = $2`,
      [expirationDate, dependentId]
    );

    console.log(
      `✅ [PAGAMENTO] Dependente atualizado e ações aplicadas com sucesso`
    );
    console.log(
      `📅 [PAGAMENTO] Assinatura válida até: ${expirationDate.toLocaleDateString(
        "pt-BR"
      )}`
    );
  } catch (error) {
    console.error(
      `❌ [PAGAMENTO] Erro ao processar pagamento de dependente:`,
      error.message
    );
    throw error;
  }
}

async function processAgendaPayment(professionalId, payment) {
  try {
    console.log(
      `🔄 [PAGAMENTO] Processando pagamento de Agenda Profissional #${professionalId}`
    );
    console.log(`💰 [PAGAMENTO] Payment ID: ${payment.id}`);
    console.log(`💰 [PAGAMENTO] Valor: R$ ${payment.transaction_amount}`);

    // 1. Atualizar status do pagamento
    await pool.query(
      `UPDATE agenda_payments
       SET status = $1,
           mp_payment_id = $2,
           processed_at = NOW()
       WHERE professional_id = $3 AND status = 'pending'`,
      ["approved", payment.id.toString(), professionalId]
    );
    console.log(`✅ [PAGAMENTO] Pagamento marcado como aprovado no banco`);

    // 2. Calcular data de expiração (30 dias a partir de agora)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);

    // 3. Verificar se já existe registro de acesso
    const existingAccessResult = await pool.query(
      `SELECT id, expires_at FROM scheduling_access WHERE professional_id = $1`,
      [professionalId]
    );

    if (existingAccessResult.rows.length > 0) {
      // Atualizar registro existente, sempre renovando para 30 dias a partir de agora
      await pool.query(
        `UPDATE scheduling_access
         SET is_active = true,
             expires_at = $1,
             schedule_balance = 0,
             updated_at = NOW()
         WHERE professional_id = $2`,
        [expirationDate, professionalId]
      );
      console.log(
        `✅ [PAGAMENTO] Acesso à agenda atualizado (renovado por 30 dias)`
      );
    } else {
      // Criar novo registro
      await pool.query(
        `INSERT INTO scheduling_access (professional_id, is_active, expires_at, schedule_balance, created_at)
         VALUES ($1, true, $2, 0, NOW())`,
        [professionalId, expirationDate]
      );
      console.log(
        `✅ [PAGAMENTO] Novo acesso à agenda criado (válido por 30 dias)`
      );
    }

    console.log(
      `✅ [PAGAMENTO] Agenda profissional atualizado e ações aplicadas com sucesso`
    );
    console.log(
      `📅 [PAGAMENTO] Acesso válido até: ${expirationDate.toLocaleDateString(
        "pt-BR"
      )}`
    );
  } catch (error) {
    console.error(
      `❌ [PAGAMENTO] Erro ao processar pagamento de agenda:`,
      error.message
    );
    throw error;
  }
}

async function processProfessionalPayment(professionalId, payment) {
  try {
    console.log(
      `🔄 [PAGAMENTO] Processando pagamento de Repasse Profissional #${professionalId}`
    );
    console.log(`💰 [PAGAMENTO] Payment ID: ${payment.id}`);
    console.log(`💰 [PAGAMENTO] Valor: R$ ${payment.transaction_amount}`);

    // 1. Buscar consultas pendentes (não quitadas) do convênio
    const settledConsultationsResult = await pool.query(
      `SELECT id, value, date, created_at
       FROM consultations
       WHERE professional_id = $1
         AND settled_at IS NULL
         AND status != 'cancelled'
         AND (user_id IS NOT NULL OR dependent_id IS NOT NULL)
       ORDER BY date ASC`,
      [professionalId]
    );

    const consultations = settledConsultationsResult.rows;
    const consultationsCount = consultations.length;
    const periodStart =
      consultations.length > 0 ? consultations[0].created_at : new Date();
    const periodEnd = new Date();

    console.log(
      `📊 [PAGAMENTO] Encontradas ${consultationsCount} consultas pendentes de quitação`
    );

    if (consultationsCount === 0) {
      console.log(
        `⚠️ [PAGAMENTO] Nenhuma consulta pendente encontrada para o profissional ${professionalId}`
      );
    }

    // 2. Atualizar status do pagamento
    await pool.query(
      `UPDATE professional_payments
   SET status = $1,
       mp_payment_id = $2,
       processed_at = NOW()
   WHERE id = (
     SELECT id FROM professional_payments
     WHERE professional_id = $3 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1
   )`,
      ["approved", payment.id.toString(), professionalId]
    );

    console.log(`✅ [PAGAMENTO] Pagamento marcado como aprovado no banco`);

    // 3. Obter ID do registro de pagamento
    const paymentIdResult = await pool.query(
      `SELECT id FROM professional_payments
       WHERE professional_id = $1
         AND mp_payment_id = $2
       LIMIT 1`,
      [professionalId, payment.id.toString()]
    );

    const paymentRecordId = paymentIdResult.rows[0]?.id;

    // 4. Marcar todas as consultas pendentes como quitadas
    await pool.query(
      `UPDATE consultations
       SET settled_at = NOW()
       WHERE professional_id = $1
         AND settled_at IS NULL
         AND status != 'cancelled'
         AND (user_id IS NOT NULL OR dependent_id IS NOT NULL)`,
      [professionalId]
    );
    console.log(
      `✅ [PAGAMENTO] ${consultationsCount} consultas marcadas como quitadas`
    );

    // 5. Criar registro de extrato
    await pool.query(
      `INSERT INTO professional_statements (
        professional_id,
        payment_id,
        mp_payment_id,
        period_start,
        period_end,
        amount,
        consultations_count,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        professionalId,
        paymentRecordId,
        payment.id.toString(),
        periodStart,
        periodEnd,
        payment.transaction_amount,
        consultationsCount,
      ]
    );
    console.log(`✅ [PAGAMENTO] Extrato criado para o período`);

    console.log(
      `✅ [PAGAMENTO] Repasse profissional atualizado e ações aplicadas com sucesso`
    );
    console.log(
      `📊 [PAGAMENTO] Novo ciclo de contagem iniciado (${consultationsCount} consultas quitadas)`
    );

    // 6. Criar notificação para o profissional
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        professionalId,
        "Repasse Confirmado",
        `Seu pagamento de repasse de R$ ${payment.transaction_amount.toFixed(
          2
        )} foi confirmado. Total de ${consultationsCount} consulta(s) quitada(s).`,
        "payment",
      ]
    );
    console.log(`✅ [PAGAMENTO] Notificação criada para o profissional`);
  } catch (error) {
    console.error(
      `❌ [PAGAMENTO] Erro ao processar repasse profissional:`,
      error.message
    );
    console.error(`❌ [PAGAMENTO] Stack:`, error.stack);
    throw error;
  }
}

async function updatePaymentStatusOnly(externalReference, status, paymentId) {
  try {
    console.log(
      `⚠️ [UPDATE-STATUS] Updating ${externalReference} to ${status}`
    );

    if (externalReference.startsWith("subscription_")) {
      const userId = Number.parseInt(
        externalReference.replace("subscription_", "")
      );
      await pool.query(
        `UPDATE client_payments
         SET status = $1,
             mp_payment_id = $2
         WHERE user_id = $3 AND status = 'pending'`,
        [status, paymentId.toString(), userId]
      );
    } else if (externalReference.startsWith("dependent_")) {
      const dependentId = Number.parseInt(
        externalReference.replace("dependent_", "")
      );
      await pool.query(
        `UPDATE dependent_payments
         SET status = $1,
             mp_payment_id = $2
         WHERE dependent_id = $3 AND status = 'pending'`,
        [status, paymentId.toString(), dependentId]
      );
    } else if (externalReference.startsWith("agenda_")) {
      const professionalId = Number.parseInt(
        externalReference.replace("agenda_", "")
      );
      await pool.query(
        `UPDATE agenda_payments
         SET status = $1,
             mp_payment_id = $2
         WHERE professional_id = $3 AND status = 'pending'`,
        [status, paymentId.toString(), professionalId]
      );
    } else if (externalReference.startsWith("professional_")) {
      const professionalId = Number.parseInt(externalReference.split("_")[1]);
      await pool.query(
        `UPDATE professional_payments
         SET status = $1,
             mp_payment_id = $2
         WHERE professional_id = $3 AND status = 'pending'`,
        [status, paymentId.toString(), professionalId]
      );
    }

    console.log(`✅ [UPDATE-STATUS] Status updated successfully`);
  } catch (error) {
    console.error(`❌ [UPDATE-STATUS] Error:`, error.message);
  }
}

// Redirect old webhook to new endpoint
app.all("/api/webhook/mercadopago", (req, res, next) => {
  console.log("🔄 [REDIRECT] Redirecting old webhook to new endpoint");
  req.url = "/api/webhooks/payment-success";
  next();
});

app.all("/api/webhook/payment", (req, res, next) => {
  console.log("🔄 [REDIRECT] Redirecting alternative webhook to main endpoint");
  req.url = "/api/webhooks/payment-success";
  next();
});

// ========================================
// AFFILIATES ROUTES (ADMIN)
// ========================================

// Get all affiliates
app.get("/api/admin/affiliates", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.name,
        a.code,
        a.status,
        a.created_at,
        COUNT(DISTINCT u.id) as clients_count,
        COALESCE(SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END), 0) as paid_total
      FROM affiliates a
      LEFT JOIN users u ON u.affiliate_code = a.code
      LEFT JOIN affiliate_commissions ac ON ac.affiliate_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching affiliates:", error);
    res.status(500).json({ error: "Erro ao buscar afiliados" });
  }
});

// Create affiliate
app.post("/api/admin/affiliates", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { name, cpf, email, password } = req.body;

    if (!name || !cpf || !password) {
      return res.status(400).json({ error: "Nome, CPF e senha são obrigatórios" });
    }

    const cpfClean = cpf.replace(/\D/g, "");

    if (cpfClean.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE cpf = $1", [cpfClean]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "CPF já cadastrado no sistema" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      "INSERT INTO users (name, cpf, email, password, roles) VALUES ($1, $2, $3, $4, ARRAY['vendedor']) RETURNING id",
      [name, cpfClean, email || null, hashedPassword]
    );

    const userId = userResult.rows[0].id;

    const generateCode = (name) => {
      const cleaned = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const random = Math.random().toString(36).substring(2, 6);
      return `${cleaned.substring(0, 10)}_${random}`;
    };

    let code = generateCode(name);
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        const result = await pool.query(
          "INSERT INTO affiliates (name, code, status, user_id) VALUES ($1, $2, 'active', $3) RETURNING *",
          [name, code, userId]
        );
        return res.status(201).json(result.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          attempts++;
          code = generateCode(name);
        } else {
          throw error;
        }
      }
    }

    return res.status(500).json({ error: "Não foi possível gerar um código único" });
  } catch (error) {
    console.error("Error creating affiliate:", error);
    res.status(500).json({ error: "Erro ao criar afiliado" });
  }
});

// Update affiliate status
app.put("/api/admin/affiliates/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      "UPDATE affiliates SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Afiliado não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating affiliate:", error);
    res.status(500).json({ error: "Erro ao atualizar afiliado" });
  }
});

// Get affiliate details with commissions
app.get("/api/admin/affiliates/:id/commissions", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        ac.*,
        u.name as client_name,
        u.cpf as client_cpf
      FROM affiliate_commissions ac
      JOIN users u ON u.id = ac.client_id
      WHERE ac.affiliate_id = $1
      ORDER BY ac.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching commissions:", error);
    res.status(500).json({ error: "Erro ao buscar comissões" });
  }
});

// Mark commission as paid
app.put("/api/admin/affiliates/:id/commissions/:commissionId/pay", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { commissionId } = req.params;

    const result = await pool.query(
      "UPDATE affiliate_commissions SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [commissionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Comissão não encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error marking commission as paid:", error);
    res.status(500).json({ error: "Erro ao marcar comissão como paga" });
  }
});

// Search user by CPF
app.get("/api/admin/users/search", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ error: "CPF é obrigatório" });
    }

    const cleanCpf = cpf.replace(/\D/g, "");

    const result = await pool.query(
      "SELECT id, name, cpf, email, roles FROM users WHERE cpf = $1",
      [cleanCpf]
    );

    if (result.rows.length === 0) {
      return res.json({ user: null });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Error searching user:", error);
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

// Import existing user as affiliate
app.post("/api/admin/affiliates/import", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    // Check if user exists
    const userResult = await pool.query(
      "SELECT id, name, cpf, roles FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const user = userResult.rows[0];

    // Check if user is already an affiliate
    if (user.roles.includes("vendedor")) {
      return res.status(400).json({ error: "Usuário já é vendedor" });
    }

    // Check if affiliate record already exists
    const existingAffiliate = await pool.query(
      "SELECT id FROM affiliates WHERE user_id = $1",
      [userId]
    );

    if (existingAffiliate.rows.length > 0) {
      return res.status(400).json({ error: "Registro de afiliado já existe para este usuário" });
    }

    // Add 'vendedor' role to user
    await pool.query(
      "UPDATE users SET roles = array_append(roles, 'vendedor') WHERE id = $1",
      [userId]
    );

    // Generate affiliate code
    const generateCode = (name) => {
      const cleaned = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const random = Math.random().toString(36).substring(2, 6);
      return `${cleaned.substring(0, 10)}_${random}`;
    };

    let code = generateCode(user.name);
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        const result = await pool.query(
          "INSERT INTO affiliates (name, code, status, user_id) VALUES ($1, $2, 'active', $3) RETURNING *",
          [user.name, code, userId]
        );
        return res.status(201).json(result.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          attempts++;
          code = generateCode(user.name);
        } else {
          throw error;
        }
      }
    }

    return res.status(500).json({ error: "Não foi possível gerar um código único" });
  } catch (error) {
    console.error("Error importing user as affiliate:", error);
    res.status(500).json({ error: "Erro ao importar usuário" });
  }
});

// ========================================
// AFFILIATE PANEL ROUTES
// ========================================

// Get affiliate dashboard data
app.get("/api/affiliate/dashboard", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user is an affiliate (has the 'vendedor' role)
    const userResult = await pool.query(
      "SELECT roles FROM users WHERE id = $1",
      [userId]
    );

    if (!userResult.rows[0] || !userResult.rows[0].roles.includes("vendedor")) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    // Get affiliate info
    const affiliateResult = await pool.query(
      "SELECT * FROM affiliates WHERE user_id = $1",
      [userId]
    );

    if (affiliateResult.rows.length === 0) {
      return res.status(404).json({ error: "Afiliado não encontrado" });
    }

    const affiliate = affiliateResult.rows[0];

    // Get stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(DISTINCT u.id) as clients_count,
        COALESCE(SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END), 0) as paid_total
      FROM users u
      LEFT JOIN affiliate_commissions ac ON ac.client_id = u.id
      WHERE u.affiliate_code = $1
    `, [affiliate.code]);

    // Get referred clients
    const clientsResult = await pool.query(`
      SELECT
        u.name,
        u.created_at,
        u.subscription_status
      FROM users u
      WHERE u.affiliate_code = $1
      ORDER BY u.created_at DESC
    `, [affiliate.code]);

    res.json({
      affiliate,
      stats: statsResult.rows[0],
      clients: clientsResult.rows
    });
  } catch (error) {
    console.error("Error fetching affiliate dashboard:", error);
    res.status(500).json({ error: "Erro ao buscar dados do painel" });
  }
});

// ========================================
// COUPONS ROUTES (ADMIN)
// ========================================

// Get all coupons
app.get("/api/admin/coupons", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM coupons
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Erro ao buscar cupons" });
  }
});

// Create coupon
app.post("/api/admin/coupons", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const {
      code,
      coupon_type,
      discount_value,
      final_price,
      valid_from,
      valid_until,
      description,
      unlimited_use
    } = req.body;

    if (!code || !coupon_type || (!discount_value && !final_price)) {
      return res.status(400).json({ error: "Dados obrigatórios faltando" });
    }

    const result = await pool.query(
      `INSERT INTO coupons
        (code, coupon_type, discount_type, discount_value, final_price, valid_from, valid_until, description, unlimited_use, is_active, created_by)
       VALUES ($1, $2, 'fixed', $3, $4, $5, $6, $7, $8, true, $9)
       RETURNING *`,
      [code, coupon_type, discount_value || 0, final_price, valid_from, valid_until, description, unlimited_use || false, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "Código de cupom já existe" });
    }
    console.error("Error creating coupon:", error);
    res.status(500).json({ error: "Erro ao criar cupom" });
  }
});

// Update coupon
app.put("/api/admin/coupons/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      coupon_type,
      discount_value,
      final_price,
      valid_from,
      valid_until,
      description,
      unlimited_use,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE coupons
       SET code = $1, coupon_type = $2, discount_value = $3, final_price = $4,
           valid_from = $5, valid_until = $6, description = $7, unlimited_use = $8, is_active = $9
       WHERE id = $10
       RETURNING *`,
      [code, coupon_type, discount_value, final_price, valid_from, valid_until, description, unlimited_use, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cupom não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).json({ error: "Erro ao atualizar cupom" });
  }
});

// Toggle coupon status
app.put("/api/admin/coupons/:id/toggle", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "UPDATE coupons SET is_active = NOT is_active WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cupom não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error toggling coupon:", error);
    res.status(500).json({ error: "Erro ao ativar/desativar cupom" });
  }
});

// Delete coupon
app.delete("/api/admin/coupons/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM coupons WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cupom não encontrado" });
    }

    res.json({ message: "Cupom excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({ error: "Erro ao excluir cupom" });
  }
});

// Validate affiliate code (public endpoint for registration)
app.get("/api/affiliates/validate/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      "SELECT id, name, code FROM affiliates WHERE code = $1 AND status = 'active'",
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ valid: false });
    }

    res.json({ valid: true, affiliate: result.rows[0] });
  } catch (error) {
    console.error("Error validating affiliate code:", error);
    res.status(500).json({ error: "Erro ao validar código" });
  }
});

app.use((err, req, res, next) => {
  console.error("❌ [ERROR-HANDLER] Unhandled error:", err);

  if (process.env.NODE_ENV === "development") {
    logAudit(
      null,
      "error_occurred",
      null,
      null,
      null,
      {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      },
      req
    ).catch(console.error);
  }

  res.status(500).json({
    message: "Erro interno do servidor",
    ...(process.env.NODE_ENV === "development" && { error: err.message }),
  });
});

// Serve React app for all non-API routes in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

// 404 handler for API routes
app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

// ===== SERVER STARTUP =====

const startServer = async () => {
  try {
    console.log("🔄 Starting server initialization...");

    console.log("📊 Initializing database...");
    await initializeDatabase();
    console.log("✅ Database initialized successfully");

    console.log("⏰ Setting up subscription expiry check job...");
    scheduleExpiryCheck();
    await checkExpiredSubscriptionsNow();
    console.log("✅ Subscription expiry check job initialized");

    console.log(`🌐 Starting HTTP server on port ${PORT}...`);
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📊 Database: Connected`);
      console.log(`💳 MercadoPago: Configured`);
      console.log(`📋 Consultations System: Active`);
      console.log(`✅ All systems operational`);
    });

    server.on("error", (error) => {
      console.error("❌ Server error:", error);
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    console.error("❌ Error stack:", error.stack);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🔄 SIGTERM received, shutting down gracefully...");

  try {
    await pool.end();
    console.log("✅ Database connections closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
});

process.on("SIGINT", async () => {
  console.log("🔄 SIGINT received, shutting down gracefully...");

  try {
    await pool.end();
    console.log("✅ Database connections closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
});

// Start the server
startServer();
