import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import puppeteer from 'puppeteer';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

// Security middleware
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
// ============================================================================

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: {
    timeout: 5000,
    idempotencyKey: 'your-idempotency-key'
  }
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn('⚠️ MP_ACCESS_TOKEN not found in environment variables');
  } else {
    mercadoPago = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
      options: {
        timeout: 5000,
        idempotencyKey: 'mp-key-' + Date.now()
      }
    });
    console.log('✅ MercadoPago SDK v2 configured successfully');
  }
} catch (error) {
  console.error('❌ Error configuring MercadoPago:', error);
}

// ============================================================================
// CLOUDINARY CONFIGURATION
// ============================================================================

try {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
    console.log('✅ Cloudinary configured successfully');
  } else {
    console.warn('⚠️ Cloudinary credentials not found');
  }
} catch (error) {
  console.error('❌ Error configuring Cloudinary:', error);
}

// Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'quiro-ferreira/uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto:good'
      }
    ]
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
  }
});

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database tables...');

    // Users table with all fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address VARCHAR(500),
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
        known_allergies TEXT,
        health_insurance_info TEXT,
        password VARCHAR(255) NOT NULL,
        roles JSONB NOT NULL DEFAULT '[]',
        category_name VARCHAR(255),
        crm VARCHAR(50),
        percentage DECIMAL(5,2) DEFAULT 50.00,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry DATE,
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
        name VARCHAR(255) NOT NULL UNIQUE,
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
        client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        birth_date DATE,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry DATE,
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
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11),
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address VARCHAR(500),
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
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(500),
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
        professional_id INTEGER NOT NULL REFERENCES users(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
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
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    // Medical records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Medical documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        template_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Scheduling access table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_access (
        id SERIAL PRIMARY KEY,
        professional_id TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        granted_by VARCHAR(255) NOT NULL,
        granted_at TIMESTAMP DEFAULT NOW(),
        reason TEXT,
        UNIQUE(professional_id)
      )
    `);

    // Client payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mp_preference_id VARCHAR(255) NOT NULL,
        mp_payment_id VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_type VARCHAR(50) DEFAULT 'subscription',
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Dependent payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER NOT NULL REFERENCES dependents(id) ON DELETE CASCADE,
        mp_preference_id VARCHAR(255) NOT NULL,
        mp_payment_id VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Professional payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mp_preference_id VARCHAR(255) NOT NULL,
        mp_payment_id VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_type VARCHAR(50) DEFAULT 'clinic_fee',
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Agenda payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mp_preference_id VARCHAR(255) NOT NULL,
        mp_payment_id VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL,
        duration_days INTEGER DEFAULT 30,
        status VARCHAR(50) DEFAULT 'pending',
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    // Insert default service categories if they don't exist
    await pool.query(`
      INSERT INTO service_categories (name, description) 
      VALUES 
        ('Fisioterapia', 'Serviços de fisioterapia e reabilitação'),
        ('Psicologia', 'Atendimento psicológico e terapêutico'),
        ('Nutrição', 'Consultas nutricionais e planejamento alimentar'),
        ('Medicina Geral', 'Consultas médicas gerais'),
        ('Odontologia', 'Serviços odontológicos'),
        ('Enfermagem', 'Serviços de enfermagem'),
        ('Outros', 'Outros serviços de saúde')
      ON CONFLICT (name) DO NOTHING
    `);

    // Insert default services if they don't exist
    const categoryResult = await pool.query('SELECT id FROM service_categories WHERE name = $1', ['Fisioterapia']);
    if (categoryResult.rows.length > 0) {
      const categoryId = categoryResult.rows[0].id;
      await pool.query(`
        INSERT INTO services (name, description, base_price, category_id, is_base_service) 
        VALUES 
          ('Consulta Fisioterapêutica', 'Avaliação e tratamento fisioterapêutico', 80.00, $1, true),
          ('Sessão de Fisioterapia', 'Sessão de tratamento fisioterapêutico', 60.00, $1, false)
        ON CONFLICT DO NOTHING
      `, [categoryId]);
    }

    // Insert default system settings
    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      VALUES 
        ('subscription_price', '250.00', 'Preço da assinatura mensal para clientes'),
        ('dependent_price', '50.00', 'Preço da assinatura mensal para dependentes'),
        ('agenda_access_price', '24.99', 'Preço do acesso à agenda para profissionais'),
        ('default_professional_percentage', '50.00', 'Porcentagem padrão dos profissionais'),
        ('system_name', 'Convênio Quiro Ferreira', 'Nome do sistema'),
        ('contact_phone', '(64) 98124-9199', 'Telefone de contato'),
        ('contact_email', 'contato@quiroferreira.com.br', 'Email de contato')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
};

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token de acesso não fornecido' });
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

    const subscriptionResult = await mercadopago.preferences.create(preference);
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Token inválido' });
  }
};

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

// Middleware to check scheduling access for professionals
const checkSchedulingAccess = async (req, res, next) => {
  try {
    if (req.user.currentRole !== 'professional') {
      return next();
    }

    const professionalId = req.user.id.toString();
    const result = await pool.query(`
      SELECT expires_at 
      FROM scheduling_access 
      WHERE professional_id = $1 AND expires_at > NOW()
    `, [professionalId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ 
        message: 'Acesso à agenda não autorizado. Entre em contato com o administrador.' 
      });
    }

    next();
  } catch (error) {
    console.error('Error checking scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateToken = (user, currentRole) => {
  return jwt.sign(
    { 
      id: user.id, 
      currentRole: currentRole 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

const formatCpf = (cpf) => {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const formatPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

const validateCpf = (cpf) => {
  const cleaned = cpf.replace(/\D/g, '');
  return /^\d{11}$/.test(cleaned);
};

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

// Login route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    console.log('🔄 Login attempt for CPF:', cpf);

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    if (!validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF inválido' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(
      'SELECT id, name, cpf, password, roles FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'CPF não encontrado' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Senha incorreta' });
    }

    const userRoles = user.roles || [];
    console.log('✅ Login successful for user:', user.name, 'Roles:', userRoles);

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        roles: userRoles
      },
      needsRoleSelection: userRoles.length > 1
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

    console.log('🔄 Role selection:', { userId, role });

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

    const token = generateToken(user, role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('✅ Role selected successfully:', role);

    res.json({
      message: 'Role selecionada com sucesso',
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

    const token = generateToken(req.user, role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Role alterada com sucesso',
      token,
      user: {
        ...req.user,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('Switch role error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Register route (for clients only)
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, password
    } = req.body;

    console.log('🔄 Registration attempt for:', name);

    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    if (!validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF inválido' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Senha deve ter pelo menos 6 caracteres' });
    }

    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    // Check if CPF already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cleanCpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING id, name, cpf, email, roles, subscription_status
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

    console.log('✅ User registered successfully:', result.rows[0]);

    res.status(201).json({
      message: 'Usuário registrado com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// Logout route
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// ============================================================================
// USER MANAGEMENT ROUTES (ADMIN)
// ============================================================================

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
        known_allergies,
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

// Get single user (admin only)
app.get('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        medical_history, current_medications, known_allergies, health_insurance_info,
        roles, category_name, crm, percentage, subscription_status, subscription_expiry,
        photo_url, notes, created_at
      FROM users 
      WHERE id = $1
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
      medical_history, current_medications, known_allergies, health_insurance_info,
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
    if (!validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }
    
    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    // Check if CPF already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cleanCpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user with all fields
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        medical_history, current_medications, known_allergies, health_insurance_info,
        password, roles, category_name, crm, percentage, subscription_status,
        subscription_expiry, notes, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, NOW()
      )
      RETURNING id, name, cpf, email, phone, roles, category_name, subscription_status, created_at
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
      known_allergies?.trim() || null,
      health_insurance_info?.trim() || null,
      hashedPassword,
      JSON.stringify(roles),
      category_name?.trim() || null,
      crm?.trim() || null,
      percentage || (roles.includes('professional') ? 50.00 : null),
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
      medical_history, current_medications, known_allergies, health_insurance_info,
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
    
    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    
    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    let updateQuery = `
      UPDATE users 
      SET 
        name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
        address_number = $6, address_complement = $7, neighborhood = $8,
        city = $9, state = $10, zip_code = $11, emergency_contact_name = $12,
        emergency_contact_phone = $13, emergency_contact_relationship = $14,
        medical_history = $15, current_medications = $16, known_allergies = $17,
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
      known_allergies?.trim() || null,
      health_insurance_info?.trim() || null,
      JSON.stringify(roles),
      category_name?.trim() || null,
      crm?.trim() || null,
      percentage || null,
      subscription_status || null,
      subscription_expiry || null,
      notes?.trim() || null
    ];
    
    // Add password update if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password = $26`;
      queryParams.push(hashedPassword);
    }
    
    updateQuery += ` WHERE id = $${queryParams.length + 1} RETURNING *`;
    queryParams.push(id);
    
    const result = await pool.query(updateQuery, queryParams);
    
    console.log('✅ User updated successfully:', result.rows[0].name);
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
    
    // Delete user (cascade will handle related records)
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

