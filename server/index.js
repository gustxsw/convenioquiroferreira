const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use("/uploads", express.static(uploadsDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido"));
    }
  },
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Middleware to authenticate JWT token
const authenticate = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Token de acesso requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    res.status(401).json({ message: "Token inválido" });
  }
};

// Middleware to authorize based on roles
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Usuário não autenticado" });
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    next();
  };
};

// Audit logging function
const logAuditAction = async (userId, action, tableName, recordId, oldData, newData, req) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress || "unknown";
    const userAgent = req.get("User-Agent") || "unknown";

    await pool.query(
      `
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [userId, action, tableName, recordId, JSON.stringify(oldData), JSON.stringify(newData), ipAddress, userAgent]
    );
  } catch (error) {
    console.error("Error logging audit action:", error);
  }
};

// Middleware to check scheduling access
const checkSchedulingAccess = async (req, res, next) => {
  try {
    const professionalId = req.user.id;

    const accessResult = await pool.query(
      `
      SELECT has_access FROM scheduling_access 
      WHERE professional_id = $1
    `,
      [professionalId]
    );

    if (accessResult.rows.length === 0 || !accessResult.rows[0].has_access) {
      return res.status(403).json({
        message: "Acesso ao sistema de agendamento não autorizado. Entre em contato com a administração.",
      });
    }

    next();
  } catch (error) {
    console.error("Error checking scheduling access:", error);
    res.status(500).json({ message: "Erro ao verificar acesso ao agendamento" });
  }
};

// ===== DATABASE INITIALIZATION =====
console.log("🔧 Initializing database...");

const initializeDatabase = async () => {
  try {
    console.log("🔄 Creating tables...");

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        cpf VARCHAR(14) UNIQUE,
        phone VARCHAR(20),
        birth_date DATE,
        address TEXT,
        roles TEXT[] DEFAULT ARRAY['client'],
        percentage DECIMAL(5,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        profile_image VARCHAR(500),
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
        duration_minutes INTEGER DEFAULT 60,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attendance locations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        birth_date DATE,
        relationship VARCHAR(100),
        cpf VARCHAR(14),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Private patients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        cpf VARCHAR(14),
        birth_date DATE,
        address TEXT,
        notes TEXT,
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
        appointment_date DATE,
        appointment_time TIME,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_patient_type CHECK (
          (user_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL) OR
          (user_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL)
        )
      )
    `);

    // Scheduling access table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_access (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        has_access BOOLEAN DEFAULT false,
        granted_by INTEGER REFERENCES users(id),
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(professional_id)
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
        action VARCHAR(50) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        record_id INTEGER,
        old_data JSONB,
        new_data JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      CREATE INDEX IF NOT EXISTS idx_consultations_appointment_date ON consultations(appointment_date);
      CREATE INDEX IF NOT EXISTS idx_scheduling_access_professional_id ON scheduling_access(professional_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    `);

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    process.exit(1);
  }
};

// Initialize database on startup
initializeDatabase();

// ===== AUTHENTICATION ROUTES =====
console.log("🔧 Setting up authentication routes...");

// Register route
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, cpf, phone, birth_date, address } = req.body;

    console.log("🔄 Registration attempt for:", email);

    // Validate required fields
    if (!name || !email || !password) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ message: "Nome, email e senha são obrigatórios" });
    }

    // Check if user already exists
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1 OR cpf = $2", [email, cpf]);

    if (existingUser.rows.length > 0) {
      console.log("❌ User already exists");
      return res.status(400).json({ message: "Usuário já existe com este email ou CPF" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (name, email, password, cpf, phone, birth_date, address) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, roles`,
      [name, email, hashedPassword, cpf || null, phone || null, birth_date || null, address || null]
    );

    const user = result.rows[0];
    console.log("✅ User registered successfully:", user.id);

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email, roles: user.roles }, JWT_SECRET, { expiresIn: "24h" });

    res.status(201).json({
      message: "Usuário registrado com sucesso",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Login route
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔄 Login attempt for:", email);

    if (!email || !password) {
      console.log("❌ Missing credentials");
      return res.status(400).json({ message: "Email e senha são obrigatórios" });
    }

    // Find user
    const result = await pool.query("SELECT * FROM users WHERE email = $1 AND is_active = true", [email]);

    if (result.rows.length === 0) {
      console.log("❌ User not found or inactive");
      return res.status(401).json({ message: "Credenciais inválidas" });
    }

    const user = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      console.log("❌ Invalid password");
      return res.status(401).json({ message: "Credenciais inválidas" });
    }

    console.log("✅ Login successful for user:", user.id);

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email, roles: user.roles }, JWT_SECRET, { expiresIn: "24h" });

    res.json({
      message: "Login realizado com sucesso",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        profile_image: user.profile_image,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Get current user profile
app.get("/api/profile", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, cpf, phone, birth_date, address, roles, profile_image, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    res.status(500).json({ message: "Erro ao carregar perfil" });
  }
});

