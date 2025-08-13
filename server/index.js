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

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://cartaoquiroferreira.com.br',
      'https://www.cartaoquiroferreira.com.br',
      'https://convenioquiroferreira.onrender.com'
    ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 🔥 ENSURE DATABASE STRUCTURE ON STARTUP
const ensureDatabaseStructure = async () => {
  console.log('🔄 Ensuring database structure...');
  
  try {
    // Create tables if they don't exist
    await pool.query(`
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
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES service_categories(id),
        is_base_service BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        birth_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
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
    `);

    await pool.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id),
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        service_id INTEGER REFERENCES services(id),
        location_id INTEGER,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
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
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        private_patient_id INTEGER NOT NULL REFERENCES private_patients(id) ON DELETE CASCADE,
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
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tables created/verified');

    // 🔥 REMOVE DUPLICATES BEFORE CREATING CONSTRAINTS
    console.log('🔄 Removing duplicates...');

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

    // Remove duplicate private patients by CPF and professional_id (keep the first one)
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

    console.log('✅ Duplicates removed');

    // 🔥 CREATE UNIQUE CONSTRAINTS
    console.log('🔄 Creating unique constraints...');

    // Users CPF unique constraint
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'users_cpf_unique'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_cpf_unique UNIQUE (cpf);
        END IF;
      END $$;
    `);

    // Dependents CPF unique constraint
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'dependents_cpf_unique'
        ) THEN
          ALTER TABLE dependents ADD CONSTRAINT dependents_cpf_unique UNIQUE (cpf);
        END IF;
      END $$;
    `);

    // Private patients CPF + professional_id unique constraint
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'private_patients_cpf_professional_unique'
        ) THEN
          ALTER TABLE private_patients ADD CONSTRAINT private_patients_cpf_professional_unique UNIQUE (cpf, professional_id);
        END IF;
      END $$;
    `);

    // Service categories name unique constraint
    await pool.query(`
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

    console.log('✅ Unique constraints created');

    // 🔥 CREATE INDEXES FOR PERFORMANCE
    console.log('🔄 Creating indexes...');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
      CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);
      CREATE INDEX IF NOT EXISTS idx_dependents_cpf ON dependents(cpf);
      CREATE INDEX IF NOT EXISTS idx_dependents_client_id ON dependents(client_id);
      CREATE INDEX IF NOT EXISTS idx_private_patients_cpf ON private_patients(cpf);
      CREATE INDEX IF NOT EXISTS idx_private_patients_professional_id ON private_patients(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_professional_id ON consultations(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
      CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON appointments(professional_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
    `);

    console.log('✅ Indexes created');
    console.log('🎉 Database structure ensured successfully!');

  } catch (error) {
    console.error('❌ Error ensuring database structure:', error);
    throw error;
  }
};

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 🔥 AUTH ROUTES
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(
      'SELECT id, name, cpf, password_hash, roles FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
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
        roles: user.roles || ['client']
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/select-role', async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: 'ID do usuário e role são obrigatórios' });
    }

    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    if (!user.roles || !user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    const token = jwt.sign(
      { id: user.id, currentRole: role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
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

app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ message: 'Role é obrigatória' });
    }

    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    if (!user.roles || !user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    const token = jwt.sign(
      { id: user.id, currentRole: role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

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
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: user.roles,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('Role switch error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/register', async (req, res) => {
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
      password
    } = req.body;

    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (cleanCpf.length !== 11) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password_hash, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (cpf) DO NOTHING
      RETURNING id, name, cpf, roles
    `, [
      name, cleanCpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, hashedPassword, ['client']
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
        roles: user.roles
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// 🔥 USER ROUTES
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement, u.neighborhood,
        u.city, u.state, u.roles, u.percentage, u.category_id,
        u.subscription_status, u.subscription_expiry, u.created_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Erro ao buscar usuários' });
  }
});

app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement, u.neighborhood,
        u.city, u.state, u.roles, u.percentage, u.category_id,
        u.subscription_status, u.subscription_expiry, u.photo_url,
        sc.name as category_name
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
    res.status(500).json({ message: 'Erro ao buscar usuário' });
  }
});

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

    const cleanCpf = cpf.replace(/\D/g, '');
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password_hash, roles,
        percentage, category_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (cpf) DO NOTHING
      RETURNING id, name, cpf, roles
    `, [
      name, cleanCpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, hashedPassword, roles,
      percentage, category_id
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
    res.status(500).json({ message: 'Erro ao criar usuário' });
  }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, roles,
      percentage, category_id, currentPassword, newPassword
    } = req.body;

    // Check if user can edit this profile
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Não autorizado a editar este perfil' });
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

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateQuery += `, password_hash = $${++paramCount}`;
      queryParams.push(hashedNewPassword);
    }

    updateQuery += ` WHERE id = $${++paramCount} RETURNING id, name, cpf, roles`;
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
    res.status(500).json({ message: 'Erro ao atualizar usuário' });
  }
});

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
    console.error('Error activating user:', error);
    res.status(500).json({ message: 'Erro ao ativar cliente' });
  }
});

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
    res.status(500).json({ message: 'Erro ao excluir usuário' });
  }
});

// 🔥 SERVICE CATEGORIES ROUTES
app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM service_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Erro ao buscar categorias' });
  }
});

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

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Erro ao criar categoria' });
  }
});

// 🔥 SERVICES ROUTES
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
    res.status(500).json({ message: 'Erro ao buscar serviços' });
  }
});

app.post('/api/services', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !description || !base_price) {
      return res.status(400).json({ message: 'Nome, descrição e preço são obrigatórios' });
    }

    const result = await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, base_price, category_id, is_base_service || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Erro ao criar serviço' });
  }
});

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

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Erro ao atualizar serviço' });
  }
});

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
    res.status(500).json({ message: 'Erro ao excluir serviço' });
  }
});

// 🔥 DEPENDENTS ROUTES
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Check if user can access this client's dependents
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Não autorizado' });
    }

    const result = await pool.query(
      'SELECT * FROM dependents WHERE client_id = $1 ORDER BY name',
      [clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro ao buscar dependentes' });
  }
});

app.get('/api/dependents/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.birth_date, d.client_id,
        u.name as client_name, u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1
    `, [cleanCpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error looking up dependent:', error);
    res.status(500).json({ message: 'Erro ao buscar dependente' });
  }
});

