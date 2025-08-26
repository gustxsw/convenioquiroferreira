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

    // Consultations table
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
        status VARCHAR(20) DEFAULT 'completed',
        session_number INTEGER,
        total_sessions INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_patient_type CHECK (
          (user_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL)
        )
      )
    `);

    // Appointments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
        service_id INTEGER REFERENCES services(id),
        location_id INTEGER REFERENCES attendance_locations(id),
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create scheduling_appointments table (separate from consultations)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
        location_id INTEGER REFERENCES attendance_locations(id) ON DELETE SET NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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

    // Client payments table
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

    // Dependent payments table
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

    // Professional payments table
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

    // Agenda payments table
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
      CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON appointments(professional_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
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

// Middleware to check scheduling access
const checkSchedulingAccess = async (req, res, next) => {
  try {
    if (!req.user || req.user.currentRole !== "professional") {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const accessResult = await pool.query(
      `
      SELECT * FROM scheduling_access 
      WHERE professional_id = $1 
        AND is_active = true 
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY expires_at DESC 
      LIMIT 1
    `,
      [req.user.id]
    );

    if (accessResult.rows.length === 0) {
      return res.status(403).json({
        message: "Acesso à agenda não autorizado ou expirado",
        code: "NO_SCHEDULING_ACCESS",
      });
    }

    req.schedulingAccess = accessResult.rows[0];
    next();
  } catch (error) {
    console.error("Error checking scheduling access:", error);
    res.status(500).json({ message: "Erro ao verificar acesso à agenda" });
  }
};

// Authentication routes
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

    // Log audit action
    await logAuditAction(user.id, "CREATE", "users", user.id, null, user, req);

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

    // Log audit action
    await logAuditAction(
      user.id,
      "LOGIN",
      "users",
      user.id,
      null,
      { login_time: new Date() },
      req
    );

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

    // Log audit action
    await logAuditAction(
      userId,
      "ROLE_SELECT",
      "users",
      userId,
      null,
      { selected_role: role },
      req
    );

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

    // Log audit action
    await logAuditAction(
      req.user.id,
      "ROLE_SWITCH",
      "users",
      req.user.id,
      { old_role: req.user.currentRole },
      { new_role: role },
      req
    );

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

// User management routes
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
// Get all users (Admin only)
app.get("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    console.log("🔄 GET /api/users - Fetching all users");

    const result = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, subscription_status,
        subscription_expiry, created_at, updated_at, photo_url, category_name,
        percentage, crm
      FROM users 
      ORDER BY created_at DESC
    `);

    console.log("✅ Users fetched successfully:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: "Erro ao carregar usuários" });
  }
});

// Get user by ID
app.get("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🔄 GET /api/users/:id - Fetching user:", id);

    const result = await pool.query(
      `
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, subscription_status,
        subscription_expiry, created_at, updated_at, photo_url, category_name,
        percentage, crm
      FROM users 
      WHERE id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    console.log("✅ User fetched successfully:", result.rows[0].name);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error fetching user:", error);
    res.status(500).json({ message: "Erro ao carregar usuário" });
  }
});

// Create new user (Admin only)
app.post("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    console.log("🔄 POST /api/users - Creating new user");
    console.log("📝 Request body:", req.body);

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

    // Convert roles array to PostgreSQL array format
    const rolesArray = `{${roles.map((role) => `"${role}"`).join(",")}}`;
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
        rolesArray,
        subscription_status || "pending",
        subscription_expiry || null,
        category_name?.trim() || null,
        percentage || null,
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

    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar usuário" });
  }
});

// Update user (Admin only)
app.put(
  "/api/users/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      console.log("🔄 PUT /api/users/:id - Updating user:", id);
      console.log("📝 Request body:", req.body);

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
        password,
        subscription_status,
        subscription_expiry,
        category_name,
        percentage,
        crm,
      } = req.body;

      // Validate required fields
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      if (!roles || !Array.isArray(roles) || roles.length === 0) {
        return res
          .status(400)
          .json({ message: "Pelo menos uma role deve ser selecionada" });
      }

      // Check if user exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [id]
      );
      if (existingUser.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      // Always update these fields
      updateFields.push(`name = $${paramCount++}`);
      updateValues.push(name.trim());

      updateFields.push(`email = $${paramCount++}`);
      updateValues.push(email?.trim() || null);

      updateFields.push(`phone = $${paramCount++}`);
      updateValues.push(phone ? phone.replace(/\D/g, "") : null);

      updateFields.push(`birth_date = $${paramCount++}`);
      updateValues.push(birth_date || null);

      updateFields.push(`address = $${paramCount++}`);
      updateValues.push(address?.trim() || null);

      updateFields.push(`address_number = $${paramCount++}`);
      updateValues.push(address_number?.trim() || null);

      updateFields.push(`address_complement = $${paramCount++}`);
      updateValues.push(address_complement?.trim() || null);

      updateFields.push(`neighborhood = $${paramCount++}`);
      updateValues.push(neighborhood?.trim() || null);

      updateFields.push(`city = $${paramCount++}`);
      updateValues.push(city?.trim() || null);

      updateFields.push(`state = $${paramCount++}`);
      updateValues.push(state || null);

      updateFields.push(`roles = $${paramCount++}`);
      updateValues.push(`{${roles.map((role) => `"${role}"`).join(",")}}`);

      updateFields.push(`subscription_status = $${paramCount++}`);
      updateValues.push(subscription_status || "pending");

      updateFields.push(`subscription_expiry = $${paramCount++}`);
      updateValues.push(subscription_expiry || null);

      updateFields.push(`category_name = $${paramCount++}`);
      updateValues.push(category_name?.trim() || null);

      updateFields.push(`percentage = $${paramCount++}`);
      updateValues.push(percentage || null);

      updateFields.push(`crm = $${paramCount++}`);
      updateValues.push(crm?.trim() || null);

      updateFields.push(`updated_at = $${paramCount++}`);
      updateValues.push(new Date());

      // Handle password update if provided
      if (password && password.trim()) {
        if (password.length < 6) {
          return res
            .status(400)
            .json({ message: "Senha deve ter pelo menos 6 caracteres" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        updateFields.push(`password = $${paramCount++}`);
        updateValues.push(hashedPassword);
      }

      // Add user ID for WHERE clause
      updateValues.push(id);

      const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING id, name, cpf, email, roles
    `;

      console.log(
        "🔄 Executing update query with",
        updateFields.length,
        "fields"
      );

      const result = await pool.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      console.log("✅ User updated successfully:", result.rows[0].name);

      res.json({
        message: "Usuário atualizado com sucesso",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error updating user:", error);
      res
        .status(500)
        .json({ message: "Erro interno do servidor ao atualizar usuário" });
    }
  }
);

