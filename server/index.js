import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { pool } from "./db.js";
import createUpload from "./middleware/upload.js";
import { authenticate, authorize } from "./middleware/auth.js";
import { generateDocumentPDF } from "./utils/documentGenerator.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://www.cartaoquiroferreira.com.br",
      "https://cartaoquiroferreira.com.br",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Serve static files from dist directory
app.use(express.static("dist"));

// 🔥 FUNÇÃO PARA ADICIONAR COLUNAS FALTANTES (SEM ALTERAR DADOS EXISTENTES)
const ensureDatabaseColumns = async () => {
  try {
    console.log('🔄 Verificando e criando colunas faltantes...');
    
    // 1. Adicionar subscription_status e subscription_expiry na tabela dependents
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dependents' AND column_name = 'subscription_status'
        ) THEN
          ALTER TABLE dependents ADD COLUMN subscription_status TEXT DEFAULT 'pending';
          UPDATE dependents SET subscription_status = 'pending' WHERE subscription_status IS NULL;
        END IF;
      END $$;
    `);
    
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dependents' AND column_name = 'subscription_expiry'
        ) THEN
          ALTER TABLE dependents ADD COLUMN subscription_expiry TIMESTAMPTZ;
        END IF;
      END $$;
    `);
    
    // 2. Adicionar category_name na tabela users
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'category_name'
        ) THEN
          ALTER TABLE users ADD COLUMN category_name TEXT;
        END IF;
      END $$;
    `);
    
    // 3. Criar tabela scheduling_access se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_access (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        has_access BOOLEAN DEFAULT false,
        expires_at TIMESTAMPTZ,
        granted_by INTEGER REFERENCES users(id),
        granted_at TIMESTAMPTZ DEFAULT now(),
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(professional_id)
      );
    `);
    
    console.log('✅ Colunas verificadas e criadas com sucesso');
  } catch (error) {
    console.error('❌ Erro ao criar colunas:', error);
  }
};

// Executar verificação de colunas na inicialização
ensureDatabaseColumns();

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Error connecting to database:", err);
  } else {
    console.log("✅ Database connected successfully");
    release();
  }
});

// ==================== AUTH ROUTES ====================

// Login route
app.post("/api/auth/login", async (req, res) => {
  try {
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: "CPF e senha são obrigatórios" });
    }

    // Clean CPF
    const cleanCpf = cpf.replace(/\D/g, "");

    // Find user by CPF
    const result = await pool.query("SELECT * FROM users WHERE cpf = $1", [
      cleanCpf,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Credenciais inválidas" });
    }

    const user = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Credenciais inválidas" });
    }

    // Return user data without setting role yet
    res.json({
      user: {
        id: user.id,
        name: user.name,
        roles: user.roles || [],
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Select role route
app.post("/api/auth/select-role", async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res
        .status(400)
        .json({ message: "ID do usuário e role são obrigatórios" });
    }

    // Get user from database
    const result = await pool.query(
      "SELECT id, name, cpf, roles FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = result.rows[0];

    // Verify user has the requested role
    if (!user.roles || !user.roles.includes(role)) {
      return res
        .status(403)
        .json({ message: "Usuário não possui esta role" });
    }

    // Generate JWT token with role
    const token = jwt.sign(
      {
        id: user.id,
        currentRole: role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        roles: user.roles,
        currentRole: role,
      },
    });
  } catch (error) {
    console.error("Role selection error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Switch role route
app.post("/api/auth/switch-role", authenticate, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ message: "Role é obrigatória" });
    }

    // Verify user has the requested role
    if (!req.user.roles || !req.user.roles.includes(role)) {
      return res
        .status(403)
        .json({ message: "Usuário não possui esta role" });
    }

    // Generate new JWT token with new role
    const token = jwt.sign(
      {
        id: req.user.id,
        currentRole: role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      token,
      user: {
        id: req.user.id,
        name: req.user.name,
        roles: req.user.roles,
        currentRole: role,
      },
    });
  } catch (error) {
    console.error("Role switch error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Register route
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

    if (!name || !cpf || !password) {
      return res
        .status(400)
        .json({ message: "Nome, CPF e senha são obrigatórios" });
    }

    // Clean CPF
    const cleanCpf = cpf.replace(/\D/g, "");

    // Validate CPF format
    if (!/^\d{11}$/.test(cleanCpf)) {
      return res
        .status(400)
        .json({ message: "CPF deve conter 11 dígitos numéricos" });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "CPF já cadastrado" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user with client role only
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING id, name, cpf, roles`,
      [
        name.trim(),
        cleanCpf,
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
        ["client"], // Only client role for registration
      ]
    );

    const newUser = result.rows[0];

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: newUser,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// Logout route
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logout realizado com sucesso" });
});

// ==================== USER ROUTES ====================

// Get all users (admin only)
app.get("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, roles, created_at,
        subscription_status, subscription_expiry
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Erro ao buscar usuários" });
  }
});

// Get user by ID
app.get("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own data unless they're admin
    if (
      req.user.id !== parseInt(id) &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const result = await pool.query(
      `SELECT u.id, u.name, u.cpf, u.email, u.phone, u.birth_date, u.address, u.address_number, 
             u.address_complement, u.neighborhood, u.city, u.state, u.roles, 
             u.subscription_status, u.subscription_expiry, u.photo_url, u.crm, u.category_name,
             sc.name as category_name_from_table
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = result.rows[0];
    // Use category_name from user table or from service_categories table
    user.category_name = user.category_name || user.category_name_from_table;
    delete user.category_name_from_table;
    
    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Erro ao buscar usuário" });
  }
});

// Get user subscription status
app.get(
  "/api/users/:id/subscription-status",
  authenticate,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Users can only access their own data unless they're admin
      if (
        req.user.id !== parseInt(id) &&
        !req.user.roles.includes("admin")
      ) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const result = await pool.query(
        "SELECT subscription_status, subscription_expiry FROM users WHERE id = $1",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Erro ao buscar status da assinatura" });
    }
  }
);

