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
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));
}

// Initialize MercadoPago SDK v2
console.log("🔄 Initializing MercadoPago SDK v2...");
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
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
        category_name VARCHAR(100),
        percentage DECIMAL(5,2) DEFAULT 50.00,
        crm VARCHAR(20),
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_patient_type CHECK (
          (user_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL)
        )
      )
    `);

    // Add status and updated_at columns to existing consultations table if they don't exist
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
      END $$;
    `);

    // Medical records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
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
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        template_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      SELECT 'subscription_price', '250.00', 'Preço da assinatura mensal'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'subscription_price')
    `);

    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      SELECT 'dependent_price', '50.00', 'Preço da ativação de dependente'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'dependent_price')
    `);

    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      SELECT 'agenda_access_price', '24.99', 'Preço do acesso à agenda'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'agenda_access_price')
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

const validateCPF = (cpf) => {
  const cleanCPF = cpf.replace(/\D/g, "");
  return cleanCPF.length === 11 && /^\d{11}$/.test(cleanCPF);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const logAuditAction = async (
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
  const baseUrl = process.env.NODE_ENV === "production" 
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
    webhook: process.env.NODE_ENV === "production"
      ? "https://www.cartaoquiroferreira.com.br/api/webhook/mercadopago"
      : "http://localhost:3001/api/webhook/mercadopago"
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

    // Create user
    const userResult = await pool.query(
      `
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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

    // Generate token with selected role
    const userData = {
      id: user.id,
      name: user.name,
      roles: user.roles,
      currentRole: role,
      subscription_status: user.subscription_status,
      subscription_expiry: user.subscription_expiry,
    };

    const token = generateToken(userData);

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    console.log("✅ Role selected successfully:", role);

    res.json({
      message: "Role selecionada com sucesso",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("❌ Role selection error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/auth/switch-role", authenticate, async (req, res) => {
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
});

app.post("/api/auth/logout", (req, res) => {
  try {
    // Clear cookie
    res.clearCookie("token");

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
        subscription_expiry, photo_url, category_name, percentage, crm, created_at
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
    if (req.user.currentRole !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const userResult = await pool.query(
      `
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, subscription_status,
        subscription_expiry, photo_url, category_name, percentage, crm, created_at
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

app.get("/api/users/:id/subscription-status", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own data unless they're admin
    if (req.user.currentRole !== "admin" && req.user.id !== parseInt(id)) {
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
    res.status(500).json({ message: "Erro ao verificar status da assinatura" });
  }
});

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
      professional_percentage,
      crm,
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
        percentage, crm, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
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
        professional_percentage || null,
        crm?.trim() || null,
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

    res.status(500).json({ message: "Erro interno do servidor ao criar usuário" });
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
      professional_percentage,
      crm,
      currentPassword,
      newPassword,
    } = req.body;

    // Users can only update their own data unless they're admin
    if (req.user.currentRole !== "admin" && req.user.id !== parseInt(id)) {
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
    let updateData = { ...currentUser };

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
    if (phone !== undefined) updateData.phone = phone?.replace(/\D/g, "") || null;
    if (birth_date !== undefined) updateData.birth_date = birth_date || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (address_number !== undefined) updateData.address_number = address_number?.trim() || null;
    if (address_complement !== undefined) updateData.address_complement = address_complement?.trim() || null;
    if (neighborhood !== undefined) updateData.neighborhood = neighborhood?.trim() || null;
    if (city !== undefined) updateData.city = city?.trim() || null;
    if (state !== undefined) updateData.state = state || null;

    // Admin-only fields
    if (req.user.currentRole === "admin") {
      if (roles !== undefined) updateData.roles = roles;
      if (subscription_status !== undefined) updateData.subscription_status = subscription_status;
      if (subscription_expiry !== undefined) updateData.subscription_expiry = subscription_expiry;
      if (category_name !== undefined) updateData.category_name = category_name?.trim() || null;
      if (professional_percentage !== undefined) updateData.percentage = professional_percentage;
      if (crm !== undefined) updateData.crm = crm?.trim() || null;
    }

    updateData.updated_at = new Date();

    // Update user
    const updatedUserResult = await pool.query(
      `
      UPDATE users SET 
        name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
        address_number = $6, address_complement = $7, neighborhood = $8,
        city = $9, state = $10, password = $11, roles = $12, subscription_status = $13,
        subscription_expiry = $14, category_name = $15, percentage = $16, crm = $17, updated_at = $18
      WHERE id = $19
      RETURNING id, name, cpf, email, phone, roles, subscription_status, subscription_expiry, category_name, percentage, crm
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

app.delete("/api/users/:id", authenticate, authorize(["admin"]), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    console.log("🔄 Deleting user:", id);

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
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
    await client.query("DELETE FROM medical_documents WHERE professional_id = $1", [id]);
    await client.query("DELETE FROM medical_records WHERE professional_id = $1", [id]);
    await client.query("DELETE FROM consultations WHERE professional_id = $1 OR user_id = $1", [id]);
    await client.query("DELETE FROM private_patients WHERE professional_id = $1", [id]);
    await client.query("DELETE FROM attendance_locations WHERE professional_id = $1", [id]);
    await client.query("DELETE FROM scheduling_access WHERE professional_id = $1", [id]);
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
      deletedUser: { id: parseInt(id), name: userName },
    });
  } catch (error) {
    // Rollback transaction on error
    await client.query("ROLLBACK");
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ message: "Erro interno do servidor ao excluir usuário" });
  } finally {
    client.release();
  }
});

// ===== CONSULTATIONS ROUTES (MAIN AGENDA SYSTEM) =====

// Get consultations for professional agenda (by date)
app.get("/api/consultations/agenda", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { date } = req.query;
    const professionalId = req.user.id;

    console.log("🔄 Fetching consultations for agenda - Professional:", professionalId, "Date:", date);

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
      WHERE c.professional_id = $1
    `;

    const params = [professionalId];

    if (date) {
      query += " AND DATE(c.date) = $2";
      params.push(date);
    }

    query += " ORDER BY c.date";

    const result = await pool.query(query, params);

    console.log("✅ Consultations loaded for agenda:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching consultations for agenda:", error);
    res.status(500).json({ message: "Erro ao carregar consultas da agenda" });
  }
});

