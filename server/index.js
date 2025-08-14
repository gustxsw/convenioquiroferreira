import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { authenticate, authorize } from "./middleware/auth.js";
import createUpload from "./middleware/upload.js";
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Auth routes
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

    console.log("📝 Registration request received:", { name, cpf, email });

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
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user with client role and pending subscription
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password_hash, 
        roles, subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) 
      RETURNING id, name, cpf, email, roles, subscription_status`,
      [
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
        hashedPassword,
        JSON.stringify(["client"]), // Always register as client
        "pending", // Default subscription status
      ]
    );

    const user = result.rows[0];
    console.log("✅ User registered successfully:", user);

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        email: user.email,
        roles: JSON.parse(user.roles),
        subscription_status: user.subscription_status,
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
      "SELECT id, name, cpf, password_hash, roles FROM users WHERE cpf = $1",
      [cpf]
    );

    if (result.rows.length === 0) {
      console.log("❌ User not found for CPF:", cpf);
      return res.status(401).json({
        message: "Credenciais inválidas",
      });
    }

    const user = result.rows[0];
    console.log("👤 User found:", { id: user.id, name: user.name });

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      console.log("❌ Invalid password for user:", user.id);
      return res.status(401).json({
        message: "Credenciais inválidas",
      });
    }

    console.log("✅ Password valid for user:", user.id);

    // Parse roles
    const userRoles = JSON.parse(user.roles || "[]");
    console.log("🎭 User roles:", userRoles);

    res.json({
      message: "Login realizado com sucesso",
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: userRoles,
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

    console.log("🎯 Role selection request:", { userId, role });

    // Validate input
    if (!userId || !role) {
      return res.status(400).json({
        message: "ID do usuário e role são obrigatórios",
      });
    }

    // Get user data
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
    const userRoles = JSON.parse(user.roles || "[]");

    // Validate role
    if (!userRoles.includes(role)) {
      return res.status(403).json({
        message: "Role não autorizada para este usuário",
      });
    }

    // Generate JWT token with selected role
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

    console.log("✅ Role selected successfully:", { userId, role });

    res.json({
      message: "Role selecionada com sucesso",
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: userRoles,
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

    console.log("🔄 Role switch request:", { userId, role });

    // Get user data
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
    const userRoles = JSON.parse(user.roles || "[]");

    // Validate role
    if (!userRoles.includes(role)) {
      return res.status(403).json({
        message: "Role não autorizada para este usuário",
      });
    }

    // Generate new JWT token with new role
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

    console.log("✅ Role switched successfully:", { userId, role });

    res.json({
      message: "Role alterada com sucesso",
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: userRoles,
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
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement, 
        u.neighborhood, u.city, u.state, u.roles, u.percentage,
        u.category_id, u.subscription_status, u.subscription_expiry,
        u.created_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      ORDER BY u.created_at DESC
    `);

    const users = result.rows.map((user) => ({
      ...user,
      roles: JSON.parse(user.roles || "[]"),
    }));

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Erro ao carregar usuários" });
  }
});