// Delete user (Admin only)
app.delete(
  "/api/users/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      console.log("🔄 DELETE /api/users/:id - Deleting user:", id);

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

      // 1. Delete medical documents
      await client.query(
        "DELETE FROM medical_documents WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted medical documents");

      // 2. Delete medical records
      await client.query(
        "DELETE FROM medical_records WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted medical records");

      // 3. Delete appointments
      await client.query(
        "DELETE FROM appointments WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted appointments");

      // 4. Delete consultations
      await client.query(
        "DELETE FROM consultations WHERE professional_id = $1 OR user_id = $1",
        [id]
      );
      console.log("✅ Deleted consultations");

      // 5. Delete private patients
      await client.query(
        "DELETE FROM private_patients WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted private patients");

      // 6. Delete attendance locations
      await client.query(
        "DELETE FROM attendance_locations WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted attendance locations");

      // 7. Delete scheduling access
      await client.query(
        "DELETE FROM scheduling_access WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted scheduling access");

      // 8. Delete dependents (if user is a client)
      await client.query("DELETE FROM dependents WHERE user_id = $1", [id]);
      console.log("✅ Deleted dependents");

      // 9. Delete notifications
      await client.query("DELETE FROM notifications WHERE user_id = $1", [id]);
      console.log("✅ Deleted notifications");

      // 10. Finally delete the user
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
      res
        .status(500)
        .json({ message: "Erro interno do servidor ao excluir usuário" });
    } finally {
      client.release();
    }
  }
);

app.get(
  "/api/users/:id/subscription-status",
  authenticate,
  async (req, res) => {
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
      res
        .status(500)
        .json({ message: "Erro ao verificar status da assinatura" });
    }
  }
);

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
      category_name,
      percentage,
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
    if (phone !== undefined)
      updateData.phone = phone?.replace(/\D/g, "") || null;
    if (birth_date !== undefined) updateData.birth_date = birth_date || null;
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
      if (category_name !== undefined)
        updateData.category_name = category_name?.trim() || null;
      if (percentage !== undefined) updateData.percentage = percentage;
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
        category_name = $14, percentage = $15, crm = $16, updated_at = $17
      WHERE id = $18
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
        updateData.category_name,
        updateData.percentage,
        updateData.crm,
        updateData.updated_at,
        id,
      ]
    );

    const updatedUser = updatedUserResult.rows[0];

    console.log("✅ User updated successfully:", updatedUser.id);

    // Log audit action
    await logAuditAction(
      req.user.id,
      "UPDATE",
      "users",
      parseInt(id),
      currentUser,
      updatedUser,
      req
    );

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
    try {
      const { id } = req.params;

      // Get user data before deletion for audit
      const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [
        id,
      ]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const user = userResult.rows[0];

      // Delete user (cascade will handle related records)
      await pool.query("DELETE FROM users WHERE id = $1", [id]);

      console.log("✅ User deleted successfully:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "DELETE",
        "users",
        parseInt(id),
        user,
        null,
        req
      );

      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting user:", error);
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  }
);

// Client lookup routes
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

// Dependents routes
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
  }
);

app.post(
  "/api/dependents",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "dependents",
        dependent.id,
        null,
        dependent,
        req
      );

      res.status(201).json({
        message: "Dependente criado com sucesso",
        dependent,
      });
    } catch (error) {
      console.error("❌ Error creating dependent:", error);
      res.status(500).json({ message: "Erro ao criar dependente" });
    }
  }
);

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

      const currentDependent = currentDependentResult.rows[0];

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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "UPDATE",
        "dependents",
        parseInt(id),
        currentDependent,
        updatedDependent,
        req
      );

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

      const dependent = dependentResult.rows[0];

      // Delete dependent
      await pool.query(
        "DELETE FROM dependents WHERE id = $1 AND user_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Dependent deleted successfully:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "DELETE",
        "dependents",
        parseInt(id),
        dependent,
        null,
        req
      );

      res.json({ message: "Dependente excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting dependent:", error);
      res.status(500).json({ message: "Erro ao excluir dependente" });
    }
  }
);

// Admin route to get all dependents
app.get(
  "/api/admin/dependents",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
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
  }
);

// Service categories routes
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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "service_categories",
        category.id,
        null,
        category,
        req
      );

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

// Services routes
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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "services",
        service.id,
        null,
        service,
        req
      );

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

      const currentService = currentServiceResult.rows[0];

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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "UPDATE",
        "services",
        parseInt(id),
        currentService,
        updatedService,
        req
      );

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

      const service = serviceResult.rows[0];

      // Check if service is being used in consultations
      const consultationCount = await pool.query(
        "SELECT COUNT(*) FROM consultations WHERE service_id = $1",
        [id]
      );
      if (parseInt(consultationCount.rows[0].count) > 0) {
        return res.status(400).json({
          message:
            "Não é possível excluir serviço que possui consultas registradas",
        });
      }

      await pool.query("DELETE FROM services WHERE id = $1", [id]);

      console.log("✅ Service deleted:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "DELETE",
        "services",
        parseInt(id),
        service,
        null,
        req
      );

      res.json({ message: "Serviço excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting service:", error);
      res.status(500).json({ message: "Erro ao excluir serviço" });
    }
  }
);