// Update user profile
app.put("/api/profile", authenticate, async (req, res) => {
  try {
    const { name, phone, birth_date, address } = req.body;
    const userId = req.user.id;

    console.log("🔄 Updating profile for user:", userId);

    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone), 
           birth_date = COALESCE($3, birth_date), 
           address = COALESCE($4, address)
       WHERE id = $5 
       RETURNING id, name, email, cpf, phone, birth_date, address, roles, profile_image`,
      [name, phone, birth_date, address, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    console.log("✅ Profile updated successfully");
    res.json({
      message: "Perfil atualizado com sucesso",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    res.status(500).json({ message: "Erro ao atualizar perfil" });
  }
});

// Upload profile image
app.post("/api/profile/image", authenticate, upload.single("profileImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nenhuma imagem foi enviada" });
    }

    const userId = req.user.id;
    const imageUrl = `/uploads/${req.file.filename}`;

    console.log("🔄 Uploading profile image for user:", userId);

    // Get current profile image to delete old one
    const currentUser = await pool.query("SELECT profile_image FROM users WHERE id = $1", [userId]);

    // Update user profile image
    await pool.query("UPDATE users SET profile_image = $1 WHERE id = $2", [imageUrl, userId]);

    // Delete old profile image if it exists
    if (currentUser.rows[0]?.profile_image) {
      const oldImagePath = path.join(__dirname, currentUser.rows[0].profile_image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    console.log("✅ Profile image uploaded successfully");
    res.json({
      message: "Imagem de perfil atualizada com sucesso",
      imageUrl,
    });
  } catch (error) {
    console.error("❌ Error uploading profile image:", error);
    res.status(500).json({ message: "Erro ao fazer upload da imagem" });
  }
});

// ===== ADMIN ROUTES =====
console.log("🔧 Setting up admin routes...");

// Get all users (admin only)
app.get("/api/admin/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    console.log("🔄 Admin fetching all users");

    const result = await pool.query(`
      SELECT 
        id, name, email, cpf, phone, birth_date, address, roles, 
        percentage, is_active, profile_image, created_at
      FROM users 
      ORDER BY created_at DESC
    `);

    console.log("✅ Users loaded:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: "Erro ao carregar usuários" });
  }
});

// Update user roles and percentage (admin only)
app.put("/api/admin/users/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { roles, percentage, is_active } = req.body;

    console.log("🔄 Admin updating user:", id);

    // Get current user data for audit
    const currentUserResult = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    const currentUser = currentUserResult.rows[0];

    const result = await pool.query(
      `UPDATE users 
       SET roles = COALESCE($1, roles), 
           percentage = COALESCE($2, percentage), 
           is_active = COALESCE($3, is_active)
       WHERE id = $4 
       RETURNING *`,
      [roles, percentage, is_active, id]
    );

    const updatedUser = result.rows[0];

    console.log("✅ User updated by admin");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "users", parseInt(id), currentUser, updatedUser, req);

    res.json({
      message: "Usuário atualizado com sucesso",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ message: "Erro ao atualizar usuário" });
  }
});

// Delete user (admin only)
app.delete("/api/admin/users/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔄 Admin deleting user:", id);

    // Get user data before deletion for audit
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    const user = userResult.rows[0];

    // Don't allow deleting the current admin user
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: "Não é possível excluir seu próprio usuário" });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    console.log("✅ User deleted by admin");

    // Log audit action
    await logAuditAction(req.user.id, "DELETE", "users", parseInt(id), user, null, req);

    res.json({ message: "Usuário excluído com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ message: "Erro ao excluir usuário" });
  }
});

// ===== SERVICES ROUTES =====
console.log("🔧 Setting up services routes...");

// Get all services
app.get("/api/services", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM services WHERE is_active = true ORDER BY name");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching services:", error);
    res.status(500).json({ message: "Erro ao carregar serviços" });
  }
});

// Create service (admin only)
app.post("/api/services", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { name, description, base_price, duration_minutes } = req.body;

    console.log("🔄 Creating service:", name);

    if (!name || !base_price) {
      return res.status(400).json({ message: "Nome e preço base são obrigatórios" });
    }

    const result = await pool.query(
      `INSERT INTO services (name, description, base_price, duration_minutes) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, parseFloat(base_price), duration_minutes || 60]
    );

    const service = result.rows[0];

    console.log("✅ Service created:", service.id);

    // Log audit action
    await logAuditAction(req.user.id, "CREATE", "services", service.id, null, service, req);

    res.status(201).json({
      message: "Serviço criado com sucesso",
      service,
    });
  } catch (error) {
    console.error("❌ Error creating service:", error);
    res.status(500).json({ message: "Erro ao criar serviço" });
  }
});

// Update service (admin only)
app.put("/api/services/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, duration_minutes, is_active } = req.body;

    console.log("🔄 Updating service:", id);

    // Get current service data for audit
    const currentServiceResult = await pool.query("SELECT * FROM services WHERE id = $1", [id]);
    if (currentServiceResult.rows.length === 0) {
      return res.status(404).json({ message: "Serviço não encontrado" });
    }
    const currentService = currentServiceResult.rows[0];

    const result = await pool.query(
      `UPDATE services 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           base_price = COALESCE($3, base_price), 
           duration_minutes = COALESCE($4, duration_minutes),
           is_active = COALESCE($5, is_active)
       WHERE id = $6 
       RETURNING *`,
      [name, description, base_price ? parseFloat(base_price) : null, duration_minutes, is_active, id]
    );

    const updatedService = result.rows[0];

    console.log("✅ Service updated");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "services", parseInt(id), currentService, updatedService, req);

    res.json({
      message: "Serviço atualizado com sucesso",
      service: updatedService,
    });
  } catch (error) {
    console.error("❌ Error updating service:", error);
    res.status(500).json({ message: "Erro ao atualizar serviço" });
  }
});

