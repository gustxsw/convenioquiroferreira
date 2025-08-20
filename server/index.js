import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { authenticate, authorize } from './middleware/auth.js';
import createUpload from './middleware/upload.js';
import { generateDocumentPDF } from './utils/documentGenerator.js';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
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
app.use(express.json());
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
        password_hash VARCHAR(255) NOT NULL,
        roles TEXT[] DEFAULT ARRAY['client'],
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        photo_url TEXT,
        category_id INTEGER,
        professional_percentage DECIMAL(5,2) DEFAULT 50.00,
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

// Auth routes
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
        address_complement, neighborhood, city, state, password_hash, roles
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
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, password_hash, roles FROM users WHERE cpf = $1',
      [cpf]
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

// User subscription status route
app.get('/api/users/:id/subscription-status', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Get user subscription status
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

// Users routes
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.roles, u.subscription_status,
        u.subscription_expiry, u.created_at, u.category_id, u.professional_percentage,
        u.crm, u.photo_url, sc.name as category_name
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
        u.subscription_expiry, u.created_at, u.category_id, u.professional_percentage,
        u.crm, u.photo_url, sc.name as category_name
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

// Client lookup route
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

// Dependents routes
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

// Dependent lookup by CPF
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

// Professionals routes
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles, u.address, u.address_number,
        u.address_complement, u.neighborhood, u.city, u.state, u.photo_url,
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

// Services routes
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

// Service categories routes
app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM service_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service categories:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Consultations routes
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        COALESCE(u_client.name, d.name, pp.name) as client_name,
        u_prof.name as professional_name,
        s.name as service_name,
        CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN services s ON c.service_id = s.id
      ORDER BY c.date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Consultations by client
app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    const result = await pool.query(`
      SELECT 
        c.*,
        COALESCE(u_client.name, d.name) as client_name,
        u_prof.name as professional_name,
        s.name as service_name,
        CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = $1 OR d.client_id = $1
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Private patients routes
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

// Medical records routes
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

// Medical documents routes
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

// Attendance locations routes
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

// Reports routes
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
        u.professional_percentage,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count,
        SUM(c.value * (u.professional_percentage / 100)) as professional_payment,
        SUM(c.value * ((100 - u.professional_percentage) / 100)) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY u.id, u.name, u.professional_percentage
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

    // Calculate total revenue
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

// Professional revenue report
app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional percentage
    const profResult = await pool.query(
      'SELECT professional_percentage FROM users WHERE id = $1',
      [professionalId]
    );

    const professionalPercentage = profResult.rows[0]?.professional_percentage || 50;

    // Get consultations for the period
    const consultationsResult = await pool.query(`
      SELECT 
        c.date,
        COALESCE(u_client.name, d.name, pp.name) as client_name,
        s.name as service_name,
        c.value as total_value,
        c.value * ($3 / 100) as amount_to_pay
      FROM consultations c
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `, [professionalId, start_date, 100 - professionalPercentage, end_date]);

    // Calculate summary
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as consultation_count,
        SUM(c.value) as total_revenue,
        SUM(c.value * ($2 / 100)) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $3 AND c.date <= $4
    `, [professionalId, 100 - professionalPercentage, start_date, end_date]);

    const summary = summaryResult.rows[0];

    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: Number(summary.total_revenue) || 0,
        consultation_count: Number(summary.consultation_count) || 0,
        amount_to_pay: Number(summary.amount_to_pay) || 0
      },
      consultations: consultationsResult.rows
    });
  } catch (error) {
    console.error('Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Reports by city
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

// MercadoPago payment routes
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    const userId = user_id || req.user.id;

    console.log('Creating subscription payment for user:', userId);

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
          ? 'https://www.cartaoquiroferreira.com.br/client?payment=success'
          : 'http://localhost:5173/client?payment=success',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://www.cartaoquiroferreira.com.br/client?payment=failure'
          : 'http://localhost:5173/client?payment=failure',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://www.cartaoquiroferreira.com.br/client?payment=pending'
          : 'http://localhost:5173/client?payment=pending'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://www.cartaoquiroferreira.com.br/api/webhooks/mercadopago'
        : 'http://localhost:3001/api/webhooks/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('Subscription preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Professional payment route
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido' });
    }

    console.log('Creating professional payment:', { professionalId, amount });

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
          ? 'https://www.cartaoquiroferreira.com.br/professional?payment=success'
          : 'http://localhost:5173/professional?payment=success',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://www.cartaoquiroferreira.com.br/professional?payment=failure'
          : 'http://localhost:5173/professional?payment=failure',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://www.cartaoquiroferreira.com.br/professional?payment=pending'
          : 'http://localhost:5173/professional?payment=pending'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://www.cartaoquiroferreira.com.br/api/webhooks/mercadopago'
        : 'http://localhost:3001/api/webhooks/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('Professional payment preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Dependent payment route
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
          ? 'https://www.cartaoquiroferreira.com.br/client?payment=success&type=dependent'
          : 'http://localhost:5173/client?payment=success&type=dependent',
        failure: process.env.NODE_ENV === 'production'
          ? 'https://www.cartaoquiroferreira.com.br/client?payment=failure&type=dependent'
          : 'http://localhost:5173/client?payment=failure&type=dependent',
        pending: process.env.NODE_ENV === 'production'
          ? 'https://www.cartaoquiroferreira.com.br/client?payment=pending&type=dependent'
          : 'http://localhost:5173/client?payment=pending&type=dependent'
      },
      auto_return: 'approved',
      notification_url: process.env.NODE_ENV === 'production'
        ? 'https://www.cartaoquiroferreira.com.br/api/webhooks/mercadopago'
        : 'http://localhost:3001/api/webhooks/mercadopago'
    };

    const response = await preference.create({ body: preferenceData });
    
    console.log('Dependent payment preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// MercadoPago webhook
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    console.log('🔔 MercadoPago webhook received:', req.body);

    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      
      // Get payment details from MercadoPago
      // Note: In production, you would fetch payment details from MercadoPago API
      // For now, we'll process based on external_reference pattern
      
      console.log('Processing payment webhook for payment ID:', paymentId);
      
      // This is a simplified webhook handler
      // In production, you should verify the payment status with MercadoPago API
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// Image upload route
app.post('/api/upload-image', authenticate, authorize(['professional']), async (req, res) => {
  try {
    console.log('🔄 Image upload request received');
    
    // Create upload middleware
    const upload = createUpload();
    
    // Use multer middleware
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('❌ Upload error:', err);
        return res.status(400).json({ 
          message: err.message || 'Erro no upload da imagem' 
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
      }

      try {
        console.log('✅ Image uploaded successfully:', req.file.path);
        
        // Update user photo_url in database
        const userId = req.user.id;
        await pool.query(
          'UPDATE users SET photo_url = $1 WHERE id = $2',
          [req.file.path, userId]
        );

        console.log('✅ User photo_url updated in database');

        res.json({
          message: 'Imagem enviada com sucesso',
          imageUrl: req.file.path
        });
      } catch (dbError) {
        console.error('❌ Database update error:', dbError);
        res.status(500).json({ message: 'Erro ao salvar URL da imagem' });
      }
    });
  } catch (error) {
    console.error('❌ Image upload route error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});