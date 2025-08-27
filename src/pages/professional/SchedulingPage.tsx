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

// Edit appointment endpoint
app.put('/api/consultations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, service_id, location_id, value, notes, patient_type, client_id, dependent_id, private_patient_id } = req.body;
    
    console.log('🔄 Editing consultation:', { id, body: req.body });
    
    // Verify consultation belongs to the professional
    const consultationCheck = await pool.query(
      'SELECT id FROM consultations WHERE id = $1 AND professional_id = $2',
      [id, req.user.id]
    );
    
    if (consultationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada ou não autorizada' });
    }
    
    // Combine date and time if both provided
    let consultationDate;
    if (date && time) {
      consultationDate = new Date(`${date}T${time}`);
    } else if (date) {
      // If only date provided, keep existing time
      const existingConsultation = await pool.query(
        'SELECT date FROM consultations WHERE id = $1',
        [id]
      );
      const existingDate = new Date(existingConsultation.rows[0].date);
      consultationDate = new Date(`${date}T${existingDate.toTimeString().split(' ')[0]}`);
    }
    
    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    if (consultationDate) {
      updateFields.push(`date = $${paramCount}`);
      updateValues.push(consultationDate);
      paramCount++;
    }
    
    if (service_id) {
      updateFields.push(`service_id = $${paramCount}`);
      updateValues.push(service_id);
      paramCount++;
    }
    
    if (location_id !== undefined) {
      updateFields.push(`location_id = $${paramCount}`);
      updateValues.push(location_id || null);
      paramCount++;
    }
    
    if (value !== undefined) {
      updateFields.push(`value = $${paramCount}`);
      updateValues.push(parseFloat(value));
      paramCount++;
    }
    
    if (notes !== undefined) {
      updateFields.push(`notes = $${paramCount}`);
      updateValues.push(notes || null);
      paramCount++;
    }
    
    // Handle patient changes
    if (patient_type === 'private' && private_patient_id) {
      updateFields.push(`user_id = NULL, dependent_id = NULL, private_patient_id = $${paramCount}`);
      updateValues.push(private_patient_id);
      paramCount++;
    } else if (patient_type === 'convenio') {
      if (dependent_id) {
        updateFields.push(`user_id = NULL, dependent_id = $${paramCount}, private_patient_id = NULL`);
        updateValues.push(dependent_id);
        paramCount++;
      } else if (client_id) {
        updateFields.push(`user_id = $${paramCount}, dependent_id = NULL, private_patient_id = NULL`);
        updateValues.push(client_id);
        paramCount++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }
    
    // Add updated_at field
    updateFields.push(`updated_at = NOW()`);
    
    // Add consultation ID as last parameter
    updateValues.push(id);
    
    const updateQuery = `
      UPDATE consultations 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    console.log('🔄 Update query:', updateQuery);
    console.log('🔄 Update values:', updateValues);
    
    const result = await pool.query(updateQuery, updateValues);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }
    
    console.log('✅ Consultation updated successfully');
    res.json({ 
      message: 'Consulta atualizada com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating consultation:', error);
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

    res.json