// Create new consultation
app.post("/api/consultations", authenticate, authorize(["professional"]), async (req, res) => {
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
      status = 'scheduled'
    } = req.body;

    console.log("🔄 Creating consultation:", req.body);

    // Validate required fields
    if (!service_id || !value || !date) {
      return res
        .status(400)
        .json({ message: "Serviço, valor e data são obrigatórios" });
    }

    if (isNaN(parseFloat(value)) || parseFloat(value) <= 0) {
      return res
        .status(400)
        .json({ message: "Valor deve ser um número maior que zero" });
    }

    // Validate patient type (exactly one must be provided)
    const patientCount = [user_id, dependent_id, private_patient_id].filter(Boolean).length;
    if (patientCount !== 1) {
      return res.status(400).json({
        message: "Exatamente um tipo de paciente deve ser especificado",
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
        parseFloat(value),
        new Date(date),
        status,
        notes?.trim() || null,
      ]
    );

    const consultation = consultationResult.rows[0];

    console.log("✅ Consultation created:", consultation.id);

    res.status(201).json({
      message: "Consulta criada com sucesso",
      consultation,
    });
  } catch (error) {
    console.error("❌ Error creating consultation:", error);
    res.status(500).json({ message: "Erro ao criar consulta" });
  }
});

// Update consultation status
app.put("/api/consultations/:id/status", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log("🔄 Updating consultation status:", id, "to:", status);

    if (!status) {
      return res.status(400).json({ message: "Status é obrigatório" });
    }

    // Validate status value
    const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
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
});

// Update consultation (full update)
app.put("/api/consultations/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      service_id,
      location_id,
      value,
      date,
      status,
      notes
    } = req.body;

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
      if (isNaN(parseFloat(value)) || parseFloat(value) <= 0) {
        return res.status(400).json({ message: "Valor deve ser um número maior que zero" });
      }
      updateFields.push(`value = $${paramCount++}`);
      updateValues.push(parseFloat(value));
    }

    if (date !== undefined) {
      updateFields.push(`date = $${paramCount++}`);
      updateValues.push(new Date(date));
    }

    if (status !== undefined) {
      const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
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
});