// Update user
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
      currentPassword,
      newPassword,
    } = req.body;

    // Users can only update their own data unless they're admin
    if (
      req.user.id !== parseInt(id) &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ message: "Senha atual é obrigatória" });
      }

      const userResult = await pool.query(
        "SELECT password FROM users WHERE id = $1",
        [id]
      );
      const user = userResult.rows[0];

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }
    }

    // Build update query
    let updateFields = [];
    let values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCount}`);
      values.push(name.trim());
      paramCount++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramCount}`);
      values.push(email?.trim() || null);
      paramCount++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCount}`);
      values.push(phone?.replace(/\D/g, "") || null);
      paramCount++;
    }

    if (birth_date !== undefined) {
      updateFields.push(`birth_date = $${paramCount}`);
      values.push(birth_date || null);
      paramCount++;
    }

    if (address !== undefined) {
      updateFields.push(`address = $${paramCount}`);
      values.push(address?.trim() || null);
      paramCount++;
    }

    if (address_number !== undefined) {
      updateFields.push(`address_number = $${paramCount}`);
      values.push(address_number?.trim() || null);
      paramCount++;
    }

    if (address_complement !== undefined) {
      updateFields.push(`address_complement = $${paramCount}`);
      values.push(address_complement?.trim() || null);
      paramCount++;
    }

    if (neighborhood !== undefined) {
      updateFields.push(`neighborhood = $${paramCount}`);
      values.push(neighborhood?.trim() || null);
      paramCount++;
    }

    if (city !== undefined) {
      updateFields.push(`city = $${paramCount}`);
      values.push(city?.trim() || null);
      paramCount++;
    }

    if (state !== undefined) {
      updateFields.push(`state = $${paramCount}`);
      values.push(state || null);
      paramCount++;
    }

    if (roles !== undefined && req.user.roles.includes("admin")) {
      updateFields.push(`roles = $${paramCount}`);
      values.push(roles);
      paramCount++;
    }

    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push(`password = $${paramCount}`);
      values.push(hashedPassword);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "Nenhum campo para atualizar" });
    }

    updateFields.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    paramCount++;

    values.push(id);

    const query = `
      UPDATE users 
      SET ${updateFields.join(", ")} 
      WHERE id = $${paramCount}
      RETURNING id, name, cpf, email, phone, birth_date, address, address_number,
                address_complement, neighborhood, city, state, roles, created_at,
                subscription_status, subscription_expiry
    `;

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
    res.status(500).json({ message: "Erro ao atualizar usuário" });
  }
});

// Create user (admin only)
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
      password,
      roles,
      category_name,
      crm,
      percentage,
    } = req.body;

    if (!name || !cpf || !password || !roles || roles.length === 0) {
      return res.status(400).json({
        message: "Nome, CPF, senha e pelo menos uma role são obrigatórios",
      });
    }

    // Clean CPF
    const cleanCpf = cpf.replace(/\D/g, "");

    // Validate CPF format
    if (!/^\d{11}$/.test(cleanCpf)) {
      return res
        .status(400)
        .json({ message: "CPF deve conter 11 dígitos numéricos" });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "CPF já cadastrado" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password, roles,
        category_name, crm, percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
      RETURNING id, name, cpf, email, phone, roles, category_name, crm, percentage`,
      [
        name.trim(),
        cleanCpf,
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
        roles,
        category_name?.trim() || null,
        crm?.trim() || null,
        percentage || null,
      ]
    );

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Erro ao criar usuário" });
  }
});

// Delete user (admin only)
app.delete(
  "/api/users/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  }
);

// ==================== APPOINTMENTS ROUTES ====================

// Get all appointments for professional
app.get("/api/appointments", authenticate, async (req, res) => {
  try {
    console.log("🔄 Fetching appointments for professional:", req.user.id);

    const result = await pool.query(
      `SELECT 
        a.id,
        a.client_id,
        a.dependent_id,
        a.private_patient_id,
        COALESCE(
          CASE 
            WHEN a.dependent_id IS NOT NULL THEN d.name
            WHEN a.private_patient_id IS NOT NULL THEN pp.name
            ELSE u.name
          END
        ) as client_name,
        COALESCE(
          CASE 
            WHEN a.dependent_id IS NOT NULL THEN (
              SELECT phone FROM users WHERE id = d.client_id
            )
            WHEN a.private_patient_id IS NOT NULL THEN pp.phone
            ELSE u.phone
          END
        ) as client_phone,
        s.name as service_name,
        al.name as location_name,
        a.date,
        a.time,
        a.status,
        a.value,
        a.is_recurring,
        a.recurring_days,
        a.session_count,
        a.total_sessions,
        a.created_at
      FROM appointments a
      LEFT JOIN users u ON a.client_id = u.id
      LEFT JOIN dependents d ON a.dependent_id = d.id
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      WHERE a.professional_id = $1
      ORDER BY a.date DESC, a.time DESC`,
      [req.user.id]
    );

    console.log("✅ Appointments loaded:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching appointments:", error);
    res.status(500).json({ message: "Erro ao buscar agendamentos" });
  }
});