// Consultations routes
app.get(
  "/api/consultations",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const consultationsResult = await pool.query(`
      SELECT 
        c.id, c.value, c.date, c.notes, c.created_at,
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

app.get(
  "/api/consultations/client/:clientId",
  authenticate,
  async (req, res) => {
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
        c.id, c.value, c.date, c.notes, c.created_at,
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

app.post(
  "/api/consultations",
  authenticate,
  authorize(["professional"]),
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
        appointment_date,
        appointment_time,
        create_appointment,
      } = req.body;

      console.log("🔄 Creating consultation with data:", req.body);

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
      const patientCount = [user_id, dependent_id, private_patient_id].filter(
        Boolean
      ).length;
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
        service_id, location_id, value, date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        ]
      );

      const consultation = consultationResult.rows[0];

      console.log("✅ Consultation created:", consultation.id);

      // Create appointment if requested
      let appointment = null;
      if (
        create_appointment &&
        appointment_date &&
        appointment_time &&
        private_patient_id
      ) {
        const appointmentResult = await pool.query(
          `
        INSERT INTO appointments (
          professional_id, private_patient_id, service_id, location_id,
          appointment_date, appointment_time, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
        RETURNING *
      `,
          [
            req.user.id,
            private_patient_id,
            service_id,
            location_id || null,
            appointment_date,
            appointment_time,
          ]
        );

        appointment = appointmentResult.rows[0];
        console.log("✅ Appointment created:", appointment.id);
      }

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "consultations",
        consultation.id,
        null,
        consultation,
        req
      );

      res.status(201).json({
        message: "Consulta registrada com sucesso",
        consultation,
        appointment,
      });
    } catch (error) {
      console.error("❌ Error creating consultation:", error);
      res.status(500).json({ message: "Erro ao registrar consulta" });
    }
  }
);

// Professionals routes
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

// Private patients routes
app.get(
  "/api/private-patients",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "private_patients",
        patient.id,
        null,
        patient,
        req
      );

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

      const currentPatient = currentPatientResult.rows[0];

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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "UPDATE",
        "private_patients",
        parseInt(id),
        currentPatient,
        updatedPatient,
        req
      );

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
)
// Get consultations for professional (filtered by date if provided)
app.get(
  "/api/consultations/professional",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { date } = req.query;
      const professionalId = req.user.id;

      console.log("🔄 Fetching consultations for professional:", professionalId, "date:", date);

      let query = `
        SELECT 
          c.id, c.value, c.date, c.status, c.notes, c.session_number, c.total_sessions,
          s.name as service_name,
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
          al.name as location_name
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

      console.log("✅ Consultations loaded:", result.rows.length);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching consultations:", error);
      res.status(500).json({ message: "Erro ao carregar consultas" });
    }
  }
);

// Update consultation status
app.put(
  "/api/consultations/:id/status",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log("🔄 Updating consultation status:", { id, status });

      if (!status) {
        return res.status(400).json({ message: "Status é obrigatório" });
      }

      // Validate status
      const validStatuses = ["scheduled", "confirmed", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }

      // Get current consultation data
      const currentConsultationResult = await pool.query(
        "SELECT * FROM consultations WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      if (currentConsultationResult.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      const currentConsultation = currentConsultationResult.rows[0];

      // Update consultation status
      const updatedConsultationResult = await pool.query(
        `
        UPDATE consultations 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND professional_id = $3
        RETURNING *
      `,
        [status, id, req.user.id]
      );

      const updatedConsultation = updatedConsultationResult.rows[0];

      console.log("✅ Consultation status updated:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "UPDATE_STATUS",
        "consultations",
        parseInt(id),
        { status: currentConsultation.status },
        { status: updatedConsultation.status },
        req
      );

      res.json({
        message: "Status da consulta atualizado com sucesso",
        consultation: updatedConsultation,
      });
    } catch (error) {
      console.error("❌ Error updating consultation status:", error);
      res.status(500).json({ message: "Erro ao atualizar status da consulta" });
    }
  }
);

// Reschedule consultation
app.put(
  "/api/consultations/:id/reschedule",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { new_date, new_time } = req.body;

      console.log("🔄 Rescheduling consultation:", { id, new_date, new_time });

      if (!new_date || !new_time) {
        return res.status(400).json({ message: "Nova data e hora são obrigatórias" });
      }

      // Get current consultation data
      const currentConsultationResult = await pool.query(
        "SELECT * FROM consultations WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      if (currentConsultationResult.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      const currentConsultation = currentConsultationResult.rows[0];

      // Combine new date and time
      const newDateTime = new Date(`${new_date}T${new_time}`);

      // Check for time conflicts
      const conflictResult = await pool.query(
        `
        SELECT id FROM consultations 
        WHERE professional_id = $1 AND DATE(date) = $2 AND TIME(date) = $3 AND id != $4
      `,
        [req.user.id, new_date, new_time, id]
      );

      if (conflictResult.rows.length > 0) {
        return res.status(409).json({ 
          message: "Já existe uma consulta agendada para este horário" 
        });
      }

      // Update consultation date
      const updatedConsultationResult = await pool.query(
        `
        UPDATE consultations 
        SET date = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND professional_id = $3
        RETURNING *
      `,
        [newDateTime.toISOString(), id, req.user.id]
      );

      const updatedConsultation = updatedConsultationResult.rows[0];

      console.log("✅ Consultation rescheduled:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "RESCHEDULE",
        "consultations",
        parseInt(id),
        { date: currentConsultation.date },
        { date: updatedConsultation.date },
        req
      );

      res.json({
        message: "Consulta reagendada com sucesso",
        consultation: updatedConsultation,
      });
    } catch (error) {
      console.error("❌ Error rescheduling consultation:", error);
      res.status(500).json({ message: "Erro ao reagendar consulta" });
    }
  }
);