// PUT /api/consultations/:id - Update consultation
app.put('/api/consultations/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const consultationId = req.params.id;
    const { date, value, location_id, notes, status } = req.body;

    console.log('🔄 Updating consultation:', consultationId, req.body);

    // Validate required fields
    if (!date || !value) {
      return res.status(400).json({ message: 'Data e valor são obrigatórios' });
    }

    // Check if consultation exists and belongs to the professional
    const checkResult = await pool.query(
      'SELECT * FROM consultations WHERE id = $1 AND professional_id = $2',
      [consultationId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada ou não autorizada' });
    }

    // Update consultation
    const updateResult = await pool.query(
      `UPDATE consultations 
       SET date = $1, value = $2, location_id = $3, notes = $4, status = $5, updated_at = NOW()
       WHERE id = $6 AND professional_id = $7
       RETURNING *`,
      [date, value, location_id, notes, status, consultationId, req.user.id]
    );

    console.log('✅ Consultation updated successfully');
    res.json({ 
      message: 'Consulta atualizada com sucesso',
      consultation: updateResult.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating consultation:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// POST /api/consultations/recurring - Create recurring consultations
app.post('/api/consultations/recurring', authenticate, authorize(['professional', 'admin']), async (req, res) => {
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
      recurrence_interval,
      end_date,
      occurrences,
      notes,
      timezone_offset = -3 // Default to Brasília timezone
    } = req.body;

    console.log('🔄 Creating recurring consultations:', req.body);

    // Validate required fields
    if (!service_id || !value || !start_date || !start_time || !recurrence_type || !occurrences) {
      return res.status(400).json({ message: 'Campos obrigatórios não preenchidos' });
    }

    // Validate patient selection
    if (!user_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário selecionar um paciente' });
    }

    const createdConsultations = [];
    const startDateTime = new Date(`${start_date}T${start_time}`);
    
    // Create initial date in specified timezone and convert to UTC
    let currentDate = new Date(`${start_date}T${start_time}`);
    if (timezone_offset !== undefined) {
      currentDate = new Date(currentDate.getTime() - (timezone_offset * 60 * 60 * 1000));
    }
    
    const endDateTime = end_date ? new Date(end_date) : null;

    for (let i = 0; i < occurrences; i++) {
      // Check if we've reached the end date
      if (endDateTime && currentDate > endDateTime) {
        break;
      }

      try {
        const result = await pool.query(
          `INSERT INTO consultations (
            user_id, dependent_id, private_patient_id, professional_id, service_id, 
            location_id, value, date, status, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          RETURNING *`,
          [
            user_id || null,
            dependent_id || null,
            private_patient_id || null,
            req.user.id,
            service_id,
            location_id || null,
            value,
            currentDate.toISOString(),
            'scheduled',
            notes || null
          ]
        );

        createdConsultations.push(result.rows[0]);
      } catch (error) {
        console.error(`❌ Error creating consultation ${i + 1}:`, error);
        // Continue with next consultation instead of failing completely
      }

      // Calculate next date based on recurrence
      if (recurrence_type === 'daily') {
        currentDate.setDate(currentDate.getDate() + recurrence_interval);
      } else if (recurrence_type === 'weekly') {
        currentDate.setDate(currentDate.getDate() + (7 * recurrence_interval));
      }
    }

    console.log('✅ Recurring consultations created:', createdConsultations.length);
    res.json({
      message: `${createdConsultations.length} consultas recorrentes criadas com sucesso`,
      created_count: createdConsultations.length,
      consultations: createdConsultations,
      created_count: createdConsultations.length
    });
  } catch (error) {
    console.error('❌ Error creating recurring consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// GET /api/consultations/:id/whatsapp - Get WhatsApp URL for consultation
app.get('/api/consultations/:id/whatsapp', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const consultationId = req.params.id;

    console.log('🔄 Getting WhatsApp URL for consultation:', consultationId);

    // Get consultation details with patient info
    const consultationResult = await pool.query(
      `SELECT 
        c.*,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          ELSE u.name
        END as patient_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN pp.phone
          WHEN c.dependent_id IS NOT NULL THEN cu.phone
          ELSE u.phone
        END as patient_phone,
        s.name as service_name
       FROM consultations c
       LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
       LEFT JOIN dependents d ON c.dependent_id = d.id
       LEFT JOIN users cu ON d.user_id = cu.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN services s ON c.service_id = s.id
       WHERE c.id = $1 AND c.professional_id = $2`,
      [consultationId, req.user.id]
    );

    if (consultationResult.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    const consultation = consultationResult.rows[0];
    
    if (!consultation.patient_phone) {
      return res.status(400).json({ message: 'Telefone do paciente não encontrado' });
    }

    // Format phone number (remove non-numeric characters and add country code)
    const cleanPhone = consultation.patient_phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    // Format date and time
    const consultationDate = new Date(consultation.date);
    const formattedDate = consultationDate.toLocaleDateString('pt-BR');
    const formattedTime = consultationDate.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Create WhatsApp message
    const message = `Olá ${consultation.patient_name}, sua consulta está confirmada para ${formattedDate} às ${formattedTime}`;
    const encodedMessage = encodeURIComponent(message);
    
    // Generate WhatsApp URL
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    console.log('✅ WhatsApp URL generated:', whatsappUrl);
    res.json({ whatsapp_url: whatsappUrl });
  } catch (error) {
    console.error('❌ Error generating WhatsApp URL:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete consultation
app.delete("/api/consultations/:id", authenticate, authorize(["professional"]), async (req, res) => {
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
});

// Get all consultations (Admin only)
app.get("/api/consultations", authenticate, authorize(["admin"]), async (req, res) => {
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
      ORDER BY c.date DESC
    `);

    console.log("✅ All consultations fetched:", consultationsResult.rows.length);

    res.json(consultationsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching consultations:", error);
    res.status(500).json({ message: "Erro ao carregar consultas" });
  }
});

// Get consultations for client
app.get("/api/consultations/client/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Clients can only access their own consultations
    if (
      req.user.currentRole === "client" &&
      req.user.id !== parseInt(clientId)
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
      ))
      ORDER BY c.date DESC
    `,
      [clientId]
    );

    console.log("✅ Client consultations fetched:", consultationsResult.rows.length);

    res.json(consultationsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching client consultations:", error);
    res.status(500).json({ message: "Erro ao carregar consultas do cliente" });
  }
});

// ===== CLIENT LOOKUP ROUTES =====

app.get("/api/clients/lookup", authenticate, authorize(["professional", "admin"]), async (req, res) => {
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
});

// ===== DEPENDENTS ROUTES =====

app.get("/api/dependents/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Clients can only access their own dependents
    if (
      req.user.currentRole === "client" &&
      req.user.id !== parseInt(clientId)
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

    console.log("✅ Dependents fetched for client:", clientId, "Count:", dependentsResult.rows.length);

    res.json(dependentsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching dependents:", error);
    res.status(500).json({ message: "Erro ao carregar dependentes" });
  }
});

app.get("/api/dependents/lookup", authenticate, authorize(["professional", "admin"]), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    if (!validateCPF(cpf)) {
      return res.status(400).json({ message: "CPF inválido" });
    }

    const cleanCPF = cpf.replace(/\D/g, "");

    const dependentResult = await pool.query(
      `
      SELECT 
        d.id, d.name, d.cpf, d.subscription_status as dependent_subscription_status,
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

    res.json(dependent);
  } catch (error) {
    console.error("❌ Error looking up dependent:", error);
    res.status(500).json({ message: "Erro ao buscar dependente" });
  }
});

app.post("/api/dependents", authenticate, authorize(["client"]), async (req, res) => {
  try {
    const { user_id, name, cpf, birth_date } = req.body;

    // Validate client can only create dependents for themselves
    if (req.user.id !== user_id) {
      return res.status(403).json({
        message: "Você só pode criar dependentes para sua própria conta",
      });
    }

    if (!name || !cpf) {
      return res.status(400).json({ message: "Nome e CPF são obrigatórios" });
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
      [user_id]
    );
    if (parseInt(dependentCount.rows[0].count) >= 10) {
      return res
        .status(400)
        .json({ message: "Limite máximo de 10 dependentes atingido" });
    }

    const dependentResult = await pool.query(
      `
      INSERT INTO dependents (user_id, name, cpf, birth_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [user_id, name.trim(), cleanCPF, birth_date || null]
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

app.put("/api/dependents/:id", authenticate, authorize(["client"]), async (req, res) => {
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
});

app.delete("/api/dependents/:id", authenticate, authorize(["client"]), async (req, res) => {
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
    res.status(500).json({ message: "Erro ao carregar categorias de serviços" });
  }
});

app.post("/api/service-categories", authenticate, authorize(["admin"]), async (req, res) => {
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
});

app.post("/api/services", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !base_price) {
      return res
        .status(400)
        .json({ message: "Nome e preço base são obrigatórios" });
    }

    if (isNaN(parseFloat(base_price)) || parseFloat(base_price) <= 0) {
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
        parseFloat(base_price),
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
});

app.put("/api/services/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, category_id, is_base_service } = req.body;

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

    if (isNaN(parseFloat(base_price)) || parseFloat(base_price) <= 0) {
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
        parseFloat(base_price),
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
});

app.delete("/api/services/:id", authenticate, authorize(["admin"]), async (req, res) => {
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
    if (parseInt(consultationCount.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Não é possível excluir serviço que possui consultas registradas",
      });
    }

    await pool.query("DELETE FROM services WHERE id = $1", [id]);

    console.log("✅ Service deleted:", id);

    res.json({ message: "Serviço excluído com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting service:", error);
    res.status(500).json({ message: "Erro ao excluir serviço" });
  }
});

// ===== PROFESSIONALS ROUTES =====

app.get("/api/professionals", authenticate, async (req, res) => {
  try {
    const professionalsResult = await pool.query(`
      SELECT 
        id, name, email, phone, address, address_number, address_complement,
        neighborhood, city, state, category_name, photo_url, crm, percentage
      FROM users 
      WHERE 'professional' = ANY(roles)
      ORDER BY name
    `);

    console.log("✅ Professionals fetched:", professionalsResult.rows.length);

    res.json(professionalsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching professionals:", error);
    res.status(500).json({ message: "Erro ao carregar profissionais" });
  }
});

// ===== PRIVATE PATIENTS ROUTES =====

app.get("/api/private-patients", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const patientsResult = await pool.query(
      `
      SELECT * FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY name
    `,
      [req.user.id]
    );

    res.json(patientsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching private patients:", error);
    res.status(500).json({ message: "Erro ao carregar pacientes particulares" });
  }
});

app.post("/api/private-patients", authenticate, authorize(["professional"]), async (req, res) => {
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
});

app.put("/api/private-patients/:id", authenticate, authorize(["professional"]), async (req, res) => {
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
    res.status(500).json({ message: "Erro ao atualizar paciente particular" });
  }
});

app.delete("/api/private-patients/:id", authenticate, authorize(["professional"]), async (req, res) => {
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

    if (parseInt(consultationCount.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Não é possível excluir paciente que possui consultas registradas",
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
});

// ===== ATTENDANCE LOCATIONS ROUTES =====

app.get("/api/attendance-locations", authenticate, authorize(["professional"]), async (req, res) => {
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
    res.status(500).json({ message: "Erro ao carregar locais de atendimento" });
  }
});

app.post("/api/attendance-locations", authenticate, authorize(["professional"]), async (req, res) => {
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
});

app.put("/api/attendance-locations/:id", authenticate, authorize(["professional"]), async (req, res) => {
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
    res.status(500).json({ message: "Erro ao atualizar local de atendimento" });
  }
});

app.delete("/api/attendance-locations/:id", authenticate, authorize(["professional"]), async (req, res) => {
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
});

// ===== MEDICAL RECORDS ROUTES =====

app.get("/api/medical-records", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const recordsResult = await pool.query(
      `
      SELECT 
        mr.*, pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
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
});

app.post("/api/medical-records", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const {
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

    if (!private_patient_id) {
      return res.status(400).json({ message: "Paciente é obrigatório" });
    }

    // Validate patient belongs to professional
    const patientResult = await pool.query(
      `
      SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2
    `,
      [private_patient_id, req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    const recordResult = await pool.query(
      `
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
      [
        req.user.id,
        private_patient_id,
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
});

app.put("/api/medical-records/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const {
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
        chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
        medications = $4, allergies = $5, physical_examination = $6,
        diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `,
      [
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
});

app.delete("/api/medical-records/:id", authenticate, authorize(["professional"]), async (req, res) => {
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
});

// Generate medical record document
app.post("/api/medical-records/generate-document", authenticate, authorize(["professional"]), async (req, res) => {
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

    console.log("✅ Medical record document generated:", documentResult.rows[0].id);

    res.json({
      message: "Documento gerado com sucesso",
      documentUrl: documentData.url,
      document: documentResult.rows[0],
    });
  } catch (error) {
    console.error("❌ Error generating medical record document:", error);
    res.status(500).json({ message: "Erro ao gerar documento do prontuário" });
  }
});

// ===== MEDICAL DOCUMENTS ROUTES =====

app.get("/api/documents/medical", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;

    console.log("🔄 Fetching medical documents for professional:", professionalId);

    const result = await pool.query(
      `SELECT 
        md.id,
        md.title,
        md.document_type,
        md.document_url,
        md.created_at,
        pp.name as patient_name,
        pp.cpf as patient_cpf
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
});

app.post("/api/documents/medical", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;
    const professionalId = req.user.id;

    console.log("🔄 Creating medical document:", {
      title,
      document_type,
      private_patient_id,
      professional_id: professionalId,
    });

    // Validate required fields
    if (!title || !document_type || !private_patient_id) {
      console.log("❌ Missing required fields");
      return res
        .status(400)
        .json({ message: "Título, tipo e paciente são obrigatórios" });
    }

    // Verify patient belongs to professional
    const patientCheck = await pool.query(
      "SELECT id, name, cpf FROM private_patients WHERE id = $1 AND professional_id = $2",
      [private_patient_id, professionalId]
    );

    if (patientCheck.rows.length === 0) {
      console.log("❌ Patient not found or not owned by professional");
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    const patient = patientCheck.rows[0];
    console.log("✅ Patient verified:", patient.name);

    // Generate document using the document generator
    try {
      const { generateDocumentPDF } = await import("./utils/documentGenerator.js");

      // Prepare complete template data
      const completeTemplateData = {
        ...template_data,
        patientName: patient.name,
        patientCpf: patient.cpf || "",
        professionalName: template_data.professionalName || req.user.name,
        professionalSpecialty: template_data.professionalSpecialty || "",
        crm: template_data.crm || "",
      };

      console.log("🔄 Generating document with data:", completeTemplateData);
      const documentResult = await generateDocumentPDF(document_type, completeTemplateData);
      console.log("✅ Document generated:", documentResult.url);

      // Save document record to database
      const result = await pool.query(
        `INSERT INTO medical_documents (
          professional_id, private_patient_id, title, document_type, 
          document_url, created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
        RETURNING *`,
        [
          professionalId,
          private_patient_id,
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
});

app.delete("/api/documents/medical/:id", authenticate, authorize(["professional"]), async (req, res) => {
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
    res.status(500).json({ message: "Erro ao excluir documento", error: error.message });
  }
});

// ===== SCHEDULING ACCESS ROUTES =====

app.get("/api/admin/professionals-scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
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
    console.error("❌ Error fetching professionals scheduling access:", error);
    res.status(500).json({
      message: "Erro ao carregar acesso à agenda dos profissionais",
    });
  }
});

app.post("/api/admin/grant-scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
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
        `Você recebeu acesso à agenda até ${new Date(expires_at).toLocaleDateString("pt-BR")}. ${reason ? `Motivo: ${reason}` : ""}`,
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
});

app.post("/api/admin/revoke-scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
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

    console.log("✅ Scheduling access revoked for professional:", professional_id);

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
});

// ===== PAYMENT ROUTES (MERCADOPAGO SDK V2) =====

app.post("/api/create-subscription", authenticate, authorize(["client"]), async (req, res) => {
  try {
    const { user_id } = req.body;

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

    console.log("🔄 Creating subscription payment for user:", user_id);

    const preference = new Preference(client);
    const urls = getProductionUrls();

    const preferenceData = {
      items: [
        {
          title: "Assinatura Cartão Quiro Ferreira",
          description: "Ativação da assinatura mensal do cartão de convênio",
          quantity: 1,
          unit_price: 250.0,
          currency_id: "BRL",
        },
      ],
      back_urls: {
        success: urls.client.success,
        failure: urls.client.failure,
        pending: urls.client.pending,
      },
      auto_return: "approved",
      notification_url: urls.webhook,
      external_reference: `subscription_${user_id}_${Date.now()}`,
      payer: {
        name: user.name,
        email: user.email || `user${user_id}@temp.com`,
        identification: {
          type: "CPF",
          number: user.cpf,
        },
      },
    };

    const subscriptionResult = await preference.create({
      body: preferenceData,
    });

    console.log("✅ Subscription preference created:", subscriptionResult.id);

    // Save payment record
    await pool.query(
      `
      INSERT INTO client_payments (user_id, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        user_id,
        250.0,
        "pending",
        subscriptionResult.id,
        `subscription_${user_id}_${Date.now()}`,
      ]
    );

    res.json({
      preference_id: subscriptionResult.id,
      init_point: subscriptionResult.init_point,
    });
  } catch (error) {
    console.error("❌ Error creating subscription:", error);
    res.status(500).json({ message: "Erro ao criar pagamento da assinatura" });
  }
});

app.post("/api/dependents/:id/create-payment", authenticate, authorize(["client"]), async (req, res) => {
  try {
    const { id: dependent_id } = req.params;

    // Get dependent info
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

    // Check if dependent already has active subscription
    if (dependent.subscription_status === "active") {
      return res
        .status(400)
        .json({ message: "Dependente já possui assinatura ativa" });
    }

    console.log("🔄 Creating dependent payment for dependent:", dependent_id);

    const preference = new Preference(client);
    const urls = getProductionUrls();

    const preferenceData = {
      items: [
        {
          title: `Ativação de Dependente - ${dependent.name}`,
          description: "Ativação de dependente no cartão de convênio",
          quantity: 1,
          unit_price: 50.0,
          currency_id: "BRL",
        },
      ],
      back_urls: {
        success: urls.dependent.success,
        failure: urls.dependent.failure,
        pending: urls.dependent.pending,
      },
      auto_return: "approved",
      notification_url: urls.webhook,
      external_reference: `dependent_${dependent_id}_${Date.now()}`,
      payer: {
        name: dependent.client_name,
        email: dependent.client_email || `client${dependent.user_id}@temp.com`,
        identification: {
          type: "CPF",
          number: dependent.client_cpf,
        },
      },
    };

    const dependentPaymentResult = await preference.create({
      body: preferenceData,
    });

    console.log("✅ Dependent preference created:", dependentPaymentResult.id);

    // Save payment record
    await pool.query(
      `
      INSERT INTO dependent_payments (dependent_id, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        dependent_id,
        50.0,
        "pending",
        dependentPaymentResult.id,
        `dependent_${dependent_id}_${Date.now()}`,
      ]
    );

    res.json({
      preference_id: dependentPaymentResult.id,
      init_point: dependentPaymentResult.init_point,
    });
  } catch (error) {
    console.error("❌ Error creating dependent payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento do dependente" });
  }
});

app.post("/api/professional/create-payment", authenticate, authorize(["professional"]), async (req, res) => {
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
          unit_price: parseFloat(amount),
          currency_id: "BRL",
        },
      ],
      back_urls: {
        success: urls.professional.success,
        failure: urls.professional.failure,
        pending: urls.professional.pending,
      },
      auto_return: "approved",
      notification_url: urls.webhook,
      external_reference: `professional_${req.user.id}_${Date.now()}`,
      payer: {
        name: req.user.name,
        email: req.user.email || `professional${req.user.id}@temp.com`,
      },
    };

    const professionalResult = await preference.create({
      body: preferenceData,
    });

    console.log("✅ Professional preference created:", professionalResult.id);

    // Save payment record
    await pool.query(
      `
      INSERT INTO professional_payments (professional_id, amount, status, mp_preference_id, payment_reference)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        req.user.id,
        parseFloat(amount),
        "pending",
        professionalResult.id,
        `professional_${req.user.id}_${Date.now()}`,
      ]
    );

    res.json({
      preference_id: professionalResult.id,
      init_point: professionalResult.init_point,
    });
  } catch (error) {
    console.error("❌ Error creating professional payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento do profissional" });
  }
});

app.post("/api/professional/create-agenda-payment", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { duration_days = 30 } = req.body;

    console.log("🔄 Creating agenda payment for duration:", duration_days);

    const preference = new Preference(client);
    const urls = getProductionUrls();

    const preferenceData = {
      items: [
        {
          title: "Acesso à Agenda - Quiro Ferreira",
          description: `Acesso ao sistema de agendamentos por ${duration_days} dias`,
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
      auto_return: "approved",
      notification_url: urls.webhook,
      external_reference: `agenda_${req.user.id}_${duration_days}_${Date.now()}`,
      payer: {
        name: req.user.name,
        email: req.user.email || `professional${req.user.id}@temp.com`,
      },
    };

    const agendaResult = await preference.create({ body: preferenceData });

    console.log("✅ Agenda preference created:", agendaResult.id);

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
        agendaResult.id,
        `agenda_${req.user.id}_${duration_days}_${Date.now()}`,
      ]
    );

    res.json({
      preference_id: agendaResult.id,
      init_point: agendaResult.init_point,
    });
  } catch (error) {
    console.error("❌ Error creating agenda payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento da agenda" });
  }
});

// ===== MERCADOPAGO WEBHOOK =====

app.post("/api/webhook/mercadopago", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    console.log("🔔 MercadoPago webhook received");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body.toString());

    const data = JSON.parse(req.body.toString());

    if (data.type === "payment") {
      const paymentId = data.data.id;
      console.log("💰 Processing payment notification:", paymentId);

      // Get payment details from MercadoPago
      const paymentResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      if (!paymentResponse.ok) {
        console.error("❌ Failed to get payment details from MercadoPago");
        return res
          .status(400)
          .json({ message: "Erro ao obter detalhes do pagamento" });
      }

      const payment = await paymentResponse.json();
      console.log("💰 Payment details:", payment);

      const externalReference = payment.external_reference;
      const status = payment.status;

      if (status === "approved") {
        console.log("✅ Payment approved, processing:", externalReference);

        // Process different payment types
        if (externalReference.startsWith("subscription_")) {
          await processSubscriptionPayment(payment);
        } else if (externalReference.startsWith("dependent_")) {
          await processDependentPayment(payment);
        } else if (externalReference.startsWith("professional_")) {
          await processProfessionalPayment(payment);
        } else if (externalReference.startsWith("agenda_")) {
          await processAgendaPayment(payment);
        }
      } else {
        console.log("⚠️ Payment not approved, status:", status);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).json({ message: "Erro no webhook" });
  }
});

// Process subscription payment
const processSubscriptionPayment = async (payment) => {
  try {
    const externalReference = payment.external_reference;
    const userId = externalReference.split("_")[1];

    console.log("🔄 Processing subscription payment for user:", userId);

    // Update user subscription status
    await pool.query(
      `
      UPDATE users 
      SET 
        subscription_status = 'active',
        subscription_expiry = CURRENT_TIMESTAMP + INTERVAL '1 year'
      WHERE id = $1
    `,
      [userId]
    );

    // Update payment record
    await pool.query(
      `
      UPDATE client_payments 
      SET 
        status = 'approved',
        mp_payment_id = $1,
        processed_at = CURRENT_TIMESTAMP
      WHERE payment_reference LIKE $2
    `,
      [payment.id, `subscription_${userId}_%`]
    );

    // Create notification
    await pool.query(
      `
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
    `,
      [
        userId,
        "Assinatura Ativada",
        "Sua assinatura foi ativada com sucesso! Agora você pode utilizar todos os serviços do convênio.",
        "success",
      ]
    );

    console.log("✅ Subscription activated for user:", userId);
  } catch (error) {
    console.error("❌ Error processing subscription payment:", error);
  }
};

// Process dependent payment
const processDependentPayment = async (payment) => {
  try {
    const externalReference = payment.external_reference;
    const dependentId = externalReference.split("_")[1];

    console.log("🔄 Processing dependent payment for dependent:", dependentId);

    // Update dependent subscription status
    await pool.query(
      `
      UPDATE dependents 
      SET 
        subscription_status = 'active',
        subscription_expiry = CURRENT_TIMESTAMP + INTERVAL '1 year',
        activated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [dependentId]
    );

    // Update payment record
    await pool.query(
      `
      UPDATE dependent_payments 
      SET 
        status = 'approved',
        mp_payment_id = $1,
        processed_at = CURRENT_TIMESTAMP
      WHERE payment_reference LIKE $2
    `,
      [payment.id, `dependent_${dependentId}_%`]
    );

    // Get dependent and client info for notification
    const dependentInfo = await pool.query(
      `
      SELECT d.name as dependent_name, d.user_id, u.name as client_name
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1
    `,
      [dependentId]
    );

    if (dependentInfo.rows.length > 0) {
      const info = dependentInfo.rows[0];

      // Create notification for client
      await pool.query(
        `
        INSERT INTO notifications (user_id, title, message, type)
        VALUES ($1, $2, $3, $4)
      `,
        [
          info.user_id,
          "Dependente Ativado",
          `O dependente ${info.dependent_name} foi ativado com sucesso!`,
          "success",
        ]
      );
    }

    console.log("✅ Dependent activated:", dependentId);
  } catch (error) {
    console.error("❌ Error processing dependent payment:", error);
  }
};

// Process professional payment
const processProfessionalPayment = async (payment) => {
  try {
    const externalReference = payment.external_reference;
    const professionalId = externalReference.split("_")[1];

    console.log("🔄 Processing professional payment for professional:", professionalId);

    // Update payment record
    await pool.query(
      `
      UPDATE professional_payments 
      SET 
        status = 'approved',
        mp_payment_id = $1,
        processed_at = CURRENT_TIMESTAMP
      WHERE payment_reference LIKE $2
    `,
      [payment.id, `professional_${professionalId}_%`]
    );

    // Create notification
    await pool.query(
      `
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
    `,
      [
        professionalId,
        "Pagamento Processado",
        `Seu pagamento de repasse ao convênio foi processado com sucesso.`,
        "success",
      ]
    );

    console.log("✅ Professional payment processed:", professionalId);
  } catch (error) {
    console.error("❌ Error processing professional payment:", error);
  }
};

// Process agenda payment
const processAgendaPayment = async (payment) => {
  try {
    const externalReference = payment.external_reference;
    const parts = externalReference.split("_");
    const professionalId = parts[1];
    const durationDays = parseInt(parts[2]);

    console.log("🔄 Processing agenda payment for professional:", professionalId, "duration:", durationDays);

    // Deactivate any existing access
    await pool.query(
      `
      UPDATE scheduling_access SET is_active = false WHERE professional_id = $1
    `,
      [professionalId]
    );

    // Grant new access
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    await pool.query(
      `
      INSERT INTO scheduling_access (professional_id, expires_at, reason)
      VALUES ($1, $2, $3)
    `,
      [professionalId, expiresAt, "Pagamento via MercadoPago"]
    );

    // Update payment record
    await pool.query(
      `
      UPDATE agenda_payments 
      SET 
        status = 'approved',
        mp_payment_id = $1,
        processed_at = CURRENT_TIMESTAMP
      WHERE payment_reference LIKE $2
    `,
      [payment.id, `agenda_${professionalId}_${durationDays}_%`]
    );

    // Create notification
    await pool.query(
      `
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
    `,
      [
        professionalId,
        "Acesso à Agenda Ativado",
        `Seu acesso à agenda foi ativado por ${durationDays} dias!`,
        "success",
      ]
    );

    console.log("✅ Agenda access activated for professional:", professionalId);
  } catch (error) {
    console.error("❌ Error processing agenda payment:", error);
  }
};

// ===== REPORTS ROUTES =====

app.get("/api/reports/revenue", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ message: "Data inicial e final são obrigatórias" });
    }

    console.log("🔄 Generating revenue report for period:", start_date, "to", end_date);

    // Get total revenue (only convenio consultations)
    const totalRevenueResult = await pool.query(
      `
      SELECT COALESCE(SUM(c.value), 0) as total_revenue
      FROM consultations c
      WHERE c.date >= $1 AND c.date <= $2
        AND (c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL)
    `,
      [start_date, end_date]
    );

    const totalRevenue = parseFloat(totalRevenueResult.rows[0].total_revenue) || 0;

    // Get revenue by professional (only convenio consultations)
    const revenueByProfessionalResult = await pool.query(
      `
      SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (100 - u.percentage) / 100), 0) as clinic_revenue,
        COALESCE(SUM(c.value * u.percentage / 100), 0) as professional_payment
      FROM users u
      LEFT JOIN consultations c ON u.id = c.professional_id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      WHERE 'professional' = ANY(u.roles)
      GROUP BY u.id, u.name, u.percentage
      HAVING COUNT(c.id) > 0
      ORDER BY revenue DESC
    `,
      [start_date, end_date]
    );

    // Get revenue by service (only convenio consultations)
    const revenueByServiceResult = await pool.query(
      `
      SELECT 
        s.name as service_name,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count
      FROM services s
      LEFT JOIN consultations c ON s.id = c.service_id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      GROUP BY s.id, s.name
      HAVING COUNT(c.id) > 0
      ORDER BY revenue DESC
    `,
      [start_date, end_date]
    );

    const report = {
      total_revenue: totalRevenue,
      revenue_by_professional: revenueByProfessionalResult.rows,
      revenue_by_service: revenueByServiceResult.rows,
    };

    console.log("✅ Revenue report generated");

    res.json(report);
  } catch (error) {
    console.error("❌ Error generating revenue report:", error);
    res.status(500).json({ message: "Erro ao gerar relatório de receita" });
  }
});