app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'ID do cliente, nome e CPF são obrigatórios' });
    }

    // Check if user can add dependents for this client
    if (req.user.currentRole !== 'admin' && req.user.id !== client_id) {
      return res.status(403).json({ message: 'Não autorizado' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cpf) DO NOTHING
      RETURNING *
    `, [client_id, name, cleanCpf, birth_date]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating dependent:', error);
    res.status(500).json({ message: 'Erro ao criar dependente' });
  }
});

app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2
      WHERE id = $3
      RETURNING *
    `, [name, birth_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({ message: 'Erro ao atualizar dependente' });
  }
});

app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro ao excluir dependente' });
  }
});

// 🔥 CLIENTS LOOKUP ROUTE
app.get('/api/clients/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT id, name, cpf, subscription_status
      FROM users 
      WHERE cpf = $1 AND 'client' = ANY(roles)
    `, [cleanCpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({ message: 'Erro ao buscar cliente' });
  }
});

// 🔥 PROFESSIONALS ROUTES
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
    res.status(500).json({ message: 'Erro ao buscar profissionais' });
  }
});

// 🔥 PRIVATE PATIENTS ROUTES
app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY name
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro ao buscar pacientes' });
  }
});

app.post('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    if (!name || !cpf) {
      return res.status(400).json({ message: 'Nome e CPF são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (cpf, professional_id) DO NOTHING
      RETURNING *
    `, [
      req.user.id, name, cleanCpf, email, phone, birth_date,
      address, address_number, address_complement, neighborhood,
      city, state, zip_code
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Paciente já cadastrado para este profissional' });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating private patient:', error);
    res.status(500).json({ message: 'Erro ao criar paciente' });
  }
});

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

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating private patient:', error);
    res.status(500).json({ message: 'Erro ao atualizar paciente' });
  }
});

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
    res.status(500).json({ message: 'Erro ao excluir paciente' });
  }
});