// Delete service (admin only)
app.delete("/api/services/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔄 Deleting service:", id);

    // Get service data before deletion for audit
    const serviceResult = await pool.query("SELECT * FROM services WHERE id = $1", [id]);
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: "Serviço não encontrado" });
    }
    const service = serviceResult.rows[0];

    await pool.query("DELETE FROM services WHERE id = $1", [id]);

    console.log("✅ Service deleted");

    // Log audit action
    await logAuditAction(req.user.id, "DELETE", "services", parseInt(id), service, null, req);

    res.json({ message: "Serviço excluído com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting service:", error);
    res.status(500).json({ message: "Erro ao excluir serviço" });
  }
});

// ===== ATTENDANCE LOCATIONS ROUTES =====
console.log("🔧 Setting up attendance locations routes...");

// Get all attendance locations
app.get("/api/attendance-locations", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM attendance_locations WHERE is_active = true ORDER BY name");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching attendance locations:", error);
    res.status(500).json({ message: "Erro ao carregar locais de atendimento" });
  }
});

// Create attendance location (admin only)
app.post("/api/attendance-locations", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { name, address } = req.body;

    console.log("🔄 Creating attendance location:", name);

    if (!name) {
      return res.status(400).json({ message: "Nome é obrigatório" });
    }

    const result = await pool.query(
      `INSERT INTO attendance_locations (name, address) 
       VALUES ($1, $2) RETURNING *`,
      [name, address || null]
    );

    const location = result.rows[0];

    console.log("✅ Attendance location created:", location.id);

    // Log audit action
    await logAuditAction(req.user.id, "CREATE", "attendance_locations", location.id, null, location, req);

    res.status(201).json({
      message: "Local de atendimento criado com sucesso",
      location,
    });
  } catch (error) {
    console.error("❌ Error creating attendance location:", error);
    res.status(500).json({ message: "Erro ao criar local de atendimento" });
  }
});

// Update attendance location (admin only)
app.put("/api/attendance-locations/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, is_active } = req.body;

    console.log("🔄 Updating attendance location:", id);

    // Get current location data for audit
    const currentLocationResult = await pool.query("SELECT * FROM attendance_locations WHERE id = $1", [id]);
    if (currentLocationResult.rows.length === 0) {
      return res.status(404).json({ message: "Local de atendimento não encontrado" });
    }
    const currentLocation = currentLocationResult.rows[0];

    const result = await pool.query(
      `UPDATE attendance_locations 
       SET name = COALESCE($1, name), 
           address = COALESCE($2, address), 
           is_active = COALESCE($3, is_active)
       WHERE id = $4 
       RETURNING *`,
      [name, address, is_active, id]
    );

    const updatedLocation = result.rows[0];

    console.log("✅ Attendance location updated");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "attendance_locations", parseInt(id), currentLocation, updatedLocation, req);

    res.json({
      message: "Local de atendimento atualizado com sucesso",
      location: updatedLocation,
    });
  } catch (error) {
    console.error("❌ Error updating attendance location:", error);
    res.status(500).json({ message: "Erro ao atualizar local de atendimento" });
  }
});

// Delete attendance location (admin only)
app.delete("/api/attendance-locations/:id", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔄 Deleting attendance location:", id);

    // Get location data before deletion for audit
    const locationResult = await pool.query("SELECT * FROM attendance_locations WHERE id = $1", [id]);
    if (locationResult.rows.length === 0) {
      return res.status(404).json({ message: "Local de atendimento não encontrado" });
    }
    const location = locationResult.rows[0];

    await pool.query("DELETE FROM attendance_locations WHERE id = $1", [id]);

    console.log("✅ Attendance location deleted");

    // Log audit action
    await logAuditAction(req.user.id, "DELETE", "attendance_locations", parseInt(id), location, null, req);

    res.json({ message: "Local de atendimento excluído com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting attendance location:", error);
    res.status(500).json({ message: "Erro ao excluir local de atendimento" });
  }
});

// ===== DEPENDENTS ROUTES =====
console.log("🔧 Setting up dependents routes...");

// Get user's dependents
app.get("/api/dependents", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM dependents WHERE user_id = $1 ORDER BY name", [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching dependents:", error);
    res.status(500).json({ message: "Erro ao carregar dependentes" });
  }
});