app.get("/api/reports/professional-revenue", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ message: "Data inicial e final são obrigatórias" });
    }

    console.log("🔄 Generating professional revenue report for:", req.user.id);

    // Get professional percentage
    const professionalResult = await pool.query(
      `SELECT percentage FROM users WHERE id = $1`,
      [req.user.id]
    );

    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;

    // Get consultations for the period
    const consultationsResult = await pool.query(
      `
      SELECT 
        c.date, c.value,
        s.name as service_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
        END as client_name,
        CASE 
          WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value * ($3 / 100.0)
          ELSE 0
        END as amount_to_pay
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `,
      [req.user.id, start_date, 100 - professionalPercentage, end_date]
    );

    // Calculate totals
    const totalRevenue = consultationsResult.rows.reduce(
      (sum, c) => sum + parseFloat(c.value),
      0
    );
    const totalAmountToPay = consultationsResult.rows.reduce(
      (sum, c) => sum + parseFloat(c.amount_to_pay),
      0
    );
    const consultationCount = consultationsResult.rows.length;

    const report = {
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: totalRevenue,
        consultation_count: consultationCount,
        amount_to_pay: totalAmountToPay,
      },
      consultations: consultationsResult.rows,
    };

    console.log("✅ Professional revenue report generated");

    res.json(report);
  } catch (error) {
    console.error("❌ Error generating professional revenue report:", error);
    res.status(500).json({
      message: "Erro ao gerar relatório de receita do profissional",
    });
  }
});