// ============================================================================
// SERVICE CATEGORIES ROUTES
// ============================================================================

// Get all service categories
app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, created_at 
      FROM service_categories 
      ORDER BY name
    `);
    
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
      return res.status(400).json({ message: 'Nome da categoria é obrigatório' });
    }
    
    const result = await pool.query(`
      INSERT INTO service_categories (name, description, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `, [name.trim(), description?.trim() || null]);
    
    res.status(201).json({
      message: 'Categoria criada com sucesso',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating service category:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'Categoria já existe' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// ============================================================================
// SERVICES ROUTES
// ============================================================================

// Get all services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.description,
        s.base_price,
        s.category_id,
        s.is_base_service,
        s.created_at,
        sc.name as category_name
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
    
    if (isNaN(base_price) || base_price <= 0) {
      return res.status(400).json({ message: 'Preço base deve ser um valor válido maior que zero' });
    }
    
    const result = await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [
      name.trim(),
      description?.trim() || null,
      parseFloat(base_price),
      category_id || null,
      is_base_service || false
    ]);
    
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
    
    if (!name || !base_price) {
      return res.status(400).json({ message: 'Nome e preço base são obrigatórios' });
    }
    
    if (isNaN(base_price) || base_price <= 0) {
      return res.status(400).json({ message: 'Preço base deve ser um valor válido maior que zero' });
    }
    
    const result = await pool.query(`
      UPDATE services 
      SET name = $1, description = $2, base_price = $3, category_id = $4, is_base_service = $5
      WHERE id = $6
      RETURNING *
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
    
    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING name', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }
    
    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting service:', error);
    if (error.code === '23503') {
      res.status(400).json({ 
        message: 'Não é possível excluir este serviço pois ele está sendo usado em consultas' 
      });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// ============================================================================
// DEPENDENTS ROUTES
// ============================================================================

// Get dependents by client ID
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, client_id, name, cpf, birth_date, subscription_status,
        subscription_expiry, billing_amount, payment_reference,
        activated_at, created_at
      FROM dependents 
      WHERE client_id = $1 
      ORDER BY created_at DESC
    `, [clientId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Lookup dependent by CPF
app.get('/api/dependents/lookup', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { cpf } = req.query;
    
    if (!cpf || !validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF inválido' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    const result = await pool.query(`
      SELECT 
        d.id,
        d.name,
        d.cpf,
        d.client_id,
        d.subscription_status as dependent_subscription_status,
        u.name as client_name,
        u.subscription_status as client_subscription_status
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

// Create dependent
app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;
    
    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'client_id, nome e CPF são obrigatórios' });
    }
    
    if (!validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF inválido' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    // Check if CPF already exists
    const existingCpf = await pool.query(`
      SELECT 'user' as type FROM users WHERE cpf = $1
      UNION
      SELECT 'dependent' as type FROM dependents WHERE cpf = $1
    `, [cleanCpf]);
    
    if (existingCpf.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }
    
    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [client_id, name.trim(), cleanCpf, birth_date || null]);
    
    res.status(201).json({
      message: 'Dependente criado com sucesso',
      dependent: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating dependent:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// Update dependent
app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }
    
    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2
      WHERE id = $3
      RETURNING *
    `, [name.trim(), birth_date || null, id]);
    
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
    
    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING name', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }
    
    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ============================================================================
// CLIENTS ROUTES
// ============================================================================

// Lookup client by CPF
app.get('/api/clients/lookup', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { cpf } = req.query;
    
    if (!cpf || !validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF inválido' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    const result = await pool.query(`
      SELECT id, name, cpf, subscription_status, subscription_expiry
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

// ============================================================================
// PROFESSIONALS ROUTES
// ============================================================================

// Get all professionals (for clients)
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

// ============================================================================
// PRIVATE PATIENTS ROUTES
// ============================================================================

// Get private patients for professional
app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code, created_at
      FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY name
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
    
    // Validate CPF if provided
    if (cpf && !validateCpf(cpf)) {
      return res.status(400).json({ message: 'CPF inválido' });
    }
    
    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
    
    // Check if CPF already exists (if provided)
    if (cleanCpf) {
      const existingCpf = await pool.query(`
        SELECT 'user' as type FROM users WHERE cpf = $1
        UNION
        SELECT 'dependent' as type FROM dependents WHERE cpf = $1
        UNION
        SELECT 'private_patient' as type FROM private_patients WHERE cpf = $1
      `, [cleanCpf]);
      
      if (existingCpf.rows.length > 0) {
        return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
      }
    }
    
    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address,
        address_number, address_complement, neighborhood, city, state,
        zip_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
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
    
    res.status(201).json({
      message: 'Paciente criado com sucesso',
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating private patient:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
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
    
    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }
    
    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    
    const result = await pool.query(`
      UPDATE private_patients 
      SET 
        name = $1, email = $2, phone = $3, birth_date = $4, address = $5,
        address_number = $6, address_complement = $7, neighborhood = $8,
        city = $9, state = $10, zip_code = $11
      WHERE id = $12 AND professional_id = $13
      RETURNING *
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
      'DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING name',
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

// ============================================================================
// ATTENDANCE LOCATIONS ROUTES
// ============================================================================

// Get attendance locations for professional
app.get('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default, created_at
      FROM attendance_locations 
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
      return res.status(400).json({ message: 'Nome do local é obrigatório' });
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
        neighborhood, city, state, zip_code, phone, is_default, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
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
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Nome do local é obrigatório' });
    }
    
    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2',
        [req.user.id, id]
      );
    }
    
    const result = await pool.query(`
      UPDATE attendance_locations 
      SET 
        name = $1, address = $2, address_number = $3, address_complement = $4,
        neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9,
        is_default = $10
      WHERE id = $11 AND professional_id = $12
      RETURNING *
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
      'DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2 RETURNING name',
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

// ============================================================================
// CONSULTATIONS ROUTES
// ============================================================================

// Get all consultations (admin only)
app.get('/api/consultations', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.value,
        c.date,
        c.notes,
        c.created_at,
        COALESCE(u.name, d.name) as client_name,
        CASE WHEN c.dependent_id IS NOT NULL THEN true ELSE false END as is_dependent,
        s.name as service_name,
        p.name as professional_name,
        p.percentage as professional_percentage,
        al.name as location_name
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN users p ON c.professional_id = p.id
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

// Get consultations by client ID
app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        c.id,
        c.value,
        c.date,
        c.notes,
        c.created_at,
        COALESCE(u.name, d.name) as client_name,
        CASE WHEN c.dependent_id IS NOT NULL THEN true ELSE false END as is_dependent,
        s.name as service_name,
        p.name as professional_name
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN users p ON c.professional_id = p.id
      LEFT JOIN services s ON c.service_id = s.id
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
      value, date, notes, appointment_date, appointment_time, create_appointment
    } = req.body;
    
    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }
    
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }
    
    if (isNaN(value) || value <= 0) {
      return res.status(400).json({ message: 'Valor deve ser um número maior que zero' });
    }
    
    // Insert consultation
    const consultationResult = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, date, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      client_id || null,
      dependent_id || null,
      private_patient_id || null,
      req.user.id,
      service_id,
      location_id || null,
      parseFloat(value),
      new Date(date),
      notes?.trim() || null
    ]);
    
    let appointmentResult = null;
    
    // Create appointment if requested
    if (create_appointment && appointment_date && appointment_time && private_patient_id) {
      appointmentResult = await pool.query(`
        INSERT INTO appointments (
          professional_id, private_patient_id, service_id, location_id,
          appointment_date, appointment_time, status, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, NOW())
        RETURNING *
      `, [
        req.user.id,
        private_patient_id,
        service_id,
        location_id || null,
        appointment_date,
        appointment_time,
        notes?.trim() || null
      ]);
    }
    
    console.log('✅ Consultation created successfully:', consultationResult.rows[0]);
    
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

