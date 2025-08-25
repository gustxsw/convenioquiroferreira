import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { authenticate, authorize } from "./middleware/auth.js";
import createUpload from "./middleware/upload.js";
import { generateDocumentPDF } from "./utils/documentGenerator.js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize MercadoPago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://www.cartaoquiroferreira.com.br",
      "https://cartaoquiroferreira.com.br",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, "../dist")));

// Database initialization with all tables
const initializeDatabase = async () => {
  try {
    console.log("🔄 Initializing database tables...");

    // Users table with roles array and agenda access control
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
        percentage DECIMAL(5,2) DEFAULT 50.00,
        category_id INTEGER,
        crm VARCHAR(50),
        photo_url TEXT,
        has_scheduling_access BOOLEAN DEFAULT FALSE,
        scheduling_access_expires_at TIMESTAMP,
        scheduling_access_granted_by INTEGER,
        scheduling_access_granted_at TIMESTAMP,
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
        is_base_service BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        birth_date DATE,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        billing_amount DECIMAL(10,2) DEFAULT 50.00,
        payment_reference VARCHAR(255),
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Consultations table with proper patient type handling
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        service_id INTEGER REFERENCES services(id) NOT NULL,
        location_id INTEGER REFERENCES attendance_locations(id),
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        patient_type VARCHAR(20) DEFAULT 'convenio',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_patient_type CHECK (
          (client_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL AND patient_type = 'convenio') OR
          (client_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL AND patient_type = 'convenio') OR
          (client_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL AND patient_type = 'private')
        )
      )
    `);

    // Appointments table for scheduling
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        service_id INTEGER REFERENCES services(id) NOT NULL,
        location_id INTEGER REFERENCES attendance_locations(id),
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        patient_type VARCHAR(20) DEFAULT 'convenio',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_appointment_patient_type CHECK (
          (client_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL AND patient_type = 'convenio') OR
          (client_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL AND patient_type = 'convenio') OR
          (client_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL AND patient_type = 'private')
        )
      )
    `);

    // Medical records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        private_patient_id INTEGER REFERENCES private_patients(id) NOT NULL,
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
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        private_patient_id INTEGER REFERENCES private_patients(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        template_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Client payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'subscription',
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Dependent payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER REFERENCES dependents(id) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'subscription',
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Professional payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'clinic_fee',
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Agenda payments table (NEW)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 100.00,
        payment_type VARCHAR(50) DEFAULT 'agenda_access',
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        access_duration_days INTEGER DEFAULT 30,
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
        read_at TIMESTAMP,
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

    // Insert default categories if they don't exist
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
      SELECT 'Medicina', 'Consultas médicas gerais'
      WHERE NOT EXISTS (SELECT 1 FROM service_categories WHERE name = 'Medicina')
    `);

    // Insert default services if they don't exist
    const categoryResult = await pool.query(
      "SELECT id FROM service_categories WHERE name = 'Fisioterapia' LIMIT 1"
    );

    if (categoryResult.rows.length > 0) {
      const categoryId = categoryResult.rows[0].id;

      await pool.query(`
        INSERT INTO services (name, description, base_price, category_id, is_base_service) 
        SELECT 'Consulta de Fisioterapia', 'Consulta padrão de fisioterapia', 80.00, $1, true
        WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Consulta de Fisioterapia')
      `, [categoryId]);
    }

    // Insert default system settings
    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      SELECT 'agenda_default_access_days', '7', 'Dias padrão de acesso à agenda concedidos pelo admin'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'agenda_default_access_days')
    `);

    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      SELECT 'agenda_payment_amount', '100.00', 'Valor padrão para pagamento de acesso à agenda'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'agenda_payment_amount')
    `);

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    throw error;
  }
};

// Initialize database on startup
initializeDatabase().catch((error) => {
  console.error("Failed to initialize database:", error);
  process.exit(1);
});

// Utility functions
const generateToken = (user, currentRole) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      roles: user.roles,
      currentRole: currentRole,
    },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "7d" }
  );
};

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Helper function to check if professional has scheduling access
const checkSchedulingAccess = async (professionalId) => {
  try {
    const result = await pool.query(
      `SELECT has_scheduling_access, scheduling_access_expires_at 
       FROM users 
       WHERE id = $1 AND 'professional' = ANY(roles)`,
      [professionalId]
    );

    if (result.rows.length === 0) {
      return { hasAccess: false, isExpired: false };
    }

    const user = result.rows[0];
    
    if (!user.has_scheduling_access) {
      return { hasAccess: false, isExpired: false };
    }

    // Check if access has expired
    if (user.scheduling_access_expires_at) {
      const expiryDate = new Date(user.scheduling_access_expires_at);
      const now = new Date();
      
      if (expiryDate < now) {
        // Access has expired, revoke it
        await pool.query(
          `UPDATE users 
           SET has_scheduling_access = FALSE, 
               scheduling_access_expires_at = NULL 
           WHERE id = $1`,
          [professionalId]
        );
        return { hasAccess: false, isExpired: true };
      }
    }

    return { hasAccess: true, isExpired: false };
  } catch (error) {
    console.error('Error checking scheduling access:', error);
    return { hasAccess: false, isExpired: false };
  }
};

// Middleware to check scheduling access
const requireSchedulingAccess = async (req, res, next) => {
  try {
    const professionalId = req.user.id;
    const accessCheck = await checkSchedulingAccess(professionalId);

    if (!accessCheck.hasAccess) {
      if (accessCheck.isExpired) {
        return res.status(403).json({
          message: 'Seu acesso à agenda expirou. Realize o pagamento para renovar.',
          code: 'ACCESS_EXPIRED'
        });
      } else {
        return res.status(403).json({
          message: 'Você não possui acesso à agenda. Realize o pagamento ou entre em contato com o administrador.',
          code: 'ACCESS_DENIED'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Error in scheduling access middleware:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
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

    console.log("📝 Registration attempt for:", { name, cpf });

    // Validate required fields
    if (!name || !cpf || !password) {
      return res.status(400).json({
        message: "Nome, CPF e senha são obrigatórios",
      });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({
        message: "CPF deve conter 11 dígitos numéricos",
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        message: "Usuário já cadastrado com este CPF",
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with client role only
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING id, name, cpf, roles`,
      [
        name,
        cpf,
        email || null,
        phone || null,
        birth_date || null,
        address || null,
        address_number || null,
        address_complement || null,
        neighborhood || null,
        city || null,
        state || null,
        hashedPassword,
        ["client"],
      ]
    );

    const user = result.rows[0];

    console.log("✅ User registered successfully:", user.id);

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles,
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({
      message: "Erro interno do servidor",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { cpf, password } = req.body;

    console.log("🔐 Login attempt for CPF:", cpf);

    // Validate input
    if (!cpf || !password) {
      return res.status(400).json({
        message: "CPF e senha são obrigatórios",
      });
    }

    // Find user by CPF
    const result = await pool.query(
      "SELECT id, name, cpf, password, roles FROM users WHERE cpf = $1",
      [cpf]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Credenciais inválidas",
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Credenciais inválidas",
      });
    }

    console.log("✅ Login successful for user:", user.id);

    res.json({
      message: "Login realizado com sucesso",
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      message: "Erro interno do servidor",
    });
  }
});