app.get("/api/reports/professional-detailed", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ message: "Data inicial e final são obrigatórias" });
    }

    console.log("🔄 Generating detailed professional report for:", req.user.id);

    // Get professional percentage
    const professionalResult = await pool.query(
      `SELECT percentage FROM users WHERE id = $1`,
      [req.user.id]
    );

    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;

    // Get detailed consultation statistics
    const statsResult = await pool.query(
      `
      SELECT 
        COUNT(*) as total_consultations,
        COUNT(CASE WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 1 END) as convenio_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NOT NULL THEN 1 END) as private_consultations,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value ELSE 0 END), 0) as convenio_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN c.value ELSE 0 END), 0) as private_revenue,
        COALESCE(SUM(CASE WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value * ($3 / 100.0) ELSE 0 END), 0) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
    `,
      [req.user.id, start_date, 100 - professionalPercentage, end_date]
    );

    const stats = statsResult.rows[0];

    const report = {
      summary: {
        total_consultations: parseInt(stats.total_consultations),
        convenio_consultations: parseInt(stats.convenio_consultations),
        private_consultations: parseInt(stats.private_consultations),
        total_revenue: parseFloat(stats.total_revenue),
        convenio_revenue: parseFloat(stats.convenio_revenue),
        private_revenue: parseFloat(stats.private_revenue),
        professional_percentage: professionalPercentage,
        amount_to_pay: parseFloat(stats.amount_to_pay),
      },
    };

    console.log("✅ Detailed professional report generated");

    res.json(report);
  } catch (error) {
    console.error("❌ Error generating detailed professional report:", error);
    res.status(500).json({ message: "Erro ao gerar relatório detalhado do profissional" });
  }
});