// 🔥 CONSULTATIONS ROUTES
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.value, c.date, c.created_at,
        s.name as service_name,
        u.name as professional_name,
        COALESCE(u2.name, d.name, pp.name) as client_name,
        CASE 
          WHEN d.id IS NOT NULL THEN true 
          ELSE false 
        END as is_dependent
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users u2 ON c.client_id = u2.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
    `;

    let queryParams = [];

    if (req.user.currentRole === 'client') {
      query += ` WHERE (c.client_id = $1 OR d.client_id = $1)`;
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
    res.status(500).json({ message: 'Erro ao buscar consultas' });
  }
});

app.post('/api/consultations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, service_id,
      location_id, value, date, appointment_date, appointment_time, create_appointment
    } = req.body;

    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    // Insert consultation
    const consultationResult = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [client_id, dependent_id, private_patient_id, req.user.id, service_id, location_id, value, date]);

    let appointmentResult = null;

    // Create appointment if requested
    if (create_appointment && appointment_date && appointment_time) {
      appointmentResult = await pool.query(`
        INSERT INTO appointments (
          professional_id, client_id, dependent_id, private_patient_id,
          service_id, location_id, appointment_date, appointment_time, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
        RETURNING *
      `, [req.user.id, client_id, dependent_id, private_patient_id, service_id, location_id, appointment_date, appointment_time]);
    }

    res.status(201).json({
      message: 'Consulta registrada com sucesso',
      consultation: consultationResult.rows[0],
      appointment: appointmentResult ? appointmentResult.rows[0] : null
    });
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro ao registrar consulta' });
  }
});

// 🔥 ATTENDANCE LOCATIONS ROUTES
app.get('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM attendance_locations 
      WHERE professional_id = $1 
      ORDER BY is_default DESC, name
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance locations:', error);
    res.status(500).json({ message: 'Erro ao buscar locais de atendimento' });
  }
});

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
      neighborhood, city, state, zip_code, phone, is_default || false
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating attendance location:', error);
    res.status(500).json({ message: 'Erro ao criar local de atendimento' });
  }
});

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
          neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9, is_default = $10
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `, [
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default,
      id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating attendance location:', error);
    res.status(500).json({ message: 'Erro ao atualizar local' });
  }
});

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
    res.status(500).json({ message: 'Erro ao excluir local' });
  }
});

// 🔥 MEDICAL RECORDS ROUTES
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.*,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE pp.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro ao buscar prontuários' });
  }
});