// Create dependent
app.post("/api/dependents", authenticate, async (req, res) => {
  try {
    const { name, birth_date, relationship, cpf } = req.body;

    console.log("🔄 Creating dependent for user:", req.user.id);

    if (!name) {
      return res.status(400).json({ message: "Nome é obrigatório" });
    }

    const result = await pool.query(
      `INSERT INTO dependents (user_id, name, birth_date, relationship, cpf) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name, birth_date || null, relationship || null, cpf || null]
    );

    const dependent = result.rows[0];

    console.log("✅ Dependent created:", dependent.id);

    // Log audit action
    await logAuditAction(req.user.id, "CREATE", "dependents", dependent.id, null, dependent, req);

    res.status(201).json({
      message: "Dependente criado com sucesso",
      dependent,
    });
  } catch (error) {
    console.error("❌ Error creating dependent:", error);
    res.status(500).json({ message: "Erro ao criar dependente" });
  }
});

// Update dependent
app.put("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date, relationship, cpf } = req.body;

    console.log("🔄 Updating dependent:", id);

    // Get current dependent data for audit
    const currentDependentResult = await pool.query("SELECT * FROM dependents WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (currentDependentResult.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }
    const currentDependent = currentDependentResult.rows[0];

    const result = await pool.query(
      `UPDATE dependents 
       SET name = COALESCE($1, name), 
           birth_date = COALESCE($2, birth_date), 
           relationship = COALESCE($3, relationship), 
           cpf = COALESCE($4, cpf)
       WHERE id = $5 AND user_id = $6 
       RETURNING *`,
      [name, birth_date, relationship, cpf, id, req.user.id]
    );

    const updatedDependent = result.rows[0];

    console.log("✅ Dependent updated");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "dependents", parseInt(id), currentDependent, updatedDependent, req);

    res.json({
      message: "Dependente atualizado com sucesso",
      dependent: updatedDependent,
    });
  } catch (error) {
    console.error("❌ Error updating dependent:", error);
    res.status(500).json({ message: "Erro ao atualizar dependente" });
  }
});

// Delete dependent
app.delete("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔄 Deleting dependent:", id);

    // Get dependent data before deletion for audit
    const dependentResult = await pool.query("SELECT * FROM dependents WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }
    const dependent = dependentResult.rows[0];

    await pool.query("DELETE FROM dependents WHERE id = $1 AND user_id = $2", [id, req.user.id]);

    console.log("✅ Dependent deleted");

    // Log audit action
    await logAuditAction(req.user.id, "DELETE", "dependents", parseInt(id), dependent, null, req);

    res.json({ message: "Dependente excluído com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting dependent:", error);
    res.status(500).json({ message: "Erro ao excluir dependente" });
  }
});

// ===== PRIVATE PATIENTS ROUTES =====
console.log("🔧 Setting up private patients routes...");

// Get professional's private patients
app.get("/api/private-patients", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM private_patients WHERE professional_id = $1 ORDER BY name", [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching private patients:", error);
    res.status(500).json({ message: "Erro ao carregar pacientes particulares" });
  }
});

// Create private patient
app.post("/api/private-patients", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { name, email, phone, cpf, birth_date, address, notes } = req.body;

    console.log("🔄 Creating private patient for professional:", req.user.id);

    if (!name) {
      return res.status(400).json({ message: "Nome é obrigatório" });
    }

    const result = await pool.query(
      `INSERT INTO private_patients (professional_id, name, email, phone, cpf, birth_date, address, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, name, email || null, phone || null, cpf || null, birth_date || null, address || null, notes || null]
    );

    const patient = result.rows[0];

    console.log("✅ Private patient created:", patient.id);

    // Log audit action
    await logAuditAction(req.user.id, "CREATE", "private_patients", patient.id, null, patient, req);

    res.status(201).json({
      message: "Paciente particular criado com sucesso",
      patient,
    });
  } catch (error) {
    console.error("❌ Error creating private patient:", error);
    res.status(500).json({ message: "Erro ao criar paciente particular" });
  }
});

// Update private patient
app.put("/api/private-patients/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, cpf, birth_date, address, notes } = req.body;

    console.log("🔄 Updating private patient:", id);

    // Get current patient data for audit
    const currentPatientResult = await pool.query("SELECT * FROM private_patients WHERE id = $1 AND professional_id = $2", [
      id,
      req.user.id,
    ]);
    if (currentPatientResult.rows.length === 0) {
      return res.status(404).json({ message: "Paciente particular não encontrado" });
    }
    const currentPatient = currentPatientResult.rows[0];

    const result = await pool.query(
      `UPDATE private_patients 
       SET name = COALESCE($1, name), 
           email = COALESCE($2, email), 
           phone = COALESCE($3, phone), 
           cpf = COALESCE($4, cpf), 
           birth_date = COALESCE($5, birth_date), 
           address = COALESCE($6, address), 
           notes = COALESCE($7, notes)
       WHERE id = $8 AND professional_id = $9 
       RETURNING *`,
      [name, email, phone, cpf, birth_date, address, notes, id, req.user.id]
    );

    const updatedPatient = result.rows[0];

    console.log("✅ Private patient updated");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "private_patients", parseInt(id), currentPatient, updatedPatient, req);

    res.json({
      message: "Paciente particular atualizado com sucesso",
      patient: updatedPatient,
    });
  } catch (error) {
    console.error("❌ Error updating private patient:", error);
    res.status(500).json({ message: "Erro ao atualizar paciente particular" });
  }
});

// Delete private patient
app.delete("/api/private-patients/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔄 Deleting private patient:", id);

    // Get patient data before deletion for audit
    const patientResult = await pool.query("SELECT * FROM private_patients WHERE id = $1 AND professional_id = $2", [
      id,
      req.user.id,
    ]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: "Paciente particular não encontrado" });
    }
    const patient = patientResult.rows[0];

    await pool.query("DELETE FROM private_patients WHERE id = $1 AND professional_id = $2", [id, req.user.id]);

    console.log("✅ Private patient deleted");

    // Log audit action
    await logAuditAction(req.user.id, "DELETE", "private_patients", parseInt(id), patient, null, req);

    res.json({ message: "Paciente particular excluído com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting private patient:", error);
    res.status(500).json({ message: "Erro ao excluir paciente particular" });
  }
});