app.get("/api/reports/clients-by-city", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const clientsByCityResult = await pool.query(`
      SELECT 
        city,
        state,
        COUNT(*) as client_count,
        COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_clients,
        COUNT(CASE WHEN subscription_status = 'pending' THEN 1 END) as pending_clients,
        COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END) as expired_clients
      FROM users 
      WHERE 'client' = ANY(roles) AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(clientsByCityResult.rows);
  } catch (error) {
    console.error("❌ Error generating clients by city report:", error);
    res.status(500).json({ message: "Erro ao gerar relatório de clientes por cidade" });
  }
});

app.get("/api/reports/professionals-by-city", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const professionalsByCityResult = await pool.query(`
      SELECT 
        city,
        state,
        COUNT(*) as total_professionals,
        json_agg(
          json_build_object(
            'category_name', COALESCE(category_name, 'Sem categoria'),
            'count', 1
          )
        ) as categories
      FROM users 
      WHERE 'professional' = ANY(roles) AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY total_professionals DESC, city
    `);

    // Process categories to group by category name
    const processedData = professionalsByCityResult.rows.map((row) => {
      const categoryMap = new Map();

      row.categories.forEach((cat) => {
        const categoryName = cat.category_name;
        if (categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, categoryMap.get(categoryName) + cat.count);
        } else {
          categoryMap.set(categoryName, cat.count);
        }
      });

      const categories = Array.from(categoryMap.entries()).map(
        ([category_name, count]) => ({
          category_name,
          count,
        })
      );

      return {
        ...row,
        categories,
      };
    });

    res.json(processedData);
  } catch (error) {
    console.error("❌ Error generating professionals by city report:", error);
    res.status(500).json({
      message: "Erro ao gerar relatório de profissionais por cidade",
    });
  }
});

// ===== IMAGE UPLOAD ROUTE =====

app.post("/api/upload-image", authenticate, async (req, res) => {
  try {
    console.log("🔄 Image upload request received");

    // Create upload middleware instance
    const upload = createUpload();

    // Use multer middleware
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("❌ Upload error:", err);
        return res
          .status(400)
          .json({ message: err.message || "Erro no upload da imagem" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Nenhuma imagem foi enviada" });
      }

      console.log("✅ Image uploaded successfully:", req.file.path);

      // Update user photo URL
      await pool.query(
        `
        UPDATE users SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `,
        [req.file.path, req.user.id]
      );

      res.json({
        message: "Imagem enviada com sucesso",
        imageUrl: req.file.path,
      });
    });
  } catch (error) {
    console.error("❌ Error in image upload route:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// ===== ADMIN ROUTES =====

app.get("/api/admin/dependents", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const dependentsResult = await pool.query(`
      SELECT 
        d.*, u.name as client_name, u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json(dependentsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching all dependents:", error);
    res.status(500).json({ message: "Erro ao carregar dependentes" });
  }
});

