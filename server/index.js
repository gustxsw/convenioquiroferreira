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

    // Consultations table (serves as both appointments and consultations)
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
        date DATE,
        appointment_time TIME,
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
      CREATE INDEX IF NOT EXISTS idx_consultations_user_id ON consultations(user_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
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
    const consultationDateTime = new Date(`${date}T${time}`);

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

      // 3. Delete consultations
      await client.query(
          user_id: selectedDependentId ? null : clientId,
        [id]
      );
      console.log("✅ Deleted consultations");

      // 4. Delete private patients
      await client.query(
          date: consultationDateTime.toISOString(),
        [id]
          status: "completed" // For completed consultations
      )
      // 5. Delete attendance locations
      await client.query(
        "DELETE FROM attendance_locations WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Deleted attendance locations");

      // 6. Delete scheduling access
      await client.query(
        "DELETE FROM scheduling_access WHERE professional_id = $1",
        [id]
      );
      console.log("✅ Consultation created:", responseData);

      // 7. Delete dependents (if user is a client)
      await client.query("DELETE FROM dependents WHERE user_id = $1", [id]);
      console.log("✅ Deleted dependents");

      // 8. Delete notifications
      await client.query("DELETE FROM notifications WHERE user_id = $1", [id]);
      console.log("✅ Deleted notifications");

      // 9. Finally delete the user
      const deleteResult = await client.query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [id]
      );

      if (deleteResult.rows.length === 0) {
        throw new Error("Falha ao excluir usuário");
        "Consulta registrada com sucesso!"
      }
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
        d.user_id as client_id, u.name as client_name, u.subscription_status as client_subscription_status
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
      const { client_id, name, cpf, birth_date } = req.body;

      // Validate client can only create dependents for themselves
      if (req.user.id !== client_id) {
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
        [client_id]
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
        [client_id, name.trim(), cleanCPF, birth_date || null]
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

// Consultations routes (used for both appointments and completed consultations)
app.get(
  "/api/consultations",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { date } = req.query;
      const professionalId = req.user.id;

      console.log("🔄 Fetching consultations for professional:", professionalId, "date:", date);

      let query = `
      SELECT 
        c.id,
        c.date,
        c.appointment_time,
        c.status,
        c.notes,
        c.value,
        c.date,
        c.created_at,
        s.name as service_name,
        s.base_price as service_price,
        al.name as location_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE 'Paciente não identificado'
        END as patient_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.phone
          WHEN c.private_patient_id IS NOT NULL THEN pp.phone
          ELSE NULL
        END as patient_phone,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'convenio'
        END as patient_type
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1
    `;

      const params = [professionalId];

      if (date) {
        query += " AND c.date = $2";
        params.push(date);
      }

      query += " ORDER BY c.date DESC, c.appointment_time DESC";

      const result = await pool.query(query, params);

      console.log("✅ Consultations loaded:", result.rows.length);
      res.json(result.rows);
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
      )) AND c.status = 'completed'
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
        date,
        appointment_time,
        create_appointment,
        status = 'scheduled'
      } = req.body;

      console.log("🔄 Creating consultation with data:", req.body);

      // Validate required fields
      if (!service_id || !value) {
        return res
          .status(400)
          .json({ message: "Serviço e valor são obrigatórios" });
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

      // If
    }
  }
)