// ===== CONSULTATIONS ROUTES =====
console.log("🔧 Setting up consultations routes...");

// Get all consultations (admin and professional)
app.get("/api/consultations/all", authenticate, authorize(["admin", "professional"]), async (req, res) => {
  try {
    const { start_date, end_date, professional_id } = req.query;

    console.log("🔄 Fetching all consultations");

    let query = `
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
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND c.date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND c.date <= $${paramCount}`;
      params.push(end_date);
    }

    if (professional_id) {
      paramCount++;
      query += ` AND c.professional_id = $${paramCount}`;
      params.push(professional_id);
    }

    query += " ORDER BY c.date DESC";

    const result = await pool.query(query, params);

    console.log("✅ All consultations loaded:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching all consultations:", error);
    res.status(500).json({ message: "Erro ao carregar consultas" });
  }
});

// Get user's consultations (client)
app.get("/api/consultations", authenticate, async (req, res) => {
  try {
    console.log("🔄 Fetching consultations for user:", req.user.id);

    const result = await pool.query(
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
      [req.user.id]
    );

    console.log("✅ User consultations loaded:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching user consultations:", error);
    res.status(500).json({ message: "Erro ao carregar consultas" });
  }
});

// Create consultation
app.post("/api/consultations", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { user_id, dependent_id, private_patient_id, service_id, location_id, value, date, appointment_date, appointment_time, create_appointment } = req.body;

    console.log("🔄 Creating consultation");

    // Validate required fields
    if (!service_id) {
      return res.status(400).json({ message: "Serviço é obrigatório" });
    }

    // Validate patient selection
    const patientCount = [user_id, dependent_id, private_patient_id].filter(Boolean).length;
    if (patientCount !== 1) {
      return res.status(400).json({
        message: "Exatamente um tipo de paciente deve ser especificado",
      });
    }

    // Get service price if not provided
    let finalValue = value;
    if (!finalValue) {
      const serviceResult = await pool.query("SELECT base_price FROM services WHERE id = $1", [service_id]);
      if (serviceResult.rows.length > 0) {
        finalValue = serviceResult.rows[0].base_price;
      }
    }

    if (!finalValue) {
      return res.status(400).json({ message: "Valor é obrigatório" });
    }

    if (!date) {
      return res.status(400).json({ message: "Data é obrigatória" });
    }

    // Create consultation
    const consultationResult = await pool.query(
      `
      INSERT INTO consultations (
        user_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, appointment_date, appointment_time, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        appointment_date || null,
        appointment_time || null,
        create_appointment ? 'scheduled' : 'completed',
      ]
    );

    const consultation = consultationResult.rows[0];

    console.log("✅ Consultation created:", consultation.id);

    // Log audit action
    await logAuditAction(req.user.id, "CREATE", "consultations", consultation.id, null, consultation, req);

    res.status(201).json({
      message: "Consulta criada com sucesso",
      consultation,
    });
  } catch (error) {
    console.error("❌ Error creating consultation:", error);
    res.status(500).json({ message: "Erro ao criar consulta" });
  }
});

// Update consultation
app.put("/api/consultations/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { service_id, location_id, value, date, notes } = req.body;

    console.log("🔄 Updating consultation:", id);

    // Get current consultation data for audit
    const currentConsultationResult = await pool.query("SELECT * FROM consultations WHERE id = $1 AND professional_id = $2", [
      id,
      req.user.id,
    ]);
    if (currentConsultationResult.rows.length === 0) {
      return res.status(404).json({ message: "Consulta não encontrada" });
    }
    const currentConsultation = currentConsultationResult.rows[0];

    const result = await pool.query(
      `UPDATE consultations 
       SET service_id = COALESCE($1, service_id), 
           location_id = COALESCE($2, location_id), 
           value = COALESCE($3, value), 
           date = COALESCE($4, date), 
           notes = COALESCE($5, notes)
       WHERE id = $6 AND professional_id = $7 
       RETURNING *`,
      [service_id, location_id, value ? parseFloat(value) : null, date ? new Date(date) : null, notes, id, req.user.id]
    );

    const updatedConsultation = result.rows[0];

    console.log("✅ Consultation updated");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "consultations", parseInt(id), currentConsultation, updatedConsultation, req);

    res.json({
      message: "Consulta atualizada com sucesso",
      consultation: updatedConsultation,
    });
  } catch (error) {
    console.error("❌ Error updating consultation:", error);
    res.status(500).json({ message: "Erro ao atualizar consulta" });
  }
});

// Delete consultation
app.delete("/api/consultations/:id", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔄 Deleting consultation:", id);

    // Get consultation data before deletion for audit
    const consultationResult = await pool.query("SELECT * FROM consultations WHERE id = $1 AND professional_id = $2", [
      id,
      req.user.id,
    ]);
    if (consultationResult.rows.length === 0) {
      return res.status(404).json({ message: "Consulta não encontrada" });
    }
    const consultation = consultationResult.rows[0];

    await pool.query("DELETE FROM consultations WHERE id = $1 AND professional_id = $2", [id, req.user.id]);

    console.log("✅ Consultation deleted");

    // Log audit action
    await logAuditAction(req.user.id, "DELETE", "consultations", parseInt(id), consultation, null, req);

    res.json({ message: "Consulta excluída com sucesso" });
  } catch (error) {
    console.error("❌ Error deleting consultation:", error);
    res.status(500).json({ message: "Erro ao excluir consulta" });
  }
});

// ===== CONSULTATIONS AS APPOINTMENTS ROUTES =====
console.log("🔧 Setting up consultations routes (used as appointments)...");

// Get consultations (used as appointments) for professional
app.get(
  "/api/consultations",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { date } = req.query;
      const professionalId = req.user.id;

      console.log(
        "🔄 Fetching consultations for professional:",
        professionalId,
        "date:",
        date
      );

      let query = `
      SELECT 
        c.id,
        c.appointment_date,
        c.appointment_time,
        c.status,
        c.notes,
        c.value,
        c.created_at,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          ELSE 'Paciente não identificado'
        END as patient_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN pp.phone
          WHEN c.user_id IS NOT NULL THEN u.phone
          ELSE NULL
        END as patient_phone,
        s.name as service_name,
        s.base_price as service_price,
        al.name as location_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          WHEN c.user_id IS NOT NULL THEN 'convenio'
          WHEN c.dependent_id IS NOT NULL THEN 'dependent'
          ELSE 'unknown'
        END as patient_type
      FROM consultations c
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE c.professional_id = $1
    `;

      const params = [professionalId];

      if (date) {
        query += " AND c.appointment_date = $2";
        params.push(date);
      }

      query += " ORDER BY c.appointment_date, c.appointment_time";

      const result = await pool.query(query, params);
      console.log("✅ Consultations loaded:", result.rows.length);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching consultations:", error);
      res.status(500).json({
        message: "Erro ao carregar consultas",
        error: error.message,
      });
    }
  }
);

// Create new consultation (appointment)
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
        notes,
        create_appointment,
      } = req.body;
      const professionalId = req.user.id;

      console.log("🔄 Creating consultation:", req.body);

      // Validate required fields
      if (!service_id) {
        return res.status(400).json({ message: "Serviço é obrigatório" });
      }

      // For appointments, require appointment_date and appointment_time
      if (create_appointment && (!appointment_date || !appointment_time)) {
        return res.status(400).json({
          message: "Data e horário são obrigatórios para agendamentos",
        });
      }

      // For completed consultations, require date and value
      if (!create_appointment && (!date || !value)) {
        return res.status(400).json({
          message: "Data e valor são obrigatórios para consultas realizadas",
        });
      }

      // Validate patient selection
      const patientCount = [user_id, dependent_id, private_patient_id].filter(Boolean).length;
      if (patientCount !== 1) {
        return res.status(400).json({
          message: "Exatamente um tipo de paciente deve ser especificado",
        });
      }

      // Get service price if not provided
      let finalValue = value;
      if (!finalValue) {
        const serviceResult = await pool.query(
          "SELECT base_price FROM services WHERE id = $1",
          [service_id]
        );
        if (serviceResult.rows.length > 0) {
          finalValue = serviceResult.rows[0].base_price;
        } else {
          return res.status(404).json({ message: "Serviço não encontrado" });
        }
      }

      // Check for time conflicts if it's an appointment
      if (create_appointment && appointment_date && appointment_time) {
        const conflictResult = await pool.query(
          `
        SELECT id FROM consultations 
        WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status = 'scheduled'
      `,
          [professionalId, appointment_date, appointment_time]
        );

        if (conflictResult.rows.length > 0) {
          return res.status(409).json({
            message: "Já existe um agendamento para este horário",
          });
        }
      }

      // Determine status and dates
      const status = create_appointment ? 'scheduled' : 'completed';
      const consultationDate = create_appointment ? new Date(`${appointment_date}T${appointment_time}`) : new Date(date);

      const result = await pool.query(
        `
      INSERT INTO consultations (
        user_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, date, appointment_date, appointment_time,
        status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING *
    `,
        [
          user_id || null,
          dependent_id || null,
          private_patient_id || null,
          professionalId,
          service_id,
          location_id || null,
          parseFloat(finalValue),
          consultationDate,
          appointment_date || null,
          appointment_time || null,
          status,
          notes || null,
        ]
      );

      console.log("✅ Consultation created:", result.rows[0]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("❌ Error creating consultation:", error);
      res.status(500).json({
        message: "Erro ao criar consulta",
        error: error.message,
      });
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
      const { status, notes } = req.body;
      const professionalId = req.user.id;

      console.log("🔄 Updating consultation status:", id, "to:", status);

      // Get current consultation
      const currentResult = await pool.query(
        "SELECT * FROM consultations WHERE id = $1 AND professional_id = $2",
        [id, professionalId]
      );

      if (currentResult.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      const current = currentResult.rows[0];

      // Update status
      const result = await pool.query(
        `
      UPDATE consultations 
      SET status = $1, notes = COALESCE($2, notes), date = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE date END
      WHERE id = $3 AND professional_id = $4
      RETURNING *
    `,
        [status, notes, id, professionalId]
      );

      console.log("✅ Consultation status updated");
      res.json(result.rows[0]);
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
      const { appointment_date, appointment_time, notes } = req.body;
      const professionalId = req.user.id;

      console.log("🔄 Rescheduling consultation:", id);

      if (!appointment_date || !appointment_time) {
        return res.status(400).json({
          message: "Nova data e horário são obrigatórios",
        });
      }

      // Check for conflicts
      const conflictResult = await pool.query(
        `
      SELECT id FROM consultations 
      WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND id != $4 AND status = 'scheduled'
    `,
        [professionalId, appointment_date, appointment_time, id]
      );

      if (conflictResult.rows.length > 0) {
        return res.status(409).json({
          message: "Já existe um agendamento para este horário",
        });
      }

      const result = await pool.query(
        `
      UPDATE consultations 
      SET appointment_date = $1, appointment_time = $2, notes = COALESCE($3, notes), date = $4
      WHERE id = $5 AND professional_id = $6
      RETURNING *
    `,
        [
          appointment_date,
          appointment_time,
          notes,
          new Date(`${appointment_date}T${appointment_time}`),
          id,
          professionalId,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      console.log("✅ Consultation rescheduled");
      res.json(result.rows[0]);
    } catch (error) {
      console.error("❌ Error rescheduling consultation:", error);
      res.status(500).json({ message: "Erro ao reagendar consulta" });
    }
  }
);

// Get recurring consultations (placeholder)
app.get(
  "/api/consultations/recurring",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      // Placeholder for recurring consultations
      // For now, return empty array
      res.json([]);
    } catch (error) {
      console.error("❌ Error fetching recurring consultations:", error);
      res.status(500).json({ message: "Erro ao carregar consultas recorrentes" });
    }
  }
);

// ===== SCHEDULING ACCESS ROUTES =====
console.log("🔧 Setting up scheduling access routes...");

// Get all scheduling access records (admin only)
app.get("/api/admin/scheduling-access", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    console.log("🔄 Admin fetching scheduling access records");

    const result = await pool.query(`
      SELECT 
        sa.id, sa.has_access, sa.granted_at,
        u.id as professional_id, u.name as professional_name, u.email as professional_email,
        admin.name as granted_by_name
      FROM scheduling_access sa
      JOIN users u ON sa.professional_id = u.id
      LEFT JOIN users admin ON sa.granted_by = admin.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    console.log("✅ Scheduling access records loaded:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching scheduling access:", error);
    res.status(500).json({ message: "Erro ao carregar acessos de agendamento" });
  }
});