// Appointments routes (with scheduling access control)
app.get(
  "/api/appointments",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { date } = req.query;

      let query = `
      SELECT 
        a.*, pp.name as patient_name, pp.phone as patient_phone,
        s.name as service_name, al.name as location_name,
        'private' as patient_type
      FROM appointments a
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      WHERE a.professional_id = $1
    `;

      const params = [req.user.id];

      if (date) {
        query += " AND a.appointment_date = $2";
        params.push(date);
      }

      query += " ORDER BY a.appointment_date, a.appointment_time";

      const appointmentsResult = await pool.query(query, params);

      res.json(appointmentsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching appointments:", error);
      res.status(500).json({ message: "Erro ao carregar agendamentos" });
    }
  }
);

app.post(
  "/api/appointments",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const {
        private_patient_id,
        service_id,
        location_id,
        appointment_date,
        appointment_time,
        notes,
      } = req.body;

      if (
        !private_patient_id ||
        !service_id ||
        !appointment_date ||
        !appointment_time
      ) {
        return res.status(400).json({
          message: "Paciente, serviço, data e horário são obrigatórios",
        });
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

      // Check for time conflicts
      const conflictResult = await pool.query(
        `
      SELECT id FROM appointments 
      WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3
    `,
        [req.user.id, appointment_date, appointment_time]
      );

      if (conflictResult.rows.length > 0) {
        return res
          .status(409)
          .json({ message: "Já existe um agendamento para este horário" });
      }

      const appointmentResult = await pool.query(
        `
      INSERT INTO appointments (
        professional_id, private_patient_id, service_id, location_id,
        appointment_date, appointment_time, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
        [
          req.user.id,
          private_patient_id,
          service_id,
          location_id || null,
          appointment_date,
          appointment_time,
          notes?.trim() || null,
        ]
      );

      const appointment = appointmentResult.rows[0];

      console.log("✅ Appointment created:", appointment.id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "appointments",
        appointment.id,
        null,
        appointment,
        req
      );

      res.status(201).json({
        message: "Agendamento criado com sucesso",
        appointment,
      });
    } catch (error) {
      console.error("❌ Error creating appointment:", error);
      res.status(500).json({ message: "Erro ao criar agendamento" });
    }
  }
);

app.put(
  "/api/appointments/:id",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        private_patient_id,
        service_id,
        location_id,
        appointment_date,
        appointment_time,
        status,
        notes,
      } = req.body;

      // Get current appointment data
      const currentAppointmentResult = await pool.query(
        `
      SELECT * FROM appointments WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (currentAppointmentResult.rows.length === 0) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      const currentAppointment = currentAppointmentResult.rows[0];

      // Check for time conflicts (excluding current appointment)
      if (appointment_date && appointment_time) {
        const conflictResult = await pool.query(
          `
        SELECT id FROM appointments 
        WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND id != $4
      `,
          [req.user.id, appointment_date, appointment_time, id]
        );

        if (conflictResult.rows.length > 0) {
          return res
            .status(409)
            .json({ message: "Já existe um agendamento para este horário" });
        }
      }

      const updatedAppointmentResult = await pool.query(
        `
      UPDATE appointments 
      SET 
        private_patient_id = COALESCE($1, private_patient_id),
        service_id = COALESCE($2, service_id),
        location_id = $3,
        appointment_date = COALESCE($4, appointment_date),
        appointment_time = COALESCE($5, appointment_time),
        status = COALESCE($6, status),
        notes = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND professional_id = $9
      RETURNING *
    `,
        [
          private_patient_id || null,
          service_id || null,
          location_id || null,
          appointment_date || null,
          appointment_time || null,
          status || null,
          notes?.trim() || null,
          id,
          req.user.id,
        ]
      );

      const updatedAppointment = updatedAppointmentResult.rows[0];

      console.log("✅ Appointment updated:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "UPDATE",
        "appointments",
        parseInt(id),
        currentAppointment,
        updatedAppointment,
        req
      );

      res.json({
        message: "Agendamento atualizado com sucesso",
        appointment: updatedAppointment,
      });
    } catch (error) {
      console.error("❌ Error updating appointment:", error);
      res.status(500).json({ message: "Erro ao atualizar agendamento" });
    }
  }
);