// Create appointment
app.post("/api/appointments", authenticate, async (req, res) => {
  try {
    console.log("🔄 Creating appointment with data:", req.body);

    const {
      patient_type,
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      date,
      time,
      value,
      is_recurring,
      recurring_days,
      total_sessions,
    } = req.body;

    // Validate required fields
    if (!service_id || !date || !time || !value) {
      return res.status(400).json({
        message: "Serviço, data, hora e valor são obrigatórios",
      });
    }

    // Validate patient selection
    if (patient_type === "convenio") {
      if (!client_id && !dependent_id) {
        return res.status(400).json({
          message: "Cliente ou dependente deve ser selecionado para convênio",
        });
      }
    } else if (patient_type === "private") {
      if (!private_patient_id) {
        return res.status(400).json({
          message: "Paciente particular deve ser selecionado",
        });
      }
    }

    // Insert appointment
    const result = await pool.query(
      `INSERT INTO appointments (
        professional_id, client_id, dependent_id, private_patient_id,
        service_id, location_id, date, time, value, status,
        is_recurring, recurring_days, total_sessions, session_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        req.user.id,
        client_id || null,
        dependent_id || null,
        private_patient_id || null,
        service_id,
        location_id || null,
        date,
        time,
        parseFloat(value),
        "scheduled",
        is_recurring || false,
        is_recurring ? recurring_days : null,
        is_recurring ? total_sessions : null,
        is_recurring ? 1 : null,
      ]
    );

    console.log("✅ Appointment created:", result.rows[0]);
    res.status(201).json({
      message: "Agendamento criado com sucesso",
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error creating appointment:", error);
    res.status(500).json({ message: "Erro ao criar agendamento" });
  }
});

// Update appointment status
app.put("/api/appointments/:id/status", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["scheduled", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Status inválido" });
    }

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM appointments WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    const result = await pool.query(
      "UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id]
    );

    res.json({
      message: "Status atualizado com sucesso",
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating appointment status:", error);
    res.status(500).json({ message: "Erro ao atualizar status" });
  }
});

// Reschedule appointment
app.put("/api/appointments/:id/reschedule", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ message: "Data e hora são obrigatórios" });
    }

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM appointments WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    const result = await pool.query(
      "UPDATE appointments SET date = $1, time = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [date, time, id]
    );

    res.json({
      message: "Agendamento reagendado com sucesso",
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error("Error rescheduling appointment:", error);
    res.status(500).json({ message: "Erro ao reagendar" });
  }
});

// Delete appointment
app.delete("/api/appointments/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM appointments WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    await pool.query("DELETE FROM appointments WHERE id = $1", [id]);

    res.json({ message: "Agendamento excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ message: "Erro ao excluir agendamento" });
  }
});

// ==================== CONSULTATION ROUTES ====================

// Get consultations for client
app.get(
  "/api/consultations/client/:clientId",
  authenticate,
  async (req, res) => {
    try {
      const { clientId } = req.params;

      // Verify access
      if (
        req.user.id !== parseInt(clientId) &&
        !req.user.roles.includes("admin")
      ) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const result = await pool.query(
        `SELECT 
          c.id, c.date, c.value,
          s.name as service_name,
          u.name as professional_name,
          COALESCE(
            CASE 
              WHEN c.dependent_id IS NOT NULL THEN d.name
              ELSE client.name
            END
          ) as client_name,
          c.dependent_id IS NOT NULL as is_dependent
        FROM consultations c
        JOIN services s ON c.service_id = s.id
        JOIN users u ON c.professional_id = u.id
        JOIN users client ON c.client_id = client.id
        LEFT JOIN dependents d ON c.dependent_id = d.id
        WHERE c.client_id = $1
        ORDER BY c.date DESC`,
        [clientId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching client consultations:", error);
      res.status(500).json({ message: "Erro ao buscar consultas" });
    }
  }
);

// Get all consultations (admin only)
app.get(
  "/api/consultations",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          c.id, c.date, c.value,
          s.name as service_name,
          u.name as professional_name,
          COALESCE(
            CASE 
              WHEN c.dependent_id IS NOT NULL THEN d.name
              ELSE client.name
            END
          ) as client_name,
          c.dependent_id IS NOT NULL as is_dependent
        FROM consultations c
        JOIN services s ON c.service_id = s.id
        JOIN users u ON c.professional_id = u.id
        JOIN users client ON c.client_id = client.id
        LEFT JOIN dependents d ON c.dependent_id = d.id
        ORDER BY c.date DESC
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching consultations:", error);
      res.status(500).json({ message: "Erro ao buscar consultas" });
    }
  }
);

// Create consultation (professional only)
app.post(
  "/api/consultations",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const {
        client_id,
        dependent_id,
        service_id,
        location_id,
        value,
        date,
      } = req.body;

      if (!service_id || !value || !date) {
        return res.status(400).json({
          message: "Serviço, valor e data são obrigatórios",
        });
      }

      if (!client_id && !dependent_id) {
        return res.status(400).json({
          message: "Cliente ou dependente deve ser especificado",
        });
      }

      // Insert consultation
      const result = await pool.query(
        `INSERT INTO consultations (
          client_id, dependent_id, professional_id, service_id, 
          location_id, value, date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *`,
        [
          client_id || null,
          dependent_id || null,
          req.user.id,
          service_id,
          location_id || null,
          parseFloat(value),
          new Date(date),
        ]
      );

      res.status(201).json({
        message: "Consulta registrada com sucesso",
        consultation: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating consultation:", error);
      res.status(500).json({ message: "Erro ao registrar consulta" });
    }
  }
);

// ==================== CLIENT LOOKUP ROUTES ====================

// Lookup client by CPF
app.get("/api/clients/lookup", authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    const cleanCpf = cpf.toString().replace(/\D/g, "");

    const result = await pool.query(
      `SELECT id, name, cpf, subscription_status, subscription_expiry 
       FROM users 
       WHERE cpf = $1 AND 'client' = ANY(roles)`,
      [cleanCpf]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Cliente não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error looking up client:", error);
    res.status(500).json({ message: "Erro ao buscar cliente" });
  }
});

// Get active clients for appointments
app.get("/api/clients", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, cpf, phone, subscription_status 
       FROM users 
       WHERE 'client' = ANY(roles) AND subscription_status = 'active'
       ORDER BY name`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "Erro ao buscar clientes" });
  }
});

// ==================== DEPENDENTS ROUTES ====================

// Lookup dependent by CPF
app.get("/api/dependents/lookup", authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    const cleanCpf = cpf.toString().replace(/\D/g, "");

    const result = await pool.query(
      `SELECT 
        d.id, d.name, d.cpf, d.client_id, d.subscription_status as dependent_subscription_status,
        u.name as client_name, u.subscription_status as client_subscription_status
       FROM dependents d
       JOIN users u ON d.client_id = u.id
       WHERE d.cpf = $1`,
      [cleanCpf]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error looking up dependent:", error);
    res.status(500).json({ message: "Erro ao buscar dependente" });
  }
});