app.post('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, vital_signs
    } = req.body;

    if (!private_patient_id) {
      return res.status(400).json({ message: 'ID do paciente é obrigatório' });
    }

    // Verify patient belongs to this professional
    const patientCheck = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    const result = await pool.query(`
      INSERT INTO medical_records (
        private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, JSON.stringify(vital_signs)
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Erro ao criar prontuário' });
  }
});

app.put('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, vital_signs
    } = req.body;

    const result = await pool.query(`
      UPDATE medical_records mr
      SET chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
          medications = $4, allergies = $5, physical_examination = $6,
          diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
          updated_at = CURRENT_TIMESTAMP
      FROM private_patients pp
      WHERE mr.id = $11 AND mr.private_patient_id = pp.id AND pp.professional_id = $12
      RETURNING mr.*
    `, [
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, JSON.stringify(vital_signs), id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating medical record:', error);
    res.status(500).json({ message: 'Erro ao atualizar prontuário' });
  }
});

app.delete('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM medical_records mr
      USING private_patients pp
      WHERE mr.id = $1 AND mr.private_patient_id = pp.id AND pp.professional_id = $2
      RETURNING mr.id
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    res.json({ message: 'Prontuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting medical record:', error);
    res.status(500).json({ message: 'Erro ao excluir prontuário' });
  }
});

// 🔥 MEDICAL DOCUMENTS ROUTES
app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        md.*,
        pp.name as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro ao buscar documentos' });
  }
});

app.post('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({ message: 'Título, tipo e dados do template são obrigatórios' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, private_patient_id, title, document_type, documentResult.url]);

    res.status(201).json({
      message: 'Documento criado com sucesso',
      document: result.rows[0],
      title: title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento' });
  }
});

// 🔥 IMAGE UPLOAD ROUTE
app.post('/api/upload-image', authenticate, authorize(['professional']), async (req, res) => {
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
        // Update user's photo_url in database
        await pool.query(
          'UPDATE users SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [req.file.path, req.user.id]
        );

        res.json({
          message: 'Imagem enviada com sucesso',
          imageUrl: req.file.path
        });
      } catch (dbError) {
        console.error('Database error updating photo:', dbError);
        res.status(500).json({ message: 'Erro ao salvar URL da imagem no banco' });
      }
    });
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 SCHEDULING ACCESS ROUTES
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.has_scheduling_access,
        u.access_expires_at, u.access_granted_by, u.access_granted_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals scheduling access:', error);
    res.status(500).json({ message: 'Erro ao buscar dados de acesso' });
  }
});

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
    res.status(500).json({ message: 'Erro ao conceder acesso' });
  }
});

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
    res.status(500).json({ message: 'Erro ao revogar acesso' });
  }
});

// 🔥 REPORTS ROUTES
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get revenue by professional
    const professionalRevenueResult = await pool.query(`
      SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count,
        SUM(c.value * u.percentage / 100) as professional_payment,
        SUM(c.value * (100 - u.percentage) / 100) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      GROUP BY u.id, u.name, u.percentage
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
      WHERE c.date >= $1 AND c.date <= $2
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Calculate total revenue
    const totalRevenueResult = await pool.query(`
      SELECT SUM(value) as total_revenue
      FROM consultations
      WHERE date >= $1 AND date <= $2
        AND (client_id IS NOT NULL OR dependent_id IS NOT NULL)
    `, [start_date, end_date]);

    const totalRevenue = totalRevenueResult.rows[0]?.total_revenue || 0;

    res.json({
      total_revenue: parseFloat(totalRevenue),
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
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional's percentage
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const professionalPercentage = professionalResult.rows[0].percentage || 50;

    // Get consultations for this professional in the date range
    const consultationsResult = await pool.query(`
      SELECT 
        c.date, c.value,
        s.name as service_name,
        COALESCE(u.name, d.name, pp.name) as client_name,
        (c.value * (100 - $3) / 100) as amount_to_pay
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `, [req.user.id, start_date, professionalPercentage, end_date]);

    // Calculate summary
    const totalRevenue = consultationsResult.rows.reduce((sum, row) => sum + parseFloat(row.value), 0);
    const totalAmountToPay = consultationsResult.rows.reduce((sum, row) => sum + parseFloat(row.amount_to_pay), 0);

    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: totalRevenue,
        consultation_count: consultationsResult.rows.length,
        amount_to_pay: totalAmountToPay
      },
      consultations: consultationsResult.rows.map(row => ({
        date: row.date,
        client_name: row.client_name,
        service_name: row.service_name,
        total_value: parseFloat(row.value),
        amount_to_pay: parseFloat(row.amount_to_pay)
      }))
    });
  } catch (error) {
    console.error('Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

app.get('/api/reports/professional-detailed', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional's percentage
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;

    // Get all consultations
    const allConsultationsResult = await pool.query(`
      SELECT 
        c.value,
        CASE 
          WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 'convenio'
          ELSE 'private'
        END as consultation_type
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $3
    `, [req.user.id, start_date, end_date]);

    // Calculate statistics
    const totalConsultations = allConsultationsResult.rows.length;
    const convenioConsultations = allConsultationsResult.rows.filter(row => row.consultation_type === 'convenio').length;
    const privateConsultations = allConsultationsResult.rows.filter(row => row.consultation_type === 'private').length;

    const totalRevenue = allConsultationsResult.rows.reduce((sum, row) => sum + parseFloat(row.value), 0);
    const convenioRevenue = allConsultationsResult.rows
      .filter(row => row.consultation_type === 'convenio')
      .reduce((sum, row) => sum + parseFloat(row.value), 0);
    const privateRevenue = allConsultationsResult.rows
      .filter(row => row.consultation_type === 'private')
      .reduce((sum, row) => sum + parseFloat(row.value), 0);

    const amountToPay = convenioRevenue * (100 - professionalPercentage) / 100;

    res.json({
      summary: {
        total_consultations: totalConsultations,
        convenio_consultations: convenioConsultations,
        private_consultations: privateConsultations,
        total_revenue: totalRevenue,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      }
    });
  } catch (error) {
    console.error('Error generating detailed professional report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório detalhado' });
  }
});