app.delete(
  "/api/appointments/:id",
  authenticate,
  authorize(["professional"]),
  checkSchedulingAccess,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get appointment data before deletion
      const appointmentResult = await pool.query(
        `
      SELECT * FROM appointments WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (appointmentResult.rows.length === 0) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      const appointment = appointmentResult.rows[0];

      await pool.query(
        "DELETE FROM appointments WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Appointment deleted:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "DELETE",
        "appointments",
        parseInt(id),
        appointment,
        null,
        req
      );

      res.json({ message: "Agendamento excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting appointment:", error);
      res.status(500).json({ message: "Erro ao excluir agendamento" });
    }
  }
);

// Medical records routes
app.get(
  "/api/medical-records",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
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
  }
);

app.post(
  "/api/medical-records",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "medical_records",
        record.id,
        null,
        record,
        req
      );

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

      const currentRecord = currentRecordResult.rows[0];

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

      // Log audit action
      await logAuditAction(
        req.user.id,
        "UPDATE",
        "medical_records",
        parseInt(id),
        currentRecord,
        updatedRecord,
        req
      );

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

      const record = recordResult.rows[0];

      await pool.query(
        "DELETE FROM medical_records WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Medical record deleted:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "DELETE",
        "medical_records",
        parseInt(id),
        record,
        null,
        req
      );

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

// ===== MEDICAL DOCUMENTS SYSTEM =====
console.log("🔧 Setting up medical documents system...");

// Get all medical documents for a professional
app.get(
  "/api/documents/medical",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const professionalId = req.user.id;

      console.log(
        "🔄 [DOCUMENTS] Fetching medical documents for professional:",
        professionalId
      );

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

      console.log(
        "✅ [DOCUMENTS] Medical documents loaded:",
        result.rows.length
      );
      res.json(result.rows);
    } catch (error) {
      console.error("❌ [DOCUMENTS] Error fetching medical documents:", error);
      res.status(500).json({
        message: "Erro ao carregar documentos médicos",
        error: error.message,
      });
    }
  }
);

// Create new medical document
app.post(
  "/api/documents/medical",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { title, document_type, private_patient_id, template_data } =
        req.body;
      const professionalId = req.user.id;

      console.log("🔄 [DOCUMENTS] Creating medical document:", {
        title,
        document_type,
        private_patient_id,
        professional_id: professionalId,
      });

      // Validate required fields
      if (!title || !document_type || !private_patient_id) {
        console.log("❌ [DOCUMENTS] Missing required fields");
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
        console.log(
          "❌ [DOCUMENTS] Patient not found or not owned by professional"
        );
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      const patient = patientCheck.rows[0];
      console.log("✅ [DOCUMENTS] Patient verified:", patient.name);

      // Generate document using the document generator
      try {
        const { generateDocumentPDF } = await import(
          "./utils/documentGenerator.js"
        );

        // Prepare complete template data
        const completeTemplateData = {
          ...template_data,
          patientName: patient.name,
          patientCpf: patient.cpf || "",
          professionalName: template_data.professionalName || req.user.name,
          professionalSpecialty: template_data.professionalSpecialty || "",
          crm: template_data.crm || "",
        };

        console.log(
          "🔄 [DOCUMENTS] Generating document with data:",
          completeTemplateData
        );
        const documentResult = await generateDocumentPDF(
          document_type,
          completeTemplateData
        );
        console.log("✅ [DOCUMENTS] Document generated:", documentResult.url);

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

        console.log(
          "✅ [DOCUMENTS] Medical document saved to database:",
          result.rows[0]
        );
        res.status(201).json({
          document: result.rows[0],
          title,
          documentUrl: documentResult.url,
        });
      } catch (docError) {
        console.error("❌ [DOCUMENTS] Error generating document:", docError);
        res.status(500).json({
          message: "Erro ao gerar documento",
          error: docError.message,
        });
      }
    } catch (error) {
      console.error("❌ [DOCUMENTS] Error creating medical document:", error);
      res.status(500).json({
        message: "Erro ao criar documento médico",
        error: error.message,
      });
    }
  }
);

// Delete medical document
app.delete(
  "/api/documents/medical/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const professionalId = req.user.id;

      console.log("🔄 [DOCUMENTS] Deleting medical document:", id);

      const result = await pool.query(
        "DELETE FROM medical_documents WHERE id = $1 AND professional_id = $2 RETURNING *",
        [id, professionalId]
      );

      if (result.rows.length === 0) {
        console.log("❌ [DOCUMENTS] Medical document not found");
        return res.status(404).json({ message: "Documento não encontrado" });
      }

      console.log("✅ [DOCUMENTS] Medical document deleted:", result.rows[0]);
      res.json({ message: "Documento excluído com sucesso" });
    } catch (error) {
      console.error("❌ [DOCUMENTS] Error deleting medical document:", error);
      res
        .status(500)
        .json({ message: "Erro ao excluir documento", error: error.message });
    }
  }
);

// Get medical documents for professional
app.get(
  "/api/medical-documents",
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
        `
      SELECT 
        md.id,
        md.title,
        md.document_type,
        md.document_url,
        md.created_at,
        CASE 
          WHEN md.private_patient_id IS NOT NULL THEN pp.name
          WHEN md.user_id IS NOT NULL THEN u.name
          WHEN md.dependent_id IS NOT NULL THEN d.name
          ELSE 'Paciente não identificado'
        END as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      LEFT JOIN users u ON md.user_id = u.id
      LEFT JOIN dependents d ON md.dependent_id = d.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC
    `,
        [professionalId]
      );

      console.log("✅ Medical documents loaded:", result.rows.length);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching medical documents:", error);
      res.status(500).json({ message: "Erro ao carregar documentos médicos" });
    }
  }
);

// Create medical document
app.post(
  "/api/medical-documents",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const {
        title,
        document_type,
        private_patient_id,
        user_id,
        dependent_id,
        template_data,
      } = req.body;

      const professionalId = req.user.id;

      console.log("🔄 Creating medical document:", { title, document_type });

      // Validate required fields
      if (!title || !document_type || !template_data) {
        return res.status(400).json({
          message:
            "Título, tipo de documento e dados do template são obrigatórios",
        });
      }

      // Validate patient selection
      if (!private_patient_id && !user_id && !dependent_id) {
        return res.status(400).json({
          message: "É necessário selecionar um paciente",
        });
      }

      // Generate document using the document generator
      const { generateDocumentPDF } = await import(
        "./utils/documentGenerator.js"
      );
      const documentResult = await generateDocumentPDF(
        document_type,
        template_data
      );

      // Save document record to database
      const result = await pool.query(
        `
      INSERT INTO medical_documents (
        professional_id, private_patient_id, user_id, dependent_id,
        title, document_type, document_url, template_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `,
        [
          professionalId,
          private_patient_id || null,
          user_id || null,
          dependent_id || null,
          title,
          document_type,
          documentResult.url,
          JSON.stringify(template_data),
        ]
      );

      console.log("✅ Medical document created:", result.rows[0].id);

      res.status(201).json({
        id: result.rows[0].id,
        title: title,
        documentUrl: documentResult.url,
        message: "Documento criado com sucesso",
      });
    } catch (error) {
      console.error("❌ Error creating medical document:", error);
      res.status(500).json({ message: "Erro ao criar documento médico" });
    }
  }
);

// Medical documents routes
app.get(
  "/api/medical-documents",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const documentsResult = await pool.query(
        `
      SELECT 
        md.*, pp.name as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC
    `,
        [req.user.id]
      );

      res.json(documentsResult.rows);
    } catch (error) {
      console.error("❌ Error fetching medical documents:", error);
      res.status(500).json({ message: "Erro ao carregar documentos médicos" });
    }
  }
);

app.post(
  "/api/medical-documents",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { title, document_type, private_patient_id, template_data } =
        req.body;

      if (!title || !document_type || !template_data) {
        return res.status(400).json({
          message:
            "Título, tipo de documento e dados do template são obrigatórios",
        });
      }

      // Validate patient if provided
      if (private_patient_id) {
        const patientResult = await pool.query(
          `
        SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2
      `,
          [private_patient_id, req.user.id]
        );

        if (patientResult.rows.length === 0) {
          return res.status(404).json({ message: "Paciente não encontrado" });
        }
      }

      // Generate document using the document generator
      const { generateDocumentPDF } = await import(
        "./utils/documentGenerator.js"
      );
      const documentResult = await generateDocumentPDF(
        document_type,
        template_data
      );

      // Save document reference
      const documentResult2 = await pool.query(
        `
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url, template_data
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
        [
          req.user.id,
          private_patient_id || null,
          title,
          document_type,
          documentResult.url,
          JSON.stringify(template_data),
        ]
      );

      const document = documentResult2.rows[0];

      console.log("✅ Medical document created:", document.id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "CREATE",
        "medical_documents",
        document.id,
        null,
        document,
        req
      );

      res.status(201).json({
        message: "Documento criado com sucesso",
        document,
        documentUrl: documentResult.url,
      });
    } catch (error) {
      console.error("❌ Error creating medical document:", error);
      res.status(500).json({ message: "Erro ao criar documento médico" });
    }
  }
);