// ============================================================================
// APPOINTMENTS ROUTES (WITH SCHEDULING ACCESS CHECK)
// ============================================================================

// Get appointments for professional
app.get('/api/appointments', authenticate, authorize(['professional']), checkSchedulingAccess, async (req, res) => {
  try {
    const { date } = req.query;
    
    let query = `
      SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        a.created_at,
        pp.name as patient_name,
        pp.phone as patient_phone,
        'private' as patient_type,
        s.name as service_name,
        al.name as location_name
      FROM appointments a
      LEFT JOIN private_patients pp ON a.private_patient_id = pp.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN attendance_locations al ON a.location_id = al.id
      WHERE a.professional_id = $1
    `;
    
    const queryParams = [req.user.id];
    
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
app.post('/api/appointments', authenticate, authorize(['professional']), checkSchedulingAccess, async (req, res) => {
  try {
    const {
      private_patient_id, service_id, location_id, appointment_date,
      appointment_time, notes
    } = req.body;
    
    if (!private_patient_id || !service_id || !appointment_date || !appointment_time) {
      return res.status(400).json({ 
        message: 'Paciente, serviço, data e horário são obrigatórios' 
      });
    }
    
    // Check if patient belongs to this professional
    const patientCheck = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );
    
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }
    
    const result = await pool.query(`
      INSERT INTO appointments (
        professional_id, private_patient_id, service_id, location_id,
        appointment_date, appointment_time, status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, NOW())
      RETURNING *
    `, [
      req.user.id,
      private_patient_id,
      service_id,
      location_id || null,
      appointment_date,
      appointment_time,
      notes?.trim() || null
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
app.put('/api/appointments/:id', authenticate, authorize(['professional']), checkSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      private_patient_id, service_id, location_id, appointment_date,
      appointment_time, status, notes
    } = req.body;
    
    const result = await pool.query(`
      UPDATE appointments 
      SET 
        private_patient_id = $1, service_id = $2, location_id = $3,
        appointment_date = $4, appointment_time = $5, status = $6, notes = $7
      WHERE id = $8 AND professional_id = $9
      RETURNING *
    `, [
      private_patient_id || null,
      service_id || null,
      location_id || null,
      appointment_date,
      appointment_time,
      status || 'scheduled',
      notes?.trim() || null,
      id,
      req.user.id
    ]);
    
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
app.delete('/api/appointments/:id', authenticate, authorize(['professional']), checkSchedulingAccess, async (req, res) => {
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

// ============================================================================
// MEDICAL RECORDS ROUTES
// ============================================================================

// Get medical records for professional
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.id,
        mr.chief_complaint,
        mr.history_present_illness,
        mr.past_medical_history,
        mr.medications,
        mr.allergies,
        mr.physical_examination,
        mr.diagnosis,
        mr.treatment_plan,
        mr.notes,
        mr.vital_signs,
        mr.created_at,
        mr.updated_at,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
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
      return res.status(400).json({ message: 'Paciente é obrigatório' });
    }
    
    // Check if patient belongs to this professional
    const patientCheck = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );
    
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }
    
    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
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
      SET 
        chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
        medications = $4, allergies = $5, physical_examination = $6,
        diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
        updated_at = NOW()
      WHERE id = $11 AND professional_id = $12
      RETURNING *
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

// Generate medical record document
app.post('/api/medical-records/generate-document', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { record_id, template_data } = req.body;
    
    if (!record_id || !template_data) {
      return res.status(400).json({ message: 'ID do prontuário e dados do template são obrigatórios' });
    }
    
    // Generate HTML document
    const htmlContent = generateMedicalRecordHTML(template_data);
    
    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:text/html;base64,${Buffer.from(htmlContent).toString('base64')}`,
      {
        folder: 'quiro-ferreira/medical-records',
        resource_type: 'raw',
        format: 'html',
        public_id: `medical_record_${record_id}_${Date.now()}`,
        use_filename: false,
        unique_filename: true
      }
    );
    
    res.json({
      message: 'Documento gerado com sucesso',
      documentUrl: uploadResult.secure_url
    });
  } catch (error) {
    console.error('Error generating medical record document:', error);
    res.status(500).json({ message: 'Erro ao gerar documento' });
  }
});

// ============================================================================
// MEDICAL DOCUMENTS ROUTES
// ============================================================================

// Get medical documents for professional
app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        md.id,
        md.title,
        md.document_type,
        md.document_url,
        md.created_at,
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
        message: 'Título, tipo de documento e dados do template são obrigatórios' 
      });
    }
    
    // Generate HTML document based on type
    const htmlContent = generateDocumentHTML(document_type, template_data);
    
    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:text/html;base64,${Buffer.from(htmlContent).toString('base64')}`,
      {
        folder: 'quiro-ferreira/documents',
        resource_type: 'raw',
        format: 'html',
        public_id: `document_${document_type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        use_filename: false,
        unique_filename: true
      }
    );
    
    // Save document record
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type,
        document_url, template_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [
      req.user.id,
      private_patient_id || null,
      title.trim(),
      document_type,
      uploadResult.secure_url,
      JSON.stringify(template_data)
    ]);
    
    res.status(201).json({
      message: 'Documento criado com sucesso',
      title: title,
      documentUrl: uploadResult.secure_url,
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento' });
  }
});

// ============================================================================
// SCHEDULING ACCESS ROUTES (ADMIN)
// ============================================================================

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

// ============================================================================
// PAYMENT ROUTES (MERCADO PAGO SDK v2)
// ============================================================================

// Create subscription payment for client
app.post('/api/create-subscription', authenticate, authorize(['client']), async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ message: 'user_id é obrigatório' });
    }
    
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
    
    if (!mercadoPago) {
      return res.status(500).json({ message: 'Serviço de pagamento não configurado' });
    }
    
    const preference = new Preference(mercadoPago);
    
    const preferenceData = {
      items: [
        {
          id: 'subscription',
          title: 'Assinatura Convênio Quiro Ferreira',
          description: 'Assinatura mensal do convênio de saúde',
          quantity: 1,
          unit_price: 250.00,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'cliente@example.com'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/client?payment=success",
        failure: "https://cartaoquiroferreira.com.br/client?payment=failure",
        pending: "https://cartaoquiroferreira.com.br/client?payment=pending"
      },
      auto_return: "approved",
      notification_url: "https://cartaoquiroferreira.com.br/api/webhook/mercadopago",
      external_reference: `subscription_${user_id}_${Date.now()}`,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const response = await preference.create({ body: preferenceData });
    
    // Save payment record
    await pool.query(`
      INSERT INTO client_payments (user_id, mp_preference_id, amount, status, payment_type, created_at)
      VALUES ($1, $2, $3, 'pending', 'subscription', NOW())
    `, [user_id, response.id, 250.00]);
    
    console.log('✅ Subscription payment preference created:', response.id);
    console.log('✅ Subscription preference created:', subscriptionResult.id);
    res.json({
      preference_id: response.id,
      preference_id: subscriptionResult.id,
      init_point: subscriptionResult.init_point
    });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create dependent payment
app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if dependent exists and belongs to user
    const dependentResult = await pool.query(`
      SELECT d.*, u.name as client_name 
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.id = $1 AND d.client_id = $2
    `, [id, req.user.id]);
    
    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }
    
    const dependent = dependentCheck.rows[0];
    
    if (dependent.subscription_status === 'active') {
      return res.status(400).json({ message: 'Dependente já possui assinatura ativa' });
    }
    
    if (!mercadoPago) {
      return res.status(500).json({ message: 'Serviço de pagamento não configurado' });
    }
    
    const preference = new Preference(mercadoPago);
    
    const preferenceData = {
      items: [
        {
          id: 'dependent',
          title: `Assinatura Dependente - ${dependent.name}`,
          description: 'Assinatura mensal para dependente',
          quantity: 1,
          unit_price: 50.00,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'cliente@example.com'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/client?payment=success&type=dependent",
        failure: "https://cartaoquiroferreira.com.br/client?payment=failure&type=dependent",
        pending: "https://cartaoquiroferreira.com.br/client?payment=pending&type=dependent"
      },
      auto_return: "approved",
      notification_url: "https://cartaoquiroferreira.com.br/api/webhook/mercadopago",
      external_reference: `dependent_${id}_${Date.now()}`,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const response = await preference.create({ body: preferenceData });
    
    // Save payment record
    await pool.query(`
      INSERT INTO dependent_payments (dependent_id, mp_preference_id, amount, status, created_at)
      VALUES ($1, $2, $3, 'pending', NOW())
    `, [id, response.id, 50.00]);
    
    console.log('✅ Dependent payment preference created:', response.id);
    
    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point
    const dependentPaymentResult = await mercadopago.preferences.create(preference);
  } catch (error) {
    console.log('✅ Dependent preference created:', dependentPaymentResult.id);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
      preference_id: dependentPaymentResult.id,
      init_point: dependentPaymentResult.init_point
// Create professional payment (clinic fee)
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido' });
    }
    
    if (!mercadoPago) {
      return res.status(500).json({ message: 'Serviço de pagamento não configurado' });
    }
    
    const preference = new Preference(mercadoPago);
    
    const preference = new Preference(client);
    
    const preferenceData = {
        {
          id: 'clinic_fee',
          title: 'Repasse ao Convênio Quiro Ferreira',
          description: 'Valor a ser repassado ao convênio referente às consultas realizadas',
          quantity: 1,
          unit_price: parseFloat(amount),
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'profissional@example.com'
      },
      back_urls: {
        success: "https://cartaoquiroferreira.com.br/professional?payment=success",
        failure: "https://cartaoquiroferreira.com.br/professional?payment=failure",
        pending: "https://cartaoquiroferreira.com.br/professional?payment=pending"
      },
      auto_return: "approved",
      notification_url: "https://cartaoquiroferreira.com.br/api/webhook/mercadopago",
      external_reference: `professional_${req.user.id}_${Date.now()}`,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const response = await preference.create({ body: preferenceData });
    const professionalResult = await mercadopago.preferences.create(preference);
    // Save payment record
    console.log('✅ Professional preference created:', professionalResult.id);
      INSERT INTO professional_payments (professional_id, mp_preference_id, amount, status, payment_type, created_at)
      VALUES ($1, $2, $3, 'pending', 'clinic_fee', NOW())
      preference_id: professionalResult.id,
      init_point: professionalResult.init_point
    console.log('✅ Professional payment preference created:', response.id);
    
    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point
    });
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create agenda access payment
    const preference = new Preference(client);
    
    const preferenceData = {
  try {
    const { duration_days } = req.body;
    const days = duration_days || 30;
    
    if (!mercadoPago) {
      return res.status(500).json({ message: 'Serviço de pagamento não configurado' });
    }
    
    const preference = new Preference(mercadoPago);
    
    const preferenceData = {
      items: [
        {
          id: 'agenda_access',
          title: `Acesso à Agenda - ${days} dias`,
          description: 'Acesso ao sistema de agendamentos por período determinado',
          quantity: 1,
          unit_price: 24.99,
          currency_id: 'BRL'
        }
      ],
      payer: {
        email: 'profissional@example.com'
    const agendaResult = await preference.create({ body: preferenceData });
      back_urls: {
    console.log('✅ Agenda preference created:', agendaResult.id);
        failure: "https://cartaoquiroferreira.com.br/professional/scheduling?payment=failure&type=agenda",
        pending: "https://cartaoquiroferreira.com.br/professional/scheduling?payment=pending&type=agenda"
      preference_id: agendaResult.id,
      init_point: agendaResult.init_point
      notification_url: "https://cartaoquiroferreira.com.br/api/webhook/mercadopago",
      external_reference: `agenda_${req.user.id}_${Date.now()}`,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const response = await preference.create({ body: preferenceData });
    const subscriptionResult = await preference.create({ body: preferenceData });
    // Save payment record
    await pool.query(`
      INSERT INTO agenda_payments (professional_id, mp_preference_id, amount, duration_days, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
    `, [req.user.id, response.id, 24.99, days]);
    
    console.log('✅ Agenda payment preference created:', response.id);
    
    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point
    });
  } catch (error) {
    console.error('Error creating agenda payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// ============================================================================
// MERCADO PAGO WEBHOOK
// ============================================================================

app.post('/api/webhook/mercadopago', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('🔔 MercadoPago webhook received');
    
    const body = JSON.parse(req.body.toString());
    console.log('Webhook data:', body);
    
    if (body.type === 'payment') {
      const paymentId = body.data.id;
      
      // Here you would typically verify the payment with MercadoPago API
      // For now, we'll process based on external_reference
      
      // Find payment record and update status
      const externalRef = body.external_reference || '';
      
      if (externalRef.startsWith('subscription_')) {
        const userId = externalRef.split('_')[1];
        
        // Update client subscription
        await pool.query(`
          UPDATE users 
          SET subscription_status = 'active', subscription_expiry = $1
          WHERE id = $2
        `, [new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), userId]);
        
        // Update payment record
        await pool.query(`
          UPDATE client_payments 
          SET status = 'approved', mp_payment_id = $1, processed_at = NOW()
          WHERE external_reference = $2
        `, [paymentId, externalRef]);
        
        console.log('✅ Subscription activated for user:', userId);
        
      } else if (externalRef.startsWith('dependent_')) {
        const dependentId = externalRef.split('_')[1];
        
        // Update dependent subscription
        await pool.query(`
          UPDATE dependents 
          SET subscription_status = 'active', subscription_expiry = $1, activated_at = NOW()
          WHERE id = $2
        `, [new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dependentId]);
        
        // Update payment record
        await pool.query(`
          UPDATE dependent_payments 
          SET status = 'approved', mp_payment_id = $1, processed_at = NOW()
          WHERE external_reference = $2
        `, [paymentId, externalRef]);
        
        console.log('✅ Dependent subscription activated:', dependentId);
        
      } else if (externalRef.startsWith('professional_')) {
        const professionalId = externalRef.split('_')[1];
        
        // Update payment record
        await pool.query(`
          UPDATE professional_payments 
          SET status = 'approved', mp_payment_id = $1, processed_at = NOW()
          WHERE external_reference = $2
        `, [paymentId, externalRef]);
        
        console.log('✅ Professional payment processed:', professionalId);
        
      } else if (externalRef.startsWith('agenda_')) {
        const professionalId = externalRef.split('_')[1];
        
        // Get payment details
        const paymentDetails = await pool.query(
          'SELECT duration_days FROM agenda_payments WHERE external_reference = $1',
          [externalRef]
        );
        
        if (paymentDetails.rows.length > 0) {
          const durationDays = paymentDetails.rows[0].duration_days;
          const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
          
          // Grant scheduling access
          await pool.query(`
            INSERT INTO scheduling_access (professional_id, expires_at, granted_by, granted_at, reason)
            VALUES ($1::text, $2, 'Sistema (Pagamento)', NOW(), 'Acesso adquirido via pagamento')
            ON CONFLICT (professional_id) 
            DO UPDATE SET 
              expires_at = EXCLUDED.expires_at,
              granted_by = EXCLUDED.granted_by,
              granted_at = NOW(),
              reason = EXCLUDED.reason
          `, [professionalId, expiresAt]);
          
          // Update payment record
          await pool.query(`
            UPDATE agenda_payments 
            SET status = 'approved', mp_payment_id = $1, processed_at = NOW()
            WHERE external_reference = $2
          `, [paymentId, externalRef]);
          
          console.log('✅ Agenda access granted for professional:', professionalId);
        }
      }
    }
    
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ message: 'Erro ao processar webhook' });
  }
});

// ============================================================================
// REPORTS ROUTES
// ============================================================================

// Revenue report (admin only)
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
        p.name as professional_name,
        COALESCE(p.percentage, 50.00) as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (COALESCE(p.percentage, 50.00) / 100)), 0) as professional_payment,
        COALESCE(SUM(c.value * ((100 - COALESCE(p.percentage, 50.00)) / 100)), 0) as clinic_revenue
      FROM users p
      LEFT JOIN consultations c ON c.professional_id = p.id 
        AND c.date >= $1 AND c.date <= $2
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
        AND c.private_patient_id IS NULL
      WHERE p.roles::text LIKE '%professional%'
      GROUP BY p.id, p.name, p.percentage
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
        AND c.private_patient_id IS NULL
      GROUP BY s.id, s.name
      HAVING COUNT(c.id) > 0
      ORDER BY revenue DESC
    `, [start_date, end_date]);
    
    // Calculate total revenue (only convenio consultations)
    const totalRevenue = professionalRevenue.rows.reduce(
      (sum, prof) => sum + parseFloat(prof.revenue || 0), 0
    );
    
    console.log('✅ Revenue report generated successfully');
    
    res.json({
      total_revenue: totalRevenue,
      revenue_by_professional: professionalRevenue.rows,
      revenue_by_service: serviceRevenue.rows
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
      return res.status(400).json({ message: 'start_date e end_date são obrigatórios' });
    }
    
    console.log('🔄 Generating professional revenue report for user:', req.user.id);
    
    // Get professional percentage
    const professionalData = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const percentage = professionalData.rows[0]?.percentage || 50.00;
    
    // Get consultations for this professional in date range
    const consultations = await pool.query(`
      SELECT 
        c.date,
        COALESCE(u.name, d.name, pp.name) as client_name,
        s.name as service_name,
        c.value as total_value,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 0
          ELSE c.value * ((100 - $3) / 100)
        END as amount_to_pay
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `, [req.user.id, start_date, percentage, end_date]);
    
    // Calculate summary
    const totalConsultations = consultations.rows.length;
    const convenioConsultations = consultations.rows.filter(c => parseFloat(c.amount_to_pay) > 0).length;
    const privateConsultations = consultations.rows.filter(c => parseFloat(c.amount_to_pay) === 0).length;
    const totalRevenue = consultations.rows.reduce((sum, c) => sum + parseFloat(c.total_value), 0);
    const convenioRevenue = consultations.rows
      .filter(c => parseFloat(c.amount_to_pay) > 0)
    const preference = new Preference(client);
    
    const preferenceData = {
    const privateRevenue = consultations.rows
      .filter(c => parseFloat(c.amount_to_pay) === 0)
      .reduce((sum, c) => sum + parseFloat(c.total_value), 0);
    const amountToPay = consultations.rows.reduce((sum, c) => sum + parseFloat(c.amount_to_pay), 0);
    
    console.log('✅ Professional revenue report generated');
    
    res.json({
      summary: {
        professional_percentage: percentage,
        total_revenue: totalRevenue,
        consultation_count: totalConsultations,
        amount_to_pay: amountToPay
      },
      consultations: consultations.rows
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
      return res.status(400).json({ message: 'start_date e end_date são obrigatórios' });
    }
    
    console.log('🔄 Generating detailed professional report for user:', req.user.id);
    
    // Get professional percentage
    const professionalData = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const percentage = professionalData.rows[0]?.percentage || 50.00;
    
    // Get detailed consultation data
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NULL THEN 1 END) as convenio_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NOT NULL THEN 1 END) as private_consultations,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NULL THEN c.value ELSE 0 END), 0) as convenio_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN c.value ELSE 0 END), 0) as private_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NULL THEN c.value * ((100 - $3) / 100) ELSE 0 END), 0) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
    `, [req.user.id, start_date, percentage, end_date]);
    
    const summary = result.rows[0];
    
    console.log('✅ Detailed professional report generated');
    
    res.json({
      summary: {
        total_consultations: parseInt(summary.total_consultations),
        convenio_consultations: parseInt(summary.convenio_consultations),
        private_consultations: parseInt(summary.private_consultations),
        total_revenue: parseFloat(summary.total_revenue),
        convenio_revenue: parseFloat(summary.convenio_revenue),
        private_revenue: parseFloat(summary.private_revenue),
        professional_percentage: percentage,
        amount_to_pay: parseFloat(summary.amount_to_pay)
      }
    });
  } catch (error) {
    const dependentPaymentResult = await preference.create({ body: preferenceData });
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Clients by city report (admin only)
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
      WHERE roles::text LIKE '%client%' AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC
    `);
    
    res.json(result.rows);
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
      WHERE roles::text LIKE '%professional%' AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY total_professionals DESC
    `);
    
    // Process categories to group by name
    const processedResult = result.rows.map(row => {
      const categoryMap = {};
      row.categories.forEach(cat => {
        const name = cat.category_name;
        if (categoryMap[name]) {
          categoryMap[name].count += cat.count;
        } else {
          categoryMap[name] = { category_name: name, count: cat.count };
        }
      });
      
      return {
        ...row,
        categories: Object.values(categoryMap)
      };
    });
    
    const preference = new Preference(client);
    
    const preferenceData = {
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ============================================================================
// FILE UPLOAD ROUTES
// ============================================================================

// Upload image (for professional photos)
app.post('/api/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
    }
    
    console.log('🔄 Image uploaded to Cloudinary:', req.file.path);
    
    // Update user photo URL
    await pool.query(
      'UPDATE users SET photo_url = $1 WHERE id = $2',
      [req.file.path, req.user.id]
    const professionalResult = await preference.create({ body: preferenceData });
    
    console.log('✅ User photo updated successfully');
    
    res.json({
      message: 'Imagem enviada com sucesso',
      imageUrl: req.file.path
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Erro ao fazer upload da imagem' });
  }
});

// ============================================================================
// DOCUMENT GENERATION FUNCTIONS
// ============================================================================

const generateMedicalRecordHTML = (data) => {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prontuário Médico</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            page-break-inside: avoid;
        }
        .section h3 {
            margin: 0 0 10px 0;
            color: #c11c22;
            font-size: 16px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        .vital-signs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .vital-sign {
            text-align: center;
            padding: 10px;
            background: white;
            border-radius: 3px;
            border: 1px solid #e9ecef;
        }
        .vital-sign-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }
        .vital-sign-value {
            font-weight: bold;
            color: #c11c22;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Prontuário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data do Atendimento:</strong> ${new Date(data.date).toLocaleDateString('pt-BR')}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    ${data.vital_signs && Object.values(data.vital_signs).some(v => v) ? `
    <div class="section">
        <h3>Sinais Vitais</h3>
        <div class="vital-signs">
            ${data.vital_signs.blood_pressure ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Pressão Arterial</div>
                <div class="vital-sign-value">${data.vital_signs.blood_pressure}</div>
            </div>` : ''}
            ${data.vital_signs.heart_rate ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Freq. Cardíaca</div>
                <div class="vital-sign-value">${data.vital_signs.heart_rate}</div>
            </div>` : ''}
            ${data.vital_signs.temperature ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Temperatura</div>
                <div class="vital-sign-value">${data.vital_signs.temperature}</div>
            </div>` : ''}
            ${data.vital_signs.respiratory_rate ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Freq. Respiratória</div>
                <div class="vital-sign-value">${data.vital_signs.respiratory_rate}</div>
            </div>` : ''}
        </div>
    </div>` : ''}

    ${data.chief_complaint ? `
    <div class="section">
        <h3>Queixa Principal</h3>
        <p>${data.chief_complaint}</p>
    </div>` : ''}

    ${data.history_present_illness ? `
    <div class="section">
        <h3>História da Doença Atual</h3>
        <p>${data.history_present_illness}</p>
    </div>` : ''}

    ${data.past_medical_history ? `
    <div class="section">
        <h3>História Médica Pregressa</h3>
        <p>${data.past_medical_history}</p>
    </div>` : ''}

    ${data.medications ? `
    <div class="section">
        <h3>Medicamentos em Uso</h3>
        <p>${data.medications}</p>
    </div>` : ''}

    ${data.allergies ? `
    <div class="section">
        <h3>Alergias</h3>
        <p>${data.allergies}</p>
    </div>` : ''}

    ${data.physical_examination ? `
    <div class="section">
        <h3>Exame Físico</h3>
        <p>${data.physical_examination}</p>
    </div>` : ''}

    ${data.diagnosis ? `
    <div class="section">
        <h3>Diagnóstico</h3>
        <p>${data.diagnosis}</p>
    </div>` : ''}

    ${data.treatment_plan ? `
    <div class="section">
        <h3>Plano de Tratamento</h3>
        <p>${data.treatment_plan}</p>
    </div>` : ''}

    ${data.notes ? `
    <div class="section">
        <h3>Observações Gerais</h3>
        <p>${data.notes}</p>
    </div>` : ''}

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;
};

const generateDocumentHTML = (documentType, data) => {
  const templates = {
    certificate: () => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atestado Médico</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .content {
            margin: 30px 0;
            text-align: justify;
            font-size: 14px;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Atestado Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        <p>Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados médicos e apresenta quadro clínico que o(a) impossibilita de exercer suas atividades habituais.</p>
        
        <p><strong>Descrição:</strong> ${data.description}</p>
        
        ${data.cid ? `<p><strong>CID:</strong> ${data.cid}</p>` : ''}
        
        <p><strong>Período de afastamento:</strong> ${data.days} dia(s) a partir de ${new Date().toLocaleDateString('pt-BR')}.</p>
        
        <p>Este atestado é válido para todos os fins legais e administrativos.</p>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

    prescription: () => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receituário Médico</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .prescription-content {
            background: #fff;
            border: 2px solid #c11c22;
            padding: 20px;
            margin: 20px 0;
            min-height: 200px;
        }
        .prescription-text {
            font-size: 16px;
            line-height: 2;
            white-space: pre-line;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Receituário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="prescription-content">
        <div class="prescription-text">${data.prescription}</div>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

    exam_request: () => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitação de Exames</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .exam-list {
            background: #fff;
            border: 2px solid #c11c22;
            padding: 20px;
            margin: 20px 0;
            min-height: 150px;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Solicitação de Exames</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="exam-list">
        <h3>Exames Solicitados:</h3>
        <div style="white-space: pre-line; font-size: 16px; line-height: 2;">
${data.content}
        </div>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

    other: () => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .content {
            margin: 30px 0;
            text-align: justify;
            font-size: 14px;
            min-height: 200px;
            white-space: pre-line;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">${data.title}</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        ${data.content}
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`
  };

  const templateFunction = templates[documentType] || templates.other;
  return templateFunction();
};