// Get dependents for a client
app.get("/api/dependents/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Verify access
    if (
      req.user.id !== parseInt(clientId) &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const result = await pool.query(
      `SELECT 
        id, name, cpf, birth_date, created_at, subscription_status,
        subscription_expiry, billing_amount, payment_reference, activated_at
      FROM dependents 
      WHERE client_id = $1 
      ORDER BY created_at DESC`,
      [clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching dependents:", error);
    res.status(500).json({ message: "Erro ao buscar dependentes" });
  }
});

// Get all dependents (admin only)
app.get(
  "/api/admin/dependents",
  authenticate,
  authorize(["admin", "professional"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT d.*, u.name as client_name, d.subscription_status, d.subscription_expiry
        FROM dependents d
        JOIN users u ON d.client_id = u.id
        ORDER BY d.created_at DESC`
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching all dependents:", error);
      res.status(500).json({ message: "Erro ao buscar dependentes" });
    }
  }
);

// Create dependent
app.post("/api/dependents", authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    if (!client_id || !name || !cpf) {
      return res.status(400).json({
        message: "ID do cliente, nome e CPF são obrigatórios",
      });
    }

    // Verify access
    if (
      req.user.id !== parseInt(client_id) &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const cleanCpf = cpf.replace(/\D/g, "");

    // Check if CPF already exists
    const existingDependent = await pool.query(
      "SELECT id FROM dependents WHERE cpf = $1",
      [cleanCpf]
    );

    if (existingDependent.rows.length > 0) {
      return res.status(409).json({ message: "CPF já cadastrado" });
    }

    // Check if CPF exists in users table
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE cpf = $1",
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "CPF já cadastrado como usuário" });
    }

    const result = await pool.query(
      `INSERT INTO dependents (
        client_id, name, cpf, birth_date, subscription_status, billing_amount
      ) VALUES ($1, $2, $3, $4, 'pending', 50) 
      RETURNING *`,
      [client_id, name.trim(), cleanCpf, birth_date || null]
    );

    res.status(201).json({
      message: "Dependente criado com sucesso",
      dependent: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating dependent:", error);
    res.status(500).json({ message: "Erro ao criar dependente" });
  }
});

// Update dependent
app.put("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    // Get dependent to verify ownership
    const dependentResult = await pool.query(
      "SELECT client_id FROM dependents WHERE id = $1",
      [id]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    const dependent = dependentResult.rows[0];

    // Verify access
    if (
      req.user.id !== dependent.client_id &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const result = await pool.query(
      `UPDATE dependents 
       SET name = $1, birth_date = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [name.trim(), birth_date || null, id]
    );

    res.json({
      message: "Dependente atualizado com sucesso",
      dependent: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating dependent:", error);
    res.status(500).json({ message: "Erro ao atualizar dependente" });
  }
});

// Delete dependent
app.delete("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get dependent to verify ownership
    const dependentResult = await pool.query(
      "SELECT client_id FROM dependents WHERE id = $1",
      [id]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    const dependent = dependentResult.rows[0];

    // Verify access
    if (
      req.user.id !== dependent.client_id &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    await pool.query("DELETE FROM dependents WHERE id = $1", [id]);

    res.json({ message: "Dependente excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting dependent:", error);
    res.status(500).json({ message: "Erro ao excluir dependente" });
  }
});

// ==================== PRIVATE PATIENTS ROUTES ====================

// Get private patients for professional
app.get("/api/private-patients", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code, created_at
      FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching private patients:", error);
    res.status(500).json({ message: "Erro ao buscar pacientes" });
  }
});

// Create private patient
app.post("/api/private-patients", authenticate, async (req, res) => {
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

    // Clean CPF if provided
    const cleanCpf = cpf ? cpf.replace(/\D/g, "") : null;

    // Check if CPF already exists (if provided)
    if (cleanCpf) {
      const existingPatient = await pool.query(
        "SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2",
        [cleanCpf, req.user.id]
      );

      if (existingPatient.rows.length > 0) {
        return res.status(409).json({ message: "CPF já cadastrado" });
      }
    }

    const result = await pool.query(
      `INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address, 
        address_number, address_complement, neighborhood, city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`,
      [
        req.user.id,
        name.trim(),
        cleanCpf,
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

    res.status(201).json({
      message: "Paciente criado com sucesso",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating private patient:", error);
    res.status(500).json({ message: "Erro ao criar paciente" });
  }
});

// Update private patient
app.put("/api/private-patients/:id", authenticate, async (req, res) => {
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

    // Verify patient belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    const result = await pool.query(
      `UPDATE private_patients 
       SET name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
           address_number = $6, address_complement = $7, neighborhood = $8,
           city = $9, state = $10, zip_code = $11, updated_at = NOW()
       WHERE id = $12 
       RETURNING *`,
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
      ]
    );

    res.json({
      message: "Paciente atualizado com sucesso",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating private patient:", error);
    res.status(500).json({ message: "Erro ao atualizar paciente" });
  }
});

// Delete private patient
app.delete("/api/private-patients/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify patient belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    await pool.query("DELETE FROM private_patients WHERE id = $1", [id]);

    res.json({ message: "Paciente excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting private patient:", error);
    res.status(500).json({ message: "Erro ao excluir paciente" });
  }
});

// ==================== ATTENDANCE LOCATIONS ROUTES ====================

// Get attendance locations for professional
app.get("/api/attendance-locations", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default, created_at
      FROM attendance_locations 
      WHERE professional_id = $1 
      ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching attendance locations:", error);
    res.status(500).json({ message: "Erro ao buscar locais" });
  }
});

// Create attendance location
app.post("/api/attendance-locations", authenticate, async (req, res) => {
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
        "UPDATE attendance_locations SET is_default = false WHERE professional_id = $1",
        [req.user.id]
      );
    }

    const result = await pool.query(
      `INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *`,
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

    res.status(201).json({
      message: "Local criado com sucesso",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating attendance location:", error);
    res.status(500).json({ message: "Erro ao criar local" });
  }
});

// Update attendance location
app.put("/api/attendance-locations/:id", authenticate, async (req, res) => {
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

    // Verify location belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM attendance_locations WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Local não encontrado" });
    }

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        "UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2",
        [req.user.id, id]
      );
    }

    const result = await pool.query(
      `UPDATE attendance_locations 
       SET name = $1, address = $2, address_number = $3, address_complement = $4,
           neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9,
           is_default = $10, updated_at = NOW()
       WHERE id = $11 
       RETURNING *`,
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
      ]
    );

    res.json({
      message: "Local atualizado com sucesso",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating attendance location:", error);
    res.status(500).json({ message: "Erro ao atualizar local" });
  }
});

// Delete attendance location
app.delete("/api/attendance-locations/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify location belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM attendance_locations WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Local não encontrado" });
    }

    await pool.query("DELETE FROM attendance_locations WHERE id = $1", [id]);

    res.json({ message: "Local excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting attendance location:", error);
    res.status(500).json({ message: "Erro ao excluir local" });
  }
});

// ==================== SERVICES ROUTES ====================

// Get all services
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
    res.status(500).json({ message: "Erro ao buscar serviços" });
  }
});