app.get('/api/reports/clients-by-city', authenticate, authorize(['admin']), async (req, res) => {
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
      WHERE 'client' = ANY(roles) 
        AND city IS NOT NULL 
        AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error generating clients by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

app.get('/api/reports/professionals-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.city,
        u.state,
        COUNT(u.id) as total_professionals,
        json_agg(
          json_build_object(
            'category_name', COALESCE(sc.name, 'Sem categoria'),
            'count', 1
          )
        ) as categories
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles) 
        AND u.city IS NOT NULL 
        AND u.city != ''
      GROUP BY u.city, u.state
      ORDER BY total_professionals DESC, u.city
    `);

    // Process the results to group categories properly
    const processedResults = result.rows.map(row => {
      const categoryMap = new Map();
      
      row.categories.forEach((cat) => {
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

    res.json(processedResults);
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

// 🔥 PAYMENT ROUTES
app.post('/api/create-subscription', authenticate, authorize(['client']), async (req, res) => {
  try {
    const { user_id, dependent_ids } = req.body;

    // Calculate total amount
    const baseAmount = 250; // R$250 for titular
    const dependentAmount = dependent_ids ? dependent_ids.length * 50 : 0; // R$50 per dependent
    const totalAmount = baseAmount + dependentAmount;

    // Create MercadoPago preference
    const preference = {
      items: [
        {
          title: 'Assinatura Cartão Quiro Ferreira',
          quantity: 1,
          unit_price: totalAmount,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'cliente@quiroferreira.com.br'
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/payment/success`,
        failure: `${req.protocol}://${req.get('host')}/payment/failure`,
        pending: `${req.protocol}://${req.get('host')}/payment/pending`
      },
      auto_return: 'approved',
      external_reference: `subscription_${user_id}_${Date.now()}`
    };

    // Here you would integrate with MercadoPago SDK
    // For now, return a mock response
    res.json({
      id: 'mock_preference_id',
      init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_preference_id',
      sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_preference_id'
    });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido' });
    }

    // Create MercadoPago preference for professional payment
    const preference = {
      items: [
        {
          title: 'Repasse ao Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'profissional@quiroferreira.com.br'
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/payment/success`,
        failure: `${req.protocol}://${req.get('host')}/payment/failure`,
        pending: `${req.protocol}://${req.get('host')}/payment/pending`
      },
      auto_return: 'approved',
      external_reference: `professional_payment_${req.user.id}_${Date.now()}`
    };

    // Here you would integrate with MercadoPago SDK
    // For now, return a mock response
    res.json({
      id: 'mock_preference_id',
      init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_preference_id',
      sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_preference_id'
    });
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// 🔥 CATCH-ALL ROUTE - Serve React app for any unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 🔥 START SERVER WITH DATABASE STRUCTURE GUARANTEE
const startServer = async () => {
  try {
    console.log('🚀 Starting Convênio Quiro Ferreira Server...');
    
    // Ensure database structure before starting server
    await ensureDatabaseStructure();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();