app.get("/api/users/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement, 
        u.neighborhood, u.city, u.state, u.roles, u.percentage,
        u.category_id, u.subscription_status, u.subscription_expiry,
        u.photo_url, u.created_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const user = result.rows[0];
    user.roles = JSON.parse(user.roles || "[]");

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Erro ao carregar usuário" });
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
      password,
      roles,
      percentage,
      category_id,
    } = req.body;

    // Validate required fields
    if (!name || !cpf || !password || !roles || roles.length === 0) {
      return res.status(400).json({
        message: "Nome, CPF, senha e pelo menos uma role são obrigatórios",
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
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password_hash, 
        roles, percentage, category_id, subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()) 
      RETURNING id, name, cpf, email, roles`,
      [
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
        hashedPassword,
        JSON.stringify(roles),
        percentage,
        category_id,
        roles.includes("client") ? "pending" : null,
      ]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: {
        ...user,
        roles: JSON.parse(user.roles),
      },
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Erro ao criar usuário" });
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
      percentage,
      category_id,
      currentPassword,
      newPassword,
    } = req.body;

    // Check if user exists
    const userResult = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    let updateQuery = `
      UPDATE users SET 
        name = $1, email = $2, phone = $3, birth_date = $4,
        address = $5, address_number = $6, address_complement = $7,
        neighborhood = $8, city = $9, state = $10, updated_at = NOW()
    `;
    let queryParams = [
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
    ];
    let paramIndex = 11;

    // Add roles if provided (admin only)
    if (roles && req.user.currentRole === "admin") {
      updateQuery += `, roles = $${paramIndex}`;
      queryParams.push(JSON.stringify(roles));
      paramIndex++;

      if (percentage !== undefined) {
        updateQuery += `, percentage = $${paramIndex}`;
        queryParams.push(percentage);
        paramIndex++;
      }

      if (category_id !== undefined) {
        updateQuery += `, category_id = $${paramIndex}`;
        queryParams.push(category_id);
        paramIndex++;
      }
    }

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ message: "Senha atual é obrigatória" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        currentPassword,
        userResult.rows[0].password_hash
      );

      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateQuery += `, password_hash = $${paramIndex}`;
      queryParams.push(hashedPassword);
      paramIndex++;
    }

    updateQuery += ` WHERE id = $${paramIndex} RETURNING id, name, email, roles`;
    queryParams.push(id);

    const result = await pool.query(updateQuery, queryParams);
    const updatedUser = result.rows[0];

    res.json({
      message: "Usuário atualizado com sucesso",
      user: {
        ...updatedUser,
        roles: JSON.parse(updatedUser.roles || "[]"),
      },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Erro ao atualizar usuário" });
  }
});

app.put(
  "/api/users/:id/activate",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { expiry_date } = req.body;

      if (!expiry_date) {
        return res
          .status(400)
          .json({ message: "Data de expiração é obrigatória" });
      }

      const result = await pool.query(
        `UPDATE users SET 
        subscription_status = 'active',
        subscription_expiry = $1,
        updated_at = NOW()
      WHERE id = $2 
      RETURNING id, name, subscription_status, subscription_expiry`,
        [expiry_date, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      res.json({
        message: "Cliente ativado com sucesso",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Error activating user:", error);
      res.status(500).json({ message: "Erro ao ativar cliente" });
    }
  }
);

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

// Service categories routes
app.get("/api/service-categories", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM service_categories ORDER BY name"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Erro ao carregar categorias" });
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

      const result = await pool.query(
        "INSERT INTO service_categories (name, description, created_at) VALUES ($1, $2, NOW()) RETURNING *",
        [name, description]
      );

      res.status(201).json({
        message: "Categoria criada com sucesso",
        category: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Erro ao criar categoria" });
    }
  }
);

// Services routes
app.get("/api/services", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, sc.name as category_name 
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching services:", error);
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

      if (!name || !description || !base_price) {
        return res.status(400).json({
          message: "Nome, descrição e preço base são obrigatórios",
        });
      }

      const result = await pool.query(
        `INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [name, description, base_price, category_id, is_base_service || false]
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
        `UPDATE services SET 
        name = $1, description = $2, base_price = $3, 
        category_id = $4, is_base_service = $5, updated_at = NOW()
      WHERE id = $6 RETURNING *`,
        [name, description, base_price, category_id, is_base_service, id]
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

app.delete(
  "/api/services/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

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
      res.status(500).json({ message: "Erro ao excluir serviço" });
    }
  }
);

