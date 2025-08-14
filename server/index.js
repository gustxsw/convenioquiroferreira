import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { authenticate, authorize } from './middleware/auth.js';
import createUpload from './middleware/upload.js';
import { generateDocumentPDF } from './utils/documentGenerator.js';

// ES6 module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

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
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Database initialization function
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database schema...');
    
    // Check and create has_scheduling_access column
    const hasSchedulingAccessCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'has_scheduling_access'
    `);
    
    if (hasSchedulingAccessCheck.rows.length === 0) {
      console.log('🔧 Creating has_scheduling_access column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN has_scheduling_access BOOLEAN DEFAULT false
      `);
      console.log('✅ has_scheduling_access column created');
    }
    
    // Check and create access_expires_at column
    const accessExpiresCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'access_expires_at'
    `);
    
    if (accessExpiresCheck.rows.length === 0) {
      console.log('🔧 Creating access_expires_at column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN access_expires_at TIMESTAMP
      `);
      console.log('✅ access_expires_at column created');
    }
    
    // Check and create access_granted_by column
    const accessGrantedByCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'access_granted_by'
    `);
    
    if (accessGrantedByCheck.rows.length === 0) {
      console.log('🔧 Creating access_granted_by column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN access_granted_by VARCHAR(255)
      `);
      console.log('✅ access_granted_by column created');
    }
    
    // Check and create access_granted_at column
    const accessGrantedAtCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'access_granted_at'
    `);
    
    if (accessGrantedAtCheck.rows.length === 0) {
      console.log('🔧 Creating access_granted_at column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN access_granted_at TIMESTAMP
      `);
      console.log('✅ access_granted_at column created');
    }

    // Check and create photo_url column
    const photoUrlCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'photo_url'
    `);
    
    if (photoUrlCheck.rows.length === 0) {
      console.log('🔧 Creating photo_url column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN photo_url TEXT
      `);
      console.log('✅ photo_url column created');
    }

    // Check and create subscription_status column
    const subscriptionStatusCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'subscription_status'
    `);
    
    if (subscriptionStatusCheck.rows.length === 0) {
      console.log('🔧 Creating subscription_status column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'pending'
      `);
      console.log('✅ subscription_status column created');
    }

    // Check and create subscription_expiry column
    const subscriptionExpiryCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'subscription_expiry'
    `);
    
    if (subscriptionExpiryCheck.rows.length === 0) {
      console.log('🔧 Creating subscription_expiry column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN subscription_expiry TIMESTAMP
      `);
      console.log('✅ subscription_expiry column created');
    }

    // Create service_categories table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create services table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES service_categories(id),
        is_base_service BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create consultations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER,
        private_patient_id INTEGER,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        service_id INTEGER REFERENCES services(id) NOT NULL,
        location_id INTEGER,
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create dependents table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) NOT NULL,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL UNIQUE,
        birth_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create private_patients table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        birth_date DATE,
        address VARCHAR(255),
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(professional_id, cpf)
      )
    `);

    // Create medical_records table if it doesn't exist
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

    // Create medical_documents table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        private_patient_id INTEGER REFERENCES private_patients(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create attendance_locations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_locations (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(8),
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default service categories if they don't exist
    const categoriesCheck = await pool.query('SELECT COUNT(*) FROM service_categories');
    if (parseInt(categoriesCheck.rows[0].count) === 0) {
      console.log('🔧 Creating default service categories...');
      await pool.query(`
        INSERT INTO service_categories (name, description) VALUES
        ('Medicina Geral', 'Consultas médicas gerais e clínica médica'),
        ('Fisioterapia', 'Tratamentos fisioterapêuticos e reabilitação'),
        ('Psicologia', 'Atendimento psicológico e terapia'),
        ('Nutrição', 'Consultas nutricionais e planejamento alimentar'),
        ('Odontologia', 'Tratamentos dentários e saúde bucal'),
        ('Enfermagem', 'Procedimentos de enfermagem e cuidados'),
        ('Outros', 'Outros serviços de saúde e bem-estar')
      `);
      console.log('✅ Default service categories created');
    }

    // Insert default services if they don't exist
    const servicesCheck = await pool.query('SELECT COUNT(*) FROM services');
    if (parseInt(servicesCheck.rows[0].count) === 0) {
      console.log('🔧 Creating default services...');
      
      // Get category IDs
      const categories = await pool.query('SELECT id, name FROM service_categories');
      const categoryMap = {};
      categories.rows.forEach(cat => {
        categoryMap[cat.name] = cat.id;
      });

      await pool.query(`
        INSERT INTO services (name, description, base_price, category_id, is_base_service) VALUES
        ('Consulta Médica', 'Consulta médica geral', 150.00, $1, true),
        ('Consulta Fisioterapia', 'Sessão de fisioterapia', 80.00, $2, true),
        ('Consulta Psicológica', 'Sessão de psicoterapia', 120.00, $3, true),
        ('Consulta Nutricional', 'Consulta com nutricionista', 100.00, $4, true),
        ('Consulta Odontológica', 'Consulta dentária', 90.00, $5, true),
        ('Procedimento de Enfermagem', 'Procedimentos básicos de enfermagem', 60.00, $6, true),
        ('Outros Serviços', 'Outros serviços de saúde', 100.00, $7, true)
      `, [
        categoryMap['Medicina Geral'],
        categoryMap['Fisioterapia'],
        categoryMap['Psicologia'],
        categoryMap['Nutrição'],
        categoryMap['Odontologia'],
        categoryMap['Enfermagem'],
        categoryMap['Outros']
      ]);
      console.log('✅ Default services created');
    }

    console.log('✅ Database initialization completed successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

// Test database connection and initialize
const testConnection = async () => {
  try {
    console.log('🔄 Testing database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', result.rows[0].now);
    
    // Initialize database schema
    await initializeDatabase();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

// =============================================================================
// AUTHENTICATION ROUTES
// =============================================================================

// Register new user (client only)
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('🔄 Registration request received:', { ...req.body, password: '[HIDDEN]' });
    
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
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with client role and pending subscription
    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password_hash, 
        roles, subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP) 
      RETURNING id, name, cpf, email, roles, subscription_status`,
      [
        name.trim(),
        cpf,
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
      ]
    );

    const user = result.rows[0];
    console.log('✅ User registered successfully:', { id: user.id, name: user.name });

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
    console.error('❌ Registration error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔄 Login attempt for CPF:', req.body.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'));
    
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, email, password_hash, roles FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found for CPF:', cpf);
      return res.status(401).json({ message: 'CPF ou senha incorretos' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      console.log('❌ Invalid password for user:', user.id);
      return res.status(401).json({ message: 'CPF ou senha incorretos' });
    }

    console.log('✅ Login successful for user:', { id: user.id, name: user.name, roles: user.roles });

    // Return user data without token (will be created on role selection)
    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Select role after login
app.post('/api/auth/select-role', async (req, res) => {
  try {
    const { userId, role } = req.body;
    
    console.log('🎯 Role selection request:', { userId, role });

    if (!userId || !role) {
      return res.status(400).json({ message: 'ID do usuário e role são obrigatórios' });
    }

    // Get user data
    const result = await pool.query(
      'SELECT id, name, cpf, email, roles FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    // Verify user has the requested role
    if (!user.roles.includes(role)) {
      return res.status(403).json({ message: 'Usuário não possui esta role' });
    }

    // Generate JWT token with selected role
    const token = jwt.sign(
      { 
        id: user.id, 
        currentRole: role,
        roles: user.roles 
      },
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

    console.log('✅ Role selected successfully:', { userId, role });

    res.json({
      message: 'Role selecionada com sucesso',
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        email: user.email,
        roles: user.roles,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('❌ Role selection error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Switch role
app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    
    console.log('🔄 Role switch request:', { userId: req.user.id, newRole: role, currentRole: req.user.currentRole });

    if (!role) {
      return res.status(400).json({ message: 'Role é obrigatória' });
    }

    // Verify user has the requested role
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ message: 'Usuário não possui esta role' });
    }

    // Generate new JWT token with new role
    const token = jwt.sign(
      { 
        id: req.user.id, 
        currentRole: role,
        roles: req.user.roles 
      },
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

    console.log('✅ Role switched successfully:', { userId: req.user.id, newRole: role });

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
    console.error('❌ Role switch error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// =============================================================================
// USER MANAGEMENT ROUTES
// =============================================================================

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
    res.status(500).json({ message: 'Erro ao carregar usuários' });
  }
});

// Get single user
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
    res.status(500).json({ message: 'Erro ao carregar usuário' });
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

    // Validate required fields
    if (!name || !cpf || !password || !roles || roles.length === 0) {
      return res.status(400).json({ message: 'Campos obrigatórios: nome, CPF, senha e pelo menos uma role' });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cpf]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }

    // Validate professional fields
    if (roles.includes('professional')) {
      if (!category_id) {
        return res.status(400).json({ message: 'Categoria é obrigatória para profissionais' });
      }
      if (!percentage || percentage < 0 || percentage > 100) {
        return res.status(400).json({ message: 'Porcentagem deve estar entre 0 e 100' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine subscription status
    let subscriptionStatus = 'pending';
    if (roles.includes('client')) {
      subscriptionStatus = 'pending';
    } else {
      subscriptionStatus = null;
    }

    // Create user
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password_hash,
        roles, percentage, category_id, subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
      RETURNING id, name, cpf, email, roles, subscription_status
    `, [
      name.trim(),
      cpf,
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
      JSON.stringify(roles),
      roles.includes('professional') ? percentage : null,
      roles.includes('professional') ? category_id : null,
      subscriptionStatus
    ]);

    const user = result.rows[0];
    console.log('✅ User created by admin:', { id: user.id, name: user.name, roles: user.roles });

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user
    });
  } catch (error) {
    console.error('❌ User creation error:', error);
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

    // Check permissions
    const isOwnProfile = req.user.id === parseInt(id);
    const isAdmin = req.user.currentRole === 'admin';

    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Get current user data
    const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const userData = currentUser.rows[0];

    // Handle password change
    let updateFields = [];
    let updateValues = [];
    let paramCount = 1;

    if (newPassword && isOwnProfile) {
      // Verify current password
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, userData.password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push(`password_hash = $${paramCount}`);
      updateValues.push(hashedPassword);
      paramCount++;
    }

    // Update basic fields
    if (name !== undefined) {
      updateFields.push(`name = $${paramCount}`);
      updateValues.push(name.trim());
      paramCount++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramCount}`);
      updateValues.push(email?.trim() || null);
      paramCount++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCount}`);
      updateValues.push(phone?.replace(/\D/g, '') || null);
      paramCount++;
    }

    if (birth_date !== undefined) {
      updateFields.push(`birth_date = $${paramCount}`);
      updateValues.push(birth_date || null);
      paramCount++;
    }

    if (address !== undefined) {
      updateFields.push(`address = $${paramCount}`);
      updateValues.push(address?.trim() || null);
      paramCount++;
    }

    if (address_number !== undefined) {
      updateFields.push(`address_number = $${paramCount}`);
      updateValues.push(address_number?.trim() || null);
      paramCount++;
    }

    if (address_complement !== undefined) {
      updateFields.push(`address_complement = $${paramCount}`);
      updateValues.push(address_complement?.trim() || null);
      paramCount++;
    }

    if (neighborhood !== undefined) {
      updateFields.push(`neighborhood = $${paramCount}`);
      updateValues.push(neighborhood?.trim() || null);
      paramCount++;
    }

    if (city !== undefined) {
      updateFields.push(`city = $${paramCount}`);
      updateValues.push(city?.trim() || null);
      paramCount++;
    }

    if (state !== undefined) {
      updateFields.push(`state = $${paramCount}`);
      updateValues.push(state || null);
      paramCount++;
    }

    // Admin-only fields
    if (isAdmin) {
      if (roles !== undefined) {
        updateFields.push(`roles = $${paramCount}`);
        updateValues.push(JSON.stringify(roles));
        paramCount++;
      }

      if (percentage !== undefined) {
        updateFields.push(`percentage = $${paramCount}`);
        updateValues.push(roles && roles.includes('professional') ? percentage : null);
        paramCount++;
      }

      if (category_id !== undefined) {
        updateFields.push(`category_id = $${paramCount}`);
        updateValues.push(roles && roles.includes('professional') ? category_id : null);
        paramCount++;
      }
    }

    // Add updated_at
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updateFields.length === 1) { // Only updated_at
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    // Update user
    updateValues.push(id);
    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, cpf, email, roles
    `;

    const result = await pool.query(query, updateValues);
    const updatedUser = result.rows[0];

    console.log('✅ User updated:', { id: updatedUser.id, name: updatedUser.name });

    res.json({
      message: 'Usuário atualizado com sucesso',
      user: updatedUser
    });
  } catch (error) {
    console.error('❌ User update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userCheck = await pool.query('SELECT name FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const userName = userCheck.rows[0].name;

    // Delete user (this will cascade to related records)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    console.log('✅ User deleted:', { id, name: userName });

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('❌ User deletion error:', error);
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

    // Check if user exists and is a client
    const userCheck = await pool.query(
      'SELECT name, roles FROM users WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userCheck.rows[0];
    if (!user.roles.includes('client')) {
      return res.status(400).json({ message: 'Usuário não é um cliente' });
    }

    // Update subscription status
    await pool.query(`
      UPDATE users 
      SET subscription_status = 'active', 
          subscription_expiry = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [expiry_date, id]);

    console.log('✅ Client activated:', { id, name: user.name, expiry_date });

    res.json({ message: 'Cliente ativado com sucesso' });
  } catch (error) {
    console.error('❌ Client activation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// SERVICE CATEGORIES ROUTES
// =============================================================================

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
    res.status(500).json({ message: 'Erro ao carregar categorias' });
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
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      RETURNING id, name, description, created_at
    `, [name.trim(), description?.trim() || null]);

    console.log('✅ Service category created:', result.rows[0]);

    res.status(201).json({
      message: 'Categoria criada com sucesso',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Service category creation error:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'Já existe uma categoria com este nome' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// =============================================================================
// SERVICES ROUTES
// =============================================================================

// Get all services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id, s.name, s.description, s.base_price, s.category_id, 
        s.is_base_service, s.created_at,
        sc.name as category_name
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY sc.name, s.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Erro ao carregar serviços' });
  }
});

// Create service (admin only)
app.post('/api/services', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !description || !base_price) {
      return res.status(400).json({ message: 'Nome, descrição e preço base são obrigatórios' });
    }

    if (base_price <= 0) {
      return res.status(400).json({ message: 'Preço base deve ser maior que zero' });
    }

    const result = await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING id, name, description, base_price, category_id, is_base_service, created_at
    `, [
      name.trim(),
      description.trim(),
      parseFloat(base_price),
      category_id || null,
      is_base_service || false
    ]);

    console.log('✅ Service created:', result.rows[0]);

    res.status(201).json({
      message: 'Serviço criado com sucesso',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Service creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update service (admin only)
app.put('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !description || !base_price) {
      return res.status(400).json({ message: 'Nome, descrição e preço base são obrigatórios' });
    }

    if (base_price <= 0) {
      return res.status(400).json({ message: 'Preço base deve ser maior que zero' });
    }

    const result = await pool.query(`
      UPDATE services 
      SET name = $1, description = $2, base_price = $3, category_id = $4, 
          is_base_service = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, name, description, base_price, category_id, is_base_service
    `, [
      name.trim(),
      description.trim(),
      parseFloat(base_price),
      category_id || null,
      is_base_service || false,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    console.log('✅ Service updated:', result.rows[0]);

    res.json({
      message: 'Serviço atualizado com sucesso',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Service update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete service (admin only)
app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service exists
    const serviceCheck = await pool.query('SELECT name FROM services WHERE id = $1', [id]);
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    const serviceName = serviceCheck.rows[0].name;

    // Check if service is being used in consultations
    const consultationCheck = await pool.query(
      'SELECT COUNT(*) FROM consultations WHERE service_id = $1',
      [id]
    );

    if (parseInt(consultationCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Não é possível excluir este serviço pois ele possui consultas registradas' 
      });
    }

    // Delete service
    await pool.query('DELETE FROM services WHERE id = $1', [id]);

    console.log('✅ Service deleted:', { id, name: serviceName });

    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('❌ Service deletion error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// CONSULTATIONS ROUTES
// =============================================================================

// Get consultations
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.date, c.value, c.status, c.notes, c.created_at,
        s.name as service_name,
        COALESCE(u_client.name, d.name, pp.name) as client_name,
        u_prof.name as professional_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true 
          ELSE false 
        END as is_dependent,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN true 
          ELSE false 
        END as is_private
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
    `;

    let queryParams = [];
    let whereConditions = [];

    // Filter based on user role
    if (req.user.currentRole === 'client') {
      whereConditions.push('(c.client_id = $1 OR d.client_id = $1)');
      queryParams.push(req.user.id);
    } else if (req.user.currentRole === 'professional') {
      whereConditions.push('c.professional_id = $1');
      queryParams.push(req.user.id);
    }
    // Admin can see all consultations

    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    query += ' ORDER BY c.date DESC';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro ao carregar consultas' });
  }
});

// Create consultation
app.post('/api/consultations', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      value,
      date,
      status,
      notes,
      appointment_date,
      appointment_time,
      create_appointment
    } = req.body;

    console.log('🔄 Creating consultation:', {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      professional_id: req.user.id,
      value,
      date,
      status: status || 'completed'
    });

    // Validate required fields
    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    // Validate that at least one patient type is provided
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    // Validate value
    if (parseFloat(value) <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }

    // If it's a convenio consultation, validate subscription status
    if (client_id || dependent_id) {
      let subscriptionQuery;
      let subscriptionParams;

      if (dependent_id) {
        // Check dependent's client subscription
        subscriptionQuery = `
          SELECT u.subscription_status, u.subscription_expiry, u.name as client_name
          FROM dependents d
          JOIN users u ON d.client_id = u.id
          WHERE d.id = $1
        `;
        subscriptionParams = [dependent_id];
      } else {
        // Check client subscription
        subscriptionQuery = `
          SELECT subscription_status, subscription_expiry, name as client_name
          FROM users 
          WHERE id = $1
        `;
        subscriptionParams = [client_id];
      }

      const subscriptionResult = await pool.query(subscriptionQuery, subscriptionParams);
      
      if (subscriptionResult.rows.length === 0) {
        return res.status(404).json({ message: 'Cliente não encontrado' });
      }

      const subscription = subscriptionResult.rows[0];
      
      if (subscription.subscription_status !== 'active') {
        return res.status(400).json({ 
          message: `Não é possível registrar consulta. Status da assinatura: ${subscription.subscription_status}` 
        });
      }

      // Check if subscription is expired
      if (subscription.subscription_expiry && new Date(subscription.subscription_expiry) < new Date()) {
        return res.status(400).json({ message: 'Assinatura do cliente está vencida' });
      }
    }

    // Create consultation
    const result = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, date, status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING id, date, value, status
    `, [
      client_id || null,
      dependent_id || null,
      private_patient_id || null,
      req.user.id,
      service_id,
      location_id || null,
      parseFloat(value),
      date,
      status || 'completed',
      notes || null
    ]);

    const consultation = result.rows[0];
    console.log('✅ Consultation created:', consultation);

    // If create_appointment is true and we have appointment data, create appointment record
    let appointmentResult = null;
    if (create_appointment && appointment_date && appointment_time) {
      try {
        const appointmentDateTime = new Date(`${appointment_date}T${appointment_time}`);
        
        // For now, we'll just log this since we don't have a separate appointments table
        console.log('📅 Appointment would be created for:', {
          consultation_id: consultation.id,
          date: appointment_date,
          time: appointment_time,
          datetime: appointmentDateTime
        });
        
        appointmentResult = {
          id: consultation.id,
          date: appointment_date,
          time: appointment_time
        };
      } catch (appointmentError) {
        console.error('❌ Error creating appointment:', appointmentError);
        // Don't fail the consultation creation if appointment fails
      }
    }

    res.status(201).json({
      message: 'Consulta registrada com sucesso',
      consultation,
      appointment: appointmentResult
    });
  } catch (error) {
    console.error('❌ Consultation creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update consultation status
app.put('/api/consultations/:id/status', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Status inválido' });
    }

    // Check if consultation exists and belongs to the professional (unless admin)
    let consultationQuery = 'SELECT id, professional_id, status FROM consultations WHERE id = $1';
    let consultationParams = [id];

    if (req.user.currentRole === 'professional') {
      consultationQuery += ' AND professional_id = $2';
      consultationParams.push(req.user.id);
    }

    const consultationCheck = await pool.query(consultationQuery, consultationParams);
    
    if (consultationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    // Update status
    const result = await pool.query(`
      UPDATE consultations 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, status
    `, [status, id]);

    console.log('✅ Consultation status updated:', { id, status });

    res.json({
      message: 'Status atualizado com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Consultation status update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// CLIENT LOOKUP ROUTES
// =============================================================================

// Lookup client by CPF
app.get('/api/clients/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.toString().replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    const result = await pool.query(`
      SELECT id, name, cpf, email, subscription_status, subscription_expiry
      FROM users 
      WHERE cpf = $1 AND roles ? 'client'
    `, [cleanCpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const client = result.rows[0];
    console.log('✅ Client found:', { id: client.id, name: client.name, status: client.subscription_status });

    res.json(client);
  } catch (error) {
    console.error('❌ Client lookup error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// DEPENDENTS ROUTES
// =============================================================================

// Get dependents for a client
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Check permissions
    if (req.user.currentRole === 'client' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT id, name, cpf, birth_date, created_at
      FROM dependents 
      WHERE client_id = $1
      ORDER BY name
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro ao carregar dependentes' });
  }
});

// Lookup dependent by CPF
app.get('/api/dependents/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.toString().replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.birth_date, d.client_id,
        u.name as client_name, u.subscription_status as client_subscription_status,
        u.subscription_expiry as client_subscription_expiry
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1
    `, [cleanCpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = result.rows[0];
    console.log('✅ Dependent found:', { id: dependent.id, name: dependent.name });

    res.json(dependent);
  } catch (error) {
    console.error('❌ Dependent lookup error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create dependent
app.post('/api/dependents', authenticate, authorize(['client', 'admin']), async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    // Validate required fields
    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'ID do cliente, nome e CPF são obrigatórios' });
    }

    // Check permissions
    if (req.user.currentRole === 'client' && req.user.id !== parseInt(client_id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Validate CPF format
    const cleanCpf = cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Check if CPF already exists
    const existingCpf = await pool.query(
      'SELECT id FROM users WHERE cpf = $1 UNION SELECT id FROM dependents WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingCpf.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }

    // Check dependent limit (10 per client)
    const dependentCount = await pool.query(
      'SELECT COUNT(*) FROM dependents WHERE client_id = $1',
      [client_id]
    );

    if (parseInt(dependentCount.rows[0].count) >= 10) {
      return res.status(400).json({ message: 'Limite máximo de 10 dependentes por cliente' });
    }

    // Create dependent
    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id, name, cpf, birth_date, created_at
    `, [client_id, name.trim(), cleanCpf, birth_date || null]);

    const dependent = result.rows[0];
    console.log('✅ Dependent created:', dependent);

    res.status(201).json({
      message: 'Dependente criado com sucesso',
      dependent
    });
  } catch (error) {
    console.error('❌ Dependent creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update dependent
app.put('/api/dependents/:id', authenticate, authorize(['client', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    // Check if dependent exists and get client_id
    const dependentCheck = await pool.query(
      'SELECT client_id FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentCheck.rows[0];

    // Check permissions
    if (req.user.currentRole === 'client' && req.user.id !== dependent.client_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Update dependent
    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2
      WHERE id = $3
      RETURNING id, name, cpf, birth_date
    `, [name?.trim(), birth_date || null, id]);

    console.log('✅ Dependent updated:', result.rows[0]);

    res.json({
      message: 'Dependente atualizado com sucesso',
      dependent: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Dependent update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete dependent
app.delete('/api/dependents/:id', authenticate, authorize(['client', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if dependent exists and get client_id
    const dependentCheck = await pool.query(
      'SELECT client_id, name FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentCheck.rows[0];

    // Check permissions
    if (req.user.currentRole === 'client' && req.user.id !== dependent.client_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Check if dependent has consultations
    const consultationCheck = await pool.query(
      'SELECT COUNT(*) FROM consultations WHERE dependent_id = $1',
      [id]
    );

    if (parseInt(consultationCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Não é possível excluir este dependente pois ele possui consultas registradas' 
      });
    }

    // Delete dependent
    await pool.query('DELETE FROM dependents WHERE id = $1', [id]);

    console.log('✅ Dependent deleted:', { id, name: dependent.name });

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('❌ Dependent deletion error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// PROFESSIONALS ROUTES
// =============================================================================

// Get all professionals (for clients)
app.get('/api/professionals', authenticate, authorize(['client', 'admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.photo_url,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.roles ? 'professional'
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro ao carregar profissionais' });
  }
});

// Get professionals with scheduling access info (admin only)
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone,
        sc.name as category_name,
        u.has_scheduling_access,
        u.access_expires_at,
        u.access_granted_by,
        u.access_granted_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.roles ? 'professional'
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals scheduling access:', error);
    res.status(500).json({ message: 'Erro ao carregar dados de acesso à agenda' });
  }
});

// Grant scheduling access (admin only)
app.post('/api/admin/grant-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id, expires_at, reason } = req.body;

    if (!professional_id || !expires_at) {
      return res.status(400).json({ message: 'ID do profissional e data de expiração são obrigatórios' });
    }

    // Check if professional exists
    const professionalCheck = await pool.query(
      'SELECT name, roles FROM users WHERE id = $1',
      [professional_id]
    );

    if (professionalCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const professional = professionalCheck.rows[0];
    if (!professional.roles.includes('professional')) {
      return res.status(400).json({ message: 'Usuário não é um profissional' });
    }

    // Grant access
    await pool.query(`
      UPDATE users 
      SET 
        has_scheduling_access = true,
        access_expires_at = $1,
        access_granted_by = $2,
        access_granted_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [expires_at, req.user.name, professional_id]);

    console.log('✅ Scheduling access granted:', { 
      professional_id, 
      professional_name: professional.name,
      expires_at,
      granted_by: req.user.name 
    });

    res.json({ message: 'Acesso à agenda concedido com sucesso' });
  } catch (error) {
    console.error('❌ Grant scheduling access error:', error);
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

    // Check if professional exists
    const professionalCheck = await pool.query(
      'SELECT name FROM users WHERE id = $1',
      [professional_id]
    );

    if (professionalCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const professional = professionalCheck.rows[0];

    // Revoke access
    await pool.query(`
      UPDATE users 
      SET 
        has_scheduling_access = false,
        access_expires_at = NULL,
        access_granted_by = NULL,
        access_granted_at = NULL
      WHERE id = $1
    `, [professional_id]);

    console.log('✅ Scheduling access revoked:', { 
      professional_id, 
      professional_name: professional.name,
      revoked_by: req.user.name 
    });

    res.json({ message: 'Acesso à agenda revogado com sucesso' });
  } catch (error) {
    console.error('❌ Revoke scheduling access error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// PRIVATE PATIENTS ROUTES
// =============================================================================

// Get private patients for a professional
app.get('/api/private-patients', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    let query = `
      SELECT 
        id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement,
        neighborhood, city, state, zip_code, created_at
      FROM private_patients
    `;
    
    let queryParams = [];

    if (req.user.currentRole === 'professional') {
      query += ' WHERE professional_id = $1';
      queryParams.push(req.user.id);
    }

    query += ' ORDER BY name';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro ao carregar pacientes particulares' });
  }
});

// Create private patient
app.post('/api/private-patients', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    if (!name || !cpf) {
      return res.status(400).json({ message: 'Nome e CPF são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Check if CPF already exists for this professional
    const existingPatient = await pool.query(
      'SELECT id FROM private_patients WHERE professional_id = $1 AND cpf = $2',
      [req.user.id, cleanCpf]
    );

    if (existingPatient.rows.length > 0) {
      return res.status(400).json({ message: 'Paciente com este CPF já cadastrado' });
    }

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      RETURNING id, name, cpf, email, phone, birth_date, created_at
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

    const patient = result.rows[0];
    console.log('✅ Private patient created:', patient);

    res.status(201).json({
      message: 'Paciente criado com sucesso',
      patient
    });
  } catch (error) {
    console.error('❌ Private patient creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update private patient
app.put('/api/private-patients/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    // Check if patient exists and belongs to professional
    let patientQuery = 'SELECT professional_id FROM private_patients WHERE id = $1';
    let patientParams = [id];

    if (req.user.currentRole === 'professional') {
      patientQuery += ' AND professional_id = $2';
      patientParams.push(req.user.id);
    }

    const patientCheck = await pool.query(patientQuery, patientParams);
    
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    // Update patient
    const result = await pool.query(`
      UPDATE private_patients 
      SET 
        name = $1, email = $2, phone = $3, birth_date = $4,
        address = $5, address_number = $6, address_complement = $7,
        neighborhood = $8, city = $9, state = $10, zip_code = $11
      WHERE id = $12
      RETURNING id, name, cpf, email, phone, birth_date
    `, [
      name?.trim(),
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
      id
    ]);

    console.log('✅ Private patient updated:', result.rows[0]);

    res.json({
      message: 'Paciente atualizado com sucesso',
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Private patient update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete private patient
app.delete('/api/private-patients/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if patient exists and belongs to professional
    let patientQuery = 'SELECT professional_id, name FROM private_patients WHERE id = $1';
    let patientParams = [id];

    if (req.user.currentRole === 'professional') {
      patientQuery += ' AND professional_id = $2';
      patientParams.push(req.user.id);
    }

    const patientCheck = await pool.query(patientQuery, patientParams);
    
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    const patient = patientCheck.rows[0];

    // Check if patient has consultations
    const consultationCheck = await pool.query(
      'SELECT COUNT(*) FROM consultations WHERE private_patient_id = $1',
      [id]
    );

    if (parseInt(consultationCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Não é possível excluir este paciente pois ele possui consultas registradas' 
      });
    }

    // Delete patient
    await pool.query('DELETE FROM private_patients WHERE id = $1', [id]);

    console.log('✅ Private patient deleted:', { id, name: patient.name });

    res.json({ message: 'Paciente excluído com sucesso' });
  } catch (error) {
    console.error('❌ Private patient deletion error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// MEDICAL RECORDS ROUTES
// =============================================================================

// Get medical records for a professional
app.get('/api/medical-records', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    let query = `
      SELECT 
        mr.id, mr.chief_complaint, mr.history_present_illness,
        mr.past_medical_history, mr.medications, mr.allergies,
        mr.physical_examination, mr.diagnosis, mr.treatment_plan,
        mr.notes, mr.vital_signs, mr.created_at, mr.updated_at,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
    `;
    
    let queryParams = [];

    if (req.user.currentRole === 'professional') {
      query += ' WHERE mr.professional_id = $1';
      queryParams.push(req.user.id);
    }

    query += ' ORDER BY mr.created_at DESC';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro ao carregar prontuários' });
  }
});

// Create medical record
app.post('/api/medical-records', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const {
      private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, vital_signs
    } = req.body;

    if (!private_patient_id) {
      return res.status(400).json({ message: 'ID do paciente é obrigatório' });
    }

    // Check if patient exists and belongs to professional
    let patientQuery = 'SELECT id FROM private_patients WHERE id = $1';
    let patientParams = [private_patient_id];

    if (req.user.currentRole === 'professional') {
      patientQuery += ' AND professional_id = $2';
      patientParams.push(req.user.id);
    }

    const patientCheck = await pool.query(patientQuery, patientParams);
    
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint,
        history_present_illness, past_medical_history, medications,
        allergies, physical_examination, diagnosis, treatment_plan,
        notes, vital_signs, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING id, created_at
    `, [
      req.user.id,
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
      vital_signs ? JSON.stringify(vital_signs) : null
    ]);

    const record = result.rows[0];
    console.log('✅ Medical record created:', record);

    res.status(201).json({
      message: 'Prontuário criado com sucesso',
      record
    });
  } catch (error) {
    console.error('❌ Medical record creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update medical record
app.put('/api/medical-records/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis,
      treatment_plan, notes, vital_signs
    } = req.body;

    // Check if record exists and belongs to professional
    let recordQuery = 'SELECT id FROM medical_records WHERE id = $1';
    let recordParams = [id];

    if (req.user.currentRole === 'professional') {
      recordQuery += ' AND professional_id = $2';
      recordParams.push(req.user.id);
    }

    const recordCheck = await pool.query(recordQuery, recordParams);
    
    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    const result = await pool.query(`
      UPDATE medical_records 
      SET 
        chief_complaint = $1, history_present_illness = $2,
        past_medical_history = $3, medications = $4, allergies = $5,
        physical_examination = $6, diagnosis = $7, treatment_plan = $8,
        notes = $9, vital_signs = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING id, updated_at
    `, [
      chief_complaint || null,
      history_present_illness || null,
      past_medical_history || null,
      medications || null,
      allergies || null,
      physical_examination || null,
      diagnosis || null,
      treatment_plan || null,
      notes || null,
      vital_signs ? JSON.stringify(vital_signs) : null,
      id
    ]);

    console.log('✅ Medical record updated:', result.rows[0]);

    res.json({
      message: 'Prontuário atualizado com sucesso',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Medical record update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete medical record
app.delete('/api/medical-records/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if record exists and belongs to professional
    let recordQuery = 'SELECT id FROM medical_records WHERE id = $1';
    let recordParams = [id];

    if (req.user.currentRole === 'professional') {
      recordQuery += ' AND professional_id = $2';
      recordParams.push(req.user.id);
    }

    const recordCheck = await pool.query(recordQuery, recordParams);
    
    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    await pool.query('DELETE FROM medical_records WHERE id = $1', [id]);

    console.log('✅ Medical record deleted:', { id });

    res.json({ message: 'Prontuário excluído com sucesso' });
  } catch (error) {
    console.error('❌ Medical record deletion error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// MEDICAL DOCUMENTS ROUTES
// =============================================================================

// Get medical documents for a professional
app.get('/api/medical-documents', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    let query = `
      SELECT 
        md.id, md.title, md.document_type, md.document_url, md.created_at,
        pp.name as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
    `;
    
    let queryParams = [];

    if (req.user.currentRole === 'professional') {
      query += ' WHERE md.professional_id = $1';
      queryParams.push(req.user.id);
    }

    query += ' ORDER BY md.created_at DESC';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro ao carregar documentos' });
  }
});

// Create medical document
app.post('/api/medical-documents', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({ message: 'Título, tipo de documento e dados são obrigatórios' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type,
        document_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING id, title, document_type, document_url, created_at
    `, [
      req.user.id,
      private_patient_id || null,
      title,
      document_type,
      documentResult.url
    ]);

    const document = result.rows[0];
    console.log('✅ Medical document created:', document);

    res.status(201).json({
      message: 'Documento criado com sucesso',
      document,
      title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('❌ Medical document creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// ATTENDANCE LOCATIONS ROUTES
// =============================================================================

// Get attendance locations for a professional
app.get('/api/attendance-locations', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    let query = `
      SELECT 
        id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default, created_at
      FROM attendance_locations
    `;
    
    let queryParams = [];

    if (req.user.currentRole === 'professional') {
      query += ' WHERE professional_id = $1';
      queryParams.push(req.user.id);
    }

    query += ' ORDER BY is_default DESC, name';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance locations:', error);
    res.status(500).json({ message: 'Erro ao carregar locais de atendimento' });
  }
});

// Create attendance location
app.post('/api/attendance-locations', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const {
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      RETURNING id, name, address, is_default, created_at
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

    const location = result.rows[0];
    console.log('✅ Attendance location created:', location);

    res.status(201).json({
      message: 'Local de atendimento criado com sucesso',
      location
    });
  } catch (error) {
    console.error('❌ Attendance location creation error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update attendance location
app.put('/api/attendance-locations/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
    } = req.body;

    // Check if location exists and belongs to professional
    let locationQuery = 'SELECT professional_id FROM attendance_locations WHERE id = $1';
    let locationParams = [id];

    if (req.user.currentRole === 'professional') {
      locationQuery += ' AND professional_id = $2';
      locationParams.push(req.user.id);
    }

    const locationCheck = await pool.query(locationQuery, locationParams);
    
    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
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
        neighborhood = $5, city = $6, state = $7, zip_code = $8,
        phone = $9, is_default = $10
      WHERE id = $11
      RETURNING id, name, address, is_default
    `, [
      name?.trim(),
      address?.trim() || null,
      address_number?.trim() || null,
      address_complement?.trim() || null,
      neighborhood?.trim() || null,
      city?.trim() || null,
      state || null,
      zip_code?.replace(/\D/g, '') || null,
      phone?.replace(/\D/g, '') || null,
      is_default || false,
      id
    ]);

    console.log('✅ Attendance location updated:', result.rows[0]);

    res.json({
      message: 'Local atualizado com sucesso',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Attendance location update error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete attendance location
app.delete('/api/attendance-locations/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if location exists and belongs to professional
    let locationQuery = 'SELECT professional_id, name FROM attendance_locations WHERE id = $1';
    let locationParams = [id];

    if (req.user.currentRole === 'professional') {
      locationQuery += ' AND professional_id = $2';
      locationParams.push(req.user.id);
    }

    const locationCheck = await pool.query(locationQuery, locationParams);
    
    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    const location = locationCheck.rows[0];

    await pool.query('DELETE FROM attendance_locations WHERE id = $1', [id]);

    console.log('✅ Attendance location deleted:', { id, name: location.name });

    res.json({ message: 'Local excluído com sucesso' });
  } catch (error) {
    console.error('❌ Attendance location deletion error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// REPORTS ROUTES
// =============================================================================

// Revenue report (admin only)
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get revenue by professional
    const professionalRevenue = await pool.query(`
      SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count,
        SUM(c.value * (u.percentage / 100.0)) as professional_payment,
        SUM(c.value * ((100 - u.percentage) / 100.0)) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC
    `, [start_date, end_date + ' 23:59:59']);

    // Get revenue by service
    const serviceRevenue = await pool.query(`
      SELECT 
        s.name as service_name,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date + ' 23:59:59']);

    // Calculate total revenue
    const totalRevenue = professionalRevenue.rows.reduce((sum, row) => sum + parseFloat(row.revenue || 0), 0);

    res.json({
      total_revenue: totalRevenue,
      revenue_by_professional: professionalRevenue.rows.map(row => ({
        professional_name: row.professional_name,
        professional_percentage: parseInt(row.professional_percentage || 50),
        revenue: parseFloat(row.revenue || 0),
        consultation_count: parseInt(row.consultation_count || 0),
        professional_payment: parseFloat(row.professional_payment || 0),
        clinic_revenue: parseFloat(row.clinic_revenue || 0)
      })),
      revenue_by_service: serviceRevenue.rows.map(row => ({
        service_name: row.service_name,
        revenue: parseFloat(row.revenue || 0),
        consultation_count: parseInt(row.consultation_count || 0)
      }))
    });
  } catch (error) {
    console.error('Error generating revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de receita' });
  }
});

// Professional revenue report
app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    console.log('🔄 Generating professional revenue report for user:', req.user.id);
    console.log('🔄 Date range:', { start_date, end_date });

    // Get professional's percentage
    const professionalData = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = professionalData.rows[0]?.percentage || 50;

    // Get consultations for the professional in the date range
    const consultationsResult = await pool.query(`
      SELECT 
        c.date, c.value,
        COALESCE(u_client.name, d.name, pp.name) as client_name,
        s.name as service_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN c.value
          ELSE c.value * ((100 - $3) / 100.0)
        END as amount_to_pay
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 
        AND c.date <= $4
      ORDER BY c.date DESC
    `, [req.user.id, start_date, professionalPercentage, end_date + ' 23:59:59']);

    console.log('✅ Found consultations:', consultationsResult.rows.length);

    // Calculate summary
    const consultations = consultationsResult.rows;
    const totalRevenue = consultations.reduce((sum, c) => sum + parseFloat(c.value || 0), 0);
    const totalAmountToPay = consultations.reduce((sum, c) => sum + parseFloat(c.amount_to_pay || 0), 0);

    const summary = {
      professional_percentage: professionalPercentage,
      total_revenue: totalRevenue,
      consultation_count: consultations.length,
      amount_to_pay: totalAmountToPay
    };

    console.log('✅ Professional revenue summary:', summary);

    res.json({
      summary,
      consultations: consultations.map(c => ({
        date: c.date,
        client_name: c.client_name,
        service_name: c.service_name,
        total_value: parseFloat(c.value || 0),
        amount_to_pay: parseFloat(c.amount_to_pay || 0)
      }))
    });
  } catch (error) {
    console.error('❌ Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de receita' });
  }
});

// Professional detailed report
app.get('/api/reports/professional-detailed', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get professional's percentage
    const professionalData = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = professionalData.rows[0]?.percentage || 50;

    // Get convenio consultations
    const convenioResult = await pool.query(`
      SELECT COUNT(*) as count, SUM(value) as revenue
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $2 
        AND c.date <= $3
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
    `, [req.user.id, start_date, end_date + ' 23:59:59']);

    // Get private consultations
    const privateResult = await pool.query(`
      SELECT COUNT(*) as count, SUM(value) as revenue
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $2 
        AND c.date <= $3
        AND c.private_patient_id IS NOT NULL
    `, [req.user.id, start_date, end_date + ' 23:59:59']);

    const convenioData = convenioResult.rows[0];
    const privateData = privateResult.rows[0];

    const convenioRevenue = parseFloat(convenioData.revenue || 0);
    const privateRevenue = parseFloat(privateData.revenue || 0);
    const totalRevenue = convenioRevenue + privateRevenue;

    // Calculate amount to pay to clinic (only from convenio consultations)
    const amountToPay = convenioRevenue * ((100 - professionalPercentage) / 100);

    const summary = {
      total_consultations: parseInt(convenioData.count || 0) + parseInt(privateData.count || 0),
      convenio_consultations: parseInt(convenioData.count || 0),
      private_consultations: parseInt(privateData.count || 0),
      total_revenue: totalRevenue,
      convenio_revenue: convenioRevenue,
      private_revenue: privateRevenue,
      professional_percentage: professionalPercentage,
      amount_to_pay: amountToPay
    };

    res.json({ summary });
  } catch (error) {
    console.error('Error generating professional detailed report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório detalhado' });
  }
});

// Clients by city report (admin only)
app.get('/api/reports/clients-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        city, state,
        COUNT(*) as client_count,
        COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_clients,
        COUNT(CASE WHEN subscription_status = 'pending' THEN 1 END) as pending_clients,
        COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END) as expired_clients
      FROM users 
      WHERE roles ? 'client' 
        AND city IS NOT NULL 
        AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error generating clients by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de clientes por cidade' });
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
      WHERE u.roles ? 'professional' 
        AND u.city IS NOT NULL 
        AND u.city != ''
      GROUP BY u.city, u.state
      ORDER BY total_professionals DESC, u.city
    `);

    // Process the results to group categories properly
    const processedResults = result.rows.map(row => {
      const categoryMap = {};
      row.categories.forEach(cat => {
        if (categoryMap[cat.category_name]) {
          categoryMap[cat.category_name] += cat.count;
        } else {
          categoryMap[cat.category_name] = cat.count;
        }
      });

      return {
        city: row.city,
        state: row.state,
        total_professionals: parseInt(row.total_professionals),
        categories: Object.entries(categoryMap).map(([name, count]) => ({
          category_name: name,
          count: count
        }))
      };
    });

    res.json(processedResults);
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de profissionais por cidade' });
  }
});

// =============================================================================
// IMAGE UPLOAD ROUTES
// =============================================================================

// Upload image route
app.post('/api/upload-image', authenticate, async (req, res) => {
  try {
    console.log('🔄 Image upload request received');
    
    // Create upload middleware instance
    const upload = createUpload();
    
    // Use multer middleware
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer error:', err);
        return res.status(400).json({ 
          message: err.message || 'Erro no upload da imagem' 
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
      }

      console.log('✅ Image uploaded to Cloudinary:', req.file.path);

      try {
        // Update user's photo_url in database
        await pool.query(
          'UPDATE users SET photo_url = $1 WHERE id = $2',
          [req.file.path, req.user.id]
        );

        console.log('✅ User photo_url updated in database');

        res.json({
          message: 'Imagem enviada com sucesso',
          imageUrl: req.file.path
        });
      } catch (dbError) {
        console.error('❌ Database update error:', dbError);
        res.status(500).json({ message: 'Erro ao salvar URL da imagem no banco de dados' });
      }
    });
  } catch (error) {
    console.error('❌ Image upload error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// =============================================================================
// PAYMENT ROUTES (MERCADOPAGO INTEGRATION)
// =============================================================================

// Create subscription payment
app.post('/api/create-subscription', authenticate, authorize(['client']), async (req, res) => {
  try {
    const { user_id, dependent_ids } = req.body;

    // Validate that user is creating payment for themselves
    if (req.user.id !== user_id) {
      return res.status(403).json({ message: 'Você só pode criar pagamentos para sua própria conta' });
    }

    // Get user data
    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // Get dependents count
    const dependentsResult = await pool.query(
      'SELECT COUNT(*) FROM dependents WHERE client_id = $1',
      [user_id]
    );

    const dependentCount = parseInt(dependentsResult.rows[0].count);

    // Calculate total amount (R$250 for titular + R$50 per dependent)
    const totalAmount = 250 + (dependentCount * 50);

    console.log('🔄 Creating subscription payment:', {
      user_id,
      user_name: user.name,
      dependent_count: dependentCount,
      total_amount: totalAmount
    });

    // Create MercadoPago preference
    const { MercadoPagoConfig, Preference } = await import('mercadopago');
    
    const client = new MercadoPagoConfig({ 
      accessToken: process.env.MP_ACCESS_TOKEN 
    });
    
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Assinatura Cartão Quiro Ferreira - ${user.name}`,
          description: `Assinatura mensal (Titular + ${dependentCount} dependente(s))`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: totalAmount
        }
      ],
      payer: {
        name: user.name,
        email: user.email || 'contato@quiroferreira.com.br'
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/payment-success`,
        failure: `${req.protocol}://${req.get('host')}/payment-failure`,
        pending: `${req.protocol}://${req.get('host')}/payment-pending`
      },
      auto_return: 'approved',
      external_reference: `subscription_${user_id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`
    };

    const result = await preference.create({ body: preferenceData });

    console.log('✅ MercadoPago preference created:', result.id);

    res.json({
      preference_id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });
  } catch (error) {
    console.error('❌ Subscription payment creation error:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento da assinatura' });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }

    // Get professional data
    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    console.log('🔄 Creating professional payment:', {
      professional_id: req.user.id,
      professional_name: user.name,
      amount
    });

    // Create MercadoPago preference
    const { MercadoPagoConfig, Preference } = await import('mercadopago');
    
    const client = new MercadoPagoConfig({ 
      accessToken: process.env.MP_ACCESS_TOKEN 
    });
    
    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Repasse ao Convênio Quiro Ferreira - ${user.name}`,
          description: 'Pagamento de repasse mensal ao convênio',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: parseFloat(amount)
        }
      ],
      payer: {
        name: user.name,
        email: user.email || 'contato@quiroferreira.com.br'
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/payment-success`,
        failure: `${req.protocol}://${req.get('host')}/payment-failure`,
        pending: `${req.protocol}://${req.get('host')}/payment-pending`
      },
      auto_return: 'approved',
      external_reference: `professional_payment_${req.user.id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`
    };

    const result = await preference.create({ body: preferenceData });

    console.log('✅ Professional payment preference created:', result.id);

    res.json({
      preference_id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });
  } catch (error) {
    console.error('❌ Professional payment creation error:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento do profissional' });
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
      const { MercadoPagoConfig, Payment } = await import('mercadopago');
      
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MP_ACCESS_TOKEN 
      });
      
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: paymentId });

      console.log('💳 Payment data from MercadoPago:', {
        id: paymentData.id,
        status: paymentData.status,
        external_reference: paymentData.external_reference
      });

      if (paymentData.status === 'approved') {
        const externalReference = paymentData.external_reference;
        
        if (externalReference?.startsWith('subscription_')) {
          // Handle subscription payment
          const userId = externalReference.split('_')[1];
          
          // Activate user subscription for 1 month
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          
          await pool.query(`
            UPDATE users 
            SET subscription_status = 'active', subscription_expiry = $1
            WHERE id = $2
          `, [expiryDate, userId]);

          console.log('✅ Subscription activated for user:', userId);
        } else if (externalReference?.startsWith('professional_payment_')) {
          // Handle professional payment
          const professionalId = externalReference.split('_')[2];
          
          console.log('✅ Professional payment processed for user:', professionalId);
          // Here you could update payment records or send notifications
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ message: 'Erro ao processar webhook' });
  }
});

// =============================================================================
// PAYMENT SUCCESS/FAILURE PAGES
// =============================================================================

// Payment success page
app.get('/payment-success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagamento Aprovado - Quiro Ferreira</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f9ff; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .success { color: #059669; font-size: 24px; margin-bottom: 20px; }
            .btn { background: #c11c22; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success">✅ Pagamento Aprovado!</div>
            <h2>Obrigado pelo seu pagamento!</h2>
            <p>Seu pagamento foi processado com sucesso. Você receberá um email de confirmação em breve.</p>
            <a href="/" class="btn">Voltar ao Sistema</a>
        </div>
    </body>
    </html>
  `);
});

// Payment failure page
app.get('/payment-failure', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagamento Rejeitado - Quiro Ferreira</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fef2f2; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .error { color: #dc2626; font-size: 24px; margin-bottom: 20px; }
            .btn { background: #c11c22; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="error">❌ Pagamento Rejeitado</div>
            <h2>Houve um problema com seu pagamento</h2>
            <p>Seu pagamento não pôde ser processado. Tente novamente ou entre em contato conosco.</p>
            <a href="/" class="btn">Voltar ao Sistema</a>
        </div>
    </body>
    </html>
  `);
});

// Payment pending page
app.get('/payment-pending', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagamento Pendente - Quiro Ferreira</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fffbeb; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .pending { color: #d97706; font-size: 24px; margin-bottom: 20px; }
            .btn { background: #c11c22; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="pending">⏳ Pagamento Pendente</div>
            <h2>Seu pagamento está sendo processado</h2>
            <p>Aguarde a confirmação do pagamento. Você receberá uma notificação quando for aprovado.</p>
            <a href="/" class="btn">Voltar ao Sistema</a>
        </div>
    </body>
    </html>
  `);
});

// =============================================================================
// HEALTH CHECK AND UTILITY ROUTES
// =============================================================================

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW()');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      database_time: dbResult.rows[0].now,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Get server info
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Convênio Quiro Ferreira API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// CATCH-ALL ROUTE FOR SPA
// =============================================================================

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    message: 'Erro interno do servidor',
    ...(isDevelopment && { error: err.message, stack: err.stack })
  });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Endpoint não encontrado' });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const startServer = async () => {
  try {
    // Test database connection and initialize schema
    await testConnection();
    
    // Start server
    app.listen(PORT, () => {
      console.log('🚀 Server running on port:', PORT);
      console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
      console.log('📊 API endpoints available at: /api/*');
      console.log('🏥 Convênio Quiro Ferreira API is ready!');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;