// Create service (admin only)
app.post(
  "/api/services",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { name, description, base_price, category_id, is_base_service } =
        req.body;

      if (!name || !description || !base_price) {
        return res.status(400).json({
          message: "Nome, descrição e preço base são obrigatórios",
        });
      }

      const result = await pool.query(
        `INSERT INTO services (name, description, base_price, category_id, is_base_service) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [
          name.trim(),
          description.trim(),
          parseFloat(base_price),
          category_id || null,
          is_base_service || false,
        ]
      );

      res.status(201).json({
        message: "Serviço criado com sucesso",
        service: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ message: "Erro ao criar serviço" });
    }
  }
);

// Update service (admin only)
app.put(
  "/api/services/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, base_price, category_id, is_base_service } =
        req.body;

      const result = await pool.query(
        `UPDATE services 
         SET name = $1, description = $2, base_price = $3, category_id = $4, 
             is_base_service = $5, updated_at = NOW() 
         WHERE id = $6 
         RETURNING *`,
        [
          name.trim(),
          description.trim(),
          parseFloat(base_price),
          category_id || null,
          is_base_service || false,
          id,
        ]
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
      res.status(500).json({ message: "Erro ao atualizar serviço" });
    }
  }
);

// Delete service (admin only)
app.delete(
  "/api/services/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se o serviço está sendo usado em consultas
      const consultationsCheck = await pool.query(
        'SELECT COUNT(*) as count FROM consultations WHERE service_id = $1',
        [id]
      );
      
      if (parseInt(consultationsCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          message: 'Não é possível excluir este serviço pois ele possui consultas registradas. Para manter a integridade dos dados, serviços com histórico não podem ser removidos.' 
        });
      }
      
      // Verificar se o serviço está sendo usado em agendamentos
      const appointmentsCheck = await pool.query(
        'SELECT COUNT(*) as count FROM appointments WHERE service_id = $1',
        [id]
      );
      
      if (parseInt(appointmentsCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          message: 'Não é possível excluir este serviço pois ele possui agendamentos. Para manter a integridade dos dados, serviços com histórico não podem ser removidos.' 
        });
      }

      const result = await pool.query(
        "DELETE FROM services WHERE id = $1 RETURNING id",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Serviço não encontrado" });
      }

      res.json({ message: "Serviço excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting service:", error);
      if (error.code === '23503') {
        res.status(400).json({ 
          message: 'Não é possível excluir este serviço pois ele está sendo usado no sistema. Serviços com histórico de uso não podem ser removidos para manter a integridade dos dados.' 
        });
      } else {
        res.status(500).json({ message: "Erro interno do servidor" });
      }
    }
  }
);

// ==================== SERVICE CATEGORIES ROUTES ====================

// Get all service categories
app.get("/api/service-categories", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, created_at
      FROM service_categories
      ORDER BY name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching service categories:", error);
    res.status(500).json({ message: "Erro ao buscar categorias" });
  }
});

// Create service category (admin only)
app.post(
  "/api/service-categories",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { name, description } = req.body;

      if (!name || !description) {
        return res
          .status(400)
          .json({ message: "Nome e descrição são obrigatórios" });
      }

      const result = await pool.query(
        `INSERT INTO service_categories (name, description) 
         VALUES ($1, $2) 
         RETURNING *`,
        [name.trim(), description.trim()]
      );

      res.status(201).json({
        message: "Categoria criada com sucesso",
        category: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating service category:", error);
      res.status(500).json({ message: "Erro ao criar categoria" });
    }
  }
);

// ==================== PROFESSIONALS ROUTES ====================

// Get all professionals
app.get("/api/professionals", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.photo_url,
        COALESCE(u.category_name, sc.name, 'Sem categoria') as category_name,
        COALESCE(sa.has_access, false) as has_scheduling_access,
        sa.expires_at as access_expires_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      LEFT JOIN scheduling_access sa ON u.id = sa.professional_id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching professionals:", error);
    res.status(500).json({ message: "Erro ao buscar profissionais" });
  }
});

// ==================== REPORTS ROUTES ====================

// Professional revenue report (detailed)
app.get(
  "/api/reports/professional-revenue-detailed",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "Data inicial e final são obrigatórias",
        });
      }

      console.log("🔄 Generating detailed professional revenue report for:", req.user.id);
      console.log("🔄 Date range:", { start_date, end_date });

      // Get professional percentage
      const profResult = await pool.query(
        "SELECT percentage FROM users WHERE id = $1",
        [req.user.id]
      );

      const professionalPercentage = profResult.rows[0]?.percentage || 50;

      // Get consultations (convênio only - particulares não contam no contas a pagar)
      const consultationsResult = await pool.query(
        `SELECT 
          c.date, c.value,
          s.name as service_name,
          COALESCE(
            CASE 
              WHEN c.dependent_id IS NOT NULL THEN d.name
              ELSE u.name
            END
          ) as client_name,
          'convenio' as consultation_type
        FROM consultations c
        JOIN services s ON c.service_id = s.id
        JOIN users u ON c.client_id = u.id
        LEFT JOIN dependents d ON c.dependent_id = d.id
        WHERE c.professional_id = $1 
          AND c.date >= $2 
          AND c.date <= $3
        ORDER BY c.date DESC`,
        [req.user.id, start_date, end_date]
      );

      // Get private appointments (agenda - não contam no contas a pagar)
      const privateAppointmentsResult = await pool.query(
        `SELECT 
          a.date, a.value,
          s.name as service_name,
          pp.name as client_name,
          'private' as consultation_type
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN private_patients pp ON a.private_patient_id = pp.id
        WHERE a.professional_id = $1 
          AND a.private_patient_id IS NOT NULL
          AND a.status = 'completed'
          AND a.date >= $2 
          AND a.date <= $3
        ORDER BY a.date DESC`,
        [req.user.id, start_date, end_date]
      );

      const convenioConsultations = consultationsResult.rows;
      const privateConsultations = privateAppointmentsResult.rows;

      // Calculate totals
      const convenioRevenue = convenioConsultations.reduce(
        (sum, c) => sum + parseFloat(c.value),
        0
      );
      const privateRevenue = privateConsultations.reduce(
        (sum, c) => sum + parseFloat(c.value),
        0
      );
      const totalRevenue = convenioRevenue + privateRevenue;

      // Calculate amount to pay (only from convênio consultations)
      const clinicPercentage = 100 - professionalPercentage;
      const amountToPay = (convenioRevenue * clinicPercentage) / 100;

      const summary = {
        total_consultations: convenioConsultations.length + privateConsultations.length,
        convenio_consultations: convenioConsultations.length,
        private_consultations: privateConsultations.length,
        total_revenue: totalRevenue,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay,
        consultation_count: convenioConsultations.length + privateConsultations.length,
      };

      // Combine all consultations for display
      const allConsultations = [
        ...convenioConsultations.map(c => ({
          ...c,
          amount_to_pay: (parseFloat(c.value) * clinicPercentage) / 100,
          total_value: parseFloat(c.value)
        })),
        ...privateConsultations.map(c => ({
          ...c,
          amount_to_pay: 0, // Particulares não geram contas a pagar
          total_value: parseFloat(c.value)
        }))
      ];

      console.log("✅ Professional detailed report generated:", summary);

      res.json({
        summary,
        consultations: allConsultations,
      });
    } catch (error) {
      console.error("❌ Error generating professional detailed report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório detalhado" });
    }
  }
);

// Revenue report (admin only)
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

      console.log("🔄 Generating admin revenue report");
      console.log("🔄 Date range:", { start_date, end_date });

      // Get revenue by professional (only convênio consultations)
      const professionalsResult = await pool.query(
        `SELECT 
          u.name as professional_name,
          u.percentage as professional_percentage,
          COUNT(c.id) as consultation_count,
          COALESCE(SUM(c.value), 0) as revenue
        FROM users u
        LEFT JOIN consultations c ON u.id = c.professional_id 
          AND c.date >= $1 AND c.date <= $2
        WHERE 'professional' = ANY(u.roles)
        GROUP BY u.id, u.name, u.percentage
        ORDER BY revenue DESC`,
        [start_date, end_date]
      );

      // Calculate professional payments and clinic revenue
      const revenueByProfessional = professionalsResult.rows.map((prof) => {
        const revenue = parseFloat(prof.revenue) || 0;
        const professionalPercentage = prof.professional_percentage || 50;
        const clinicPercentage = 100 - professionalPercentage;
        
        const professionalPayment = (revenue * professionalPercentage) / 100;
        const clinicRevenue = (revenue * clinicPercentage) / 100;

        return {
          professional_name: prof.professional_name,
          professional_percentage: professionalPercentage,
          revenue: revenue,
          consultation_count: parseInt(prof.consultation_count) || 0,
          professional_payment: professionalPayment,
          clinic_revenue: clinicRevenue,
        };
      });

      // Get revenue by service (only convênio consultations)
      const servicesResult = await pool.query(
        `SELECT 
          s.name as service_name,
          COUNT(c.id) as consultation_count,
          COALESCE(SUM(c.value), 0) as revenue
        FROM services s
        LEFT JOIN consultations c ON s.id = c.service_id 
          AND c.date >= $1 AND c.date <= $2
        GROUP BY s.id, s.name
        HAVING COUNT(c.id) > 0
        ORDER BY revenue DESC`,
        [start_date, end_date]
      );

      const revenueByService = servicesResult.rows.map((service) => ({
        service_name: service.service_name,
        revenue: parseFloat(service.revenue) || 0,
        consultation_count: parseInt(service.consultation_count) || 0,
      }));

      // Calculate total revenue
      const totalRevenue = revenueByProfessional.reduce(
        (sum, prof) => sum + prof.revenue,
        0
      );

      console.log("✅ Admin revenue report generated");

      res.json({
        total_revenue: totalRevenue,
        revenue_by_professional: revenueByProfessional,
        revenue_by_service: revenueByService,
      });
    } catch (error) {
      console.error("❌ Error generating revenue report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório de receita" });
    }
  }
);

// Clients by city report (admin only)
app.get(
  "/api/reports/clients-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          city, state,
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
      console.error("Error generating clients by city report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório por cidade" });
    }
  }
);

// Professionals by city report (admin only)
app.get(
  "/api/reports/professionals-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
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
        ORDER BY total_professionals DESC
      `);

      // Process categories to group by category name
      const processedResult = result.rows.map((row) => {
        const categoryMap = new Map();

        row.categories.forEach((cat) => {
          const categoryName = cat.category_name;
          if (categoryMap.has(categoryName)) {
            categoryMap.set(categoryName, categoryMap.get(categoryName) + 1);
          } else {
            categoryMap.set(categoryName, 1);
          }
        });

        const categories = Array.from(categoryMap.entries()).map(
          ([category_name, count]) => ({
            category_name,
            count,
          })
        );

        return {
          city: row.city,
          state: row.state,
          total_professionals: parseInt(row.total_professionals),
          categories,
        };
      });

      res.json(processedResult);
    } catch (error) {
      console.error("Error generating professionals by city report:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar relatório de profissionais" });
    }
  }
);