// ===== NOTIFICATIONS ROUTES =====

app.get("/api/notifications", authenticate, async (req, res) => {
  try {
    const notificationsResult = await pool.query(
      `
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `,
      [req.user.id]
    );

    res.json(notificationsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ message: "Erro ao carregar notificações" });
  }
});

app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `
      UPDATE notifications 
      SET is_read = true 
      WHERE id = $1 AND user_id = $2
    `,
      [id, req.user.id]
    );

    res.json({ message: "Notificação marcada como lida" });
  } catch (error) {
    console.error("❌ Error marking notification as read:", error);
    res.status(500).json({ message: "Erro ao marcar notificação como lida" });
  }
});

app.put("/api/notifications/mark-all-read", authenticate, async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE notifications 
      SET is_read = true 
      WHERE user_id = $1 AND is_read = false
    `,
      [req.user.id]
    );

    res.json({ message: "Todas as notificações foram marcadas como lidas" });
  } catch (error) {
    console.error("❌ Error marking all notifications as read:", error);
    res.status(500).json({ message: "Erro ao marcar todas as notificações como lidas" });
  }
});

// ===== SYSTEM SETTINGS ROUTES =====

app.get("/api/system-settings", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const settingsResult = await pool.query(`
      SELECT * FROM system_settings ORDER BY key
    `);

    res.json(settingsResult.rows);
  } catch (error) {
    console.error("❌ Error fetching system settings:", error);
    res.status(500).json({ message: "Erro ao carregar configurações do sistema" });
  }
});

app.put("/api/system-settings/:key", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (!value) {
      return res.status(400).json({ message: "Valor é obrigatório" });
    }

    const settingResult = await pool.query(
      `
      INSERT INTO system_settings (key, value, description, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
      [key, value, description || null, req.user.id]
    );

    const setting = settingResult.rows[0];

    console.log("✅ System setting updated:", key);

    res.json({
      message: "Configuração atualizada com sucesso",
      setting,
    });
  } catch (error) {
    console.error("❌ Error updating system setting:", error);
    res.status(500).json({ message: "Erro ao atualizar configuração do sistema" });
  }
});