app.delete(
  "/api/medical-documents/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get document data before deletion
      const documentResult = await pool.query(
        `
      SELECT * FROM medical_documents WHERE id = $1 AND professional_id = $2
    `,
        [id, req.user.id]
      );

      if (documentResult.rows.length === 0) {
        return res.status(404).json({ message: "Documento não encontrado" });
      }

      const document = documentResult.rows[0];

      await pool.query(
        "DELETE FROM medical_documents WHERE id = $1 AND professional_id = $2",
        [id, req.user.id]
      );

      console.log("✅ Medical document deleted:", id);

      // Log audit action
      await logAuditAction(
        req.user.id,
        "DELETE",
        "medical_documents",
        parseInt(id),
        document,
        null,
        req
      );

      res.json({ message: "Documento excluído com sucesso" });
    } catch (error) {
      console.error("❌ Error deleting medical document:", error);
      res.status(500).json({ message: "Erro ao excluir documento médico" });
    }
  }
);

// Reports routes
app.get(
  "/api/reports/revenue",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "Data inicial e final são obrigatórias",
        });
      }

      console.log("🔄 Generating revenue report:", { start_date, end_date });

      // Get total revenue
      const totalRevenueResult = await pool.query(
        `
      SELECT COALESCE(SUM(value), 0) as total_revenue
      FROM consultations 
      WHERE date >= $1 AND date <= $2
    `,
        [start_date, end_date]
      );

      const totalRevenue = parseFloat(
        totalRevenueResult.rows[0].total_revenue
      );

      // Get revenue by professional
      const revenueByProfessionalResult = await pool.query(
        `
      SELECT 
        u.name as professional_name,
        COALESCE(u.percentage, 50) as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (COALESCE(u.percentage, 50) / 100)), 0) as professional_payment,
        COALESCE(SUM(c.value * ((100 - COALESCE(u.percentage, 50)) / 100)), 0) as clinic_revenue
      FROM users u
      LEFT JOIN consultations c ON u.id = c.professional_id 
        AND c.date >= $1 AND c.date <= $2
      WHERE 'professional' = ANY(u.roles)
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC
    `,
        [start_date, end_date]
      );

      // Get revenue by service
      const revenueByServiceResult = await pool.query(
        `
      SELECT 
        s.name as service_name,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count
      FROM services s
      LEFT JOIN consultations c ON s.id = c.service_id 
        AND c.date >= $1 AND c.date <= $2
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
  }
);

app.get(
  "/api/reports/professional-revenue",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      const professionalId = req.user.id;

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "Data inicial e final são obrigatórias",
        });
      }

      console.log("🔄 Generating professional revenue report:", {
        professionalId,
        start_date,
        end_date,
      });

      // Get professional percentage
      const professionalResult = await pool.query(
        "SELECT percentage FROM users WHERE id = $1",
        [professionalId]
      );

      const professionalPercentage =
        professionalResult.rows[0]?.percentage || 50;

      // Get consultations for the professional in the date range
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
          WHEN c.private_patient_id IS NOT NULL THEN c.value
          ELSE c.value * ((100 - $3) / 100)
        END as amount_to_pay
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `,
        [professionalId, start_date, professionalPercentage, end_date]
      );

      // Calculate summary
      const totalRevenue = consultationsResult.rows.reduce(
        (sum, c) => sum + parseFloat(c.value),
        0
      );
      const totalAmountToPay = consultationsResult.rows.reduce(
        (sum, c) => sum + parseFloat(c.amount_to_pay),
        0
      );

      const report = {
        summary: {
          professional_percentage: professionalPercentage,
          total_revenue: totalRevenue,
          consultation_count: consultationsResult.rows.length,
          amount_to_pay: totalAmountToPay,
        },
        consultations: consultationsResult.rows.map((c) => ({
          date: c.date,
          client_name: c.client_name,
          service_name: c.service_name,
          total_value: parseFloat(c.value),
          amount_to_pay: parseFloat(c.amount_to_pay),
        })),
      };

      console.log("✅ Professional revenue report generated");

      res.json(report);
    } catch (error) {
      console.error("❌ Error generating professional revenue report:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar relatório de receita profissional" });
    }
  }
);