// ==================== MEDICAL RECORDS ROUTES ====================

// Get medical records for professional
app.get("/api/medical-records", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        mr.id, mr.chief_complaint, mr.history_present_illness, mr.past_medical_history,
        mr.medications, mr.allergies, mr.physical_examination, mr.diagnosis,
        mr.treatment_plan, mr.notes, mr.vital_signs, mr.created_at, mr.updated_at,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching medical records:", error);
    res.status(500).json({ message: "Erro ao buscar prontuários" });
  }
});

// Create medical record
app.post("/api/medical-records", authenticate, async (req, res) => {
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

    // Verify patient belongs to professional
    const patientCheck = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [private_patient_id, req.user.id]
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
        vital_signs || null,
      ]
    );

    res.status(201).json({
      message: "Prontuário criado com sucesso",
      record: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating medical record:", error);
    res.status(500).json({ message: "Erro ao criar prontuário" });
  }
});

// Update medical record
app.put("/api/medical-records/:id", authenticate, async (req, res) => {
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

    // Verify record belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM medical_records WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Prontuário não encontrado" });
    }

    const result = await pool.query(
      `UPDATE medical_records 
       SET chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
           medications = $4, allergies = $5, physical_examination = $6,
           diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
           updated_at = NOW()
       WHERE id = $11 
       RETURNING *`,
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
        vital_signs || null,
        id,
      ]
    );

    res.json({
      message: "Prontuário atualizado com sucesso",
      record: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating medical record:", error);
    res.status(500).json({ message: "Erro ao atualizar prontuário" });
  }
});

// Delete medical record
app.delete("/api/medical-records/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify record belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM medical_records WHERE id = $1 AND professional_id = $2",
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Prontuário não encontrado" });
    }

    await pool.query("DELETE FROM medical_records WHERE id = $1", [id]);

    res.json({ message: "Prontuário excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting medical record:", error);
    res.status(500).json({ message: "Erro ao excluir prontuário" });
  }
});

// Generate medical record document
app.post("/api/medical-records/generate-document", authenticate, async (req, res) => {
  try {
    const { record_id, template_data } = req.body;

    if (!record_id || !template_data) {
      return res.status(400).json({ message: "Dados insuficientes para gerar documento" });
    }

    // Verify record belongs to professional
    const checkResult = await pool.query(
      "SELECT id FROM medical_records WHERE id = $1 AND professional_id = $2",
      [record_id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Prontuário não encontrado" });
    }

    // Generate document
    const documentResult = await generateDocumentPDF('medical_record', template_data);

    res.json({
      message: "Documento gerado com sucesso",
      documentUrl: documentResult.url,
      title: `Prontuário - ${template_data.patientName}`
    });
  } catch (error) {
    console.error("Error generating medical record document:", error);
    res.status(500).json({ message: "Erro ao gerar documento" });
  }
});

// ==================== MEDICAL DOCUMENTS ROUTES ====================

// Get medical documents for professional
app.get("/api/medical-documents", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        md.id, md.title, md.document_type, md.document_url, md.created_at,
        pp.name as patient_name
      FROM medical_documents md
      JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching medical documents:", error);
    res.status(500).json({ message: "Erro ao buscar documentos" });
  }
});