// Grant or revoke scheduling access (admin only)
app.put("/api/admin/scheduling-access/:professionalId", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { professionalId } = req.params;
    const { has_access } = req.body;

    console.log("🔄 Admin updating scheduling access for professional:", professionalId);

    // Check if professional exists and has professional role
    const professionalResult = await pool.query(
      "SELECT id, name FROM users WHERE id = $1 AND 'professional' = ANY(roles)",
      [professionalId]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: "Profissional não encontrado" });
    }

    const professional = professionalResult.rows[0];

    // Upsert scheduling access
    const result = await pool.query(
      `
      INSERT INTO scheduling_access (professional_id, has_access, granted_by, granted_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (professional_id) 
      DO UPDATE SET 
        has_access = $2, 
        granted_by = $3, 
        granted_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
      [professionalId, has_access, req.user.id]
    );

    const accessRecord = result.rows[0];

    console.log("✅ Scheduling access updated");

    // Log audit action
    await logAuditAction(req.user.id, "UPDATE", "scheduling_access", accessRecord.id, null, accessRecord, req);

    res.json({
      message: `Acesso ao agendamento ${has_access ? "concedido" : "revogado"} para ${professional.name}`,
      access: accessRecord,
    });
  } catch (error) {
    console.error("❌ Error updating scheduling access:", error);
    res.status(500).json({ message: "Erro ao atualizar acesso de agendamento" });
  }
});

// Check current user's scheduling access
app.get("/api/scheduling-access/check", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT has_access FROM scheduling_access WHERE professional_id = $1",
      [req.user.id]
    );

    const hasAccess = result.rows.length > 0 ? result.rows[0].has_access : false;

    res.json({ has_access: hasAccess });
  } catch (error) {
    console.error("❌ Error checking scheduling access:", error);
    res.status(500).json({ message: "Erro ao verificar acesso de agendamento" });
  }
});

// ===== NOTIFICATIONS ROUTES =====
console.log("🔧 Setting up notifications routes...");

// Get user notifications
app.get("/api/notifications", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ message: "Erro ao carregar notificações" });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );

    res.json({ message: "Notificação marcada como lida" });
  } catch (error) {
    console.error("❌ Error marking notification as read:", error);
    res.status(500).json({ message: "Erro ao marcar notificação como lida" });
  }
});

// Mark all notifications as read
app.put("/api/notifications/read-all", authenticate, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1",
      [req.user.id]
    );

    res.json({ message: "Todas as notificações foram marcadas como lidas" });
  } catch (error) {
    console.error("❌ Error marking all notifications as read:", error);
    res.status(500).json({ message: "Erro ao marcar todas as notificações como lidas" });
  }
});

// ===== REPORTS ROUTES =====
console.log("🔧 Setting up reports routes...");

// Get revenue report by professional (admin only)
app.get("/api/reports/revenue-by-professional", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log("🔄 Generating revenue report by professional");

    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Data de início e fim são obrigatórias" });
    }

    const result = await pool.query(
      `
      SELECT 
        u.id, u.name, u.percentage,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (100 - u.percentage) / 100), 0) as clinic_revenue,
        COALESCE(SUM(c.value * u.percentage / 100), 0) as professional_payment
      FROM users u
      LEFT JOIN consultations c ON u.id = c.professional_id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL)
        AND c.status = 'completed'
      WHERE 'professional' = ANY(u.roles)
      GROUP BY u.id, u.name, u.percentage
      HAVING COUNT(c.id) > 0
      ORDER BY total_revenue DESC
    `,
      [start_date, end_date]
    );

    console.log("✅ Revenue report generated");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error generating revenue report:", error);
    res.status(500).json({ message: "Erro ao gerar relatório de receita" });
  }
});

// Get revenue report by service (admin only)
app.get("/api/reports/revenue-by-service", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log("🔄 Generating revenue report by service");

    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Data de início e fim são obrigatórias" });
    }

    const result = await pool.query(
      `
      SELECT 
        s.id, s.name,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COUNT(c.id) as consultation_count
      FROM services s
      LEFT JOIN consultations c ON s.id = c.service_id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL)
        AND c.status = 'completed'
      GROUP BY s.id, s.name
      HAVING COUNT(c.id) > 0
      ORDER BY total_revenue DESC
    `,
      [start_date, end_date]
    );

    console.log("✅ Service revenue report generated");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error generating service revenue report:", error);
    res.status(500).json({ message: "Erro ao gerar relatório de receita por serviço" });
  }
});

// Get professional's financial report
app.get("/api/reports/professional-financial", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log("🔄 Generating professional financial report for user:", req.user.id);

    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Data de início e fim são obrigatórias" });
    }

    // Get professional's percentage
    const professionalResult = await pool.query("SELECT percentage FROM users WHERE id = $1", [req.user.id]);
    const professionalPercentage = professionalResult.rows[0]?.percentage || 0;

    // Get consultations in date range
    const consultationsResult = await pool.query(
      `
      SELECT 
        c.id, c.value, c.date, c.notes,
        s.name as service_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
        END as client_name,
        al.name as location_name
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
        AND c.status = 'completed'
      ORDER BY c.date DESC
    `,
      [req.user.id, start_date, end_date]
    );

    // Calculate totals
    const totalRevenue = consultationsResult.rows.reduce((sum, consultation) => sum + parseFloat(consultation.value), 0);
    const professionalPayment = totalRevenue * (professionalPercentage / 100);
    const clinicRevenue = totalRevenue - professionalPayment;

    const report = {
      period: { start_date, end_date },
      professional_percentage: professionalPercentage,
      total_revenue: totalRevenue,
      professional_payment: professionalPayment,
      clinic_revenue: clinicRevenue,
      consultation_count: consultationsResult.rows.length,
      consultations: consultationsResult.rows,
    };

    console.log("✅ Professional financial report generated");
    res.json(report);
  } catch (error) {
    console.error("❌ Error generating professional financial report:", error);
    res.status(500).json({ message: "Erro ao gerar relatório financeiro" });
  }
});

// Get professional's payment calculation
app.get("/api/reports/professional-payment", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log("🔄 Calculating professional payment for user:", req.user.id);

    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Data de início e fim são obrigatórias" });
    }

    // Get professional's percentage
    const professionalResult = await pool.query("SELECT name, percentage FROM users WHERE id = $1", [req.user.id]);
    const professional = professionalResult.rows[0];
    const professionalPercentage = professional?.percentage || 0;

    // Calculate payment
    const paymentResult = await pool.query(
      `
      SELECT 
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(c.value * $3 / 100), 0) as professional_payment
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
        AND c.status = 'completed'
    `,
      [req.user.id, start_date, 100 - professionalPercentage, end_date]
    );

    const payment = paymentResult.rows[0];

    const result = {
      professional_name: professional.name,
      professional_percentage: professionalPercentage,
      period: { start_date, end_date },
      consultation_count: parseInt(payment.consultation_count),
      total_revenue: parseFloat(payment.total_revenue),
      professional_payment: parseFloat(payment.professional_payment),
      clinic_revenue: parseFloat(payment.total_revenue) - parseFloat(payment.professional_payment),
    };

    console.log("✅ Professional payment calculated");
    res.json(result);
  } catch (error) {
    console.error("❌ Error calculating professional payment:", error);
    res.status(500).json({ message: "Erro ao calcular pagamento do profissional" });
  }
});

// ===== AUDIT LOGS ROUTES =====
console.log("🔧 Setting up audit logs routes...");

// Get audit logs (admin only)
app.get("/api/admin/audit-logs", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const { limit = 100, offset = 0, user_id, action, table_name } = req.query;

    console.log("🔄 Admin fetching audit logs");

    let query = `
      SELECT 
        al.*, u.name as user_name, u.email as user_email
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
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    console.log("✅ Audit logs loaded:", result.rows.length);
    res.json(result.rows);
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
    uptime: process.uptime(),
  });
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ message: "Erro interno do servidor" });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/api/health`);
});