app.get(
  "/api/reports/professional-detailed",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      const professionalId = req.user.id;

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "Data inicial e final são obrigatórias",
        });
      }

      console.log("🔄 Generating detailed professional report:", {
        professionalId,
        start_date,
        end_date,
      });

      // Get professional percentage
      const professionalResult = await pool.query(
        "SELECT percentage FROM users WHERE id = $1",
        [professionalId]
      );

      const professionalPercentage =
        professionalResult.rows[0]?.percentage || 50;

      // Get all consultations
      const consultationsResult = await pool.query(
        `
      SELECT 
        c.*,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'convenio'
        END as consultation_type
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $3
    `,
        [professionalId, start_date, end_date]
      );

      // Calculate statistics
      const totalConsultations = consultationsResult.rows.length;
      const convenioConsultations = consultationsResult.rows.filter(
        (c) => c.consultation_type === "convenio"
      ).length;
      const privateConsultations = consultationsResult.rows.filter(
        (c) => c.consultation_type === "private"
      ).length;

      const totalRevenue = consultationsResult.rows.reduce(
        (sum, c) => sum + parseFloat(c.value),
        0
      );
      const convenioRevenue = consultationsResult.rows
        .filter((c) => c.consultation_type === "convenio")
        .reduce((sum, c) => sum + parseFloat(c.value), 0);
      const privateRevenue = consultationsResult.rows
        .filter((c) => c.consultation_type === "private")
        .reduce((sum, c) => sum + parseFloat(c.value), 0);

      // Calculate amount to pay (only for convenio consultations)
      const amountToPay =
        convenioRevenue * ((100 - professionalPercentage) / 100);

      const report = {
        summary: {
          total_consultations: totalConsultations,
          convenio_consultations: convenioConsultations,
          private_consultations: privateConsultations,
          total_revenue: totalRevenue,
          convenio_revenue: convenioRevenue,
          private_revenue: privateRevenue,
          professional_percentage: professionalPercentage,
          amount_to_pay: amountToPay,
        },
      };

      console.log("✅ Detailed professional report generated");

      res.json(report);
    } catch (error) {
      console.error("❌ Error generating detailed professional report:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar relatório detalhado profissional" });
    }
  }
);

app.get(
  "/api/reports/clients-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
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
      ORDER BY client_count DESC
    `);

      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error generating clients by city report:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar relatório de clientes por cidade" });
    }
  }
);

app.get(
  "/api/reports/professionals-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
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
      ORDER BY total_professionals DESC
    `);

      // Process categories to group by category name
      const processedResult = result.rows.map((row) => {
        const categoryMap = new Map();

        row.categories.forEach((cat) => {
          const categoryName = cat.category_name;
          if (categoryMap.has(categoryName)) {
            categoryMap.set(
              categoryName,
              categoryMap.get(categoryName) + cat.count
            );
          } else {
            categoryMap.set(categoryName, cat.count);
          }
        });

        return {
          ...row,
          categories: Array.from(categoryMap.entries()).map(
            ([category_name, count]) => ({
              category_name,
              count,
            })
          ),
        };
      });

      res.json(processedResult);
    } catch (error) {
      console.error("❌ Error generating professionals by city report:", error);
      res.status(500).json({
        message: "Erro ao gerar relatório de profissionais por cidade",
      });
    }
  }
);

// Image upload route
app.post("/api/upload-image", authenticate, async (req, res) => {
  try {
    console.log("🔄 Processing image upload...");

    // Create upload middleware instance
    const upload = createUpload();

    // Use multer middleware
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("❌ Multer error:", err);
        return res.status(400).json({
          message: err.message || "Erro no upload da imagem",
        });
      }

      if (!req.file) {
        console.log("❌ No file uploaded");
        return res.status(400).json({ message: "Nenhuma imagem enviada" });
      }

      console.log("✅ Image uploaded to Cloudinary:", req.file.path);

      // Update user photo URL in database
      await pool.query("UPDATE users SET photo_url = $1 WHERE id = $2", [
        req.file.path,
        req.user.id,
      ]);

      console.log("✅ User photo URL updated in database");

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

// Payment routes
app.post("/api/create-subscription", authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    const userId = user_id || req.user.id;

    console.log("🔄 Creating subscription payment for user:", userId);

    // Verify user exists and is a client
    const userResult = await pool.query(
      `
      SELECT id, name, cpf, subscription_status 
      FROM users 
      WHERE id = $1 AND 'client' = ANY(roles)
    `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Cliente não encontrado" });
    }

    const user = userResult.rows[0];

    // Check if user already has active subscription
    if (user.subscription_status === "active") {
      return res.status(400).json({
        message: "Usuário já possui assinatura ativa",
      });
    }

    // Create MercadoPago preference
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: "Assinatura Convênio Quiro Ferreira",
          description: "Assinatura mensal do convênio de saúde",
          quantity: 1,
          unit_price: 250.0,
          currency_id: "BRL",
        },
      ],
      payer: {
        name: user.name,
        identification: {
          type: "CPF",
          number: user.cpf,
        },
      },
      back_urls: {
        success: `${req.protocol}://${req.get(
          "host"
        )}/client?payment=success`,
        failure: `${req.protocol}://${req.get(
          "host"
        )}/client?payment=failure`,
        pending: `${req.protocol}://${req.get(
          "host"
        )}/client?payment=pending`,
      },
      auto_return: "approved",
      external_reference: `subscription_${userId}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get(
        "host"
      )}/api/webhooks/mercadopago`,
    };

    const result = await preference.create({ body: preferenceData });

    // Save payment record
    await pool.query(
      `
      INSERT INTO client_payments (user_id, amount, payment_method, payment_reference, mp_preference_id)
      VALUES ($1, $2, 'mercadopago', $3, $4)
    `,
      [userId, 250.0, result.external_reference, result.id]
    );

    console.log("✅ Subscription payment created:", result.id);

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (error) {
    console.error("❌ Error creating subscription payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento da assinatura" });
  }
});