// Create medical document
app.post("/api/medical-documents", authenticate, async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !private_patient_id || !template_data) {
      return res.status(400).json({ message: "Dados insuficientes" });
    }

    // Verify patient belongs to professional
    const patientCheck = await pool.query(
      "SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2",
      [private_patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: "Paciente não encontrado" });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(
      `INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url
      ) VALUES ($1, $2, $3, $4, $5) 
      RETURNING *`,
      [req.user.id, private_patient_id, title, document_type, documentResult.url]
    );

    res.status(201).json({
      message: "Documento criado com sucesso",
      document: result.rows[0],
      title: title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error("Error creating medical document:", error);
    res.status(500).json({ message: "Erro ao criar documento" });
  }
});

// ==================== SCHEDULING ACCESS ROUTES ====================

// Get professionals with scheduling access (admin only)
app.get(
  "/api/admin/professionals-scheduling-access",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.name, u.email, u.phone, 
               COALESCE(u.category_name, sc.name) as category_name,
               COALESCE(sa.has_access, false) as has_scheduling_access,
               sa.expires_at as access_expires_at,
               granted_by_user.name as access_granted_by,
               sa.granted_at as access_granted_at
        FROM users u
        LEFT JOIN service_categories sc ON u.category_id = sc.id
        LEFT JOIN scheduling_access sa ON u.id = sa.professional_id
        LEFT JOIN users granted_by_user ON sa.granted_by = granted_by_user.id
        WHERE u.roles @> '["professional"]'
        ORDER BY u.name
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching professionals scheduling access:", error);
      res.status(500).json({ message: "Erro ao buscar acesso à agenda" });
    }
  }
);

// Grant scheduling access (admin only)
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

      // Upsert scheduling access
      await pool.query(
        `INSERT INTO scheduling_access (professional_id, has_access, expires_at, granted_by, reason)
         VALUES ($1, true, $2, $3, $4)
         ON CONFLICT (professional_id) 
         DO UPDATE SET has_access = true, expires_at = $2, granted_by = $3, reason = $4, granted_at = now()`,
        [professional_id, expires_at, req.user.id, reason]
      );

      res.json({ message: "Acesso à agenda concedido com sucesso" });
    } catch (error) {
      console.error("Error granting scheduling access:", error);
      res.status(500).json({ message: "Erro ao conceder acesso" });
    }
  }
);

// Revoke scheduling access (admin only)
app.post(
  "/api/admin/revoke-scheduling-access",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { professional_id } = req.body;

      if (!professional_id) {
        return res.status(400).json({
          message: "ID do profissional é obrigatório",
        });
      }

      await pool.query(
        `UPDATE scheduling_access 
        SET has_access = false, expires_at = now() 
        WHERE professional_id = $1`,
        [professional_id]
      );

      res.json({ message: "Acesso à agenda revogado com sucesso" });
    } catch (error) {
      console.error("Error revoking scheduling access:", error);
      res.status(500).json({ message: "Erro ao revogar acesso" });
    }
  }
);

// ==================== PAYMENT ROUTES ====================

// Create subscription payment
app.post("/api/create-subscription", authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "ID do usuário é obrigatório" });
    }

    // Verify access
    if (
      req.user.id !== parseInt(user_id) &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    // Get user data
    const userResult = await pool.query(
      "SELECT name, email FROM users WHERE id = $1",
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = userResult.rows[0];

    // Create MercadoPago preference
    const { MercadoPago, Preference } = await import("mercadopago");

    const client = new MercadoPago({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: "Assinatura Convênio Quiro Ferreira - Titular",
          quantity: 1,
          unit_price: 250,
          currency_id: "BRL",
        },
      ],
      payer: {
        name: user.name,
        email: user.email || "cliente@quiroferreira.com.br",
      },
      back_urls: {
        success: `${req.protocol}://${req.get("host")}/client?payment=success&type=subscription`,
        failure: `${req.protocol}://${req.get("host")}/client?payment=failure&type=subscription`,
        pending: `${req.protocol}://${req.get("host")}/client?payment=pending&type=subscription`,
      },
      auto_return: "approved",
      external_reference: `subscription_${user_id}`,
      notification_url: `${req.protocol}://${req.get("host")}/api/webhooks/mercadopago`,
    };

    const result = await preference.create({ body: preferenceData });

    res.json({
      id: result.id,
      init_point: result.init_point,
    });
  } catch (error) {
    console.error("Error creating subscription payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento" });
  }
});

// Create dependent payment
app.post("/api/dependents/:id/create-payment", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get dependent data
    const dependentResult = await pool.query(
      `SELECT 
        d.id, d.name, d.client_id,
        u.name as client_name, u.email as client_email,
        COALESCE(d.subscription_status, 'pending') as subscription_status,
        d.subscription_expiry,
        COALESCE(d.billing_amount, 50.00) as billing_amount,
        COALESCE(d.subscription_status, 'pending') as current_status
       FROM dependents d
       JOIN users u ON d.client_id = u.id
       WHERE d.id = $1`,
      [id]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    const dependent = dependentResult.rows[0];

    // Verify access
    if (
      req.user.id !== dependent.client_id &&
      !req.user.roles.includes("admin")
    ) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    // Create MercadoPago preference
    const { MercadoPago, Preference } = await import("mercadopago");

    const client = new MercadoPago({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Ativação de Dependente - ${dependent.name}`,
          description: `Ativação da assinatura do dependente ${dependent.name}`,
          quantity: 1,
          unit_price: dependent.billing_amount || 50,
          currency_id: "BRL",
        },
      ],
      payer: {
        name: dependent.client_name,
        email: dependent.client_email || "cliente@quiroferreira.com.br",
      },
      back_urls: {
        success: `${req.protocol}://${req.get("host")}/client?payment=success&type=dependent`,
        failure: `${req.protocol}://${req.get("host")}/client?payment=failure&type=dependent`,
        pending: `${req.protocol}://${req.get("host")}/client?payment=pending&type=dependent`,
      },
      auto_return: "approved",
      external_reference: `dependent_${id}`,
      notification_url: `${req.protocol}://${req.get("host")}/api/webhooks/mercadopago`,
    };

    const result = await preference.create({ body: preferenceData });

    res.json({
      id: result.id,
      init_point: result.init_point,
    });
  } catch (error) {
    console.error("Error creating dependent payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento" });
  }
});

