import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { authenticate, authorize } from './middleware/auth.js';
import createUpload from './middleware/upload.js';
import { generateDocumentPDF } from './utils/documentGenerator.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for production
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://cartaoquiroferreira.com.br',
    'https://www.cartaoquiroferreira.com.br'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// 🔥 ENSURE DATABASE STRUCTURE ON STARTUP
const ensureDatabaseStructure = async () => {
  try {
    console.log('🔄 Ensuring database structure...');

    // Create all tables
    await pool.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        password_hash VARCHAR(255) NOT NULL,
        roles TEXT[] DEFAULT ARRAY['client'],
        percentage INTEGER DEFAULT 50,
        category_id INTEGER,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry DATE,
        photo_url TEXT,
        has_scheduling_access BOOLEAN DEFAULT FALSE,
        access_expires_at TIMESTAMP,
        access_granted_by VARCHAR(255),
        access_granted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Service categories table
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Services table
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES service_categories(id),
        is_base_service BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Dependents table
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        birth_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Private patients table
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Consultations table
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        professional_id INTEGER NOT NULL REFERENCES users(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        location_id INTEGER,
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Appointments table
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dependent_id INTEGER REFERENCES dependents(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
        consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        date DATE NOT NULL,
        time TIME NOT NULL,
        duration INTEGER DEFAULT 60,
        status VARCHAR(20) DEFAULT 'scheduled',
        location_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Medical records table
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dependent_id INTEGER REFERENCES dependents(id) ON DELETE CASCADE,
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
      );

      -- Medical documents table
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dependent_id INTEGER REFERENCES dependents(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        patient_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Attendance locations table
      CREATE TABLE IF NOT EXISTS attendance_locations (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(10),
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Payments table
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        mercadopago_id VARCHAR(255),
        mercadopago_status VARCHAR(50),
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Remove duplicates and create unique constraints
    console.log('🔄 Removing duplicates and creating constraints...');

    // Remove duplicate users by CPF (keep the first one)
    await pool.query(`
      DELETE FROM users 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM users 
        GROUP BY cpf
      );
    `);

    // Remove duplicate dependents by CPF (keep the first one)
    await pool.query(`
      DELETE FROM dependents 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM dependents 
        GROUP BY cpf
      );
    `);

    // Remove duplicate private patients by CPF and professional (keep the first one)
    await pool.query(`
      DELETE FROM private_patients 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM private_patients 
        GROUP BY cpf, professional_id
      );
    `);

    // Remove duplicate service categories by name (keep the first one)
    await pool.query(`
      DELETE FROM service_categories 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM service_categories 
        GROUP BY name
      );
    `);

    // Create unique constraints
    await pool.query(`
      -- Users CPF unique constraint
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'users_cpf_unique'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_cpf_unique UNIQUE (cpf);
        END IF;
      END $$;

      -- Dependents CPF unique constraint
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'dependents_cpf_unique'
        ) THEN
          ALTER TABLE dependents ADD CONSTRAINT dependents_cpf_unique UNIQUE (cpf);
        END IF;
      END $$;

      -- Private patients CPF + professional unique constraint
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'private_patients_cpf_professional_unique'
        ) THEN
          ALTER TABLE private_patients ADD CONSTRAINT private_patients_cpf_professional_unique UNIQUE (cpf, professional_id);
        END IF;
      END $$;

      -- Service categories name unique constraint
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'service_categories_name_unique'
        ) THEN
          ALTER TABLE service_categories ADD CONSTRAINT service_categories_name_unique UNIQUE (name);
        END IF;
      END $$;
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
      CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);
      CREATE INDEX IF NOT EXISTS idx_dependents_client_id ON dependents(client_id);
      CREATE INDEX IF NOT EXISTS idx_dependents_cpf ON dependents(cpf);
      CREATE INDEX IF NOT EXISTS idx_private_patients_professional_id ON private_patients(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_professional_id ON consultations(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
      CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON appointments(professional_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
      CREATE INDEX IF NOT EXISTS idx_medical_records_professional_id ON medical_records(professional_id);
    `);

    console.log('✅ Database structure ensured successfully');
  } catch (error) {
    console.error('❌ Error ensuring database structure:', error);
    throw error;
  }
};

// Initialize database structure before starting server
await ensureDatabaseStructure();

// ==================== AUTH ROUTES ====================

// Register route (only for clients)
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, password
    } = req.body;

    // Validate required fields
    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user with client role only
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password_hash, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (cpf) DO NOTHING
      RETURNING id, name, cpf, email, roles, subscription_status
    `, [
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, passwordHash, ['client']
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    const user = result.rows[0];
    res.status(201).json({ 
      message: 'Usuário criado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        email: user.email,
        roles: user.roles,
        subscription_status: user.subscription_status
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Login route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, password_hash, roles FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Select role route
app.post('/api/auth/select-role', async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: 'ID do usuário e role são obrigatórios' });
    }

    // Get user and verify role
    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    if (!user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Generate JWT token with selected role
    const token = jwt.sign(
      { id: user.id, currentRole: role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      message: 'Role selecionada com sucesso',
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('Role selection error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Switch role route
app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ message: 'Role é obrigatória' });
    }

    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Generate new JWT token with new role
    const token = jwt.sign(
      { id: req.user.id, currentRole: role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Role alterada com sucesso',
      token,
      user: {
        id: req.user.id,
        name: req.user.name,
        cpf: req.user.cpf,
        roles: req.user.roles,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('Role switch error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Logout route
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// ==================== USER ROUTES ====================

// Get all users (admin only)
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.roles, u.percentage,
        u.category_id, u.subscription_status, u.subscription_expiry,
        u.created_at, sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get user by ID
app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own data unless they're admin
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.roles, u.percentage,
        u.category_id, u.subscription_status, u.subscription_expiry,
        u.photo_url, u.created_at, sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create user (admin only)
app.post('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, password, roles,
      percentage, category_id
    } = req.body;

    if (!name || !cpf || !password || !roles || roles.length === 0) {
      return res.status(400).json({ message: 'Campos obrigatórios: nome, CPF, senha e pelo menos uma role' });
    }

    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password_hash,
        roles, percentage, category_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (cpf) DO NOTHING
      RETURNING id, name, cpf, email, roles
    `, [
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, passwordHash,
      roles, percentage, category_id
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update user
app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, roles,
      percentage, category_id, currentPassword, newPassword
    } = req.body;

    // Users can only update their own data unless they're admin
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    let updateQuery = `
      UPDATE users SET 
        name = $1, email = $2, phone = $3, birth_date = $4,
        address = $5, address_number = $6, address_complement = $7,
        neighborhood = $8, city = $9, state = $10, updated_at = CURRENT_TIMESTAMP
    `;
    let queryParams = [name, email, phone, birth_date, address, address_number, address_complement, neighborhood, city, state];
    let paramCount = 10;

    // Only admin can update roles, percentage, and category
    if (req.user.currentRole === 'admin' && roles) {
      updateQuery += `, roles = $${++paramCount}, percentage = $${++paramCount}, category_id = $${++paramCount}`;
      queryParams.push(roles, percentage, category_id);
    }

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha' });
      }

      // Verify current password
      const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      updateQuery += `, password_hash = $${++paramCount}`;
      queryParams.push(newPasswordHash);
    }

    updateQuery += ` WHERE id = $${++paramCount} RETURNING id, name, email, roles`;
    queryParams.push(id);

    const result = await pool.query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: 'Usuário atualizado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Activate client (admin only)