// ===== AUDIT LOGS ROUTES =====

app.get("/api/audit-logs", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { page = 1, limit = 50, user_id, action, table_name } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        al.*, u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (user_id) {
      paramCount++;
      query += ` AND al.user_id = $${paramCount}`;
      params.push(user_id);
    }

    if (action) {
      paramCount++;
      query += ` AND al.action = $${paramCount}`;
      params.push(action);
    }

    if (table_name) {
      paramCount++;
      query += ` AND al.table_name = $${paramCount}`;
      params.push(table_name);
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const logsResult = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM audit_logs al WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (user_id) {
      countParamCount++;
      countQuery += ` AND al.user_id = $${countParamCount}`;
      countParams.push(user_id);
    }

    if (action) {
      countParamCount++;
      countQuery += ` AND al.action = $${countParamCount}`;
      countParams.push(action);
    }

    if (table_name) {
      countParamCount++;
      countQuery += ` AND al.table_name = $${countParamCount}`;
      countParams.push(table_name);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      logs: logsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching audit logs:", error);
    res.status(500).json({ message: "Erro ao carregar logs de auditoria" });
  }
});

// ===== HEALTH CHECK =====

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    database: "Connected",
    mercadopago: "Configured",
  });
});

// ===== ERROR HANDLERS =====

// Catch-all route for SPA in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  // Log error to audit logs if user is available
  if (req.user) {
    logAuditAction(
      req.user.id,
      "ERROR",
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

// ===== SERVER STARTUP =====

const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();

    // Start listening
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📊 Database: Connected`);
      console.log(`💳 MercadoPago: Configured`);
      console.log(`📋 Consultations System: Active`);
      console.log(`✅ All systems operational`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
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