app.post("/api/auth/select-role", async (req, res) => {
  try {
    const { userId, role } = req.body;

    console.log("🎯 Role selection:", { userId, role });

    // Validate input
    if (!userId || !role) {
      return res.status(400).json({
        message: "ID do usuário e role são obrigatórios",
      });
    }

    // Get user and verify role
    const result = await pool.query(
      "SELECT id, name, cpf, roles FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Usuário não encontrado",
      });
    }

    const user = result.rows[0];

    if (!user.roles.includes(role)) {
      return res.status(403).json({
        message: "Role não autorizada para este usuário",
      });
    }

    // Generate token with selected role
    const token = generateToken(user, role);

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log("✅ Role selected successfully:", role);

    res.json({
      message: "Role selecionada com sucesso",
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles,
        currentRole: role,
      },
    });
  } catch (error) {
    console.error("❌ Role selection error:", error);
    res.status(500).json({
      message: "Erro interno do servidor",
    });
  }
});

app.post("/api/auth/switch-role", authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.user.id;

    console.log("🔄 Role switch:", { userId, role });

    // Get user and verify role
    const result = await pool.query(
      "SELECT id, name, cpf, roles FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Usuário não encontrado",
      });
    }

    const user = result.rows[0];

    if (!user.roles.includes(role)) {
      return res.status(403).json({
        message: "Role não autorizada para este usuário",
      });
    }

    // Generate new token with new role
    const token = generateToken(user, role);

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log("✅ Role switched successfully:", role);

    res.json({
      message: "Role alterada com sucesso",
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles,
        currentRole: role,
      },
    });
  } catch (error) {
    console.error("❌ Role switch error:", error);
    res.status(500).json({
      message: "Erro interno do servidor",
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logout realizado com sucesso" });
});

// User management routes
app.get("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.roles, 
        u.subscription_status, u.subscription_expiry, u.percentage,
        u.has_scheduling_access, u.scheduling_access_expires_at,
        sc.name as category_name,
        u.created_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Users can only access their own data unless they're admin
    if (parseInt(id) !== userId && !req.user.roles.includes("admin")) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    const result = await pool.query(
      `SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement, 
        u.neighborhood, u.city, u.state, u.zip_code,
        u.roles, u.subscription_status, u.subscription_expiry, 
        u.percentage, u.crm, u.photo_url,
        u.has_scheduling_access, u.scheduling_access_expires_at,
        sc.name as category_name,
        u.created_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/users/:id/subscription-status", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Users can only access their own data unless they're admin
    if (parseInt(id) !== userId && !req.user.roles.includes("admin")) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    const result = await pool.query(
      "SELECT subscription_status, subscription_expiry FROM users WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = result.rows[0];

    // Check if subscription has expired
    let currentStatus = user.subscription_status;
    if (
      user.subscription_expiry &&
      new Date(user.subscription_expiry) < new Date()
    ) {
      currentStatus = "expired";
      // Update status in database
      await pool.query(
        "UPDATE users SET subscription_status = 'expired' WHERE id = $1",
        [id]
      );
    }

    res.json({
      subscription_status: currentStatus,
      subscription_expiry: user.subscription_expiry,
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      email,
      phone,
      percentage,
      category_id,
      crm,
      currentPassword,
      newPassword,
    } = req.body;

    // Users can only update their own data unless they're admin
    if (parseInt(id) !== userId && !req.user.roles.includes("admin")) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          message: "Senha atual é obrigatória para alterar a senha",
        });
      }

      const userResult = await pool.query(
        "SELECT password FROM users WHERE id = $1",
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const isValidPassword = await comparePassword(
        currentPassword,
        userResult.rows[0].password
      );

      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (email !== undefined) {
      updates.push(`email = $${paramCount}`);
      values.push(email || null);
      paramCount++;
    }

    if (phone !== undefined) {
      updates.push(`phone = $${paramCount}`);
      values.push(phone || null);
      paramCount++;
    }

    if (percentage !== undefined && req.user.roles.includes("admin")) {
      updates.push(`percentage = $${paramCount}`);
      values.push(percentage);
      paramCount++;
    }

    if (category_id !== undefined && req.user.roles.includes("admin")) {
      updates.push(`category_id = $${paramCount}`);
      values.push(category_id || null);
      paramCount++;
    }

    if (crm !== undefined) {
      updates.push(`crm = $${paramCount}`);
      values.push(crm || null);
      paramCount++;
    }

    if (newPassword) {
      const hashedPassword = await hashPassword(newPassword);
      updates.push(`password = $${paramCount}`);
      values.push(hashedPassword);
      paramCount++;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE users SET ${updates.join(
      ", "
    )} WHERE id = $${paramCount} RETURNING id, name, email, phone`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    res.json({
      message: "Usuário atualizado com sucesso",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Service categories routes
app.get("/api/service-categories", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM service_categories ORDER BY name"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
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
        return res.status(400).json({
          message: "Nome da categoria é obrigatório",
        });
      }

      const result = await pool.query(
        "INSERT INTO service_categories (name, description) VALUES ($1, $2) RETURNING *",
        [name, description]
      );

      res.status(201).json({
        message: "Categoria criada com sucesso",
        category: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating category:", error);
      if (error.code === "23505") {
        res.status(400).json({
          message: "Já existe uma categoria com este nome",
        });
      } else {
        res.status(500).json({ message: "Erro interno do servidor" });
      }
    }
  }
);

// Services routes
app.get("/api/services", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id, s.name, s.description, s.base_price, s.category_id, s.is_base_service,
        sc.name as category_name
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY sc.name, s.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/services", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } =
      req.body;

    if (!name || !base_price) {
      return res.status(400).json({
        message: "Nome e preço base são obrigatórios",
      });
    }

    const result = await pool.query(
      `INSERT INTO services (name, description, base_price, category_id, is_base_service) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description, base_price, category_id || null, is_base_service || false]
    );

    res.status(201).json({
      message: "Serviço criado com sucesso",
      service: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating service:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/services/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, category_id, is_base_service } =
      req.body;

    const result = await pool.query(
      `UPDATE services 
       SET name = $1, description = $2, base_price = $3, category_id = $4, is_base_service = $5
       WHERE id = $6 RETURNING *`,
      [name, description, base_price, category_id || null, is_base_service || false, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Serviço não encontrado" });
    }

    res.json({
      message: "Serviço atualizado com sucesso",
      service: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/services/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service is being used in consultations
    const consultationCheck = await pool.query(
      "SELECT COUNT(*) as count FROM consultations WHERE service_id = $1",
      [id]
    );

    if (parseInt(consultationCheck.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Não é possível excluir um serviço que possui consultas registradas",
      });
    }

    const result = await pool.query(
      "DELETE FROM services WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Serviço não encontrado" });
    }

    res.json({ message: "Serviço excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Professionals routes
app.get("/api/professionals", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.zip_code,
        u.percentage, u.crm, u.photo_url,
        u.has_scheduling_access, u.scheduling_access_expires_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching professionals:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Dependents routes
app.get("/api/dependents/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.id;

    // Check if user can access this client's dependents
    if (
      parseInt(clientId) !== userId &&
      !req.user.roles.includes("admin") &&
      !req.user.roles.includes("professional")
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    const result = await pool.query(`
      SELECT 
        d.*,
        CASE 
          WHEN d.subscription_expiry IS NOT NULL AND d.subscription_expiry < CURRENT_TIMESTAMP 
          THEN 'expired'
          ELSE d.subscription_status
        END as current_status
      FROM dependents d
      WHERE d.client_id = $1
      ORDER BY d.name
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching dependents:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/dependents/lookup", authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.client_id,
        u.name as client_name,
        CASE 
          WHEN d.subscription_expiry IS NOT NULL AND d.subscription_expiry < CURRENT_TIMESTAMP 
          THEN 'expired'
          ELSE d.subscription_status
        END as dependent_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1
    `, [cpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error looking up dependent:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/dependents", authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;
    const userId = req.user.id;

    // Check if user can create dependents for this client
    if (
      parseInt(client_id) !== userId &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    // Validate required fields
    if (!name || !cpf) {
      return res.status(400).json({
        message: "Nome e CPF são obrigatórios",
      });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({
        message: "CPF deve conter 11 dígitos numéricos",
      });
    }

    // Check if CPF already exists
    const existingCpf = await pool.query(
      "SELECT id FROM dependents WHERE cpf = $1 UNION SELECT id FROM users WHERE cpf = $1",
      [cpf]
    );

    if (existingCpf.rows.length > 0) {
      return res.status(400).json({
        message: "CPF já cadastrado no sistema",
      });
    }

    // Check dependent limit (10 per client)
    const dependentCount = await pool.query(
      "SELECT COUNT(*) as count FROM dependents WHERE client_id = $1",
      [client_id]
    );

    if (parseInt(dependentCount.rows[0].count) >= 10) {
      return res.status(400).json({
        message: "Limite máximo de 10 dependentes por cliente",
      });
    }

    const result = await pool.query(
      `INSERT INTO dependents (client_id, name, cpf, birth_date) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [client_id, name, cpf, birth_date || null]
    );

    res.status(201).json({
      message: "Dependente criado com sucesso",
      dependent: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating dependent:", error);
    if (error.code === "23505") {
      res.status(400).json({
        message: "CPF já cadastrado no sistema",
      });
    } else {
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  }
});

app.put("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    // Check if user can update this dependent
    const dependentCheck = await pool.query(
      "SELECT client_id FROM dependents WHERE id = $1",
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    const clientId = dependentCheck.rows[0].client_id;

    if (
      clientId !== req.user.id &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    const result = await pool.query(
      "UPDATE dependents SET name = $1, birth_date = $2 WHERE id = $3 RETURNING *",
      [name, birth_date || null, id]
    );

    res.json({
      message: "Dependente atualizado com sucesso",
      dependent: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating dependent:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user can delete this dependent
    const dependentCheck = await pool.query(
      "SELECT client_id FROM dependents WHERE id = $1",
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    const clientId = dependentCheck.rows[0].client_id;

    if (
      clientId !== req.user.id &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    await pool.query("DELETE FROM dependents WHERE id = $1", [id]);

    res.json({ message: "Dependente excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting dependent:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Client lookup route
app.get("/api/clients/lookup", authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    const result = await pool.query(`
      SELECT 
        id, name, cpf,
        CASE 
          WHEN subscription_expiry IS NOT NULL AND subscription_expiry < CURRENT_TIMESTAMP 
          THEN 'expired'
          ELSE subscription_status
        END as subscription_status,
        subscription_expiry
      FROM users 
      WHERE cpf = $1 AND 'client' = ANY(roles)
    `, [cpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Cliente não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error looking up client:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Private patients routes
app.get("/api/private-patients", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM private_patients 
       WHERE professional_id = $1 
       ORDER BY name`,
      [professionalId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching private patients:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
);

app.post("/api/private-patients", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
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
      return res.status(400).json({
        message: "Nome é obrigatório",
      });
    }

    // Check if CPF already exists (if provided)
    if (cpf) {
      const existingCpf = await pool.query(
        `SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2
         UNION 
         SELECT id FROM users WHERE cpf = $1
         UNION 
         SELECT id FROM dependents WHERE cpf = $1`,
        [cpf, professionalId]
      );

      if (existingCpf.rows.length > 0) {
        return res.status(400).json({
          message: "CPF já cadastrado no sistema",
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`,
      [
        professionalId,
        name,
        cpf || null,
        email || null,
        phone || null,
        birth_date || null,
        address || null,
        address_number || null,
        address_complement || null,
        neighborhood || null,
        city || null,
        state || null,
        zip_code || null,
      ]
    );

    res.status(201).json({
      message: "Paciente criado com sucesso",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating private patient:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/private-patients/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;
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

    // Check if patient belongs to this professional
    const patientCheck = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    const result = await pool.query(
      `UPDATE private_patients SET 
        name = $1, email = $2, phone = $3, birth_date = $4,
        address = $5, address_number = $6, address_complement = $7,
        neighborhood = $8, city = $9, state = $10, zip_code = $11
       WHERE id = $12 AND professional_id = $13 
       RETURNING *`,
      [
        name,
        email || null,
        phone || null,
        birth_date || null,
        address || null,
        address_number || null,
        address_complement || null,
        neighborhood || null,
        city || null,
        state || null,
        zip_code || null,
        id,
        professionalId,
      ]
    );

    res.json({
      message: "Paciente atualizado com sucesso",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating private patient:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/private-patients/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    // Check if patient belongs to this professional
    const patientCheck = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    // Check if patient has consultations
    const consultationCheck = await pool.query(
      "SELECT COUNT(*) as count FROM consultations WHERE private_patient_id = $1",
      [id]
    );

    if (parseInt(consultationCheck.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Não é possível excluir um paciente que possui consultas registradas",
      });
    }

    await pool.query(
      "DELETE FROM private_patients WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    res.json({ message: "Paciente excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting private patient:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Attendance locations routes
app.get("/api/attendance-locations", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM attendance_locations 
       WHERE professional_id = $1 
       ORDER BY is_default DESC, name`,
      [professionalId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching attendance locations:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/attendance-locations", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
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
      return res.status(400).json({
        message: "Nome do local é obrigatório",
      });
    }

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        "UPDATE attendance_locations SET is_default = FALSE WHERE professional_id = $1",
        [professionalId]
      );
    }

    const result = await pool.query(
      `INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *`,
      [
        professionalId,
        name,
        address || null,
        address_number || null,
        address_complement || null,
        neighborhood || null,
        city || null,
        state || null,
        zip_code || null,
        phone || null,
        is_default || false,
      ]
    );

    res.status(201).json({
      message: "Local criado com sucesso",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating attendance location:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/attendance-locations/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;
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

    // Check if location belongs to this professional
    const locationCheck = await pool.query(
      "SELECT id FROM attendance_locations WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ message: "Local não encontrado" });
    }

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        "UPDATE attendance_locations SET is_default = FALSE WHERE professional_id = $1 AND id != $2",
        [professionalId, id]
      );
    }

    const result = await pool.query(
      `UPDATE attendance_locations SET 
        name = $1, address = $2, address_number = $3, address_complement = $4,
        neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9, is_default = $10
       WHERE id = $11 AND professional_id = $12 
       RETURNING *`,
      [
        name,
        address || null,
        address_number || null,
        address_complement || null,
        neighborhood || null,
        city || null,
        state || null,
        zip_code || null,
        phone || null,
        is_default || false,
        id,
        professionalId,
      ]
    );

    res.json({
      message: "Local atualizado com sucesso",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating attendance location:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/attendance-locations/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    // Check if location belongs to this professional
    const locationCheck = await pool.query(
      "SELECT id FROM attendance_locations WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ message: "Local não encontrado" });
    }

    await pool.query(
      "DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    res.json({ message: "Local excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting attendance location:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Consultations routes with corrected logic
app.get("/api/consultations", authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.value, c.date, c.patient_type, c.created_at,
        s.name as service_name,
        u.name as professional_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN u_client.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
        END as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
    `;

    const params = [];

    // Filter by user role
    if (req.user.currentRole === "professional") {
      query += " WHERE c.professional_id = $1";
      params.push(req.user.id);
    } else if (req.user.currentRole === "client") {
      query += " WHERE (c.client_id = $1 OR c.dependent_id IN (SELECT id FROM dependents WHERE client_id = $1))";
      params.push(req.user.id);
    }

    query += " ORDER BY c.date DESC";

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching consultations:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/consultations/client/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.id;

    // Check if user can access this client's consultations
    if (
      parseInt(clientId) !== userId &&
      !req.user.roles.includes("admin") &&
      !req.user.roles.includes("professional")
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    const result = await pool.query(`
      SELECT 
        c.id, c.value, c.date, c.patient_type, c.created_at,
        s.name as service_name,
        u.name as professional_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN u_client.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
        END as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE (c.client_id = $1 OR c.dependent_id IN (SELECT id FROM dependents WHERE client_id = $1))
        AND c.patient_type = 'convenio'
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching client consultations:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/consultations", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const {
      client_id,
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

    const professionalId = req.user.id;

    console.log("📝 Creating consultation:", {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      value,
      date,
    });

    // Validate required fields
    if (!service_id || !value || !date) {
      return res.status(400).json({
        message: "Serviço, valor e data são obrigatórios",
      });
    }

    // Validate patient selection
    const patientCount = [client_id, dependent_id, private_patient_id].filter(
      Boolean
    ).length;
    if (patientCount !== 1) {
      return res.status(400).json({
        message: "Selecione exatamente um tipo de paciente",
      });
    }

    // Determine patient type
    let patient_type = "convenio";
    if (private_patient_id) {
      patient_type = "private";
    }

    // For convenio patients, verify subscription status
    if (patient_type === "convenio") {
      if (client_id) {
        const clientCheck = await pool.query(
          `SELECT subscription_status, subscription_expiry FROM users WHERE id = $1`,
          [client_id]
        );

        if (clientCheck.rows.length === 0) {
          return res.status(404).json({ message: "Cliente não encontrado" });
        }

        const client = clientCheck.rows[0];
        const now = new Date();
        const isExpired = client.subscription_expiry && new Date(client.subscription_expiry) < now;

        if (client.subscription_status !== "active" || isExpired) {
          return res.status(400).json({
            message: "Cliente não possui assinatura ativa",
          });
        }
      } else if (dependent_id) {
        const dependentCheck = await pool.query(
          `SELECT subscription_status, subscription_expiry FROM dependents WHERE id = $1`,
          [dependent_id]
        );

        if (dependentCheck.rows.length === 0) {
          return res.status(404).json({ message: "Dependente não encontrado" });
        }

        const dependent = dependentCheck.rows[0];
        const now = new Date();
        const isExpired = dependent.subscription_expiry && new Date(dependent.subscription_expiry) < now;

        if (dependent.subscription_status !== "active" || isExpired) {
          return res.status(400).json({
            message: "Dependente não possui assinatura ativa",
          });
        }
      }
    }

    // Create consultation
    const consultationResult = await pool.query(
      `INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, patient_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *`,
      [
        client_id || null,
        dependent_id || null,
        private_patient_id || null,
        professionalId,
        service_id,
        location_id || null,
        value,
        date,
        patient_type,
      ]
    );

    let appointmentResult = null;

    // Create appointment if requested
    if (create_appointment && appointment_date && appointment_time) {
      appointmentResult = await pool.query(
        `INSERT INTO appointments (
          professional_id, client_id, dependent_id, private_patient_id,
          service_id, location_id, appointment_date, appointment_time, patient_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [
          professionalId,
          client_id || null,
          dependent_id || null,
          private_patient_id || null,
          service_id,
          location_id || null,
          appointment_date,
          appointment_time,
          patient_type,
        ]
      );
    }

    console.log("✅ Consultation created successfully:", consultationResult.rows[0].id);

    res.status(201).json({
      message: "Consulta registrada com sucesso",
      consultation: consultationResult.rows[0],
      appointment: appointmentResult ? appointmentResult.rows[0] : null,
    });
  } catch (error) {
    console.error("❌ Error creating consultation:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Appointments routes (NEW - with scheduling access control)
app.get("/api/appointments", authenticate, authorize(["professional"]), requireSchedulingAccess, async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { date } = req.query;

    let query = `
      SELECT 
        a.id, a.appointment_date, a.appointment_time, a.status, a.notes, a.patient_type,
        s.name as service_name,
        al.name as location_name,
        CASE 
          WHEN a.client_id IS NOT NULL THEN u_client.name
          WHEN a.dependent_id IS NOT NULL THEN d.name
          WHEN a.private_patient_id IS NOT NULL THEN pp.name
        END as patient_name,
        CASE 
          WHEN a.client_id IS NOT NULL THEN u_client.phone
          WHEN a.dependent_id IS NOT NULL THEN u_client_dep.phone
          WHEN a.private_patient_id IS NOT NULL THEN pp.phone
        END as patient_phone
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      LEFT JOIN users u_client ON a.client_id = u_client.id
      LEFT JOIN dependents d ON a.dependent_id = d.id
      LEFT JOIN users u_client_dep ON d.client_id = u_client_dep.id
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      WHERE a.professional_id = $1
    `;

    const params = [professionalId];

    if (date) {
      query += " AND a.appointment_date = $2";
      params.push(date);
    }

    query += " ORDER BY a.appointment_date, a.appointment_time";

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/appointments", authenticate, authorize(["professional"]), requireSchedulingAccess, async (req, res) => {
  try {
    const {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      appointment_date,
      appointment_time,
      notes,
    } = req.body;

    const professionalId = req.user.id;

    // Validate required fields
    if (!service_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        message: "Serviço, data e hora são obrigatórios",
      });
    }

    // Validate patient selection
    const patientCount = [client_id, dependent_id, private_patient_id].filter(
      Boolean
    ).length;
    if (patientCount !== 1) {
      return res.status(400).json({
        message: "Selecione exatamente um tipo de paciente",
      });
    }

    // Determine patient type
    let patient_type = "convenio";
    if (private_patient_id) {
      patient_type = "private";
    }

    // Check for scheduling conflicts
    const conflictCheck = await pool.query(
      `SELECT id FROM appointments 
       WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status != 'cancelled'`,
      [professionalId, appointment_date, appointment_time]
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({
        message: "Já existe um agendamento para este horário",
      });
    }

    const result = await pool.query(
      `INSERT INTO appointments (
        professional_id, client_id, dependent_id, private_patient_id,
        service_id, location_id, appointment_date, appointment_time, notes, patient_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [
        professionalId,
        client_id || null,
        dependent_id || null,
        private_patient_id || null,
        service_id,
        location_id || null,
        appointment_date,
        appointment_time,
        notes || null,
        patient_type,
      ]
    );

    res.status(201).json({
      message: "Agendamento criado com sucesso",
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/appointments/:id", authenticate, authorize(["professional"]), requireSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;
    const { appointment_date, appointment_time, status, notes } = req.body;

    // Check if appointment belongs to this professional
    const appointmentCheck = await pool.query(
      "SELECT id FROM appointments WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (appointmentCheck.rows.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    // Check for scheduling conflicts (if changing date/time)
    if (appointment_date && appointment_time) {
      const conflictCheck = await pool.query(
        `SELECT id FROM appointments 
         WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3 
         AND id != $4 AND status != 'cancelled'`,
        [professionalId, appointment_date, appointment_time, id]
      );

      if (conflictCheck.rows.length > 0) {
        return res.status(400).json({
          message: "Já existe um agendamento para este horário",
        });
      }
    }

    const result = await pool.query(
      `UPDATE appointments SET 
        appointment_date = COALESCE($1, appointment_date),
        appointment_time = COALESCE($2, appointment_time),
        status = COALESCE($3, status),
        notes = COALESCE($4, notes)
       WHERE id = $5 AND professional_id = $6 
       RETURNING *`,
      [appointment_date, appointment_time, status, notes, id, professionalId]
    );

    res.json({
      message: "Agendamento atualizado com sucesso",
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating appointment:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/appointments/:id", authenticate, authorize(["professional"]), requireSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    // Check if appointment belongs to this professional
    const appointmentCheck = await pool.query(
      "SELECT id FROM appointments WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (appointmentCheck.rows.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    await pool.query(
      "DELETE FROM appointments WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    res.json({ message: "Agendamento excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Medical records routes
app.get("/api/medical-records", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(`
      SELECT 
        mr.*,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [professionalId]);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching medical records:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/medical-records", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
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
      return res.status(400).json({
        message: "Paciente é obrigatório",
      });
    }

    // Verify patient belongs to this professional
    const patientCheck = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [private_patient_id, professionalId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    const result = await pool.query(
      `INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING *`,
      [
        professionalId,
        private_patient_id,
        chief_complaint || null,
        history_present_illness || null,
        past_medical_history || null,
        medications || null,
        allergies || null,
        physical_examination || null,
        diagnosis || null,
        treatment_plan || null,
        notes || null,
        vital_signs || null,
      ]
    );

    res.status(201).json({
      message: "Prontuário criado com sucesso",
      record: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating medical record:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/medical-records/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;
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

    // Check if record belongs to this professional
    const recordCheck = await pool.query(
      "SELECT id FROM medical_records WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: "Prontuário não encontrado" });
    }

    const result = await pool.query(
      `UPDATE medical_records SET 
        chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
        medications = $4, allergies = $5, physical_examination = $6,
        diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND professional_id = $12 
       RETURNING *`,
      [
        chief_complaint || null,
        history_present_illness || null,
        past_medical_history || null,
        medications || null,
        allergies || null,
        physical_examination || null,
        diagnosis || null,
        treatment_plan || null,
        notes || null,
        vital_signs || null,
        id,
        professionalId,
      ]
    );

    res.json({
      message: "Prontuário atualizado com sucesso",
      record: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating medical record:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/medical-records/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    // Check if record belongs to this professional
    const recordCheck = await pool.query(
      "SELECT id FROM medical_records WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: "Prontuário não encontrado" });
    }

    await pool.query(
      "DELETE FROM medical_records WHERE id = $1 AND professional_id = $2",
      [id, professionalId]
    );

    res.json({ message: "Prontuário excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting medical record:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/medical-records/generate-document", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { record_id, template_data } = req.body;
    const professionalId = req.user.id;

    // Verify record belongs to this professional
    const recordCheck = await pool.query(
      "SELECT id FROM medical_records WHERE id = $1 AND professional_id = $2",
      [record_id, professionalId]
    );

    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: "Prontuário não encontrado" });
    }

    // Generate document
    const documentResult = await generateDocumentPDF('medical_record', template_data);

    res.json({
      message: "Documento gerado com sucesso",
      documentUrl: documentResult.url,
    });
  } catch (error) {
    console.error("Error generating medical record document:", error);
    res.status(500).json({ message: "Erro ao gerar documento" });
  }
});

// Medical documents routes
app.get("/api/medical-documents", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(`
      SELECT 
        md.*,
        pp.name as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC
    `, [professionalId]);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching medical documents:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/medical-documents", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({
        message: "Título, tipo de documento e dados do template são obrigatórios",
      });
    }

    // Verify patient belongs to this professional (if specified)
    if (private_patient_id) {
      const patientCheck = await pool.query(
        "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
        [private_patient_id, professionalId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(
      `INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url, template_data
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *`,
      [
        professionalId,
        private_patient_id || null,
        title,
        document_type,
        documentResult.url,
        template_data,
      ]
    );

    res.status(201).json({
      message: "Documento criado com sucesso",
      title: title,
      documentUrl: documentResult.url,
      document: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating medical document:", error);
    res.status(500).json({ message: "Erro ao criar documento" });
  }
});

// Image upload route
app.post("/api/upload-image", authenticate, async (req, res) => {
  try {
    const upload = createUpload();

    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("❌ Upload error:", err);
        return res.status(400).json({
          message: err.message || "Erro no upload da imagem",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Nenhuma imagem foi enviada",
        });
      }

      console.log("✅ Image uploaded successfully:", req.file.path);

      // Update user photo URL
      await pool.query(
        "UPDATE users SET photo_url = $1 WHERE id = $2",
        [req.file.path, req.user.id]
      );

      res.json({
        message: "Imagem enviada com sucesso",
        imageUrl: req.file.path,
      });
    });
  } catch (error) {
    console.error("❌ Upload route error:", error);
    res.status(500).json({
      message: "Erro interno do servidor",
    });
  }
});

// Reports routes with corrected calculation logic
app.get("/api/reports/revenue", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        message: "Data inicial e final são obrigatórias",
      });
    }

    console.log("🔄 Generating revenue report for period:", { start_date, end_date });

    // Get consultations for the period (ONLY convenio patients)
    const consultationsResult = await pool.query(`
      SELECT 
        c.id, c.value, c.date, c.patient_type,
        u.name as professional_name, u.percentage as professional_percentage,
        s.name as service_name
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2 
        AND c.patient_type = 'convenio'
      ORDER BY c.date DESC
    `, [start_date, end_date]);

    const consultations = consultationsResult.rows;
    console.log("📊 Found consultations for revenue calculation:", consultations.length);

    // Calculate total revenue (only convenio)
    const total_revenue = consultations.reduce((sum, c) => sum + parseFloat(c.value), 0);

    // Calculate revenue by professional (only convenio)
    const professionalRevenue = {};
    consultations.forEach(consultation => {
      const profName = consultation.professional_name;
      const profPercentage = parseFloat(consultation.professional_percentage) || 50;
      const consultationValue = parseFloat(consultation.value);
      
      if (!professionalRevenue[profName]) {
        professionalRevenue[profName] = {
          professional_name: profName,
          professional_percentage: profPercentage,
          revenue: 0,
          consultation_count: 0,
          professional_payment: 0,
          clinic_revenue: 0
        };
      }
      
      professionalRevenue[profName].revenue += consultationValue;
      professionalRevenue[profName].consultation_count += 1;
      professionalRevenue[profName].professional_payment += consultationValue * (profPercentage / 100);
      professionalRevenue[profName].clinic_revenue += consultationValue * ((100 - profPercentage) / 100);
    });

    // Calculate revenue by service (only convenio)
    const serviceRevenue = {};
    consultations.forEach(consultation => {
      const serviceName = consultation.service_name;
      const consultationValue = parseFloat(consultation.value);
      
      if (!serviceRevenue[serviceName]) {
        serviceRevenue[serviceName] = {
          service_name: serviceName,
          revenue: 0,
          consultation_count: 0
        };
      }
      
      serviceRevenue[serviceName].revenue += consultationValue;
      serviceRevenue[serviceName].consultation_count += 1;
    });

    const report = {
      total_revenue,
      revenue_by_professional: Object.values(professionalRevenue),
      revenue_by_service: Object.values(serviceRevenue)
    };

    console.log("✅ Revenue report generated:", {
      total_revenue: report.total_revenue,
      professionals_count: report.revenue_by_professional.length,
      services_count: report.revenue_by_service.length
    });

    res.json(report);
  } catch (error) {
    console.error("❌ Error generating revenue report:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/reports/professional-revenue", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const professionalId = req.user.id;

    if (!start_date || !end_date) {
      return res.status(400).json({
        message: "Data inicial e final são obrigatórias",
      });
    }

    console.log("🔄 Generating professional revenue report:", { professionalId, start_date, end_date });

    // Get professional data
    const professionalResult = await pool.query(
      "SELECT percentage FROM users WHERE id = $1",
      [professionalId]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    const professional_percentage = parseFloat(professionalResult.rows[0].percentage) || 50;

    // Get consultations for the period (ONLY convenio patients for payment calculation)
    const consultationsResult = await pool.query(`
      SELECT 
        c.id, c.value, c.date, c.patient_type,
        s.name as service_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN u_client.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
        END as client_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $3
        AND c.patient_type = 'convenio'
      ORDER BY c.date DESC
    `, [professionalId, start_date, end_date]);

    const convenioConsultations = consultationsResult.rows;

    // Calculate amount to pay (only convenio consultations)
    const convenio_revenue = convenioConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const amount_to_pay = convenio_revenue * ((100 - professional_percentage) / 100);

    console.log("📊 Professional revenue calculation:", {
      convenio_consultations: convenioConsultations.length,
      convenio_revenue,
      professional_percentage,
      amount_to_pay
    });

    const report = {
      summary: {
        professional_percentage,
        total_revenue: convenio_revenue,
        consultation_count: convenioConsultations.length,
        amount_to_pay
      },
      consultations: convenioConsultations.map(c => ({
        date: c.date,
        client_name: c.client_name,
        service_name: c.service_name,
        total_value: parseFloat(c.value),
        amount_to_pay: parseFloat(c.value) * ((100 - professional_percentage) / 100)
      }))
    };

    res.json(report);
  } catch (error) {
    console.error("❌ Error generating professional revenue report:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/reports/professional-detailed", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const professionalId = req.user.id;

    if (!start_date || !end_date) {
      return res.status(400).json({
        message: "Data inicial e final são obrigatórias",
      });
    }

    // Get professional data
    const professionalResult = await pool.query(
      "SELECT percentage FROM users WHERE id = $1",
      [professionalId]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    const professional_percentage = parseFloat(professionalResult.rows[0].percentage) || 50;

    // Get all consultations for the period
    const allConsultationsResult = await pool.query(`
      SELECT 
        c.id, c.value, c.date, c.patient_type,
        s.name as service_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN u_client.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
        END as client_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $3
      ORDER BY c.date DESC
    `, [professionalId, start_date, end_date]);

    const allConsultations = allConsultationsResult.rows;

    // Separate convenio and private consultations
    const convenioConsultations = allConsultations.filter(c => c.patient_type === 'convenio');
    const privateConsultations = allConsultations.filter(c => c.patient_type === 'private');

    // Calculate revenues
    const convenio_revenue = convenioConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const private_revenue = privateConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const total_revenue = convenio_revenue + private_revenue;

    // Calculate amount to pay (only from convenio consultations)
    const amount_to_pay = convenio_revenue * ((100 - professional_percentage) / 100);

    const report = {
      summary: {
        total_consultations: allConsultations.length,
        convenio_consultations: convenioConsultations.length,
        private_consultations: privateConsultations.length,
        total_revenue,
        convenio_revenue,
        private_revenue,
        professional_percentage,
        amount_to_pay
      }
    };

    res.json(report);
  } catch (error) {
    console.error("Error generating detailed professional report:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/reports/clients-by-city", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        city, state,
        COUNT(*) as client_count,
        COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_clients,
        COUNT(CASE WHEN subscription_status = 'pending' THEN 1 END) as pending_clients,
        COUNT(CASE WHEN subscription_status = 'expired' OR (subscription_expiry IS NOT NULL AND subscription_expiry < CURRENT_TIMESTAMP) THEN 1 END) as expired_clients
      FROM users 
      WHERE 'client' = ANY(roles) AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error generating clients by city report:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.get("/api/reports/professionals-by-city", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.city, u.state,
        COUNT(*) as total_professionals,
        json_agg(
          json_build_object(
            'category_name', COALESCE(sc.name, 'Sem categoria'),
            'count', 1
          )
        ) as categories
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles) AND u.city IS NOT NULL AND u.city != ''
      GROUP BY u.city, u.state
      ORDER BY total_professionals DESC, u.city
    `);

    // Process the categories to group them properly
    const processedResult = result.rows.map(row => {
      const categoryMap = {};
      row.categories.forEach(cat => {
        const categoryName = cat.category_name;
        if (categoryMap[categoryName]) {
          categoryMap[categoryName].count += cat.count;
        } else {
          categoryMap[categoryName] = { category_name: categoryName, count: cat.count };
        }
      });
      
      return {
        ...row,
        categories: Object.values(categoryMap)
      };
    });

    res.json(processedResult);
  } catch (error) {
    console.error("Error generating professionals by city report:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Admin scheduling access management routes (NEW)
app.get("/api/admin/professionals-scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone,
        u.has_scheduling_access, u.scheduling_access_expires_at,
        u.scheduling_access_granted_at,
        sc.name as category_name,
        granted_by.name as access_granted_by
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      LEFT JOIN users granted_by ON u.scheduling_access_granted_by = granted_by.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.has_scheduling_access DESC, u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching professionals scheduling access:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/admin/grant-scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { professional_id, expires_at, reason } = req.body;
    const adminId = req.user.id;

    if (!professional_id || !expires_at) {
      return res.status(400).json({
        message: "ID do profissional e data de expiração são obrigatórios",
      });
    }

    // Verify professional exists
    const professionalCheck = await pool.query(
      "SELECT id, name FROM users WHERE id = $1 AND 'professional' = ANY(roles)",
      [professional_id]
    );

    if (professionalCheck.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    // Grant access
    await pool.query(`
      UPDATE users SET 
        has_scheduling_access = TRUE,
        scheduling_access_expires_at = $1,
        scheduling_access_granted_by = $2,
        scheduling_access_granted_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [expires_at, adminId, professional_id]);

    // Log the action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
      VALUES ($1, 'GRANT_SCHEDULING_ACCESS', 'users', $2, $3)
    `, [
      adminId,
      professional_id,
      JSON.stringify({
        expires_at,
        reason: reason || null,
        granted_by: req.user.name
      })
    ]);

    res.json({
      message: "Acesso à agenda concedido com sucesso",
      professional_name: professionalCheck.rows[0].name,
      expires_at
    });
  } catch (error) {
    console.error("Error granting scheduling access:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/admin/revoke-scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { professional_id } = req.body;
    const adminId = req.user.id;

    if (!professional_id) {
      return res.status(400).json({
        message: "ID do profissional é obrigatório",
      });
    }

    // Verify professional exists
    const professionalCheck = await pool.query(
      "SELECT id, name FROM users WHERE id = $1 AND 'professional' = ANY(roles)",
      [professional_id]
    );

    if (professionalCheck.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    // Revoke access
    await pool.query(`
      UPDATE users SET 
        has_scheduling_access = FALSE,
        scheduling_access_expires_at = NULL,
        scheduling_access_granted_by = NULL,
        scheduling_access_granted_at = NULL
      WHERE id = $1
    `, [professional_id]);

    // Log the action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
      VALUES ($1, 'REVOKE_SCHEDULING_ACCESS', 'users', $2, $3)
    `, [
      adminId,
      professional_id,
      JSON.stringify({
        revoked_by: req.user.name,
        revoked_at: new Date().toISOString()
      })
    ]);

    res.json({
      message: "Acesso à agenda revogado com sucesso",
      professional_name: professionalCheck.rows[0].name
    });
  } catch (error) {
    console.error("Error revoking scheduling access:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Professional agenda payment routes (NEW)
app.post("/api/professional/create-agenda-payment", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { duration_days = 30 } = req.body;

    // Check if professional already has active access
    const accessCheck = await checkSchedulingAccess(professionalId);
    if (accessCheck.hasAccess) {
      return res.status(400).json({
        message: "Você já possui acesso ativo à agenda",
      });
    }

    // Get payment amount from settings
    const settingsResult = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'agenda_payment_amount'"
    );

    const amount = settingsResult.rows.length > 0 
      ? parseFloat(settingsResult.rows[0].value) 
      : 100.00;

    // Create payment record
    const paymentResult = await pool.query(`
      INSERT INTO agenda_payments (professional_id, amount, access_duration_days)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [professionalId, amount, duration_days]);

    const payment = paymentResult.rows[0];

    // Create MercadoPago preference
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Acesso à Agenda - ${duration_days} dias`,
          description: `Acesso completo ao sistema de agendamentos por ${duration_days} dias`,
          quantity: 1,
          unit_price: amount,
        },
      ],
      payer: {
        name: req.user.name,
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/professional?payment=success&type=agenda`,
        failure: `${req.protocol}://${req.get('host')}/professional?payment=failure&type=agenda`,
        pending: `${req.protocol}://${req.get('host')}/professional?payment=pending&type=agenda`,
      },
      auto_return: "approved",
      external_reference: `agenda_${payment.id}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Update payment with MercadoPago data
    await pool.query(
      `UPDATE agenda_payments 
       SET payment_reference = $1, mp_preference_id = $2 
       WHERE id = $3`,
      [`agenda_${payment.id}`, response.id, payment.id]
    );

    res.json({
      message: "Pagamento criado com sucesso",
      init_point: response.init_point,
      payment_id: payment.id,
    });
  } catch (error) {
    console.error("Error creating agenda payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento" });
  }
});

// Professional clinic fee payment routes (existing, corrected)
app.post("/api/professional/create-payment", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: "Valor deve ser maior que zero",
      });
    }

    // Create payment record
    const paymentResult = await pool.query(`
      INSERT INTO professional_payments (professional_id, amount, payment_type)
      VALUES ($1, $2, 'clinic_fee')
      RETURNING *
    `, [professionalId, amount]);

    const payment = paymentResult.rows[0];

    // Create MercadoPago preference
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: "Repasse ao Convênio Quiro Ferreira",
          description: "Valor referente às consultas realizadas",
          quantity: 1,
          unit_price: parseFloat(amount),
        },
      ],
      payer: {
        name: req.user.name,
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/professional?payment=success&type=clinic`,
        failure: `${req.protocol}://${req.get('host')}/professional?payment=failure&type=clinic`,
        pending: `${req.protocol}://${req.get('host')}/professional?payment=pending&type=clinic`,
      },
      auto_return: "approved",
      external_reference: `professional_${payment.id}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Update payment with MercadoPago data
    await pool.query(
      `UPDATE professional_payments 
       SET payment_reference = $1, mp_preference_id = $2 
       WHERE id = $3`,
      [`professional_${payment.id}`, response.id, payment.id]
    );

    res.json({
      message: "Pagamento criado com sucesso",
      init_point: response.init_point,
      payment_id: payment.id,
    });
  } catch (error) {
    console.error("Error creating professional payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento" });
  }
});

// Client subscription payment routes (existing)
app.post("/api/create-subscription", authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    const requestUserId = req.user.id;

    // Users can only create payments for themselves unless they're admin
    if (user_id !== requestUserId && !req.user.roles.includes("admin")) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    // Check if user already has active subscription
    const userCheck = await pool.query(
      `SELECT subscription_status, subscription_expiry FROM users WHERE id = $1`,
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = userCheck.rows[0];
    const now = new Date();
    const isExpired = user.subscription_expiry && new Date(user.subscription_expiry) < now;

    if (user.subscription_status === "active" && !isExpired) {
      return res.status(400).json({
        message: "Usuário já possui assinatura ativa",
      });
    }

    // Create payment record
    const paymentResult = await pool.query(`
      INSERT INTO client_payments (client_id, amount, payment_type)
      VALUES ($1, $2, 'subscription')
      RETURNING *
    `, [user_id, 250.00]);

    const payment = paymentResult.rows[0];

    // Create MercadoPago preference
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: "Assinatura Convênio Quiro Ferreira",
          description: "Assinatura anual do convênio de saúde",
          quantity: 1,
          unit_price: 250.0,
        },
      ],
      payer: {
        name: req.user.name,
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success&type=subscription`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure&type=subscription`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending&type=subscription`,
      },
      auto_return: "approved",
      external_reference: `client_${payment.id}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Update payment with MercadoPago data
    await pool.query(
      `UPDATE client_payments 
       SET payment_reference = $1, mp_preference_id = $2 
       WHERE id = $3`,
      [`client_${payment.id}`, response.id, payment.id]
    );

    res.json({
      message: "Pagamento criado com sucesso",
      init_point: response.init_point,
      payment_id: payment.id,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({ message: "Erro ao criar assinatura" });
  }
});

// Dependent payment routes (existing)
app.post("/api/dependents/:id/create-payment", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user can create payment for this dependent
    const dependentCheck = await pool.query(
      "SELECT client_id, name, subscription_status FROM dependents WHERE id = $1",
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    const dependent = dependentCheck.rows[0];

    if (dependent.client_id !== userId && !req.user.roles.includes("admin")) {
      return res.status(403).json({ message: "Acesso não autorizado" });
    }

    if (dependent.subscription_status === "active") {
      return res.status(400).json({
        message: "Dependente já possui assinatura ativa",
      });
    }

    // Create payment record
    const paymentResult = await pool.query(`
      INSERT INTO dependent_payments (dependent_id, amount, payment_type)
      VALUES ($1, $2, 'subscription')
      RETURNING *
    `, [id, 50.00]);

    const payment = paymentResult.rows[0];

    // Create MercadoPago preference
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Assinatura Dependente - ${dependent.name}`,
          description: "Assinatura anual do dependente no convênio",
          quantity: 1,
          unit_price: 50.0,
        },
      ],
      payer: {
        name: req.user.name,
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success&type=dependent`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure&type=dependent`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending&type=dependent`,
      },
      auto_return: "approved",
      external_reference: `dependent_${payment.id}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Update payment with MercadoPago data
    await pool.query(
      `UPDATE dependent_payments 
       SET payment_reference = $1, mp_preference_id = $2 
       WHERE id = $3`,
      [`dependent_${payment.id}`, response.id, payment.id]
    );

    res.json({
      message: "Pagamento criado com sucesso",
      init_point: response.init_point,
      payment_id: payment.id,
    });
  } catch (error) {
    console.error("Error creating dependent payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento" });
  }
});

// MercadoPago webhook handler (enhanced for agenda payments)
app.post("/api/webhooks/mercadopago", async (req, res) => {
  try {
    const { type, data } = req.body;

    console.log("🔔 MercadoPago webhook received:", { type, data });

    if (type === "payment") {
      const paymentId = data.id;

      // Get payment details from MercadoPago
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      if (!mpResponse.ok) {
        console.error("❌ Failed to fetch payment from MercadoPago");
        return res.status(400).json({ message: "Falha ao buscar pagamento" });
      }

      const paymentData = await mpResponse.json();
      const externalReference = paymentData.external_reference;
      const status = paymentData.status;

      console.log("💰 Payment data:", { externalReference, status });

      if (!externalReference) {
        console.warn("⚠️ No external reference found");
        return res.status(400).json({ message: "Referência externa não encontrada" });
      }

      // Process different payment types
      if (externalReference.startsWith("client_")) {
        await processClientPayment(externalReference, paymentData);
      } else if (externalReference.startsWith("dependent_")) {
        await processDependentPayment(externalReference, paymentData);
      } else if (externalReference.startsWith("professional_")) {
        await processProfessionalPayment(externalReference, paymentData);
      } else if (externalReference.startsWith("agenda_")) {
        await processAgendaPayment(externalReference, paymentData);
      }
    }

    res.status(200).json({ message: "Webhook processado com sucesso" });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Payment processing functions
const processClientPayment = async (externalReference, paymentData) => {
  try {
    const paymentId = externalReference.replace("client_", "");
    const status = paymentData.status;

    console.log("💳 Processing client payment:", { paymentId, status });

    // Update payment record
    await pool.query(
      `UPDATE client_payments 
       SET payment_status = $1, mp_payment_id = $2, processed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [status, paymentData.id, paymentId]
    );

    if (status === "approved") {
      // Get payment details
      const paymentResult = await pool.query(
        "SELECT client_id FROM client_payments WHERE id = $1",
        [paymentId]
      );

      if (paymentResult.rows.length > 0) {
        const clientId = paymentResult.rows[0].client_id;

        // Activate subscription for 1 year
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        await pool.query(
          `UPDATE users 
           SET subscription_status = 'active', subscription_expiry = $1 
           WHERE id = $2`,
          [expiryDate, clientId]
        );

        console.log("✅ Client subscription activated:", clientId);
      }
    }
  } catch (error) {
    console.error("❌ Error processing client payment:", error);
    throw error;
  }
};

const processDependentPayment = async (externalReference, paymentData) => {
  try {
    const paymentId = externalReference.replace("dependent_", "");
    const status = paymentData.status;

    console.log("👥 Processing dependent payment:", { paymentId, status });

    // Update payment record
    await pool.query(
      `UPDATE dependent_payments 
       SET payment_status = $1, mp_payment_id = $2, processed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [status, paymentData.id, paymentId]
    );

    if (status === "approved") {
      // Get payment details
      const paymentResult = await pool.query(
        "SELECT dependent_id FROM dependent_payments WHERE id = $1",
        [paymentId]
      );

      if (paymentResult.rows.length > 0) {
        const dependentId = paymentResult.rows[0].dependent_id;

        // Activate dependent subscription for 1 year
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        await pool.query(
          `UPDATE dependents 
           SET subscription_status = 'active', subscription_expiry = $1, activated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [expiryDate, dependentId]
        );

        console.log("✅ Dependent subscription activated:", dependentId);
      }
    }
  } catch (error) {
    console.error("❌ Error processing dependent payment:", error);
    throw error;
  }
};

const processProfessionalPayment = async (externalReference, paymentData) => {
  try {
    const paymentId = externalReference.replace("professional_", "");
    const status = paymentData.status;

    console.log("👨‍⚕️ Processing professional payment:", { paymentId, status });

    // Update payment record
    await pool.query(
      `UPDATE professional_payments 
       SET payment_status = $1, mp_payment_id = $2, processed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [status, paymentData.id, paymentId]
    );

    console.log("✅ Professional payment processed:", paymentId);
  } catch (error) {
    console.error("❌ Error processing professional payment:", error);
    throw error;
  }
};

const processAgendaPayment = async (externalReference, paymentData) => {
  try {
    const paymentId = externalReference.replace("agenda_", "");
    const status = paymentData.status;

    console.log("📅 Processing agenda payment:", { paymentId, status });

    // Update payment record
    await pool.query(
      `UPDATE agenda_payments 
       SET payment_status = $1, mp_payment_id = $2, processed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [status, paymentData.id, paymentId]
    );

    if (status === "approved") {
      // Get payment details
      const paymentResult = await pool.query(
        "SELECT professional_id, access_duration_days FROM agenda_payments WHERE id = $1",
        [paymentId]
      );

      if (paymentResult.rows.length > 0) {
        const { professional_id, access_duration_days } = paymentResult.rows[0];

        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + access_duration_days);

        // Grant scheduling access
        await pool.query(
          `UPDATE users 
           SET has_scheduling_access = TRUE, 
               scheduling_access_expires_at = $1,
               scheduling_access_granted_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [expiryDate, professional_id]
        );

        console.log("✅ Scheduling access granted:", { professional_id, expiryDate });
      }
    }
  } catch (error) {
    console.error("❌ Error processing agenda payment:", error);
    throw error;
  }
};

// Admin routes for user management
app.post("/api/admin/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const {
      name,
      cpf,
      email,
      phone,
      roles,
      percentage,
      category_id,
      crm,
      password,
    } = req.body;

    if (!name || !cpf || !password || !roles || roles.length === 0) {
      return res.status(400).json({
        message: "Nome, CPF, senha e pelo menos uma role são obrigatórios",
      });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({
        message: "CPF deve conter 11 dígitos numéricos",
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        message: "Usuário já cadastrado com este CPF",
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, password, roles, percentage, category_id, crm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING id, name, cpf, email, phone, roles`,
      [
        name,
        cpf,
        email || null,
        phone || null,
        hashedPassword,
        roles,
        percentage || 50,
        category_id || null,
        crm || null,
      ]
    );

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/admin/users/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      roles,
      percentage,
      category_id,
      crm,
      subscription_status,
    } = req.body;

    const result = await pool.query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        roles = COALESCE($4, roles),
        percentage = COALESCE($5, percentage),
        category_id = COALESCE($6, category_id),
        crm = COALESCE($7, crm),
        subscription_status = COALESCE($8, subscription_status),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 
       RETURNING id, name, email, phone, roles`,
      [name, email, phone, roles, percentage, category_id, crm, subscription_status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    res.json({
      message: "Usuário atualizado com sucesso",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.delete("/api/admin/users/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user has consultations
    const consultationCheck = await pool.query(
      `SELECT COUNT(*) as count FROM consultations 
       WHERE professional_id = $1 OR client_id = $1`,
      [id]
    );

    if (parseInt(consultationCheck.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Não é possível excluir um usuário que possui consultas registradas",
      });
    }

    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING name",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    res.json({ message: "Usuário excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Admin dependents route
app.get("/api/admin/dependents", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        u.name as client_name,
        CASE 
          WHEN d.subscription_expiry IS NOT NULL AND d.subscription_expiry < CURRENT_TIMESTAMP 
          THEN 'expired'
          ELSE d.subscription_status
        END as current_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching admin dependents:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// System settings routes (NEW)
app.get("/api/admin/settings", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM system_settings ORDER BY key"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching system settings:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/admin/settings/:key", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const adminId = req.user.id;

    const result = await pool.query(
      `UPDATE system_settings 
       SET value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE key = $3 
       RETURNING *`,
      [value, adminId, key]
    );

    if (result.rows.length === 0) {
      // Create new setting if it doesn't exist
      const insertResult = await pool.query(
        `INSERT INTO system_settings (key, value, updated_by) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [key, value, adminId]
      );

      return res.json({
        message: "Configuração criada com sucesso",
        setting: insertResult.rows[0],
      });
    }

    res.json({
      message: "Configuração atualizada com sucesso",
      setting: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating system setting:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Professional scheduling access status route (NEW)
app.get("/api/professional/scheduling-access-status", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const accessCheck = await checkSchedulingAccess(professionalId);

    const result = await pool.query(
      `SELECT has_scheduling_access, scheduling_access_expires_at 
       FROM users 
       WHERE id = $1`,
      [professionalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    const user = result.rows[0];

    res.json({
      hasAccess: accessCheck.hasAccess,
      isExpired: accessCheck.isExpired,
      expiresAt: user.scheduling_access_expires_at,
      canPurchase: !accessCheck.hasAccess
    });
  } catch (error) {
    console.error("Error checking scheduling access status:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Notifications routes (NEW)
app.get("/api/notifications", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE notifications 
       SET read_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2 
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notificação não encontrada" });
    }

    res.json({
      message: "Notificação marcada como lida",
      notification: result.rows[0],
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "3.0.0",
    features: ["agenda_control", "payment_system", "medical_records"],
  });
});

// Catch-all route for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error);
  res.status(500).json({
    message: "Erro interno do servidor",
    ...(process.env.NODE_ENV === "development" && { error: error.message }),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("✅ QuiroFerreira API v3.0 - Agenda Control Phase");
});

export default app;