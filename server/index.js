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

    // Consultations table - MAIN TABLE FOR AGENDA
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

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
      CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);
      CREATE INDEX IF NOT EXISTS idx_dependents_user_id ON dependents(user_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_professional_id ON consultations(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
      CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
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

// ===== CONSULTATIONS ROUTES (MAIN AGENDA SYSTEM) =====

// Get consultations for professional agenda (by date)
app.get(
  "/api/consultations/agenda",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
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
  }
);

// Create new consultation
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
  }
);

// Update consultation (full update)
app.put(
  "/api/consultations/:id",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
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
  }
);

// Delete consultation
app.delete(
  "/api/consultations/:id",
  authenticate,
  authorize(["professional"]),
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
        ORDER BY c.date DESC
      `);

      console.log("✅ All consultations fetched:", consultationsResult.rows.length);

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
  }
);

// ===== OTHER EXISTING ROUTES =====

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

    console.log("✅ Dependents fetched for client:", clientId, "Count:", dependentsResult.rows.length);

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

// Service categories routes
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
      res.status(500).json({ message: "Erro ao carregar pacientes particulares" });
    }
  }
);

// Attendance locations routes
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
      res.status(500).json({ message: "Erro ao carregar locais de atendimento" });
    }
  }
);

// Reports routes
app.get(
  "/api/reports/professional-revenue",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
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
  }
);

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Catch-all route for SPA in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  res.status(500).json({
    message: "Erro interno do servidor",
    ...(process.env.NODE_ENV === "development" && { error: err.message }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

// Start server
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