// Create professional payment
app.post(
  "/api/professional/create-payment",
  authenticate,
  authorize(["professional"]),
  async (req, res) => {
    try {
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valor inválido" });
      }

      // Get professional data
      const userResult = await pool.query(
        "SELECT name, email FROM users WHERE id = $1",
        [req.user.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const user = userResult.rows[0];

      // Create MercadoPago preference
      const { MercadoPago, Preference } = await import("mercadopago");

      const client = new MercadoPago({
        accessToken: process.env.MP_ACCESS_TOKEN,
      });

      const preference = new Preference(client);

      const preferenceData = {
        items: [
          {
            title: `Repasse ao Convênio - ${user.name}`,
            quantity: 1,
            unit_price: parseFloat(amount),
            currency_id: "BRL",
          },
        ],
        payer: {
          name: user.name,
          email: user.email || "profissional@quiroferreira.com.br",
        },
        back_urls: {
          success: `${req.protocol}://${req.get("host")}/professional?payment=success&type=professional`,
          failure: `${req.protocol}://${req.get("host")}/professional?payment=failure&type=professional`,
          pending: `${req.protocol}://${req.get("host")}/professional?payment=pending&type=professional`,
        },
        auto_return: "approved",
        external_reference: `professional_${req.user.id}`,
        notification_url: `${req.protocol}://${req.get("host")}/api/webhooks/mercadopago`,
      };

      const result = await preference.create({ body: preferenceData });

      res.json({
        id: result.id,
        init_point: result.init_point,
      });
    } catch (error) {
      console.error("Error creating professional payment:", error);
      res.status(500).json({ message: "Erro ao criar pagamento" });
    }
  }
);

// Create agenda payment
app.post("/api/agenda/create-payment", authenticate, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valor inválido" });
    }

    // Get professional data
    const userResult = await pool.query(
      "SELECT name, email FROM users WHERE id = $1",
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = userResult.rows[0];

    // Create MercadoPago preference
    const { MercadoPago, Preference } = await import("mercadopago");

    const client = new MercadoPago({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Acesso à Agenda - ${user.name}`,
          quantity: 1,
          unit_price: parseFloat(amount),
          currency_id: "BRL",
        },
      ],
      payer: {
        name: user.name,
        email: user.email || "profissional@quiroferreira.com.br",
      },
      back_urls: {
        success: `${req.protocol}://${req.get("host")}/professional?payment=success&type=agenda`,
        failure: `${req.protocol}://${req.get("host")}/professional?payment=failure&type=agenda`,
        pending: `${req.protocol}://${req.get("host")}/professional?payment=pending&type=agenda`,
      },
      auto_return: "approved",
      external_reference: `agenda_${req.user.id}`,
      notification_url: `${req.protocol}://${req.get("host")}/api/webhooks/mercadopago`,
    };

    const result = await preference.create({ body: preferenceData });

    res.json({
      id: result.id,
      init_point: result.init_point,
    });
  } catch (error) {
    console.error("Error creating agenda payment:", error);
    res.status(500).json({ message: "Erro ao criar pagamento" });
  }
});

// ==================== WEBHOOK ROUTES ====================

// MercadoPago webhook
app.post("/api/webhooks/mercadopago", async (req, res) => {
  try {
    console.log("🔔 MercadoPago webhook received:", req.body);

    const { type, data } = req.body;

    if (type === "payment") {
      const { MercadoPago, Payment } = await import("mercadopago");

      const client = new MercadoPago({
        accessToken: process.env.MP_ACCESS_TOKEN,
      });

      const payment = new Payment(client);
      const paymentInfo = await payment.get({ id: data.id });

      console.log("💳 Payment info:", paymentInfo);

      if (paymentInfo.status === "approved") {
        const externalReference = paymentInfo.external_reference;
        console.log("✅ Payment approved for:", externalReference);

        if (externalReference.startsWith("subscription_")) {
          // Handle subscription payment
          const userId = externalReference.replace("subscription_", "");
          
          // Set subscription as active for 1 year
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);

          await pool.query(
            `UPDATE users 
             SET subscription_status = 'active', 
                 subscription_expiry = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [expiryDate, userId]
          );

          console.log("✅ Subscription activated for user:", userId);

        } else if (externalReference.startsWith("dependent_")) {
          // Handle dependent payment
          const dependentId = externalReference.replace("dependent_", "");
          
          // Set dependent as active for 1 year
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);

          await pool.query(
            `UPDATE dependents 
             SET subscription_status = 'active',
                 subscription_expiry = $1,
                 activated_at = NOW(),
                 payment_reference = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [expiryDate, paymentInfo.id, dependentId]
          );

          console.log("✅ Dependent activated:", dependentId);

        } else if (externalReference.startsWith("professional_")) {
          // Handle professional payment (clear debts)
          const professionalId = externalReference.replace("professional_", "");

          await pool.query(
            `UPDATE users 
             SET amount_to_pay = 0,
                 last_payment_date = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [professionalId]
          );

          console.log("✅ Professional debts cleared:", professionalId);

        } else if (externalReference.startsWith("agenda_")) {
          // Handle agenda payment (1 month access)
          const professionalId = externalReference.replace("agenda_", "");
          
          // Grant 1 month of scheduling access
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);

          await pool.query(
            `INSERT INTO scheduling_access (professional_id, has_access, expires_at, granted_by, granted_at, reason)
             VALUES ($1, true, $2, $1, NOW(), 'Pagamento da agenda')
             ON CONFLICT (professional_id) 
             DO UPDATE SET 
               has_access = true,
               expires_at = $2,
               granted_at = NOW(),
               reason = 'Pagamento da agenda'`,
            [professionalId, expiryDate]
          );

          console.log("✅ Agenda access granted for:", professionalId);
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).send("Error");
  }
});

// ==================== IMAGE UPLOAD ROUTE ====================

// Upload image route
app.post("/api/upload-image", authenticate, async (req, res) => {
  try {
    // Create upload middleware instance
    const upload = createUpload();

    // Use multer middleware
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("❌ Upload error:", err);
        return res.status(400).json({
          message: err.message || "Erro no upload da imagem",
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Nenhuma imagem enviada" });
      }

      try {
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
      } catch (dbError) {
        console.error("❌ Database error after upload:", dbError);
        res.status(500).json({
          message: "Erro ao salvar URL da imagem no banco de dados",
        });
      }
    });
  } catch (error) {
    console.error("❌ Error in upload route:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// ==================== CATCH-ALL ROUTE ====================

// Serve React app for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "dist", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
});