// Consultations routes
app.get("/api/consultations", authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.date, c.value, c.status, c.notes,
        s.name as service_name,
        u.name as professional_name,
        COALESCE(cl.name, pp.name) as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true 
          ELSE false 
        END as is_dependent
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users cl ON c.client_id = cl.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
    `;

    const queryParams = [];

    // Filter by user role
    if (req.user.currentRole === "client") {
      query += ` WHERE (c.client_id = $1 OR d.client_id = $1)`;
      queryParams.push(req.user.id);
    } else if (req.user.currentRole === "professional") {
      query += ` WHERE c.professional_id = $1`;
      queryParams.push(req.user.id);
    }

    query += ` ORDER BY c.date DESC`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching consultations:", error);
    res.status(500).json({ message: "Erro ao carregar consultas" });
  }
});

app.post("/api/consultations", authenticate, async (req, res) => {
  try {
    const {
      client_id,
      dependent_id,
      private_patient_id,
      professional_id,
      service_id,
      location_id,
      value,
      date,
      status = "completed",
      notes,
    } = req.body;

    console.log("📝 Creating consultation:", {
      client_id,
      dependent_id,
      private_patient_id,
      professional_id: professional_id || req.user.id,
      service_id,
      location_id,
      value,
      date,
      status,
    });

    // Validate required fields
    if (!service_id || !value || !date) {
      return res.status(400).json({
        message: "Serviço, valor e data são obrigatórios",
      });
    }

    // Validate that at least one patient type is provided
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({
        message:
          "É necessário especificar um cliente, dependente ou paciente particular",
      });
    }

    // Use the authenticated user as professional if not provided
    const finalProfessionalId = professional_id || req.user.id;

    const result = await pool.query(
      `INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) 
      RETURNING *`,
      [
        client_id,
        dependent_id,
        private_patient_id,
        finalProfessionalId,
        service_id,
        location_id,
        value,
        date,
        status,
        notes,
      ]
    );

    console.log("✅ Consultation created:", result.rows[0]);

    res.status(201).json({
      message: "Consulta registrada com sucesso",
      consultation: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error creating consultation:", error);
    res.status(500).json({ message: "Erro ao registrar consulta" });
  }
});

app.put(
  "/api/consultations/:id/status",
  authenticate,
  authorize(["professional", "admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log("🔄 Updating consultation status:", { id, status });

      // Validate status
      const validStatuses = ["scheduled", "confirmed", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }

      // Check if consultation exists and belongs to the professional
      let checkQuery = "SELECT id, professional_id FROM consultations WHERE id = $1";
      const checkParams = [id];

      if (req.user.currentRole === "professional") {
        checkQuery += " AND professional_id = $2";
        checkParams.push(req.user.id);
      }

      const checkResult = await pool.query(checkQuery, checkParams);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Consulta não encontrada" });
      }

      // Update status
      const result = await pool.query(
        "UPDATE consultations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        [status, id]
      );

      console.log("✅ Consultation status updated:", result.rows[0]);

      res.json({
        message: "Status atualizado com sucesso",
        consultation: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error updating consultation status:", error);
      res.status(500).json({ message: "Erro ao atualizar status" });
    }
  }
);

// Dependents routes
app.get("/api/dependents/:clientId", authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await pool.query(
      "SELECT * FROM dependents WHERE client_id = $1 ORDER BY name",
      [clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching dependents:", error);
    res.status(500).json({ message: "Erro ao carregar dependentes" });
  }
});

app.get("/api/dependents/lookup", authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    const result = await pool.query(
      `SELECT 
        d.id, d.name, d.cpf, d.birth_date, d.client_id,
        u.name as client_name, u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1`,
      [cpf]
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

app.post("/api/dependents", authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    // Validate required fields
    if (!client_id || !name || !cpf) {
      return res.status(400).json({
        message: "ID do cliente, nome e CPF são obrigatórios",
      });
    }

    // Check if dependent already exists
    const existingDependent = await pool.query(
      "SELECT id FROM dependents WHERE cpf = $1",
      [cpf]
    );

    if (existingDependent.rows.length > 0) {
      return res.status(400).json({
        message: "Dependente já cadastrado com este CPF",
      });
    }

    const result = await pool.query(
      `INSERT INTO dependents (client_id, name, cpf, birth_date, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [client_id, name, cpf, birth_date]
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

app.put("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    const result = await pool.query(
      "UPDATE dependents SET name = $1, birth_date = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [name, birth_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    res.json({
      message: "Dependente atualizado com sucesso",
      dependent: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating dependent:", error);
    res.status(500).json({ message: "Erro ao atualizar dependente" });
  }
});

app.delete("/api/dependents/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM dependents WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Dependente não encontrado" });
    }

    res.json({ message: "Dependente excluído com sucesso" });
  } catch (error) {
    console.error("Error deleting dependent:", error);
    res.status(500).json({ message: "Erro ao excluir dependente" });
  }
});

