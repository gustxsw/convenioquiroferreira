import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { pool } from './db.js';
import { authenticate, authorize } from './middleware/auth.js';
import createUpload from './middleware/upload.js';
import { generateDocumentPDF } from './utils/documentGenerator.js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://www.cartaoquiroferreira.com.br',
      'https://cartaoquiroferreira.com.br'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Serve static files from dist directory
app.use(express.static(path.join(process.cwd(), 'dist')));

// Initialize MercadoPago with SDK v2
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || 'TEST-your-access-token'
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected successfully', time: result.rows[0].now });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ message: 'Database connection failed', error: error.message });
  }
});

// Initialize database tables
const initializeDatabase = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Initializing database tables...');
    
    await client.query('BEGIN');

    // Create users table with roles array
    await client.query(`
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
        password VARCHAR(255) NOT NULL,
        roles TEXT[] DEFAULT ARRAY['client'],
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        photo_url TEXT,
        category_id INTEGER,
        percentage DECIMAL(5,2) DEFAULT 50.00,
        crm VARCHAR(20),
        has_scheduling_access BOOLEAN DEFAULT FALSE,
        access_expires_at TIMESTAMP,
        access_granted_by VARCHAR(255),
        access_granted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create service_categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create services table
    await client.query(`
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

    // Create dependents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        birth_date DATE,
        billing_amount DECIMAL(10,2) DEFAULT 50.00,
        payment_reference VARCHAR(255),
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create dependent_payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER REFERENCES dependents(id) ON DELETE CASCADE,
        payment_id VARCHAR(255) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        external_reference VARCHAR(255),
        approved_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create attendance_locations table
    await client.query(`
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
        zip_code VARCHAR(10),
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create consultations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER,
        professional_id INTEGER REFERENCES users(id),
        service_id INTEGER REFERENCES services(id),
        location_id INTEGER REFERENCES attendance_locations(id),
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create private_patients table
    await client.query(`
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
        zip_code VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create medical_records table
    await client.query(`
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

    // Create medical_documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subscription_payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        payment_id VARCHAR(255) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        external_reference VARCHAR(255),
        approved_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create professional_payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        payment_id VARCHAR(255) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        external_reference VARCHAR(255),
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create agenda_payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        payment_id VARCHAR(255) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        external_reference VARCHAR(255),
        approved_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create notifications table
    await client.query(`
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

    // Create audit_logs table
    await client.query(`
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

    // Create system_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Initialize database on startup
initializeDatabase().catch(console.error);

// ==================== AUTH ROUTES ====================

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

    // Validate required fields
    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING id, name, cpf, roles`,
      [
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, passwordHash, ['client']
      ]
    );

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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password: inputPassword } = req.body;

    if (!cpf || !inputPassword) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, password, roles FROM users WHERE cpf = $1',
      [cpf]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(inputPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Return user data without token (will be created when role is selected)
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

    // Get user and verify role
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

    // Create JWT token with selected role
    const token = jwt.sign(
      { 
        id: user.id, 
        cpf: user.cpf,
        currentRole: role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
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

app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.user.id;

    if (!role) {
      return res.status(400).json({ message: 'Role é obrigatória' });
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

    if (!user.roles || !user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Create new JWT token with new role
    const token = jwt.sign(
      { 
        id: user.id, 
        cpf: user.cpf,
        currentRole: role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// ==================== USERS ROUTES ====================

app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.roles, u.subscription_status,
        u.subscription_expiry, u.created_at, u.category_id, u.percentage,
        u.crm, u.photo_url, u.has_scheduling_access, u.access_expires_at,
        u.access_granted_by, u.access_granted_at, sc.name as category_name
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

app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.roles, u.subscription_status,
        u.subscription_expiry, u.created_at, u.category_id, u.percentage,
        u.crm, u.photo_url, u.has_scheduling_access, u.access_expires_at,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/users/:id/subscription-status', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await pool.query(
      'SELECT subscription_status, subscription_expiry FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    res.json({
      subscription_status: user.subscription_status,
      subscription_expiry: user.subscription_expiry
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, phone, currentPassword, newPassword, category_id, percentage, crm } = req.body;

    // Verify user exists and get current data
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // If changing password, verify current password
    let passwordHash = user.password;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }

      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    // Update user
    const result = await pool.query(`
      UPDATE users SET 
        name = $1, email = $2, phone = $3, password = $4,
        category_id = $5, percentage = $6, crm = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, name, email, phone, category_id, percentage, crm
    `, [name, email, phone, passwordHash, category_id, percentage, crm, userId]);

    res.json({
      message: 'Usuário atualizado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, password, roles,
      category_id, percentage, crm
    } = req.body;

    // Validate required fields
    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        category_id, percentage, crm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, name, cpf, roles
    `, [
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, passwordHash, roles || ['client'],
      category_id, percentage || 50.00, crm
    ]);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== CLIENT ROUTES ====================

app.get('/api/clients/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const result = await pool.query(
      `SELECT id, name, cpf, subscription_status, subscription_expiry 
       FROM users 
       WHERE cpf = $1 AND 'client' = ANY(roles)`,
      [cpf]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get all clients for professional
app.get('/api/clients', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, cpf, phone, subscription_status
      FROM users 
      WHERE 'client' = ANY(roles)
      ORDER BY name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== DEPENDENTS ROUTES ====================

app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    const result = await pool.query(`
      SELECT 
        d.*,
        CASE 
          WHEN dp.status = 'approved' AND dp.expires_at > NOW() THEN 'active'
          WHEN dp.status = 'approved' AND dp.expires_at <= NOW() THEN 'expired'
          WHEN dp.status = 'pending' THEN 'pending'
          ELSE 'pending'
        END as current_status
      FROM dependents d
      LEFT JOIN dependent_payments dp ON d.id = dp.dependent_id 
        AND dp.status = 'approved'
        AND dp.approved_at = (
          SELECT MAX(approved_at) 
          FROM dependent_payments 
          WHERE dependent_id = d.id AND status = 'approved'
        )
      WHERE d.client_id = $1
      ORDER BY d.created_at DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/dependents/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.client_id,
        u.name as client_name,
        u.subscription_status as client_subscription_status,
        CASE 
          WHEN dp.status = 'approved' AND dp.expires_at > NOW() THEN 'active'
          WHEN dp.status = 'approved' AND dp.expires_at <= NOW() THEN 'expired'
          WHEN dp.status = 'pending' THEN 'pending'
          ELSE 'pending'
        END as dependent_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      LEFT JOIN dependent_payments dp ON d.id = dp.dependent_id 
        AND dp.status = 'approved'
        AND dp.approved_at = (
          SELECT MAX(approved_at) 
          FROM dependent_payments 
          WHERE dependent_id = d.id AND status = 'approved'
        )
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

app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'ID do cliente, nome e CPF são obrigatórios' });
    }

    // Check if CPF already exists
    const existingDependent = await pool.query('SELECT id FROM dependents WHERE cpf = $1', [cpf]);
    if (existingDependent.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado como dependente' });
    }

    // Check if CPF exists as user
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado como usuário' });
    }

    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [client_id, name, cpf, birth_date]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const dependentId = parseInt(req.params.id);
    const { name, birth_date } = req.body;

    const result = await pool.query(`
      UPDATE dependents SET name = $1, birth_date = $2
      WHERE id = $3
      RETURNING *
    `, [name, birth_date, dependentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const dependentId = parseInt(req.params.id);

    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING id', [dependentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/admin/dependents', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        u.name as client_name,
        CASE 
          WHEN dp.status = 'approved' AND dp.expires_at > NOW() THEN 'active'
          WHEN dp.status = 'approved' AND dp.expires_at <= NOW() THEN 'expired'
          WHEN dp.status = 'pending' THEN 'pending'
          ELSE 'pending'
        END as current_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      LEFT JOIN dependent_payments dp ON d.id = dp.dependent_id 
        AND dp.status = 'approved'
        AND dp.approved_at = (
          SELECT MAX(approved_at) 
          FROM dependent_payments 
          WHERE dependent_id = d.id AND status = 'approved'
        )
      ORDER BY d.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PROFESSIONALS ROUTES ====================

app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles, u.address, u.address_number,
        u.address_complement, u.neighborhood, u.city, u.state, u.photo_url,
        u.percentage, u.crm, u.has_scheduling_access, u.access_expires_at,
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
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/admin/grant-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id, expires_at, reason } = req.body;
    const adminName = req.user.name;

    if (!professional_id || !expires_at) {
      return res.status(400).json({ message: 'ID do profissional e data de expiração são obrigatórios' });
    }

    const result = await pool.query(`
      UPDATE users SET 
        has_scheduling_access = true,
        access_expires_at = $1,
        access_granted_by = $2,
        access_granted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND 'professional' = ANY(roles)
      RETURNING id, name
    `, [expires_at, adminName, professional_id]);

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

app.post('/api/admin/revoke-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id } = req.body;

    if (!professional_id) {
      return res.status(400).json({ message: 'ID do profissional é obrigatório' });
    }

    const result = await pool.query(`
      UPDATE users SET 
        has_scheduling_access = false,
        access_expires_at = NULL,
        access_granted_by = NULL,
        access_granted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND 'professional' = ANY(roles)
      RETURNING id, name
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

// ==================== SERVICES ROUTES ====================

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

app.post('/api/services', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !description || !base_price) {
      return res.status(400).json({ message: 'Nome, descrição e preço base são obrigatórios' });
    }

    const result = await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, base_price, category_id, is_base_service || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);
    const { name, description, base_price, category_id, is_base_service } = req.body;

    const result = await pool.query(`
      UPDATE services SET 
        name = $1, description = $2, base_price = $3, 
        category_id = $4, is_base_service = $5
      WHERE id = $6
      RETURNING *
    `, [name, description, base_price, category_id, is_base_service, serviceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);

    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [serviceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICE CATEGORIES ROUTES ====================

app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM service_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service categories:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
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
      RETURNING *
    `, [name, description]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== CONSULTATIONS ROUTES ====================

app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        COALESCE(u_client.name, d.name, pp.name) as client_name,
        u_prof.name as professional_name,
        s.name as service_name,
        al.name as location_name,
        CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      ORDER BY c.date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    const result = await pool.query(`
      SELECT 
        c.*,
        COALESCE(u_client.name, d.name) as client_name,
        u_prof.name as professional_name,
        s.name as service_name,
        al.name as location_name,
        CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE c.client_id = $1 OR d.client_id = $1
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/consultations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, service_id, location_id,
      value, date, status, notes, appointment_date, appointment_time, create_appointment
    } = req.body;
    const professionalId = req.user.id;

    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    // Validate that at least one patient type is provided
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    const result = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      client_id, dependent_id, private_patient_id, professionalId,
      service_id, location_id, value, date, status || 'completed', notes
    ]);

    const consultation = result.rows[0];

    // If create_appointment is true, also create an appointment record
    let appointment = null;
    if (create_appointment && appointment_date && appointment_time) {
      // For now, we'll just return the consultation as appointment
      // In a full system, you might have a separate appointments table
      appointment = {
        id: consultation.id,
        date: appointment_date,
        time: appointment_time,
        consultation_id: consultation.id
      };
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

app.put('/api/consultations/:id/status', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const consultationId = parseInt(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status é obrigatório' });
    }

    const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Status inválido' });
    }

    const result = await pool.query(`
      UPDATE consultations SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND professional_id = $3
      RETURNING *
    `, [status, consultationId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    res.json({
      message: 'Status atualizado com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating consultation status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update consultation date and time
app.put('/api/consultations/:id/reschedule', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time } = req.body;

    console.log('🔄 Rescheduling consultation:', { id, date, time });

    if (!date || !time) {
      return res.status(400).json({ message: 'Data e hora são obrigatórios' });
    }

    // Combine date and time into a timestamp
    const dateTime = new Date(`${date}T${time}`);

    const result = await pool.query(`
      UPDATE consultations 
      SET date = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND professional_id = $3
      RETURNING *
    `, [dateTime, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    console.log('✅ Consultation rescheduled:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error rescheduling consultation:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create recurring consultations
app.post('/api/consultations/recurring', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      value,
      start_date,
      start_time,
      sessions_count,
      recurrence_days, // Array of days: ['monday', 'wednesday', 'friday']
      notes
    } = req.body;

    console.log('🔄 Creating recurring consultations:', req.body);

    // Validate required fields
    if (!service_id || !value || !start_date || !start_time || !sessions_count || !recurrence_days) {
      return res.status(400).json({ message: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    if (sessions_count < 1 || sessions_count > 52) {
      return res.status(400).json({ message: 'Número de sessões deve ser entre 1 e 52' });
    }

    if (!Array.isArray(recurrence_days) || recurrence_days.length === 0) {
      return res.status(400).json({ message: 'Pelo menos um dia da semana deve ser selecionado' });
    }

    // Validate patient selection
    if (!client_id && !private_patient_id) {
      return res.status(400).json({ message: 'Cliente ou paciente particular deve ser selecionado' });
    }

    // Map day names to numbers (0 = Sunday, 1 = Monday, etc.)
    const dayMap = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6
    };

    const dayNumbers = recurrence_days.map(day => dayMap[day.toLowerCase()]).filter(num => num !== undefined);

    if (dayNumbers.length === 0) {
      return res.status(400).json({ message: 'Dias da semana inválidos' });
    }

    // Generate consultation dates
    const consultationDates = [];
    const startDateTime = new Date(`${start_date}T${start_time}`);
    let currentDate = new Date(startDateTime);
    let sessionsCreated = 0;

    // Find next occurrence of the selected days
    while (sessionsCreated < sessions_count) {
      if (dayNumbers.includes(currentDate.getDay())) {
        consultationDates.push(new Date(currentDate));
        sessionsCreated++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety check to prevent infinite loop
      if (consultationDates.length === 0 && currentDate > new Date(startDateTime.getTime() + (365 * 24 * 60 * 60 * 1000))) {
        throw new Error('Não foi possível gerar as datas das consultas');
      }
    }

    // Create all consultations in a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const createdConsultations = [];

      for (let i = 0; i < consultationDates.length; i++) {
        const consultationDate = consultationDates[i];
        const sessionNumber = i + 1;
        const sessionNotes = notes ? `${notes} (Sessão ${sessionNumber}/${sessions_count})` : `Sessão ${sessionNumber}/${sessions_count}`;

        const result = await client.query(
          `INSERT INTO consultations 
           (client_id, dependent_id, private_patient_id, professional_id, service_id, location_id, value, date, status, notes, is_recurring, session_number, total_sessions, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING *`,
          [
            client_id || null,
            dependent_id || null,
            private_patient_id || null,
            req.user.id,
            service_id,
            location_id || null,
            value,
            consultationDate.toISOString(),
            'scheduled',
            sessionNotes,
            true,
            sessionNumber,
            sessions_count
          ]
        );

        createdConsultations.push(result.rows[0]);
      }

      await client.query('COMMIT');

      console.log('✅ Recurring consultations created:', createdConsultations.length);

      res.status(201).json({
        message: `${createdConsultations.length} consultas recorrentes criadas com sucesso`,
        consultations: createdConsultations
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error creating recurring consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PRIVATE PATIENTS ROUTES ====================

app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM private_patients WHERE professional_id = $1 ORDER BY name',
      [professionalId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    // Check if CPF already exists (if provided)
    if (cpf) {
      const existingPatient = await pool.query(
        'SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2',
        [cpf, professionalId]
      );

      if (existingPatient.rows.length > 0) {
        return res.status(400).json({ message: 'CPF já cadastrado para este profissional' });
      }
    }

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address,
        address_number, address_complement, neighborhood, city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      professionalId, name, cpf, email, phone, birth_date, address,
      address_number, address_complement, neighborhood, city, state, zip_code
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const professionalId = req.user.id;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    const result = await pool.query(`
      UPDATE private_patients SET 
        name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
        address_number = $6, address_complement = $7, neighborhood = $8,
        city = $9, state = $10, zip_code = $11
      WHERE id = $12 AND professional_id = $13
      RETURNING *
    `, [
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code,
      patientId, professionalId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const professionalId = req.user.id;

    const result = await pool.query(
      'DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING id',
      [patientId, professionalId]
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

// ==================== MEDICAL RECORDS ROUTES ====================

app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(`
      SELECT mr.*, pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [professionalId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const {
      private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, vital_signs
    } = req.body;

    if (!private_patient_id) {
      return res.status(400).json({ message: 'ID do paciente é obrigatório' });
    }

    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      professionalId, private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, JSON.stringify(vital_signs)
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const professionalId = req.user.id;
    const {
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, vital_signs
    } = req.body;

    const result = await pool.query(`
      UPDATE medical_records SET 
        chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
        medications = $4, allergies = $5, physical_examination = $6,
        diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `, [
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, JSON.stringify(vital_signs),
      recordId, professionalId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const professionalId = req.user.id;

    const result = await pool.query(
      'DELETE FROM medical_records WHERE id = $1 AND professional_id = $2 RETURNING id',
      [recordId, professionalId]
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

app.post('/api/medical-records/generate-document', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { record_id, template_data } = req.body;
    const professionalId = req.user.id;

    if (!record_id || !template_data) {
      return res.status(400).json({ message: 'ID do prontuário e dados do template são obrigatórios' });
    }

    // Verify record belongs to professional
    const recordResult = await pool.query(
      'SELECT * FROM medical_records WHERE id = $1 AND professional_id = $2',
      [record_id, professionalId]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF('medical_record', template_data);

    res.json({
      message: 'Documento gerado com sucesso',
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('Error generating medical record document:', error);
    res.status(500).json({ message: 'Erro ao gerar documento' });
  }
});

// ==================== MEDICAL DOCUMENTS ROUTES ====================

app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(`
      SELECT md.*, pp.name as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC
    `, [professionalId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({ message: 'Título, tipo de documento e dados do template são obrigatórios' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [professionalId, private_patient_id, title, document_type, documentResult.url]);

    res.status(201).json({
      message: 'Documento criado com sucesso',
      document: result.rows[0],
      title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento' });
  }
});

// ==================== ATTENDANCE LOCATIONS ROUTES ====================

app.get('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM attendance_locations WHERE professional_id = $1 ORDER BY is_default DESC, name',
      [professionalId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance locations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const {
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1',
        [professionalId]
      );
    }

    const result = await pool.query(`
      INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      professionalId, name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default || false
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const locationId = parseInt(req.params.id);
    const professionalId = req.user.id;
    const {
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default
    } = req.body;

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2',
        [professionalId, locationId]
      );
    }

    const result = await pool.query(`
      UPDATE attendance_locations SET 
        name = $1, address = $2, address_number = $3, address_complement = $4,
        neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9, is_default = $10
      WHERE id = $11 AND professional_id = $12
      RETURNING *
    `, [
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default,
      locationId, professionalId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const locationId = parseInt(req.params.id);
    const professionalId = req.user.id;

    const result = await pool.query(
      'DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2 RETURNING id',
      [locationId, professionalId]
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

// ==================== REPORTS ROUTES ====================

app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get revenue by professional
    const professionalsResult = await pool.query(`
      SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count,
        SUM(c.value * (u.percentage / 100)) as professional_payment,
        SUM(c.value * ((100 - u.percentage) / 100)) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get revenue by service
    const servicesResult = await pool.query(`
      SELECT 
        s.name as service_name,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get total revenue
    const totalResult = await pool.query(`
      SELECT SUM(value) as total_revenue
      FROM consultations
      WHERE date >= $1 AND date <= $2
    `, [start_date, end_date]);

    res.json({
      total_revenue: totalResult.rows[0].total_revenue || 0,
      revenue_by_professional: professionalsResult.rows,
      revenue_by_service: servicesResult.rows
    });
  } catch (error) {
    console.error('Error generating revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 APPOINTMENTS SYSTEM - COMPLETELY REWRITTEN

// Get all appointments for professional
app.get('/api/appointments', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    
    console.log('🔄 Fetching appointments for professional:', professionalId);
    
    const result = await pool.query(`
      SELECT 
        a.id,
        a.client_id,
        a.dependent_id,
        a.private_patient_id,
        a.date,
        a.time,
        a.status,
        a.value,
        a.is_recurring,
        a.recurring_days,
        a.session_count,
        a.total_sessions,
        a.created_at,
        COALESCE(c.name, d.name, pp.name) as client_name,
        COALESCE(c.phone, dc.phone, pp.phone) as client_phone,
        s.name as service_name,
        al.name as location_name,
        CASE 
          WHEN a.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'convenio'
        END as appointment_type
      FROM appointments a
      LEFT JOIN users c ON a.client_id = c.id
      LEFT JOIN dependents d ON a.dependent_id = d.id
      LEFT JOIN users dc ON d.client_id = dc.id
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      WHERE a.professional_id = $1
      ORDER BY a.date DESC, a.time DESC
    `, [professionalId]);
    
    console.log('✅ Appointments loaded:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching appointments:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create appointment
app.post('/api/appointments', authenticate, authorize(['professional']), async (req, res) => {
  try {
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
      total_sessions
    } = req.body;

    console.log('🔄 Creating new appointment:', req.body);
    
    // Validate required fields
    if (!service_id || !date || !time || !value) {
      return res.status(400).json({ message: 'Campos obrigatórios: serviço, data, hora e valor' });
    }

    // Validate patient selection
    if (patient_type === 'convenio' && !client_id && !dependent_id) {
      return res.status(400).json({ message: 'Selecione um cliente ou dependente para consulta do convênio' });
    }

    if (patient_type === 'private' && !private_patient_id) {
      return res.status(400).json({ message: 'Selecione um paciente particular' });
    }

    const result = await pool.query(`
      INSERT INTO appointments (
        professional_id, client_id, dependent_id, private_patient_id,
        service_id, location_id, date, time, value, status,
        is_recurring, recurring_days, total_sessions, session_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      req.user.id,
      client_id || null,
      dependent_id || null,
      private_patient_id || null,
      service_id,
      location_id || null,
      date,
      time,
      parseFloat(value),
      'scheduled',
      is_recurring || false,
      is_recurring ? JSON.stringify(recurring_days) : null,
      is_recurring ? total_sessions : null,
      is_recurring ? 1 : null
    ]);

    console.log('✅ Appointment created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update appointment
app.put('/api/appointments/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const professionalId = req.user.id;
    
    console.log('🔄 Updating appointment:', appointmentId);
    
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
      total_sessions
    } = req.body;

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      'SELECT id FROM appointments WHERE id = $1 AND professional_id = $2',
      [appointmentId, professionalId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    const result = await pool.query(`
      UPDATE appointments SET
        client_id = $1,
        dependent_id = $2,
        private_patient_id = $3,
        service_id = $4,
        location_id = $5,
        date = $6,
        time = $7,
        value = $8,
        is_recurring = $9,
        recurring_days = $10,
        total_sessions = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 AND professional_id = $13
      RETURNING *
    `, [
      client_id || null,
      dependent_id || null,
      private_patient_id || null,
      service_id,
      location_id || null,
      date,
      time,
      parseFloat(value),
      is_recurring || false,
      recurring_days ? JSON.stringify(recurring_days) : null,
      is_recurring ? parseInt(total_sessions) || null : null,
      appointmentId,
      professionalId
    ]);

    console.log('✅ Appointment updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Reschedule appointment
app.put('/api/appointments/:id/reschedule', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const professionalId = req.user.id;
    const { date, time } = req.body;
    
    console.log('🔄 Rescheduling appointment:', appointmentId, { date, time });

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      'SELECT id FROM appointments WHERE id = $1 AND professional_id = $2',
      [appointmentId, professionalId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    const result = await pool.query(`
      UPDATE appointments SET
        date = $1,
        time = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND professional_id = $4
      RETURNING *
    `, [date, time, appointmentId, professionalId]);

    console.log('✅ Appointment rescheduled:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error rescheduling appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update appointment status
app.put('/api/appointments/:id/status', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const professionalId = req.user.id;
    const { status } = req.body;
    
    console.log('🔄 Updating appointment status:', appointmentId, status);

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      'SELECT id FROM appointments WHERE id = $1 AND professional_id = $2',
      [appointmentId, professionalId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    const result = await pool.query(`
      UPDATE appointments SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND professional_id = $3
      RETURNING *
    `, [status, appointmentId, professionalId]);

    console.log('✅ Appointment status updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating appointment status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const professionalId = req.user.id;
    
    console.log('🔄 Deleting appointment:', appointmentId);

    // Verify appointment belongs to professional
    const checkResult = await pool.query(
      'SELECT id FROM appointments WHERE id = $1 AND professional_id = $2',
      [appointmentId, professionalId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    await pool.query('DELETE FROM appointments WHERE id = $1 AND professional_id = $2', [appointmentId, professionalId]);

    console.log('✅ Appointment deleted');
    res.json({ message: 'Agendamento excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 PROFESSIONAL REVENUE REPORT - COMPLETELY REWRITTEN
app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { start_date, end_date } = req.query;

    console.log('🔄 Generating professional revenue report:', { professionalId, start_date, end_date });
    
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional percentage
    const profResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [professionalId]
    );

    const professionalPercentage = profResult.rows[0]?.percentage || 50;
    console.log('💰 Professional percentage:', professionalPercentage);

    // 🔥 SEPARAR CONSULTAS: Convênio vs Particulares
    // Consultas do CONVÊNIO (contam para contas a pagar)
    const convenioResult = await pool.query(`
      SELECT 
        c.id,
        c.date,
        c.value,
        COALESCE(cl.name, d.name) as client_name,
        s.name as service_name
      FROM consultations c
      LEFT JOIN users cl ON c.client_id = cl.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 
        AND c.date <= $3
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      ORDER BY c.date DESC
    `, [professionalId, start_date, end_date]);
    
    // Consultas PARTICULARES (não contam para contas a pagar - são da agenda)
    const privateResult = await pool.query(`
      SELECT 
        c.id,
        c.date,
        c.value,
        pp.name as client_name,
        s.name as service_name
      FROM consultations c
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 
        AND c.date <= $3
        AND c.private_patient_id IS NOT NULL
      ORDER BY c.date DESC
    `, [professionalId, start_date, end_date]);
    
    const convenioConsultations = convenioResult.rows;
    const privateConsultations = privateResult.rows;
    
    console.log('📊 Convênio consultations:', convenioConsultations.length);
    console.log('📊 Private consultations:', privateConsultations.length);
    
    // 🔥 CÁLCULOS CORRETOS
    const convenioRevenue = convenioConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const privateRevenue = privateConsultations.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const totalRevenue = convenioRevenue + privateRevenue;
    
    // 🔥 CONTAS A PAGAR: Apenas sobre consultas do convênio
    const amountToPay = convenioRevenue * ((100 - professionalPercentage) / 100);
    
    console.log('💰 Revenue calculations:', {
      convenioRevenue,
      privateRevenue,
      totalRevenue,
      amountToPay,
      professionalPercentage
    });
    
    // Combine all consultations for display
    const allConsultations = [
      ...convenioConsultations.map(c => ({ ...c, type: 'convenio', amount_to_pay: parseFloat(c.value) * ((100 - professionalPercentage) / 100) })),
      ...privateConsultations.map(c => ({ ...c, type: 'private', amount_to_pay: 0 }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    res.json({
      summary: {
        convenio_consultations: convenioConsultations.length,
        private_consultations: privateConsultations.length,
        total_consultations: convenioConsultations.length + privateConsultations.length,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        total_revenue: totalRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      },
      consultations: allConsultations.map(c => ({
        date: c.date,
        client_name: c.client_name,
        service_name: c.service_name,
        total_value: parseFloat(c.value), 
        amount_to_pay: c.amount_to_pay,
        type: c.type
      }))
    });
    
    console.log('✅ Professional revenue report generated');
  } catch (error) {
    console.error('❌ Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 PROFESSIONAL DETAILED REPORT - COMPLETELY REWRITTEN
app.get('/api/reports/professional-detailed', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { start_date, end_date } = req.query;

    console.log('🔄 Generating detailed professional report:', { professionalId, start_date, end_date });
    
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional percentage
    const profResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [professionalId]
    );

    const professionalPercentage = profResult.rows[0]?.percentage || 50;
    console.log('💰 Professional percentage:', professionalPercentage);

    // 🔥 CONSULTAS DO CONVÊNIO (geram contas a pagar)
    const convenioConsultations = await pool.query(`
      SELECT 
        COUNT(*) as count,
        SUM(value) as revenue
      FROM consultations 
      WHERE professional_id = $1 
        AND date >= $2 
        AND date <= $3
        AND (client_id IS NOT NULL OR dependent_id IS NOT NULL)
        AND private_patient_id IS NULL
    `, [professionalId, start_date, end_date]);

    // 🔥 CONSULTAS PARTICULARES (não geram contas a pagar - são da agenda)
    const privateConsultations = await pool.query(`
      SELECT 
        COUNT(*) as count,
        SUM(value) as revenue
      FROM consultations 
      WHERE professional_id = $1 
        AND date >= $2 
        AND date <= $3
        AND private_patient_id IS NOT NULL
    `, [professionalId, start_date, end_date]);

    const convenioData = convenioConsultations.rows[0];
    const privateData = privateConsultations.rows[0];

    const convenioRevenue = parseFloat(convenioData.revenue) || 0;
    const privateRevenue = parseFloat(privateData.revenue) || 0;
    const totalRevenue = convenioRevenue + privateRevenue;

    // 🔥 CONTAS A PAGAR: Apenas sobre consultas do convênio
    const amountToPay = convenioRevenue * ((100 - professionalPercentage) / 100);

    console.log('📊 Detailed report calculations:', {
      convenioRevenue,
      privateRevenue,
      totalRevenue,
      amountToPay,
      professionalPercentage
    });
    
    res.json({
      summary: {
        total_consultations: Number(convenioData.count) + Number(privateData.count),
        convenio_consultations: Number(convenioData.count) || 0,
        private_consultations: Number(privateData.count) || 0,
        total_revenue: totalRevenue,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      }
    });
    
    console.log('✅ Detailed professional report generated');
  } catch (error) {
    console.error('❌ Error generating detailed professional report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
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
      WHERE 'client' = ANY(roles) AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error generating clients by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/reports/professionals-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.city,
        u.state,
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

    // Process the aggregated data to group by category
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
        total_professionals: Number(row.total_professionals),
        categories: Array.from(categoryMap.entries()).map(([name, count]) => ({
          category_name: name,
          count: count
        }))
      };
    });

    res.json(processedData);
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PAYMENT ROUTES ====================

app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    const userId = user_id || req.user.id;

    console.log('🔄 Creating subscription payment for user:', userId);
    
    // Verify user exists and is not already active
    const userResult = await pool.query(
      'SELECT subscription_status FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // 🔥 VALIDAÇÃO: Não permitir pagamento se já ativo
    if (user.subscription_status === 'active') {
      return res.status(400).json({ message: 'Usuário já possui assinatura ativa' });
    }

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: 'Assinatura Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: 250,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'cliente@example.com'
      },
      external_reference: `subscription_${userId}_${Date.now()}`,
      back_urls: {
        success: process.env.NODE_ENV === 'production' 
          ? 'https://cartaoquiroferreira.com.br/client?payment=success'
          : 'http://localhost:5173/client?payment=success',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/client?payment=failure'
          : 'http://localhost:5173/client?payment=failure',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/client?payment=pending'
          : 'http://localhost:5173/client?payment=pending'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://cartaoquiroferreira.com.br/api/webhooks/mercadopago'
        : 'http://localhost:3001/api/webhooks/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('✅ Subscription payment preference created');

    // Save payment record
    await pool.query(`
      INSERT INTO subscription_payments (user_id, payment_id, amount, external_reference)
      VALUES ($1, $2, $3, $4)
    `, [userId, response.id, 250, preferenceData.external_reference]);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('❌ Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { amount } = req.body;

    console.log('🔄 Creating professional payment:', { professionalId, amount });
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido para pagamento' });
    }

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: 'Repasse ao Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: Number(amount),
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'profissional@example.com'
      },
      external_reference: `professional_${professionalId}_${Date.now()}`,
      back_urls: {
        success: process.env.NODE_ENV === 'production' 
          ? 'https://cartaoquiroferreira.com.br/professional?payment=success&type=professional'
          : 'http://localhost:5173/professional?payment=success&type=professional',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/professional?payment=failure&type=professional'
          : 'http://localhost:5173/professional?payment=failure&type=professional',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/professional?payment=pending&type=professional'
          : 'http://localhost:5173/professional?payment=pending&type=professional'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://cartaoquiroferreira.com.br/api/webhook/mercadopago'
        : 'http://localhost:3001/api/webhook/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('✅ Professional payment preference created');

    // Save payment record
    await pool.query(`
      INSERT INTO professional_payments (professional_id, payment_id, amount, external_reference)
      VALUES ($1, $2, $3, $4)
    `, [professionalId, response.id, amount, preferenceData.external_reference]);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('❌ Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const dependentId = parseInt(req.params.id);

    // Get dependent info
    const dependentResult = await pool.query(
      'SELECT d.*, u.name as client_name FROM dependents d JOIN users u ON d.client_id = u.id WHERE d.id = $1',
      [dependentId]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];

    console.log('Creating dependent payment for:', dependent.name);

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Ativação de Dependente - ${dependent.name}`,
          quantity: 1,
          unit_price: Number(dependent.billing_amount) || 50,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'cliente@example.com'
      },
      external_reference: `dependent_${dependentId}_${Date.now()}`,
      back_urls: {
        success: process.env.NODE_ENV === 'production' 
          ? 'https://cartaoquiroferreira.com.br/client?payment=success&type=dependent'
          : 'http://localhost:5173/client?payment=success&type=dependent',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/client?payment=failure&type=dependent'
          : 'http://localhost:5173/client?payment=failure&type=dependent',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/client?payment=pending&type=dependent'
          : 'http://localhost:5173/client?payment=pending&type=dependent'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://cartaoquiroferreira.com.br/api/webhooks/mercadopago'
        : 'http://localhost:3001/api/webhooks/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('Dependent payment preference created:', response.id);

    // Save payment record
    await pool.query(`
      INSERT INTO dependent_payments (dependent_id, payment_id, amount, external_reference)
      VALUES ($1, $2, $3, $4)
    `, [dependentId, response.id, Number(dependent.billing_amount) || 50, preferenceData.external_reference]);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// 🔥 AGENDA PAYMENT - NEW ROUTE
app.post('/api/agenda/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    
    console.log('🔄 Creating agenda payment for professional:', professionalId);
    
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: 'Acesso à Agenda - Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: 100,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'profissional@example.com'
      },
      external_reference: `agenda_${professionalId}_${Date.now()}`,
      back_urls: {
        success: process.env.NODE_ENV === 'production' 
          ? 'https://cartaoquiroferreira.com.br/professional?payment=success&type=agenda'
          : 'http://localhost:5173/professional?payment=success&type=agenda',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/professional?payment=failure&type=agenda'
          : 'http://localhost:5173/professional?payment=failure&type=agenda',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://cartaoquiroferreira.com.br/professional?payment=pending&type=agenda'
          : 'http://localhost:5173/professional?payment=pending&type=agenda'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://cartaoquiroferreira.com.br/api/webhooks/mercadopago'
        : 'http://localhost:3001/api/webhooks/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('✅ Agenda payment preference created');

    // Save payment record
    await pool.query(`
      INSERT INTO agenda_payments (professional_id, payment_id, amount, external_reference)
      VALUES ($1, $2, $3, $4)
    `, [professionalId, response.id, 100, preferenceData.external_reference]);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('❌ Error creating agenda payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== WEBHOOK ROUTES ====================

app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    console.log('🔔 MercadoPago webhook received:', req.body);

    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      
      console.log('💳 Processing payment:', paymentId);
      
      // In production, you would fetch payment details from MercadoPago API
      // For now, we'll simulate approved payment processing
      const paymentData = {
        status: 'approved',
        external_reference: `subscription_1_${Date.now()}`, // This would come from MP API
        transaction_amount: 250
      };
      
      console.log('💳 Payment data:', {
        status: paymentData.status,
        external_reference: paymentData.external_reference,
        transaction_amount: paymentData.transaction_amount
      });
      
      if (paymentData.status === 'approved') {
        const externalReference = paymentData.external_reference;
        const [paymentType, userId] = externalReference.split('_');

        if (paymentType === 'subscription') {
          // 🔥 PAGAMENTO DE ASSINATURA: 1 ano de convênio
          console.log('✅ Processing subscription payment for user:', userId);
          
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 🔥 1 ANO EXATO

          await pool.query(`
            UPDATE users SET 
              subscription_status = 'active',
              subscription_expiry = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [expiryDate, userId]);

          console.log('✅ User subscription activated for 1 year');
          
        } else if (paymentType === 'professional') {
          // 🔥 PAGAMENTO PROFISSIONAL: Zerar contas a pagar
          console.log('✅ Processing professional payment for:', professionalId);
          
          await pool.query(`
            UPDATE users SET 
              amount_to_pay = 0,
              last_payment_date = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [userId]);

          console.log('✅ Professional debts cleared');
          
        } else if (externalReference.startsWith('agenda_')) {
          // 🔥 PAGAMENTO DA AGENDA: 1 mês de acesso
          const professionalId = externalReference.split('_')[1];
          
          console.log('✅ Processing agenda payment for professional:', professionalId);
          
          // Grant 1 month of scheduling access
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1); // 🔥 1 MÊS EXATO
          
          await pool.query(`
            UPDATE users SET 
              has_scheduling_access = true,
              access_expires_at = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [expiryDate, professionalId]);
          
          console.log('✅ Professional granted 1 month of scheduling access');
          
        } else if (paymentType === 'dependent') {
          // 🔥 PAGAMENTO DE DEPENDENTE
          const dependentId = userId;
          
          console.log('✅ Processing dependent payment for:', dependentId);
          
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 🔥 1 ANO EXATO

          await pool.query(`
            UPDATE dependent_payments SET 
              status = 'approve