app.post(
  "/api/dependents/:id/create-payment",
  authenticate,
  authorize(["client"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      console.log("🔄 Creating dependent payment for dependent:", id);

      // Get dependent data
      const dependentResult = await pool.query(
        `
      SELECT d.*, u.name as client_name, u.cpf as client_cpf
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1 AND d.user_id = $2
    `,
        [id, req.user.id]
      );

      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: "Dependente não encontrado" });
      }

      const dependent = dependentResult.rows[0];

      // Check if dependent already has active subscription
      if (dependent.subscription_status === "active") {
        return res.status(400).json({
          message: "Dependente já possui assinatura ativa",
        });
      }

      // Create MercadoPago preference
      const preference = new Preference(client);

      const preferenceData = {
        items: [
          {
            title: `Ativação de Dependente - ${dependent.name}`,
            description: "Ativação de dependente no convênio de saúde",
            quantity: 1,
            unit_price: 50.0,
            currency_id: "BRL",
          },
        ],
        payer: {
          name: dependent.client_name,
          identification: {
            type: "CPF",
            number: dependent.client_cpf,
          },
        },
        back_urls: {
          success: `${req.protocol}://${req.get(
            "host"
          )}/client?payment=success&type=dependent`,
          failure: `${req.protocol}://${req.get(
            "host"
          )}/client?payment=failure&type=dependent`,
          pending: `${req.protocol}://${req.get(
            "host"
          )}/client?payment=pending&type=dependent`,
        },
        auto_return: "approved",
        external_reference: `dependent_${id}_${Date.now()}`,
        notification_url: `${req.protocol}://${req.get(
          "host"
        )}/api/webhooks/mercadopago`,
      };

      const result = await preference.create({ body: preferenceData });

      // Save payment record
      await pool.query(
        `
      INSERT INTO dependent_payments (dependent_id, amount, payment_method, payment_reference, mp_preference_id)
      VALUES ($1, $2, 'mercadopago', $3, $4)
    `,
        [id, 50.0, result.external_reference, result.id]
      );

      console.log("✅ Dependent payment created:", result.id);

      res.json({
        id: result.id,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point,
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
      const professionalId = req.user.id;

      console.log("🔄 Creating professional payment:", { professionalId, amount });

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valor inválido" });
      }

      // Get professional data
      const professionalResult = await pool.query(
        "SELECT name, cpf FROM users WHERE id = $1",
        [professionalId]
      );

      if (professionalResult.rows.length === 0) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const professional = professionalResult.rows[0];

      // Create MercadoPago preference
      const preference = new Preference(client);

      const preferenceData = {
        items: [
          {
            title: "Repasse ao Convênio Quiro Ferreira",
            description: "Pagamento de repasse ao convênio",
            quantity: 1,
            unit_price: parseFloat(amount),
            currency_id: "BRL",
          },
        ],
        payer: {
          name: professional.name,
          identification: {
            type: "CPF",
            number: professional.cpf,
          },
        },
        back_urls: {
          success: `${req.protocol}://${req.get(
            "host"
          )}/professional?payment=success`,
          failure: `${req.protocol}://${req.get(
            "host"
          )}/professional?payment=failure`,
          pending: `${req.protocol}://${req.get(
            "host"
          )}/professional?payment=pending`,
        },
        auto_return: "approved",
        external_reference: `professional_${professionalId}_${Date.now()}`,
        notification_url: `${req.protocol}://${req.get(
          "host"
        )}/api/webhooks/mercadopago`,
      };

      const result = await preference.create({ body: preferenceData });

      // Save payment record
      await pool.query(
        `
      INSERT INTO professional_payments (professional_id, amount, payment_method, payment_reference, mp_preference_id)
      VALUES ($1, $2, 'mercadopago', $3, $4)
    `,
        [professionalId, parseFloat(amount), result.external_reference, result.id]
      );

      console.log("✅ Professional payment created:", result.id);

      res.json({
        id: result.id,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point,
      });
    } catch (error) {
      console.error("❌ Error creating professional payment:", error);
      res
        .status(500)
        .json({ message: "Erro ao criar pagamento profissional" });
    }
  }
);

// Admin scheduling access routes
app.get(
  "/api/admin/professionals-scheduling-access",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.category_name,
        CASE 
          WHEN sa.id IS NOT NULL AND sa.expires_at > CURRENT_TIMESTAMP THEN true
          ELSE false
        END as has_scheduling_access,
        sa.expires_at as access_expires_at,
        granted_by_user.name as access_granted_by,
        sa.created_at as access_granted_at,
        sa.reason as access_reason
      FROM users u
      LEFT JOIN scheduling_access sa ON u.id = sa.professional_id AND sa.is_active = true
      LEFT JOIN users granted_by_user ON sa.granted_by = granted_by_user.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching professionals scheduling access:", error);
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

      // Verify professional exists
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

      console.log("✅ Scheduling access granted:", accessResult.rows[0].id);

      res.json({
        message: "Acesso à agenda concedido com sucesso",
        access: accessResult.rows[0],
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

      // Deactivate access
      const result = await pool.query(
        `
      UPDATE scheduling_access 
      SET is_active = false 
      WHERE professional_id = $1 AND is_active = true
      RETURNING *
    `,
        [professional_id]
      );

      console.log("✅ Scheduling access revoked for professional:", professional_id);

      res.json({
        message: "Acesso à agenda revogado com sucesso",
        revoked_count: result.rows.length,
      });
    } catch (error) {
      console.error("❌ Error revoking scheduling access:", error);
      res.status(500).json({ message: "Erro ao revogar acesso à agenda" });
    }
  }
);

// MercadoPago webhook
app.post("/api/webhooks/mercadopago", async (req, res) => {
  try {
    console.log("🔄 MercadoPago webhook received:", req.body);

    const { type, data } = req.body;

    if (type === "payment") {
      const paymentId = data.id;

      // Here you would typically verify the payment with MercadoPago API
      // For now, we'll just acknowledge the webhook
      console.log("💰 Payment notification received:", paymentId);

      // You can implement payment verification logic here
      // Example: Update subscription status based on payment confirmation
    }

    res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    res.status(500).json({ message: "Erro ao processar webhook" });
  }
});

// Serve React app in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ message: "Erro interno do servidor" });
});

// Start server
const startServer = async () => {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📊 Database connected successfully`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();