// Clients lookup route
app.get("/api/clients/lookup", authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: "CPF é obrigatório" });
    }

    const result = await pool.query(
      `SELECT id, name, cpf, subscription_status, subscription_expiry
       FROM users 
       WHERE cpf = $1 AND roles::jsonb ? 'client'`,
      [cpf]
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

// Professionals routes
app.get("/api/professionals", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.photo_url,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.roles::jsonb ? 'professional'
      ORDER BY u.name
    `);

    const professionals = result.rows.map((prof) => ({
      ...prof,
      roles: JSON.parse(prof.roles || "[]"),
    }));

    res.json(professionals);
  } catch (error) {
    console.error("Error fetching professionals:", error);
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
      const result = await pool.query(
        "SELECT * FROM private_patients WHERE professional_id = $1 ORDER BY name",
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching private patients:", error);
      res.status(500).json({ message: "Erro ao carregar pacientes" });
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

      if (!name || !cpf) {
        return res
          .status(400)
          .json({ message: "Nome e CPF são obrigatórios" });
      }

      // Check if patient already exists for this professional
      const existingPatient = await pool.query(
        "SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2",
        [cpf, req.user.id]
      );

      if (existingPatient.rows.length > 0) {
        return res.status(400).json({
          message: "Paciente já cadastrado com este CPF",
        });
      }

      const result = await pool.query(
        `INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) 
      RETURNING *`,
        [
          req.user.id,
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

      const result = await pool.query(
        `UPDATE private_patients SET 
        name = $1, email = $2, phone = $3, birth_date = $4,
        address = $5, address_number = $6, address_complement = $7,
        neighborhood = $8, city = $9, state = $10, zip_code = $11,
        updated_at = NOW()
      WHERE id = $12 AND professional_id = $13 
      RETURNING *`,
        [
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
          id,
          req.user.id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      res.json({
        message: "Paciente atualizado com sucesso",
        patient: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating private patient:", error);
      res.status(500).json({ message: "Erro ao atualizar paciente" });
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

      const result = await pool.query(
        "DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING id",
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Paciente não encontrado" });
      }

      res.json({ message: "Paciente excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting private patient:", error);
      res.status(500).json({ message: "Erro ao excluir paciente" });
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
      const result = await pool.query(
        `SELECT 
        mr.*, 
        COALESCE(cl.name, pp.name) as patient_name
      FROM medical_records mr
      LEFT JOIN users cl ON mr.client_id = cl.id
      LEFT JOIN dependents d ON mr.dependent_id = d.id
      LEFT JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching medical records:", error);
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
        client_id,
        dependent_id,
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

      const result = await pool.query(
        `INSERT INTO medical_records (
        professional_id, client_id, dependent_id, private_patient_id,
        chief_complaint, history_present_illness, past_medical_history,
        medications, allergies, physical_examination, diagnosis,
        treatment_plan, notes, vital_signs, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) 
      RETURNING *`,
        [
          req.user.id,
          client_id,
          dependent_id,
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
          JSON.stringify(vital_signs),
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

      const result = await pool.query(
        `UPDATE medical_records SET 
        chief_complaint = $1, history_present_illness = $2,
        past_medical_history = $3, medications = $4, allergies = $5,
        physical_examination = $6, diagnosis = $7, treatment_plan = $8,
        notes = $9, vital_signs = $10, updated_at = NOW()
      WHERE id = $11 AND professional_id = $12 
      RETURNING *`,
        [
          chief_complaint,
          history_present_illness,
          past_medical_history,
          medications,
          allergies,
          physical_examination,
          diagnosis,
          treatment_plan,
          notes,
          JSON.stringify(vital_signs),
          id,
          req.user.id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Prontuário não encontrado" });
      }

      res.json({
        message: "Prontuário atualizado com sucesso",
        record: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating medical record:", error);
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

      const result = await pool.query(
        "DELETE FROM medical_records WHERE id = $1 AND professional_id = $2 RETURNING id",
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Prontuário não encontrado" });
      }

      res.json({ message: "Prontuário excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting medical record:", error);
      res.status(500).json({ message: "Erro ao excluir prontuário" });
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
      const result = await pool.query(
        `SELECT 
        md.*,
        COALESCE(cl.name, pp.name) as patient_name
      FROM medical_documents md
      LEFT JOIN users cl ON md.client_id = cl.id
      LEFT JOIN dependents d ON md.dependent_id = d.id
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching medical documents:", error);
      res.status(500).json({ message: "Erro ao carregar documentos" });
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

      console.log("🔄 Creating medical document:", {
        title,
        document_type,
        private_patient_id,
      });

      // Generate document
      const documentResult = await generateDocumentPDF(
        document_type,
        template_data
      );

      // Save to database
      const result = await pool.query(
        `INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type,
        document_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW()) 
      RETURNING *`,
        [
          req.user.id,
          private_patient_id,
          title,
          document_type,
          documentResult.url,
        ]
      );

      console.log("✅ Document created and saved:", result.rows[0]);

      res.status(201).json({
        message: "Documento criado com sucesso",
        document: result.rows[0],
        title: title,
        documentUrl: documentResult.url,
      });
    } catch (error) {
      console.error("❌ Error creating medical document:", error);
      res.status(500).json({
        message: "Erro ao criar documento",
        error: error.message,
      });
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
      const result = await pool.query(
        "SELECT * FROM attendance_locations WHERE professional_id = $1 ORDER BY is_default DESC, name",
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching attendance locations:", error);
      res.status(500).json({ message: "Erro ao carregar locais" });
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

      // If this is being set as default, unset other defaults
      if (is_default) {
        await pool.query(
          "UPDATE attendance_locations SET is_default = false WHERE professional_id = $1",
          [req.user.id]
        );
      }

      const result = await pool.query(
        `INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()) 
      RETURNING *`,
        [
          req.user.id,
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

      // If this is being set as default, unset other defaults
      if (is_default) {
        await pool.query(
          "UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2",
          [req.user.id, id]
        );
      }

      const result = await pool.query(
        `UPDATE attendance_locations SET 
        name = $1, address = $2, address_number = $3, address_complement = $4,
        neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9,
        is_default = $10, updated_at = NOW()
      WHERE id = $11 AND professional_id = $12 
      RETURNING *`,
        [
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
          id,
          req.user.id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Local não encontrado" });
      }

      res.json({
        message: "Local atualizado com sucesso",
        location: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating attendance location:", error);
      res.status(500).json({ message: "Erro ao atualizar local" });
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

      const result = await pool.query(
        "DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2 RETURNING id",
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Local não encontrado" });
      }

      res.json({ message: "Local excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting attendance location:", error);
      res.status(500).json({ message: "Erro ao excluir local" });
    }
  }
);

// Image upload route
app.post("/api/upload-image", authenticate, async (req, res) => {
  try {
    console.log("🔄 Image upload request received");

    // Create upload middleware
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
        return res.status(400).json({
          message: "Nenhuma imagem foi enviada",
        });
      }

      console.log("✅ Image uploaded to Cloudinary:", req.file.path);

      // Update user's photo_url in database
      await pool.query("UPDATE users SET photo_url = $1 WHERE id = $2", [
        req.file.path,
        req.user.id,
      ]);

      res.json({
        message: "Imagem enviada com sucesso",
        imageUrl: req.file.path,
      });
    });
  } catch (error) {
    console.error("❌ Error in image upload route:", error);
    res.status(500).json({
      message: "Erro interno do servidor",
      error: error.message,
    });
  }
});

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

      // Get revenue by professional
      const professionalRevenueResult = await pool.query(
        `SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count,
        SUM(c.value * (u.percentage / 100.0)) as professional_payment,
        SUM(c.value * ((100 - u.percentage) / 100.0)) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
        AND c.client_id IS NOT NULL
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC`,
        [start_date, end_date]
      );

      // Get revenue by service
      const serviceRevenueResult = await pool.query(
        `SELECT 
        s.name as service_name,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC`,
        [start_date, end_date]
      );

      // Calculate total revenue
      const totalRevenueResult = await pool.query(
        `SELECT SUM(value) as total_revenue 
       FROM consultations 
       WHERE date >= $1 AND date <= $2`,
        [start_date, end_date]
      );

      const totalRevenue = totalRevenueResult.rows[0]?.total_revenue || 0;

      res.json({
        total_revenue: parseFloat(totalRevenue),
        revenue_by_professional: professionalRevenueResult.rows.map((row) => ({
          professional_name: row.professional_name,
          professional_percentage: parseInt(row.professional_percentage),
          revenue: parseFloat(row.revenue),
          consultation_count: parseInt(row.consultation_count),
          professional_payment: parseFloat(row.professional_payment),
          clinic_revenue: parseFloat(row.clinic_revenue),
        })),
        revenue_by_service: serviceRevenueResult.rows.map((row) => ({
          service_name: row.service_name,
          revenue: parseFloat(row.revenue),
          consultation_count: parseInt(row.consultation_count),
        })),
      });
    } catch (error) {
      console.error("Error generating revenue report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório" });
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

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "Data inicial e final são obrigatórias",
        });
      }

      console.log("🔄 Generating professional revenue report:", {
        professional_id: req.user.id,
        start_date,
        end_date,
      });

      // Get professional's percentage
      const professionalResult = await pool.query(
        "SELECT percentage FROM users WHERE id = $1",
        [req.user.id]
      );

      const professionalPercentage =
        professionalResult.rows[0]?.percentage || 50;

      // Get consultations for the period
      const consultationsResult = await pool.query(
        `SELECT 
        c.date, c.value,
        COALESCE(cl.name, pp.name) as client_name,
        s.name as service_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN c.value * ($3 / 100.0)
          ELSE 0
        END as amount_to_pay
      FROM consultations c
      LEFT JOIN users cl ON c.client_id = cl.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC`,
        [req.user.id, start_date, 100 - professionalPercentage, end_date]
      );

      // Calculate summary
      const totalRevenue = consultationsResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.value),
        0
      );
      const totalAmountToPay = consultationsResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.amount_to_pay),
        0
      );

      console.log("✅ Professional revenue report generated:", {
        consultations: consultationsResult.rows.length,
        totalRevenue,
        totalAmountToPay,
      });

      res.json({
        summary: {
          professional_percentage: professionalPercentage,
          total_revenue: totalRevenue,
          consultation_count: consultationsResult.rows.length,
          amount_to_pay: totalAmountToPay,
        },
        consultations: consultationsResult.rows.map((row) => ({
          date: row.date,
          client_name: row.client_name,
          service_name: row.service_name,
          total_value: parseFloat(row.value),
          amount_to_pay: parseFloat(row.amount_to_pay),
        })),
      });
    } catch (error) {
      console.error("❌ Error generating professional revenue report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório" });
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

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "Data inicial e final são obrigatórias",
        });
      }

      // Get professional's percentage
      const professionalResult = await pool.query(
        "SELECT percentage FROM users WHERE id = $1",
        [req.user.id]
      );

      const professionalPercentage =
        professionalResult.rows[0]?.percentage || 50;

      // Get detailed consultation data
      const result = await pool.query(
        `SELECT 
        COUNT(*) as total_consultations,
        COUNT(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 1 END) as convenio_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NOT NULL THEN 1 END) as private_consultations,
        SUM(c.value) as total_revenue,
        SUM(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value ELSE 0 END) as convenio_revenue,
        SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN c.value ELSE 0 END) as private_revenue,
        SUM(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value * ((100 - $3) / 100.0) ELSE 0 END) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4`,
        [req.user.id, start_date, professionalPercentage, end_date]
      );

      const summary = result.rows[0];

      res.json({
        summary: {
          total_consultations: parseInt(summary.total_consultations) || 0,
          convenio_consultations: parseInt(summary.convenio_consultations) || 0,
          private_consultations: parseInt(summary.private_consultations) || 0,
          total_revenue: parseFloat(summary.total_revenue) || 0,
          convenio_revenue: parseFloat(summary.convenio_revenue) || 0,
          private_revenue: parseFloat(summary.private_revenue) || 0,
          professional_percentage: professionalPercentage,
          amount_to_pay: parseFloat(summary.amount_to_pay) || 0,
        },
      });
    } catch (error) {
      console.error("Error generating detailed professional report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório detalhado" });
    }
  }
);

// 🔥 FIXED: Clients by city report with proper integer conversion
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
          COUNT(*)::integer as client_count,
          COUNT(CASE WHEN subscription_status = 'active' THEN 1 END)::integer as active_clients,
          COUNT(CASE WHEN subscription_status = 'pending' THEN 1 END)::integer as pending_clients,
          COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END)::integer as expired_clients
        FROM users 
        WHERE roles::jsonb ? 'client' 
          AND city IS NOT NULL 
          AND city != ''
        GROUP BY city, state
        ORDER BY client_count DESC, city
      `);

      // 🔥 ADDITIONAL PROCESSING: Ensure all numeric values are integers
      const processedResults = result.rows.map(row => ({
        city: row.city,
        state: row.state,
        client_count: parseInt(row.client_count) || 0,
        active_clients: parseInt(row.active_clients) || 0,
        pending_clients: parseInt(row.pending_clients) || 0,
        expired_clients: parseInt(row.expired_clients) || 0
      }));

      console.log("✅ Clients by city report generated:", processedResults.length, "cities");
      res.json(processedResults);
    } catch (error) {
      console.error("Error generating clients by city report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório por cidade" });
    }
  }
);