// ============================================================================
// NOTIFICATIONS ROUTES
// ============================================================================

// Get notifications for user
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, message, type, read_at, created_at
      FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    res.json({ message: 'Notificação marcada como lida' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create notification (admin only)
app.post('/api/notifications', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { user_id, title, message, type } = req.body;
    
    if (!user_id || !title || !message) {
      return res.status(400).json({ message: 'user_id, título e mensagem são obrigatórios' });
    }
    
    const result = await pool.query(`
      INSERT INTO notifications (user_id, title, message, type, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [user_id, title.trim(), message.trim(), type || 'info']);
    
    res.status(201).json({
      message: 'Notificação criada com sucesso',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ============================================================================
// SYSTEM SETTINGS ROUTES (ADMIN)
// ============================================================================

// Get system settings (admin only)
app.get('/api/system-settings', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT key, value, description, updated_by, updated_at
      FROM system_settings 
      ORDER BY key
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update system setting (admin only)
app.put('/api/system-settings/:key', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (!value) {
      return res.status(400).json({ message: 'Valor é obrigatório' });
    }
    
    const result = await pool.query(`
      UPDATE system_settings 
      SET value = $1, updated_by = $2, updated_at = NOW()
      WHERE key = $3
      RETURNING *
    `, [value.toString(), req.user.id, key]);
    
    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Configuração não encontrada' });
    }
    
    const dependent = dependentResult.rows[0];
      message: 'Configuração atualizada com sucesso',
      setting: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating system setting:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ============================================================================
// AUDIT LOGS ROUTES (ADMIN)
// ============================================================================

// Get audit logs (admin only)
app.get('/api/audit-logs', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        al.id,
        al.action,
        al.table_name,
        al.record_id,
        al.old_values,
        al.new_values,
        al.ip_address,
        al.created_at,
        u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ============================================================================
// HEALTH CHECK AND FALLBACK ROUTES
// ============================================================================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API status endpoint
app.get('/api/status', authenticate, (req, res) => {
  res.json({
    message: 'API funcionando corretamente',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON inválido' });
  }
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Arquivo muito grande' });
  }
  
  res.status(500).json({ 
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Endpoint não encontrado' });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Local'}`);
      console.log(`💳 MercadoPago: ${process.env.MP_ACCESS_TOKEN ? 'Configured' : 'Not configured'}`);
      console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not configured'}`);
      console.log('✅ Server ready for production!');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();