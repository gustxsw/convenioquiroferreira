import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import createUpload from './middleware/upload.js';
import { generateDocumentPDF } from './utils/documentGenerator.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://sdk.mercadopago.com"],
      connectSrc: ["'self'", "https://api.mercadopago.com"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://cartaoquiroferreira.com.br',
    'https://www.cartaoquiroferreira.com.br'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve static files
app.use(express.static('dist'));

// Initialize MercadoPago
const mercadoPagoClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

// Database initialization - Create tables if not exists
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database tables...');

    // Users table
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
        emergency_contact_name VARCHAR(255),
        emergency_contact_phone VARCHAR(20),
        emergency_contact_relationship VARCHAR(50),
        medical_history TEXT,
        current_medications TEXT,
        allergies TEXT,
        health_insurance_info TEXT,
        password VARCHAR(255) NOT NULL,
        roles JSONB NOT NULL DEFAULT '[]',
        category_name VARCHAR(255),
        crm VARCHAR(50),
        percentage DECIMAL(5,2) DEFAULT 50.00,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        photo_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Service categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE,
        birth_date DATE,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        billing_amount DECIMAL(10,2) DEFAULT 50.00,
        payment_reference VARCHAR(255),
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Consultations table
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
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Appointments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
        service_id INTEGER REFERENCES services(id),
        location_id INTEGER REFERENCES attendance_locations(id),
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Scheduling access table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_access (
        id SERIAL PRIMARY KEY,
        professional_id TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        granted_by VARCHAR(255),
        granted_at TIMESTAMP DEFAULT NOW(),
        reason TEXT,
        UNIQUE(professional_id)
      )
    `);

    // Medical records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Client payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_reference VARCHAR(255) UNIQUE,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        mercadopago_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Dependent payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER REFERENCES dependents(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_reference VARCHAR(255) UNIQUE,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        mercadopago_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Professional payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_reference VARCHAR(255) UNIQUE,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        mercadopago_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Agenda payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        duration_days INTEGER DEFAULT 7,
        payment_reference VARCHAR(255) UNIQUE,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        mercadopago_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
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
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    req.user = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: user.roles || [],
      currentRole: decoded.currentRole || (user.roles && user.roles[0])
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Token inválido' });
  }
};

// Authorization middleware
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.currentRole) {
      return res.status(403).json({ message: 'Acesso não autorizado - role não definida' });
    }

    if (!roles.includes(req.user.currentRole)) {
      return res.status(403).json({ message: 'Acesso não autorizado para esta role' });
    }

    next();
  };
};

// Scheduling access middleware
const requireSchedulingAccess = async (req, res, next) => {
  try {
    const professionalId = req.user.id.toString();
    
    const result = await pool.query(`
      SELECT expires_at 
      FROM scheduling_access 
      WHERE professional_id = $1 AND expires_at > NOW()
    `, [professionalId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ 
        message: 'Acesso à agenda não autorizado. Adquira o acesso para continuar.' 
      });
    }

    next();
  } catch (error) {
    console.error('Error checking scheduling access:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

// Initialize database on startup
initializeDatabase().catch(console.error);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(
      'SELECT id, name, cpf, password, roles FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const userRoles = user.roles || [];
    const needsRoleSelection = userRoles.length > 1;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: userRoles
      },
      needsRoleSelection
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Select role
app.post('/api/auth/select-role', async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: 'userId e role são obrigatórios' });
    }

    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    const userRoles = user.roles || [];

    if (!userRoles.includes(role)) {
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
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: userRoles,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('Role selection error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Switch role
app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ message: 'Role é obrigatória' });
    }

    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    const token = jwt.sign(
      { id: req.user.id, currentRole: role },
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

// Register (client only)
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, password
    } = req.body;

    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cleanCpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING id, name, cpf, email, roles
    `, [
      name.trim(),
      cleanCpf,
      email?.trim() || null,
      phone?.replace(/\D/g, '') || null,
      birth_date || null,
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      hashedPassword,
      JSON.stringify(['client']),
      'pending'
    ]);

    res.status(201).json({
      message: 'Conta criada com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// ==================== USER MANAGEMENT ROUTES ====================

// Get all users (admin only)
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    console.log('🔄 Fetching all users...');
    
    const result = await pool.query(`
      SELECT 
        id,
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
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        medical_history,
        current_medications,
        allergies,
        health_insurance_info,
        roles,
        category_name,
        crm,
        percentage,
        subscription_status,
        subscription_expiry,
        photo_url,
        notes,
        created_at
      FROM users 
      ORDER BY created_at DESC
    `);
    
    console.log('✅ Users loaded:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get single user
app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        medical_history, current_medications, allergies, health_insurance_info,
        roles, category_name, crm, percentage, subscription_status, 
        subscription_expiry, photo_url, notes, created_at
      FROM users WHERE id = $1
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
      address_complement, neighborhood, city, state, zip_code,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      medical_history, current_medications, allergies, health_insurance_info,
      password, roles, category_name, crm, percentage, subscription_status,
      subscription_expiry, notes
    } = req.body;
    
    console.log('🔄 Creating new user:', { name, cpf, roles });
    
    // Validate required fields
    if (!name || !cpf || !password || !roles || roles.length === 0) {
      return res.status(400).json({ 
        message: 'Nome, CPF, senha e pelo menos uma role são obrigatórios' 
      });
    }
    
    // Validate CPF format
    const cleanCpf = cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }
    
    // Check if CPF already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cleanCpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        medical_history, current_medications, allergies, health_insurance_info,
        password, roles, category_name, crm, percentage, subscription_status,
        subscription_expiry, notes, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW()
      ) RETURNING id, name, cpf, email, phone, roles, category_name, subscription_status, created_at
    `, [
      name.trim(),
      cleanCpf,
      email?.trim() || null,
      phone?.replace(/\D/g, '') || null,
      birth_date || null,
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null,
      emergency_contact_name?.trim() || null,
      emergency_contact_phone?.replace(/\D/g, '') || null,
      emergency_contact_relationship?.trim() || null,
      medical_history?.trim() || null,
      current_medications?.trim() || null,
      allergies?.trim() || null,
      health_insurance_info?.trim() || null,
      hashedPassword,
      JSON.stringify(roles),
      category_name?.trim() || null,
      crm?.trim() || null,
      percentage ? parseFloat(percentage) : (roles.includes('professional') ? 50.00 : null),
      subscription_status || (roles.includes('client') ? 'pending' : null),
      subscription_expiry || null,
      notes?.trim() || null
    ]);
    
    console.log('✅ User created successfully:', result.rows[0]);
    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// Update user (admin only)
app.put('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      medical_history, current_medications, allergies, health_insurance_info,
      password, roles, category_name, crm, percentage, subscription_status,
      subscription_expiry, notes
    } = req.body;
    
    console.log('🔄 Updating user:', { id, name, roles });
    
    // Validate required fields
    if (!name || !roles || roles.length === 0) {
      return res.status(400).json({ 
        message: 'Nome e pelo menos uma role são obrigatórios' 
      });
    }
    
    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    let updateQuery = `
      UPDATE users 
      SET name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
          address_number = $6, address_complement = $7, neighborhood = $8,
          city = $9, state = $10, zip_code = $11, emergency_contact_name = $12,
          emergency_contact_phone = $13, emergency_contact_relationship = $14,
          medical_history = $15, current_medications = $16, allergies = $17,
          health_insurance_info = $18, roles = $19, category_name = $20,
          crm = $21, percentage = $22, subscription_status = $23,
          subscription_expiry = $24, notes = $25, updated_at = NOW()
    `;
    
    let queryParams = [
      name.trim(),
      email?.trim() || null,
      phone?.replace(/\D/g, '') || null,
      birth_date || null,
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null,
      emergency_contact_name?.trim() || null,
      emergency_contact_phone?.replace(/\D/g, '') || null,
      emergency_contact_relationship?.trim() || null,
      medical_history?.trim() || null,
      current_medications?.trim() || null,
      allergies?.trim() || null,
      health_insurance_info?.trim() || null,
      JSON.stringify(roles),
      category_name?.trim() || null,
      crm?.trim() || null,
      percentage ? parseFloat(percentage) : null,
      subscription_status || null,
      subscription_expiry || null,
      notes?.trim() || null
    ];
    
    // Add password update if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password = $${queryParams.length + 1}`;
      queryParams.push(hashedPassword);
    }
    
    updateQuery += ` WHERE id = $${queryParams.length + 1} RETURNING id, name, cpf, email, phone, roles, category_name, subscription_status, created_at`;
    queryParams.push(id);
    
    const result = await pool.query(updateQuery, queryParams);
    
    console.log('✅ User updated successfully:', result.rows[0]);
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
    
    console.log('🔄 Deleting user:', id);
    
    // Check if user exists
    const existingUser = await pool.query('SELECT id, name FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    console.log('✅ User deleted successfully:', existingUser.rows[0].name);
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting user:', error);
    if (error.code === '23503') {
      res.status(400).json({ 
        message: 'Não é possível excluir este usuário pois ele possui dados relacionados no sistema' 
      });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// Get user subscription status
app.get('/api/users/:id/subscription-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT subscription_status, subscription_expiry FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICE CATEGORIES ROUTES ====================

// Get service categories
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

    const result = await pool.query(
      'INSERT INTO service_categories (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description?.trim() || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICES ROUTES ====================

// Get services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, sc.name as category_name
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY s.name
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
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [
      name.trim(),
      description?.trim() || null,
      parseFloat(base_price),
      category_id || null,
      is_base_service || false
    ]);

    res.status(201).json(result.rows[0]);
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
      WHERE id = $6 RETURNING *
    `, [
      name.trim(),
      description?.trim() || null,
      parseFloat(base_price),
      category_id || null,
      is_base_service || false,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete service (admin only)
app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting service:', error);
    if (error.code === '23503') {
      res.status(400).json({ message: 'Não é possível excluir este serviço pois ele está sendo usado' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// ==================== DEPENDENTS ROUTES ====================

// Get dependents by client
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM dependents 
      WHERE client_id = $1 
      ORDER BY created_at DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create dependent
app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    if (!client_id || !name) {
      return res.status(400).json({ message: 'client_id e nome são obrigatórios' });
    }

    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;

    // Check if CPF already exists (if provided)
    if (cleanCpf) {
      const existingCpf = await pool.query(
        'SELECT id FROM dependents WHERE cpf = $1 UNION SELECT id FROM users WHERE cpf = $1',
        [cleanCpf]
      );
      if (existingCpf.rows.length > 0) {
        return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
      }
    }

    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date, subscription_status, billing_amount)
      VALUES ($1, $2, $3, $4, 'pending', 50.00) RETURNING *
    `, [client_id, name.trim(), cleanCpf, birth_date || null]);

    res.status(201).json(result.rows[0]);
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

    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2, updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [name.trim(), birth_date || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete dependent
app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Lookup dependent by CPF
app.get('/api/dependents/lookup', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        d.*,
        u.name as client_name,
        u.subscription_status as client_subscription_status,
        d.subscription_status as dependent_subscription_status
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
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== CLIENTS ROUTES ====================

// Lookup client by CPF
app.get('/api/clients/lookup', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT id, name, cpf, subscription_status
      FROM users 
      WHERE cpf = $1 AND roles::text LIKE '%client%'
    `, [cleanCpf]);

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

// Get professionals (for clients)
app.get('/api/professionals', authenticate, authorize(['client']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, email, phone, address, address_number, address_complement,
        neighborhood, city, state, category_name, photo_url
      FROM users 
      WHERE roles::text LIKE '%professional%'
      ORDER BY name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals:', error);
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
        COALESCE(u.name, d.name, pp.name) as client_name,
        s.name as service_name,
        prof.name as professional_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN false
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users prof ON c.professional_id = prof.id
    `;

    let queryParams = [];

    if (req.user.currentRole === 'professional') {
      query += ' WHERE c.professional_id = $1';
      queryParams.push(req.user.id);
    }

    query += ' ORDER BY c.date DESC';

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get consultations by client
app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await pool.query(`
      SELECT 
        c.*,
        COALESCE(u.name, d.name) as client_name,
        s.name as service_name,
        prof.name as professional_name,
        CASE 
          WHEN c.client_id IS NOT NULL THEN false
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users prof ON c.professional_id = prof.id
      WHERE c.client_id = $1 OR c.dependent_id IN (
        SELECT id FROM dependents WHERE client_id = $1
      )
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create consultation
app.post('/api/consultations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, service_id, location_id,
      value, date, appointment_date, appointment_time, create_appointment
    } = req.body;

    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'service_id, value e date são obrigatórios' });
    }

    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    // Create consultation
    const consultationResult = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *
    `, [
      client_id || null,
      dependent_id || null,
      private_patient_id || null,
      req.user.id,
      service_id,
      location_id || null,
      parseFloat(value),
      new Date(date)
    ]);

    let appointmentResult = null;

    // Create appointment if requested
    if (create_appointment && appointment_date && appointment_time) {
      appointmentResult = await pool.query(`
        INSERT INTO appointments (
          professional_id, private_patient_id, service_id, location_id,
          appointment_date, appointment_time, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', NOW()) RETURNING *
      `, [
        req.user.id,
        private_patient_id || null,
        service_id,
        location_id || null,
        appointment_date,
        appointment_time
      ]);
    }

    res.status(201).json({
      message: 'Consulta registrada com sucesso',
      consultation: consultationResult.rows[0],
      appointment: appointmentResult?.rows[0] || null
    });
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== APPOINTMENTS ROUTES ====================

// Get appointments
app.get('/api/appointments', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const { date } = req.query;
    
    let query = `
      SELECT 
        a.*,
        pp.name as patient_name,
        pp.phone as patient_phone,
        s.name as service_name,
        al.name as location_name
      FROM appointments a
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      WHERE a.professional_id = $1
    `;

    let queryParams = [req.user.id];

    if (date) {
      query += ' AND a.appointment_date = $2';
      queryParams.push(date);
    }

    query += ' ORDER BY a.appointment_date, a.appointment_time';

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create appointment
app.post('/api/appointments', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const {
      private_patient_id, service_id, location_id,
      appointment_date, appointment_time, notes
    } = req.body;

    if (!private_patient_id || !service_id || !appointment_date || !appointment_time) {
      return res.status(400).json({ 
        message: 'private_patient_id, service_id, appointment_date e appointment_time são obrigatórios' 
      });
    }

    const result = await pool.query(`
      INSERT INTO appointments (
        professional_id, private_patient_id, service_id, location_id,
        appointment_date, appointment_time, notes, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', NOW()) RETURNING *
    `, [
      req.user.id,
      private_patient_id,
      service_id,
      location_id || null,
      appointment_date,
      appointment_time,
      notes || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update appointment
app.put('/api/appointments/:id', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      private_patient_id, service_id, location_id,
      appointment_date, appointment_time, notes, status
    } = req.body;

    const result = await pool.query(`
      UPDATE appointments 
      SET private_patient_id = $1, service_id = $2, location_id = $3,
          appointment_date = $4, appointment_time = $5, notes = $6, status = $7
      WHERE id = $8 AND professional_id = $9 RETURNING *
    `, [
      private_patient_id,
      service_id,
      location_id || null,
      appointment_date,
      appointment_time,
      notes || null,
      status || 'scheduled',
      id,
      req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM appointments WHERE id = $1 AND professional_id = $2 RETURNING *',
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

// ==================== SCHEDULING ACCESS ROUTES ====================

// Get professionals with scheduling access status (admin only)
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    console.log('🔄 Fetching professionals with scheduling access status...');
    
    const result = await pool.query(`
      SELECT 
        u.id::text as id,
        u.name,
        u.email,
        u.phone,
        COALESCE(u.category_name, 'Sem categoria') as category_name,
        COALESCE(sa.has_access, false) as has_scheduling_access,
        sa.expires_at as access_expires_at,
        sa.granted_by as access_granted_by,
        sa.granted_at as access_granted_at,
        sa.reason as access_reason
      FROM users u
      LEFT JOIN (
        SELECT 
          professional_id,
          true as has_access,
          expires_at,
          granted_by,
          granted_at,
          reason
        FROM scheduling_access 
        WHERE expires_at > NOW()
      ) sa ON sa.professional_id = u.id::text
      WHERE u.roles::text LIKE '%professional%'
      ORDER BY u.name
    `);
    
    console.log('✅ Found professionals:', result.rows.length);
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
    
    console.log('🔄 Granting scheduling access:', { professional_id, expires_at, reason });
    
    if (!professional_id || !expires_at) {
      return res.status(400).json({ message: 'professional_id e expires_at são obrigatórios' });
    }
    
    // Validate professional exists and has professional role
    const professionalCheck = await pool.query(
      'SELECT id, name, roles FROM users WHERE id = $1',
      [professional_id]
    );
    
    if (professionalCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }
    
    const professional = professionalCheck.rows[0];
    if (!professional.roles || !professional.roles.includes('professional')) {
      return res.status(400).json({ message: 'Usuário não é um profissional' });
    }

    // Delete existing access first (to avoid duplicates)
    await pool.query(
      'DELETE FROM scheduling_access WHERE professional_id = $1',
      [professional_id]
    );
    
    // Insert new scheduling access
    const result = await pool.query(`
      INSERT INTO scheduling_access (professional_id, expires_at, granted_by, granted_at, reason)
      VALUES ($1::text, $2, $3, NOW(), $4)
      RETURNING *
    `, [professional_id, expires_at, req.user.name, reason || null]);
    
    console.log('✅ Scheduling access granted:', result.rows[0]);

    res.json({ 
      message: 'Acesso à agenda concedido com sucesso',
      access: result.rows[0]
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
    
    console.log('🔄 Revoking scheduling access for professional:', professional_id);
    
    if (!professional_id) {
      return res.status(400).json({ message: 'professional_id é obrigatório' });
    }

    await pool.query(
      'DELETE FROM scheduling_access WHERE professional_id = $1::text',
      [professional_id]
    );
    
    console.log('✅ Scheduling access revoked for professional:', professional_id);

    res.json({ message: 'Acesso à agenda revogado com sucesso' });
  } catch (error) {
    console.error('Error revoking scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Check professional scheduling access status
app.get('/api/professional/scheduling-access-status', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const professionalId = req.user.id.toString();
    console.log('🔄 Checking scheduling access for professional:', professionalId);
    
    const result = await pool.query(`
      SELECT 
        CASE WHEN sa.expires_at > NOW() THEN true ELSE false END as has_access,
        CASE WHEN sa.expires_at IS NOT NULL AND sa.expires_at < NOW() THEN true ELSE false END as is_expired,
        expires_at,
        CASE WHEN sa.professional_id IS NULL THEN true ELSE false END as can_purchase
      FROM (SELECT $1::text as prof_id) p
      LEFT JOIN scheduling_access sa ON sa.professional_id = p.prof_id
    `, [professionalId]);
    
    const accessData = result.rows[0] || {
      has_access: false,
      is_expired: false,
      expires_at: null,
      can_purchase: true
    };
    
    console.log('✅ Scheduling access status:', accessData);

    res.json({
      hasAccess: accessData.has_access,
      isExpired: accessData.is_expired,
      expiresAt: accessData.expires_at,
      canPurchase: accessData.can_purchase
    });
  } catch (error) {
    console.error('Error checking scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PRIVATE PATIENTS ROUTES ====================

// Get private patients
app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

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

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;

    // Check if CPF already exists (if provided)
    if (cleanCpf) {
      const existingCpf = await pool.query(
        'SELECT id FROM private_patients WHERE cpf = $1 UNION SELECT id FROM users WHERE cpf = $1 UNION SELECT id FROM dependents WHERE cpf = $1',
        [cleanCpf]
      );
      if (existingCpf.rows.length > 0) {
        return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
      }
    }

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address,
        address_number, address_complement, neighborhood, city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *
    `, [
      req.user.id,
      name.trim(),
      cleanCpf,
      email?.trim() || null,
      phone?.replace(/\D/g, '') || null,
      birth_date || null,
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null
    ]);

    res.status(201).json(result.rows[0]);
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
      SET name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
          address_number = $6, address_complement = $7, neighborhood = $8,
          city = $9, state = $10, zip_code = $11
      WHERE id = $12 AND professional_id = $13 RETURNING *
    `, [
      name.trim(),
      email?.trim() || null,
      phone?.replace(/\D/g, '') || null,
      birth_date || null,
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null,
      id,
      req.user.id
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

// Delete private patient
app.delete('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING *',
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

// ==================== ATTENDANCE LOCATIONS ROUTES ====================

// Get attendance locations
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
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create attendance location
app.post('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
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
        [req.user.id]
      );
    }

    const result = await pool.query(`
      INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
    `, [
      req.user.id,
      name.trim(),
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null,
      phone?.replace(/\D/g, '') || null,
      is_default || false
    ]);

    res.status(201).json(result.rows[0]);
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
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default
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
      WHERE id = $11 AND professional_id = $12 RETURNING *
    `, [
      name.trim(),
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null,
      phone?.replace(/\D/g, '') || null,
      is_default || false,
      id,
      req.user.id
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

// Delete attendance location
app.delete('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2 RETURNING *',
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

// ==================== MEDICAL RECORDS ROUTES ====================

// Get medical records
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.*,
        pp.name as patient_name
      FROM medical_records mr
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
      private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, vital_signs
    } = req.body;

    if (!private_patient_id) {
      return res.status(400).json({ message: 'private_patient_id é obrigatório' });
    }

    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *
    `, [
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
      vital_signs ? JSON.stringify(vital_signs) : null
    ]);

    res.status(201).json(result.rows[0]);
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
      SET chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
          medications = $4, allergies = $5, physical_examination = $6,
          diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
          updated_at = NOW()
      WHERE id = $11 AND professional_id = $12 RETURNING *
    `, [
      chief_complaint?.trim() || null,
      history_present_illness?.trim() || null,
      past_medical_history?.trim() || null,
      medications?.trim() || null,
      allergies?.trim() || null,
      physical_examination?.trim() || null,
      diagnosis?.trim() || null,
      treatment_plan?.trim() || null,
      notes?.trim() || null,
      vital_signs ? JSON.stringify(vital_signs) : null,
      id,
      req.user.id
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

// Delete medical record
app.delete('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM medical_records WHERE id = $1 AND professional_id = $2 RETURNING *',
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

// Generate medical record document
app.post('/api/medical-records/generate-document', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { record_id, template_data } = req.body;

    if (!record_id || !template_data) {
      return res.status(400).json({ message: 'record_id e template_data são obrigatórios' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF('medical_record', template_data);

    // Save document reference
    await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url, template_data
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user.id,
      template_data.private_patient_id || null,
      `Prontuário - ${template_data.patientName}`,
      'medical_record',
      documentResult.url,
      JSON.stringify(template_data)
    ]);

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

// Get medical documents
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
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create medical document
app.post('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({ 
        message: 'title, document_type e template_data são obrigatórios' 
      });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url, template_data
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [
      req.user.id,
      private_patient_id || null,
      title.trim(),
      document_type,
      documentResult.url,
      JSON.stringify(template_data)
    ]);

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

// ==================== PAYMENT ROUTES ====================

// Create subscription payment (client)
app.post('/api/create-subscription', authenticate, authorize(['client']), async (req, res) => {
  try {
    const { user_id } = req.body;
    const amount = 250; // Fixed subscription amount

    console.log('🔄 Creating subscription payment for user:', user_id);

    // Check if user already has active subscription
    const userCheck = await pool.query(
      'SELECT subscription_status FROM users WHERE id = $1',
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    if (userCheck.rows[0].subscription_status === 'active') {
      return res.status(400).json({ message: 'Usuário já possui assinatura ativa' });
    }

    const paymentReference = `SUB_${user_id}_${Date.now()}`;

    // Create payment record
    await pool.query(`
      INSERT INTO client_payments (client_id, amount, payment_reference, payment_status)
      VALUES ($1, $2, $3, 'pending')
    `, [user_id, amount, paymentReference]);

    // Create MercadoPago preference
    const preference = new Preference(mercadoPagoClient);
    
    const preferenceData = {
      items: [{
        id: paymentReference,
        title: 'Assinatura Cartão Quiro Ferreira',
        description: 'Assinatura mensal do convênio de saúde',
        quantity: 1,
        unit_price: amount
      }],
      payer: {
        email: req.user.email || 'cliente@cartaoquiroferreira.com.br'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/client?payment=success",
        failure: "https://cartaoquiroferreira.com.br/client?payment=failure",
        pending: "https://cartaoquiroferreira.com.br/client?payment=pending"
      },
      auto_return: "approved",
      external_reference: paymentReference,
      notification_url: `${process.env.NODE_ENV === 'production' ? 'https://cartaoquiroferreira.com.br' : 'http://localhost:3001'}/api/webhooks/mercadopago`
    };

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Subscription payment preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      payment_reference: paymentReference
    });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create dependent payment
app.post('/api/dependents/:id/create-payment', authenticate, authorize(['client']), async (req, res) => {
  try {
    const { id } = req.params;
    const amount = 50; // Fixed dependent amount

    console.log('🔄 Creating dependent payment for dependent:', id);

    // Check if dependent exists and belongs to user
    const dependentCheck = await pool.query(
      'SELECT * FROM dependents WHERE id = $1 AND client_id = $2',
      [id, req.user.id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentCheck.rows[0];

    if (dependent.subscription_status === 'active') {
      return res.status(400).json({ message: 'Dependente já possui assinatura ativa' });
    }

    const paymentReference = `DEP_${id}_${Date.now()}`;

    // Create payment record
    await pool.query(`
      INSERT INTO dependent_payments (dependent_id, amount, payment_reference, payment_status)
      VALUES ($1, $2, $3, 'pending')
    `, [id, amount, paymentReference]);

    // Create MercadoPago preference
    const preference = new Preference(mercadoPagoClient);
    
    const preferenceData = {
      items: [{
        id: paymentReference,
        title: `Assinatura Dependente - ${dependent.name}`,
        description: 'Assinatura mensal do dependente',
        quantity: 1,
        unit_price: amount
      }],
      payer: {
        email: req.user.email || 'cliente@cartaoquiroferreira.com.br'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/client?payment=success&type=dependent",
        failure: "https://cartaoquiroferreira.com.br/client?payment=failure&type=dependent",
        pending: "https://cartaoquiroferreira.com.br/client?payment=pending&type=dependent"
      },
      auto_return: "approved",
      external_reference: paymentReference,
      notification_url: `${process.env.NODE_ENV === 'production' ? 'https://cartaoquiroferreira.com.br' : 'http://localhost:3001'}/api/webhooks/mercadopago`
    };

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Dependent payment preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      payment_reference: paymentReference
    });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }

    console.log('🔄 Creating professional payment for amount:', amount);

    const paymentReference = `PROF_${req.user.id}_${Date.now()}`;

    // Create payment record
    await pool.query(`
      INSERT INTO professional_payments (professional_id, amount, payment_reference, payment_status)
      VALUES ($1, $2, $3, 'pending')
    `, [req.user.id, amount, paymentReference]);

    // Create MercadoPago preference
    const preference = new Preference(mercadoPagoClient);
    
    const preferenceData = {
      items: [{
        id: paymentReference,
        title: 'Repasse ao Convênio Quiro Ferreira',
        description: 'Pagamento de consultas realizadas',
        quantity: 1,
        unit_price: amount
      }],
      payer: {
        email: req.user.email || 'profissional@cartaoquiroferreira.com.br'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/professional?payment=success",
        failure: "https://cartaoquiroferreira.com.br/professional?payment=failure",
        pending: "https://cartaoquiroferreira.com.br/professional?payment=pending"
      },
      auto_return: "approved",
      external_reference: paymentReference,
      notification_url: `${process.env.NODE_ENV === 'production' ? 'https://cartaoquiroferreira.com.br' : 'http://localhost:3001'}/api/webhooks/mercadopago`
    };

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Professional payment preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      payment_reference: paymentReference
    });
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create agenda payment
app.post('/api/professional/create-agenda-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { duration_days = 30 } = req.body;
    const amount = 24.99; // Fixed agenda access amount

    console.log('🔄 Creating agenda payment for professional:', req.user.id);

    const paymentReference = `AGENDA_${req.user.id}_${Date.now()}`;

    // Create payment record
    await pool.query(`
      INSERT INTO agenda_payments (professional_id, amount, duration_days, payment_reference, payment_status)
      VALUES ($1, $2, $3, $4, 'pending')
    `, [req.user.id, amount, duration_days, paymentReference]);

    // Create MercadoPago preference
    const preference = new Preference(mercadoPagoClient);
    
    const preferenceData = {
      items: [{
        id: paymentReference,
        title: 'Acesso à Agenda - Quiro Ferreira',
        description: `Acesso ao sistema de agendamentos por ${duration_days} dias`,
        quantity: 1,
        unit_price: amount
      }],
      payer: {
        email: req.user.email || 'profissional@cartaoquiroferreira.com.br'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/professional/scheduling?payment=success&type=agenda",
        failure: "https://cartaoquiroferreira.com.br/professional/scheduling?payment=failure&type=agenda",
        pending: "https://cartaoquiroferreira.com.br/professional/scheduling?payment=pending&type=agenda"
      },
      auto_return: "approved",
      external_reference: paymentReference,
      notification_url: `${process.env.NODE_ENV === 'production' ? 'https://cartaoquiroferreira.com.br' : 'http://localhost:3001'}/api/webhooks/mercadopago`
    };

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Agenda payment preference created:', response.id);

    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      payment_reference: paymentReference
    });
  } catch (error) {
    console.error('Error creating agenda payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// ==================== WEBHOOK ROUTES ====================

// MercadoPago webhook
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    console.log('🔔 MercadoPago webhook received:', req.body);

    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      
      // Get payment details from MercadoPago
      const { Payment } = await import('mercadopago');
      const payment = new Payment(mercadoPagoClient);
      const paymentData = await payment.get({ id: paymentId });

      console.log('💰 Payment data from MP:', paymentData);

      const externalReference = paymentData.external_reference;
      const status = paymentData.status;

      if (status === 'approved') {
        // Process approved payment
        if (externalReference.startsWith('SUB_')) {
          // Subscription payment
          const userId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE users 
            SET subscription_status = 'active', 
                subscription_expiry = NOW() + INTERVAL '1 year'
            WHERE id = $1
          `, [userId]);

          await pool.query(`
            UPDATE client_payments 
            SET payment_status = 'approved', processed_at = NOW(), mercadopago_id = $1
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Subscription activated for user:', userId);

        } else if (externalReference.startsWith('DEP_')) {
          // Dependent payment
          const dependentId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE dependents 
            SET subscription_status = 'active', 
                subscription_expiry = NOW() + INTERVAL '1 year',
                activated_at = NOW()
            WHERE id = $1
          `, [dependentId]);

          await pool.query(`
            UPDATE dependent_payments 
            SET payment_status = 'approved', processed_at = NOW(), mercadopago_id = $1
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Dependent subscription activated:', dependentId);

        } else if (externalReference.startsWith('PROF_')) {
          // Professional payment
          await pool.query(`
            UPDATE professional_payments 
            SET payment_status = 'approved', processed_at = NOW(), mercadopago_id = $1
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Professional payment processed:', externalReference);

        } else if (externalReference.startsWith('AGENDA_')) {
          // Agenda payment
          const professionalId = externalReference.split('_')[1];
          
          // Get payment details to get duration
          const paymentDetails = await pool.query(
            'SELECT duration_days FROM agenda_payments WHERE payment_reference = $1',
            [externalReference]
          );

          const durationDays = paymentDetails.rows[0]?.duration_days || 30;

          // Grant scheduling access
          await pool.query(`
            INSERT INTO scheduling_access (professional_id, expires_at, granted_by, reason)
            VALUES ($1::text, NOW() + INTERVAL '${durationDays} days', 'Sistema - Pagamento', 'Acesso adquirido via pagamento')
            ON CONFLICT (professional_id) 
            DO UPDATE SET 
              expires_at = NOW() + INTERVAL '${durationDays} days',
              granted_by = 'Sistema - Pagamento',
              granted_at = NOW(),
              reason = 'Acesso adquirido via pagamento'
          `, [professionalId]);

          await pool.query(`
            UPDATE agenda_payments 
            SET payment_status = 'approved', processed_at = NOW(), mercadopago_id = $1
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Agenda access granted for professional:', professionalId);
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== REPORTS ROUTES ====================

// Revenue report (admin)
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'start_date e end_date são obrigatórios' });
    }

    console.log('🔄 Generating revenue report:', { start_date, end_date });

    // Get revenue by professional (only convenio consultations)
    const professionalRevenue = await pool.query(`
      SELECT 
        prof.name as professional_name,
        COALESCE(prof.percentage, 50.00) as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (COALESCE(prof.percentage, 50.00) / 100)), 0) as professional_payment,
        COALESCE(SUM(c.value * ((100 - COALESCE(prof.percentage, 50.00)) / 100)), 0) as clinic_revenue
      FROM users prof
      LEFT JOIN consultations c ON c.professional_id = prof.id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      WHERE prof.roles::text LIKE '%professional%'
      GROUP BY prof.id, prof.name, prof.percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get revenue by service (only convenio consultations)
    const serviceRevenue = await pool.query(`
      SELECT 
        s.name as service_name,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count
      FROM services s
      LEFT JOIN consultations c ON c.service_id = s.id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      GROUP BY s.id, s.name
      HAVING COUNT(c.id) > 0
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Calculate total revenue (only convenio consultations)
    const totalRevenue = await pool.query(`
      SELECT COALESCE(SUM(value), 0) as total
      FROM consultations 
      WHERE date >= $1 AND date <= $2
        AND (client_id IS NOT NULL OR dependent_id IS NOT NULL)
    `, [start_date, end_date]);

    const report = {
      total_revenue: parseFloat(totalRevenue.rows[0].total),
      revenue_by_professional: professionalRevenue.rows.map(row => ({
        professional_name: row.professional_name,
        professional_percentage: parseFloat(row.professional_percentage),
        revenue: parseFloat(row.revenue),
        consultation_count: parseInt(row.consultation_count),
        professional_payment: parseFloat(row.professional_payment),
        clinic_revenue: parseFloat(row.clinic_revenue)
      })),
      revenue_by_service: serviceRevenue.rows.map(row => ({
        service_name: row.service_name,
        revenue: parseFloat(row.revenue),
        consultation_count: parseInt(row.consultation_count)
      }))
    };

    console.log('✅ Revenue report generated:', report);
    res.json(report);
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
      return res.status(400).json({ message: 'start_date e end_date são obrigatórios' });
    }

    console.log('🔄 Generating professional revenue report for user:', req.user.id);

    // Get professional percentage
    const professionalData = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const percentage = professionalData.rows[0]?.percentage || 50.00;

    // Get consultations for the period (only convenio consultations for payment calculation)
    const consultations = await pool.query(`
      SELECT 
        c.date,
        COALESCE(u.name, d.name) as client_name,
        s.name as service_name,
        c.value as total_value,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 0
          ELSE c.value * ((100 - $3) / 100)
        END as amount_to_pay
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `, [req.user.id, start_date, percentage, end_date]);

    // Calculate summary
    const summary = await pool.query(`
      SELECT 
        $2 as professional_percentage,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(
          CASE 
            WHEN c.private_patient_id IS NOT NULL THEN 0
            ELSE c.value * ((100 - $2) / 100)
          END
        ), 0) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $3 AND c.date <= $4
    `, [req.user.id, percentage, start_date, end_date]);

    const report = {
      summary: {
        professional_percentage: parseFloat(percentage),
        total_revenue: parseFloat(summary.rows[0].total_revenue),
        consultation_count: parseInt(summary.rows[0].consultation_count),
        amount_to_pay: parseFloat(summary.rows[0].amount_to_pay)
      },
      consultations: consultations.rows.map(row => ({
        date: row.date,
        client_name: row.client_name,
        service_name: row.service_name,
        total_value: parseFloat(row.total_value),
        amount_to_pay: parseFloat(row.amount_to_pay)
      }))
    };

    console.log('✅ Professional revenue report generated');
    res.json(report);
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
      return res.status(400).json({ message: 'start_date e end_date são obrigatórios' });
    }

    console.log('🔄 Generating detailed professional report for user:', req.user.id);

    // Get professional percentage
    const professionalData = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const percentage = professionalData.rows[0]?.percentage || 50.00;

    // Get detailed summary
    const summary = await pool.query(`
      SELECT 
        COUNT(c.id) as total_consultations,
        COUNT(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 1 END) as convenio_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NOT NULL THEN 1 END) as private_consultations,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value ELSE 0 END), 0) as convenio_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN c.value ELSE 0 END), 0) as private_revenue,
        $2 as professional_percentage,
        COALESCE(SUM(
          CASE 
            WHEN c.private_patient_id IS NOT NULL THEN 0
            ELSE c.value * ((100 - $2) / 100)
          END
        ), 0) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $3 AND c.date <= $4
    `, [req.user.id, percentage, start_date, end_date]);

    const report = {
      summary: {
        total_consultations: parseInt(summary.rows[0].total_consultations),
        convenio_consultations: parseInt(summary.rows[0].convenio_consultations),
        private_consultations: parseInt(summary.rows[0].private_consultations),
        total_revenue: parseFloat(summary.rows[0].total_revenue),
        convenio_revenue: parseFloat(summary.rows[0].convenio_revenue),
        private_revenue: parseFloat(summary.rows[0].private_revenue),
        professional_percentage: parseFloat(summary.rows[0].professional_percentage),
        amount_to_pay: parseFloat(summary.rows[0].amount_to_pay)
      }
    };

    console.log('✅ Detailed professional report generated');
    res.json(report);
  } catch (error) {
    console.error('Error generating detailed professional report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Clients by city report (admin)
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
      WHERE roles::text LIKE '%client%' 
        AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error generating clients by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Professionals by city report (admin)
app.get('/api/reports/professionals-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        city,
        state,
        COUNT(*) as total_professionals,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'category_name', COALESCE(category_name, 'Sem categoria'),
            'count', 1
          )
        ) as categories
      FROM users 
      WHERE roles::text LIKE '%professional%' 
        AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY total_professionals DESC
    `);

    // Process categories to group by name
    const processedResult = result.rows.map(row => {
      const categoryMap = new Map();
      
      row.categories.forEach(cat => {
        const name = cat.category_name;
        if (categoryMap.has(name)) {
          categoryMap.set(name, categoryMap.get(name) + cat.count);
        } else {
          categoryMap.set(name, cat.count);
        }
      });

      return {
        ...row,
        categories: Array.from(categoryMap.entries()).map(([name, count]) => ({
          category_name: name,
          count: count
        }))
      };
    });

    res.json(processedResult);
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== IMAGE UPLOAD ROUTES ====================

// Upload image
app.post('/api/upload-image', authenticate, async (req, res) => {
  try {
    const upload = createUpload();
    
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ message: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
      }

      const imageUrl = req.file.path;

      // Update user photo URL
      await pool.query(
        'UPDATE users SET photo_url = $1 WHERE id = $2',
        [imageUrl, req.user.id]
      );

      console.log('✅ Image uploaded successfully:', imageUrl);

      res.json({
        message: 'Imagem enviada com sucesso',
        imageUrl: imageUrl
      });
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== ADMIN ROUTES ====================

// Get all dependents (admin only)
app.get('/api/admin/dependents', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        u.name as client_name
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS enabled for production domains`);
});

export default app;