// 🔥 FIXED: Professionals by city report with proper integer conversion
app.get(
  "/api/reports/professionals-by-city",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          u.city,
          u.state,
          COUNT(u.id)::integer as total_professionals,
          COALESCE(
            json_agg(
              json_build_object(
                'category_name', COALESCE(sc.name, 'Sem categoria'),
                'count', category_counts.count
              )
            ) FILTER (WHERE category_counts.count > 0),
            '[]'::json
          ) as categories
        FROM users u
        LEFT JOIN service_categories sc ON u.category_id = sc.id
        LEFT JOIN (
          SELECT 
            city, 
            state, 
            category_id,
            COUNT(*)::integer as count
          FROM users 
          WHERE roles::jsonb ? 'professional' 
            AND city IS NOT NULL 
            AND city != ''
          GROUP BY city, state, category_id
        ) category_counts ON u.city = category_counts.city 
                          AND u.state = category_counts.state 
                          AND u.category_id = category_counts.category_id
        WHERE u.roles::jsonb ? 'professional' 
          AND u.city IS NOT NULL 
          AND u.city != ''
        GROUP BY u.city, u.state
        ORDER BY total_professionals DESC, u.city
      `);

      // 🔥 ADDITIONAL PROCESSING: Ensure all numeric values are integers
      const processedResults = result.rows.map(row => ({
        city: row.city,
        state: row.state,
        total_professionals: parseInt(row.total_professionals) || 0,
        categories: (row.categories || []).map((cat: any) => ({
          category_name: cat.category_name,
          count: parseInt(cat.count) || 0
        }))
      }));

      console.log("✅ Professionals by city report generated:", processedResults.length, "cities");
      res.json(processedResults);
    } catch (error) {
      console.error("Error generating professionals by city report:", error);
      res.status(500).json({ message: "Erro ao gerar relatório por cidade" });
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
          u.id, u.name, u.email, u.phone,
          sc.name as category_name,
          psa.has_scheduling_access,
          psa.access_expires_at,
          psa.access_granted_by,
          psa.access_granted_at
        FROM users u
        LEFT JOIN service_categories sc ON u.category_id = sc.id
        LEFT JOIN professional_scheduling_access psa ON u.id = psa.professional_id
        WHERE u.roles::jsonb ? 'professional'
        ORDER BY u.name
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching professionals scheduling access:", error);
      res
        .status(500)
        .json({ message: "Erro ao carregar dados de acesso à agenda" });
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

      // Insert or update scheduling access
      await pool.query(
        `INSERT INTO professional_scheduling_access 
        (professional_id, has_scheduling_access, access_expires_at, access_granted_by, access_granted_at, reason)
        VALUES ($1, true, $2, $3, NOW(), $4)
        ON CONFLICT (professional_id) 
        DO UPDATE SET 
          has_scheduling_access = true,
          access_expires_at = $2,
          access_granted_by = $3,
          access_granted_at = NOW(),
          reason = $4`,
        [professional_id, expires_at, req.user.name, reason]
      );

      res.json({ message: "Acesso à agenda concedido com sucesso" });
    } catch (error) {
      console.error("Error granting scheduling access:", error);
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
        return res.status(400).json({
          message: "ID do profissional é obrigatório",
        });
      }

      await pool.query(
        `UPDATE professional_scheduling_access 
        SET has_scheduling_access = false,
            access_expires_at = NULL,
            access_granted_by = NULL,
            access_granted_at = NULL,
            reason = NULL
        WHERE professional_id = $1`,
        [professional_id]
      );

      res.json({ message: "Acesso à agenda revogado com sucesso" });
    } catch (error) {
      console.error("Error revoking scheduling access:", error);
      res.status(500).json({ message: "Erro ao revogar acesso à agenda" });
    }
  }
);

// Catch-all handler for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "dist", "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Erro interno do servidor" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});