app.put('/api/users/:id/activate', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { expiry_date } = req.body;

    if (!expiry_date) {
      return res.status(400).json({ message: 'Data de expiração é obrigatória' });
    }

    const result = await pool.query(`
      UPDATE users 
      SET subscription_status = 'active', subscription_expiry = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND 'client' = ANY(roles)
      RETURNING id, name, subscription_status, subscription_expiry
    `, [expiry_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json({
      message: 'Cliente ativado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error activating client:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICE CATEGORIES ROUTES ====================

// Get all service categories
app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM service_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service categories:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create service category (admin only)
app.post('/api/service-categories', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const result = await pool.query(`
      INSERT INTO service_categories (name, description)
      VALUES ($1, $2)
      ON CONFLICT (name) DO NOTHING
      RETURNING *
    `, [name, description]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Categoria já existe' });
    }

    res.status(201).json({
      message: 'Categoria criada com sucesso',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICES ROUTES ====================

// Get all services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, sc.name as category_name
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY sc.name, s.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create service (admin only)
app.post('/api/services', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !base_price) {
      return res.status(400).json({ message: 'Nome e preço base são obrigatórios' });
    }

    const result = await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, base_price, category_id, is_base_service]);

    res.status(201).json({
      message: 'Serviço criado com sucesso',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update service (admin only)
app.put('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, category_id, is_base_service } = req.body;

    const result = await pool.query(`
      UPDATE services 
      SET name = $1, description = $2, base_price = $3, category_id = $4, is_base_service = $5
      WHERE id = $6
      RETURNING *
    `, [name, description, base_price, category_id, is_base_service, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json({
      message: 'Serviço atualizado com sucesso',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete service (admin only)
app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== DEPENDENTS ROUTES ====================

// Get dependents by client ID
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Clients can only access their own dependents
    if (req.user.currentRole === 'client' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(
      'SELECT * FROM dependents WHERE client_id = $1 ORDER BY name',
      [clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Lookup dependent by CPF
app.get('/api/dependents/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const result = await pool.query(`
      SELECT 
        d.*, 
        u.name as client_name,
        u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1
    `, [cpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error looking up dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create dependent
app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    // Clients can only create dependents for themselves
    if (req.user.currentRole === 'client' && req.user.id !== client_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'ID do cliente, nome e CPF são obrigatórios' });
    }

    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cpf) DO NOTHING
      RETURNING *
    `, [client_id, name, cpf, birth_date]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    res.status(201).json({
      message: 'Dependente criado com sucesso',
      dependent: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update dependent
app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    // Verify ownership for clients
    if (req.user.currentRole === 'client') {
      const ownershipCheck = await pool.query(
        'SELECT client_id FROM dependents WHERE id = $1',
        [id]
      );

      if (ownershipCheck.rows.length === 0 || ownershipCheck.rows[0].client_id !== req.user.id) {
        return res.status(403).json({ message: 'Acesso não autorizado' });
      }
    }

    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2
      WHERE id = $3
      RETURNING *
    `, [name, birth_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json({
      message: 'Dependente atualizado com sucesso',
      dependent: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete dependent
app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership for clients
    if (req.user.currentRole === 'client') {
      const ownershipCheck = await pool.query(
        'SELECT client_id FROM dependents WHERE id = $1',
        [id]
      );

      if (ownershipCheck.rows.length === 0 || ownershipCheck.rows[0].client_id !== req.user.id) {
        return res.status(403).json({ message: 'Acesso não autorizado' });
      }
    }

    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PRIVATE PATIENTS ROUTES ====================

// Get private patients for professional
app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM private_patients WHERE professional_id = $1 ORDER BY name',
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create private patient
app.post('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    if (!name || !cpf) {
      return res.status(400).json({ message: 'Nome e CPF são obrigatórios' });
    }

    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (cpf, professional_id) DO NOTHING
      RETURNING *
    `, [
      req.user.id, name, cpf, email, phone, birth_date,
      address, address_number, address_complement, neighborhood,
      city, state, zip_code
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Paciente já cadastrado para este profissional' });
    }

    res.status(201).json({
      message: 'Paciente criado com sucesso',
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update private patient
app.put('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    const result = await pool.query(`
      UPDATE private_patients 
      SET name = $1, email = $2, phone = $3, birth_date = $4,
          address = $5, address_number = $6, address_complement = $7,
          neighborhood = $8, city = $9, state = $10, zip_code = $11
      WHERE id = $12 AND professional_id = $13
      RETURNING *
    `, [
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code, id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    res.json({
      message: 'Paciente atualizado com sucesso',
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete private patient
app.delete('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    res.json({ message: 'Paciente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== CONSULTATIONS ROUTES ====================

// Get consultations
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.*,
        c.created_at as date,
        s.name as service_name,
        prof.name as professional_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN true
          ELSE false
        END as is_private
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users prof ON c.professional_id = prof.id
    `;

    let queryParams = [];

    if (req.user.currentRole === 'client') {
      query += ` WHERE (c.client_id = $1 OR c.dependent_id IN (
        SELECT id FROM dependents WHERE client_id = $1
      ))`;
      queryParams.push(req.user.id);
    } else if (req.user.currentRole === 'professional') {
      query += ` WHERE c.professional_id = $1`;
      queryParams.push(req.user.id);
    }

    query += ` ORDER BY c.date DESC`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create consultation
app.post('/api/consultations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, service_id,
      location_id, value, date, notes, appointment_date,
      appointment_time, create_appointment
    } = req.body;

    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    // Create consultation
    const consultationResult = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      client_id, dependent_id, private_patient_id, req.user.id,
      service_id, location_id, value, date, notes
    ]);

    const consultation = consultationResult.rows[0];
    let appointment = null;

    // Create appointment if requested
    if (create_appointment && appointment_date && appointment_time) {
      const patientName = await getPatientName(client_id, dependent_id, private_patient_id);
      const serviceResult = await pool.query('SELECT name FROM services WHERE id = $1', [service_id]);
      const serviceName = serviceResult.rows[0]?.name || 'Consulta';

      const appointmentResult = await pool.query(`
        INSERT INTO appointments (
          professional_id, client_id, dependent_id, private_patient_id,
          consultation_id, title, date, time, location_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        req.user.id, client_id, dependent_id, private_patient_id,
        consultation.id, `${serviceName} - ${patientName}`,
        appointment_date, appointment_time, location_id
      ]);

      appointment = appointmentResult.rows[0];
    }

    res.status(201).json({
      message: 'Consulta registrada com sucesso',
      consultation,
      appointment
    });
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Helper function to get patient name
async function getPatientName(clientId, dependentId, privatePatientId) {
  if (dependentId) {
    const result = await pool.query('SELECT name FROM dependents WHERE id = $1', [dependentId]);
    return result.rows[0]?.name || 'Dependente';
  } else if (privatePatientId) {
    const result = await pool.query('SELECT name FROM private_patients WHERE id = $1', [privatePatientId]);
    return result.rows[0]?.name || 'Paciente Particular';
  } else if (clientId) {
    const result = await pool.query('SELECT name FROM users WHERE id = $1', [clientId]);
    return result.rows[0]?.name || 'Cliente';
  }
  return 'Paciente';
}

// ==================== APPOINTMENTS ROUTES ====================

// Get appointments for professional
app.get('/api/appointments', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { date } = req.query;

    let query = `
      SELECT 
        a.*,
        COALESCE(u.name, d.name, pp.name) as patient_name,
        al.name as location_name
      FROM appointments a
      LEFT JOIN users u ON a.client_id = u.id
      LEFT JOIN dependents d ON a.dependent_id = d.id
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      WHERE a.professional_id = $1
    `;

    let queryParams = [req.user.id];

    if (date) {
      query += ` AND a.date = $2`;
      queryParams.push(date);
    }

    query += ` ORDER BY a.date, a.time`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create appointment
app.post('/api/appointments', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, title,
      description, date, time, duration, location_id
    } = req.body;

    if (!title || !date || !time) {
      return res.status(400).json({ message: 'Título, data e hora são obrigatórios' });
    }

    const result = await pool.query(`
      INSERT INTO appointments (
        professional_id, client_id, dependent_id, private_patient_id,
        title, description, date, time, duration, location_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      req.user.id, client_id, dependent_id, private_patient_id,
      title, description, date, time, duration, location_id
    ]);

    res.status(201).json({
      message: 'Agendamento criado com sucesso',
      appointment: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update appointment
app.put('/api/appointments/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, time, duration, status, location_id } = req.body;

    const result = await pool.query(`
      UPDATE appointments 
      SET title = $1, description = $2, date = $3, time = $4,
          duration = $5, status = $6, location_id = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND professional_id = $9
      RETURNING *
    `, [title, description, date, time, duration, status, location_id, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    res.json({
      message: 'Agendamento atualizado com sucesso',
      appointment: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM appointments WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    res.json({ message: 'Agendamento excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== MEDICAL RECORDS ROUTES ====================

// Get medical records for professional
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.*,
        COALESCE(u.name, d.name, pp.name) as patient_name
      FROM medical_records mr
      LEFT JOIN users u ON mr.client_id = u.id
      LEFT JOIN dependents d ON mr.dependent_id = d.id
      LEFT JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create medical record
app.post('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      private_patient_id, client_id, dependent_id, chief_complaint,
      history_present_illness, past_medical_history, medications,
      allergies, physical_examination, diagnosis, treatment_plan,
      notes, vital_signs
    } = req.body;

    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, client_id, dependent_id,
        chief_complaint, history_present_illness, past_medical_history,
        medications, allergies, physical_examination, diagnosis,
        treatment_plan, notes, vital_signs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      req.user.id, private_patient_id, client_id, dependent_id,
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, JSON.stringify(vital_signs)
    ]);

    res.status(201).json({
      message: 'Prontuário criado com sucesso',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update medical record
app.put('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, vital_signs
    } = req.body;

    const result = await pool.query(`
      UPDATE medical_records 
      SET chief_complaint = $1, history_present_illness = $2,
          past_medical_history = $3, medications = $4, allergies = $5,
          physical_examination = $6, diagnosis = $7, treatment_plan = $8,
          notes = $9, vital_signs = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `, [
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, JSON.stringify(vital_signs), id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    res.json({
      message: 'Prontuário atualizado com sucesso',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete medical record
app.delete('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM medical_records WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    res.json({ message: 'Prontuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== MEDICAL DOCUMENTS ROUTES ====================

// Get medical documents for professional
app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM medical_documents 
      WHERE professional_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create medical document
app.post('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({ message: 'Título, tipo e dados do template são obrigatórios' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save to database
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type,
        document_url, patient_name
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      req.user.id, private_patient_id, title, document_type,
      documentResult.url, template_data.patientName
    ]);

    res.status(201).json({
      message: 'Documento criado com sucesso',
      document: result.rows[0],
      title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== ATTENDANCE LOCATIONS ROUTES ====================

// Get attendance locations for professional
app.get('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM attendance_locations WHERE professional_id = $1 ORDER BY is_default DESC, name',
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance locations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create attendance location
app.post('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1',
        [req.user.id]
      );
    }

    const result = await pool.query(`
      INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      req.user.id, name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
    ]);

    res.status(201).json({
      message: 'Local criado com sucesso',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update attendance location
app.put('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
    } = req.body;

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2',
        [req.user.id, id]
      );
    }

    const result = await pool.query(`
      UPDATE attendance_locations 
      SET name = $1, address = $2, address_number = $3, address_complement = $4,
          neighborhood = $5, city = $6, state = $7, zip_code = $8,
          phone = $9, is_default = $10
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `, [
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default, id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    res.json({
      message: 'Local atualizado com sucesso',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete attendance location
app.delete('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    res.json({ message: 'Local excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== CLIENT LOOKUP ROUTES ====================

// Lookup client by CPF
app.get('/api/clients/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const result = await pool.query(`
      SELECT id, name, cpf, subscription_status, subscription_expiry
      FROM users 
      WHERE cpf = $1 AND 'client' = ANY(roles)
    `, [cpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PROFESSIONALS ROUTES ====================

// Get all professionals (for clients)
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.photo_url,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get professionals with scheduling access (admin only)
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone,
        u.has_scheduling_access, u.access_expires_at,
        u.access_granted_by, u.access_granted_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Grant scheduling access (admin only)
app.post('/api/admin/grant-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id, expires_at, reason } = req.body;

    if (!professional_id || !expires_at) {
      return res.status(400).json({ message: 'ID do profissional e data de expiração são obrigatórios' });
    }

    const result = await pool.query(`
      UPDATE users 
      SET has_scheduling_access = true, access_expires_at = $1,
          access_granted_by = $2, access_granted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND 'professional' = ANY(roles)
      RETURNING id, name, has_scheduling_access, access_expires_at
    `, [expires_at, req.user.name, professional_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    res.json({
      message: 'Acesso à agenda concedido com sucesso',
      professional: result.rows[0]
    });
  } catch (error) {
    console.error('Error granting scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Revoke scheduling access (admin only)
app.post('/api/admin/revoke-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id } = req.body;

    if (!professional_id) {
      return res.status(400).json({ message: 'ID do profissional é obrigatório' });
    }

    const result = await pool.query(`
      UPDATE users 
      SET has_scheduling_access = false, access_expires_at = NULL,
          access_granted_by = NULL, access_granted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND 'professional' = ANY(roles)
      RETURNING id, name, has_scheduling_access
    `, [professional_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    res.json({
      message: 'Acesso à agenda revogado com sucesso',
      professional: result.rows[0]
    });
  } catch (error) {
    console.error('Error revoking scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== REPORTS ROUTES ====================

// Revenue report (admin only)
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get revenue by professional
    const professionalRevenueResult = await pool.query(`
      SELECT 
        prof.name as professional_name,
        prof.percentage as professional_percentage,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count,
        SUM(c.value * prof.percentage / 100) as professional_payment,
        SUM(c.value * (100 - prof.percentage) / 100) as clinic_revenue
      FROM consultations c
      JOIN users prof ON c.professional_id = prof.id
      WHERE c.created_at >= $1 AND c.created_at <= $2
        AND c.private_patient_id IS NULL
      GROUP BY prof.id, prof.name, prof.percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get revenue by service
    const serviceRevenueResult = await pool.query(`
      SELECT 
        s.name as service_name,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.created_at >= $1 AND c.created_at <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Calculate total revenue
    const totalRevenueResult = await pool.query(`
      SELECT SUM(value) as total_revenue
      FROM consultations
      WHERE created_at >= $1 AND created_at <= $2
        AND private_patient_id IS NULL
    `, [start_date, end_date]);

    res.json({
      total_revenue: parseFloat(totalRevenueResult.rows[0].total_revenue || 0),
      revenue_by_professional: professionalRevenueResult.rows.map(row => ({
        professional_name: row.professional_name,
        professional_percentage: parseInt(row.professional_percentage),
        revenue: parseFloat(row.revenue),
        consultation_count: parseInt(row.consultation_count),
        professional_payment: parseFloat(row.professional_payment),
        clinic_revenue: parseFloat(row.clinic_revenue)
      })),
      revenue_by_service: serviceRevenueResult.rows.map(row => ({
        service_name: row.service_name,
        revenue: parseFloat(row.revenue),
        consultation_count: parseInt(row.consultation_count)
      }))
    });
  } catch (error) {
    console.error('Error generating revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Professional revenue report
app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get professional data
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const professionalPercentage = professionalResult.rows[0].percentage || 50;

    // Get consultations for the period
    const consultationsResult = await pool.query(`
      SELECT 
        c.created_at as date, c.value as total_value,
        COALESCE(u.name, d.name, pp.name) as client_name,
        s.name as service_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN c.value
          ELSE c.value * (100 - $3) / 100
        END as amount_to_pay
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 
        AND c.created_at >= $2 AND c.created_at <= $4
      ORDER BY c.created_at DESC
    `, [req.user.id, start_date, professionalPercentage, end_date]);

    // Calculate summary
    const convenioConsultations = consultationsResult.rows.filter(c => !c.client_name || c.client_name !== 'Paciente Particular');
    const privateConsultations = consultationsResult.rows.filter(c => c.client_name === 'Paciente Particular');

    const totalRevenue = consultationsResult.rows.reduce((sum, c) => sum + parseFloat(c.total_value), 0);
    const convenioRevenue = convenioConsultations.reduce((sum, c) => sum + parseFloat(c.total_value), 0);
    const privateRevenue = privateConsultations.reduce((sum, c) => sum + parseFloat(c.total_value), 0);
    const amountToPay = convenioConsultations.reduce((sum, c) => sum + parseFloat(c.amount_to_pay), 0);

    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: totalRevenue,
        consultation_count: consultationsResult.rows.length,
        amount_to_pay: amountToPay
      },
      consultations: consultationsResult.rows.map(row => ({
        date: row.date,
        client_name: row.client_name,
        service_name: row.service_name,
        total_value: parseFloat(row.total_value),
        amount_to_pay: parseFloat(row.amount_to_pay)
      }))
    });
  } catch (error) {
    console.error('Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Professional detailed report
app.get('/api/reports/professional-detailed', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get professional data
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;

    // Get all consultations for the period
    const consultationsResult = await pool.query(`
      SELECT 
        c.*,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'convenio'
        END as consultation_type
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.created_at >= $2 
        AND c.created_at <= $3
      ORDER BY c.created_at DESC
    `, [req.user.id, start_date, end_date]);

    const consultations = consultationsResult.rows;
    const convenioConsultations = consultations.filter(c => c.consultation_type === 'convenio');
    const privateConsultations = consultations.filter(c => c.consultation_type === 'private');

    const totalRevenue = consultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const convenioRevenue = convenioConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const privateRevenue = privateConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const amountToPay = convenioRevenue * (100 - professionalPercentage) / 100;

    res.json({
      summary: {
        total_consultations: consultations.length,
        convenio_consultations: convenioConsultations.length,
        private_consultations: privateConsultations.length,
        total_revenue: totalRevenue,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      }
    });
  } catch (error) {
    console.error('Error generating professional detailed report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Clients by city report (admin only)
app.get('/api/reports/clients-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        city, state,
        COUNT(*) as client_count,
        COUNT(CASE WHEN subscription_status = 'active\' THEN 1 END) as active_clients,
        COUNT(CASE WHEN subscription_status = 'pending\' THEN 1 END) as pending_clients,
        COUNT(CASE WHEN subscription_status = 'expired\' THEN 1 END) as expired_clients
      FROM users 
      WHERE 'client' = ANY(roles) 
        AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows.map(row => ({
      city: row.city,
      state: row.state,
      client_count: parseInt(row.client_count),
      active_clients: parseInt(row.active_clients),
      pending_clients: parseInt(row.pending_clients),
      expired_clients: parseInt(row.expired_clients)
    })));
  } catch (error) {
    console.error('Error generating clients by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Professionals by city report (admin only)
app.get('/api/reports/professionals-by-city', authenticate, authorize(['admin']), async (req, res) => {
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
      WHERE 'professional' = ANY(u.roles) 
        AND u.city IS NOT NULL AND u.city != ''
      GROUP BY u.city, u.state
      ORDER BY total_professionals DESC, u.city
    `);

    // Process the aggregated data
    const processedData = result.rows.map(row => {
      const categoryMap = new Map();
      
      row.categories.forEach(cat => {
        const categoryName = cat.category_name;
        if (categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, categoryMap.get(categoryName) + 1);
        } else {
          categoryMap.set(categoryName, 1);
        }
      });

      return {
        city: row.city,
        state: row.state,
        total_professionals: parseInt(row.total_professionals),
        categories: Array.from(categoryMap.entries()).map(([category_name, count]) => ({
          category_name,
          count
        }))
      };
    });

    res.json(processedData);
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== IMAGE UPLOAD ROUTE ====================

app.post('/api/upload-image', authenticate, async (req, res) => {
  try {
    const upload = createUpload();
    
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ message: err.message || 'Erro no upload da imagem' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
      }

      try {
        // Update user's photo URL in database
        await pool.query(
          'UPDATE users SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [req.file.path, req.user.id]
        );

        res.json({
          message: 'Imagem enviada com sucesso',
          imageUrl: req.file.path
        });
      } catch (dbError) {
        console.error('Database error after upload:', dbError);
        res.status(500).json({ message: 'Erro ao salvar URL da imagem no banco de dados' });
      }
    });
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PAYMENT ROUTES ====================

// Create subscription payment
app.post('/api/create-subscription', authenticate, authorize(['client']), async (req, res) => {
  try {
    const { user_id, dependent_ids } = req.body;

    // Verify user
    if (req.user.id !== user_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Get dependents count
    const dependentsResult = await pool.query(
      'SELECT COUNT(*) as count FROM dependents WHERE client_id = $1',
      [user_id]
    );

    const dependentCount = parseInt(dependentsResult.rows[0].count);
    const totalAmount = 250 + (dependentCount * 50); // R$250 + R$50 per dependent

    // Create payment record
    const paymentResult = await pool.query(`
      INSERT INTO payments (user_id, amount, payment_type, status)
      VALUES ($1, $2, 'subscription', 'pending')
      RETURNING *
    `, [user_id, totalAmount]);

    // Mock MercadoPago response for development
    const mockPaymentData = {
      id: paymentResult.rows[0].id,
      init_point: \`https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_${paymentResult.rows[0].id}`,
      sandbox_init_point: \`https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_${paymentResult.rows[0].id}`
    };

    res.json(mockPaymentData);
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }

    // Create payment record
    const paymentResult = await pool.query(`
      INSERT INTO payments (user_id, amount, payment_type, status)
      VALUES ($1, $2, 'professional_payment', 'pending')
      RETURNING *
    `, [req.user.id, amount]);

    // Mock MercadoPago response
    const mockPaymentData = {
      id: paymentResult.rows[0].id,
      init_point: \`https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=prof_${paymentResult.rows[0].id}`,
      sandbox_init_point: \`https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=prof_${paymentResult.rows[0].id}`
    };

    res.json(mockPaymentData);
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== PRODUCTION ROUTES ====================

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 Server running on port ${PORT}`);
  console.log(\`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(\`📊 Database connected successfully`);
});