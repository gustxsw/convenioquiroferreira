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
import mercadopago from 'mercadopago';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure MercadoPago SDK v2
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://cartaoquiroferreira.com.br',
      'https://www.cartaoquiroferreira.com.br'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve static files
app.use(express.static('dist'));

// Database structure verification and correction
async function checkAndFixDatabaseStructure() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Checking and fixing database structure (users-only)...');
    
    // Start transaction for safety
    await client.query('BEGIN');
    
    // 1. Ensure users table has proper structure (no separate clients table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        client_id INTEGER DEFAULT NULL,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE,
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
        password VARCHAR(255) NOT NULL,
        roles TEXT[] DEFAULT ARRAY['client'],
        photo_url TEXT,
        category_id INTEGER,
        percentage DECIMAL(5,2) DEFAULT 50.00,
        crm VARCHAR(50),
        signature_url TEXT,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table verified/created');

    // Add missing columns to users if they don't exist (including client fields)
    const userColumns = [
      'client_id INTEGER',
      'roles TEXT[]',
      'photo_url TEXT',
      'category_id INTEGER',
      'percentage DECIMAL(5,2) DEFAULT 50.00',
      'crm VARCHAR(50)',
      'signature_url TEXT',
      'subscription_status VARCHAR(20) DEFAULT \'pending\'',
      'subscription_expiry DATE',
      'address TEXT',
      'address_number VARCHAR(20)',
      'address_complement VARCHAR(100)',
      'neighborhood VARCHAR(100)',
      'city VARCHAR(100)',
      'state VARCHAR(2)',
      'zip_code VARCHAR(8)',
      'birth_date DATE'
    ];

    for (const column of userColumns) {
      const [columnName] = column.split(' ');
      try {
        await client.query(`
          DO $$ 
          BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = '${columnName}') THEN
              ALTER TABLE users ADD COLUMN ${column};
            END IF;
          END $$;
        `);
      } catch (error) {
        console.warn(`Warning: Could not add column ${columnName}:`, error.message);
      }
    }
    console.log('✅ Users table columns verified');

    // 2. Ensure dependents table references users(id) as client_id
    await client.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE,
        birth_date DATE,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry DATE,
        billing_amount DECIMAL(10,2) DEFAULT 50.00,
        payment_reference VARCHAR(255),
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Dependents table verified/created');

    // 3. Ensure consultations table has proper structure
    await client.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER,
        professional_id INTEGER NOT NULL REFERENCES users(id),
        service_id INTEGER NOT NULL,
        location_id INTEGER,
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Consultations table verified/created');

    // 4. Create payment tables with proper client_id references
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'subscription',
        mp_payment_id VARCHAR(100),
        mp_preference_id VARCHAR(100),
        payment_status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER NOT NULL REFERENCES dependents(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        mp_payment_id VARCHAR(100),
        mp_preference_id VARCHAR(100),
        payment_status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mercadopago_payment_id VARCHAR(255),
        mercadopago_preference_id VARCHAR(255),
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        consultation_id INTEGER REFERENCES consultations(id),
        amount DECIMAL(10,2) NOT NULL,
        mp_payment_id VARCHAR(100),
        mp_preference_id VARCHAR(100),
        payment_status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Payment tables verified/created');

    // 5. Create other necessary tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER,
        is_base_service BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id) ON DELETE CASCADE,
        patient_name VARCHAR(255) NOT NULL,
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
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        private_patient_id INTEGER REFERENCES private_patients(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
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
        zip_code VARCHAR(8),
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ All tables verified/created');

    // 6. Migrate role to roles array if needed
    try {
      const roleColumnExists = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
      `);
      
      if (roleColumnExists.rows.length > 0) {
        await client.query(`
          UPDATE users 
          SET roles = ARRAY[role] 
          WHERE roles IS NULL AND role IS NOT NULL
        `);
        console.log('✅ Migrated role data to roles array');
      }
      console.log('✅ Role migration completed');
    } catch (error) {
      console.warn('Warning: Could not migrate role data:', error.message);
    }

    // 7. Set client_id for users who are clients (have 'client' role)
    try {
      await client.query(`
        UPDATE users 
        SET client_id = id 
        WHERE 'client' = ANY(roles) AND client_id IS NULL
      `);
      console.log('✅ Client IDs synchronized for client users');
    } catch (error) {
      console.log('⚠️ Client ID sync not needed or failed:', error.message);
    }

    await client.query('COMMIT');
    console.log('✅ Database structure verification completed');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in database structure verification:', error);
  } finally {
    client.release();
  }
}

// Helper function to get production URLs
function getProductionUrls() {
  const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.PORT === '3001' ||
                     process.env.DATABASE_URL?.includes('neon.tech');
  
  const baseUrl = isProduction 
    ? 'https://www.cartaoquiroferreira.com.br'
    : 'http://localhost:3001';
    
  return {
    baseUrl,
    successUrl: `${baseUrl}?payment=success`,
    failureUrl: `${baseUrl}?payment=failure`,
    pendingUrl: `${baseUrl}?payment=pending`
  };
}

// ==================== AUTH ROUTES ====================

// Login route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;
    
    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    const result = await pool.query(
      'SELECT id, name, cpf, roles, password FROM users WHERE cpf = $1',
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
    
    const userRoles = user.roles || ['client'];
    const needsRoleSelection = userRoles.length > 1;
    
    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: userRoles
    };
    
    res.json({
      user: userData,
      needsRoleSelection
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Role selection route
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
    
    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: userRoles,
      currentRole: role
    };
    
    res.json({
      user: userData,
      token
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
    const userId = req.user.id;
    
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
      return res.status(403).json({ message: 'Role não autorizada' });
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
    
    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: userRoles,
      currentRole: role
    };
    
    res.json({
      user: userData,
      token
    });
    
  } catch (error) {
    console.error('Switch role error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Register route (clients only)
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
    
    if (cleanCpf.length !== 11) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cleanCpf]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create client record
      const clientResult = await client.query(
        `INSERT INTO clients (name, cpf, email, phone, birth_date, address, address_number, 
         address_complement, neighborhood, city, state, subscription_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending') 
         RETURNING client_id`,
        [name, cleanCpf, email, phone, birth_date, address, address_number, 
         address_complement, neighborhood, city, state]
      );
      
      const clientId = clientResult.rows[0].client_id;
      
      // Create user record linked to client
      const userResult = await client.query(
        `INSERT INTO users (client_id, name, cpf, email, phone, birth_date, address, 
         address_number, address_complement, neighborhood, city, state, password, roles, subscription_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, ARRAY['client'], 'pending') 
         RETURNING id`,
        [clientId, name, cleanCpf, email, phone, birth_date, address, 
         address_number, address_complement, neighborhood, city, state, hashedPassword]
      );
      
      await client.query('COMMIT');
      
      const userData = {
        id: userResult.rows[0].id,
        client_id: clientId,
        name,
        cpf: cleanCpf,
        roles: ['client']
      };
      
      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: userData
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      res.status(409).json({ message: 'CPF já cadastrado' });
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

// ==================== USER ROUTES ====================

// Get all users (admin only)
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.cpf, u.email, u.phone, u.roles, u.subscription_status, 
             u.subscription_expiry, u.created_at, c.client_id
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.client_id
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
    
    const result = await pool.query(`
      SELECT u.*, c.client_id, sc.name as category_name
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.client_id
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    const user = result.rows[0];
    delete user.password;
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update user
app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, currentPassword, newPassword } = req.body;
    
    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password if changing password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória' });
      }
      
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }
    }
    
    // Prepare update data
    let updateQuery = 'UPDATE users SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP';
    let updateValues = [name, email, phone];
    let paramCount = 3;
    
    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateQuery += `, password = $${++paramCount}`;
      updateValues.push(hashedPassword);
    }
    
    updateQuery += ` WHERE id = $${++paramCount} RETURNING id, name, email, phone`;
    updateValues.push(id);
    
    const result = await pool.query(updateQuery, updateValues);
    
    res.json({
      message: 'Usuário atualizado com sucesso',
      user: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get user subscription status
app.get('/api/users/:id/subscription-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT u.subscription_status, u.subscription_expiry, c.client_id
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.client_id
      WHERE u.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== CLIENT ROUTES ====================

// Client lookup by CPF
app.get('/api/clients/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;
    
    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const result = await pool.query(
      'SELECT id as client_id, name, cpf, subscription_status, subscription_expiry FROM users WHERE cpf = $1 AND \'client\' = ANY(roles)',
      [cpf.replace(/\D/g, '')]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const client = result.rows[0];
    res.json({
      id: client.client_id, // This is actually users.id
      name: client.name,
      cpf: client.cpf,
      subscription_status: client.subscription_status,
      subscription_expiry: client.subscription_expiry
    });
  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get all clients (admin only)
app.get('/api/clients', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id as client_id, name, cpf, email, phone, subscription_status, subscription_expiry, created_at
      FROM users 
      WHERE 'client' = ANY(roles)
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update client subscription status
app.put('/api/clients/:id/subscription', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { subscription_status, subscription_expiry } = req.body;

    await pool.query(
      'UPDATE users SET subscription_status = $1, subscription_expiry = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND \'client\' = ANY(roles)',
      [subscription_status, subscription_expiry, id]
    );

    res.json({ message: 'Status de assinatura atualizado com sucesso' });
  } catch (error) {
    console.error('Error updating subscription status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== DEPENDENT ROUTES ====================

// Get dependents by client ID
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Verify client exists and user has access
    const clientCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND \'client\' = ANY(roles)',
      [clientId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    // Check if user has access (is the client or is admin)
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT d.*, 
             CASE 
               WHEN d.subscription_status = 'active' AND d.subscription_expiry > CURRENT_DATE THEN 'active'
               WHEN d.subscription_status = 'active' AND d.subscription_expiry <= CURRENT_DATE THEN 'expired'
               ELSE d.subscription_status
             END as current_status
      FROM dependents d
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
      SELECT d.*, 
             u.name as client_name,
             u.subscription_status as client_subscription_status,
             d.subscription_status as dependent_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1
    `, [cpf.replace(/\D/g, '')]);

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
    
    // Verify client exists
    const clientCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND \'client\' = ANY(roles)',
      [client_id]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    // Check if user has access (is the client or is admin)
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(client_id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Check if CPF already exists
    if (cpf) {
      const cpfCheck = await pool.query(
        'SELECT id FROM dependents WHERE cpf = $1',
        [cpf]
      );

      if (cpfCheck.rows.length > 0) {
        return res.status(400).json({ message: 'CPF já cadastrado' });
      }
    }

    const result = await pool.query(
      `INSERT INTO dependents (client_id, name, cpf, birth_date, subscription_status, billing_amount)
       VALUES ($1, $2, $3, $4, 'pending', 50.00)
       RETURNING *`,
      [client_id, name, cpf, birth_date]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating dependent:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'CPF já cadastrado' });
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

    // Get dependent to check client_id
    const dependentCheck = await pool.query(
      'SELECT client_id FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentCheck.rows[0];

    // Check if user has access
    if (req.user.currentRole !== 'admin' && req.user.id !== dependent.client_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query(
      'UPDATE dependents SET name = $1, birth_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [name, birth_date, id]
    );

    res.json({ message: 'Dependente atualizado com sucesso' });
  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Delete dependent
app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get dependent to check client_id
    const dependentCheck = await pool.query(
      'SELECT client_id FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentCheck.rows[0];

    // Check if user has access
    if (req.user.currentRole !== 'admin' && req.user.id !== dependent.client_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query('DELETE FROM dependents WHERE id = $1', [id]);

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create dependent payment
app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get dependent info
    const dependentResult = await pool.query(`
      SELECT d.*, 
             u.name as client_name,
             u.email as client_email
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.id = $1
    `, [id]);

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];

    // Check if user has access
    if (req.user.currentRole !== 'admin' && req.user.id !== dependent.client_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Create payment preference
    const preference = {
      items: [{
        title: `Ativação de Dependente - ${dependent.name}`,
        quantity: 1,
        unit_price: 50.00,
        currency_id: 'BRL'
      }],
      payer: {
        name: dependent.client_name,
        email: dependent.client_email || 'contato@quiroferreira.com.br'
      },
      back_urls: {
        success: `${getBaseUrl()}/client?payment=success&type=dependent`,
        failure: `${getBaseUrl()}/client?payment=failure&type=dependent`,
        pending: `${getBaseUrl()}/client?payment=pending&type=dependent`
      },
      auto_return: 'approved',
      notification_url: `${getBaseUrl()}/api/webhook/mercadopago`,
      external_reference: `dependent_${dependent.id}`,
      metadata: {
        type: 'dependent_payment',
        dependent_id: dependent.id,
        client_id: dependent.client_id,
        amount: 50.00
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    // Store payment reference
    await pool.query(
      'UPDATE dependents SET payment_reference = $1 WHERE id = $2',
      [response.body.id, dependent.id]
    );

    res.json({
      preference_id: response.body.id,
      init_point: response.body.init_point
    });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// ==================== PAYMENT ROUTES ====================

// Create subscription payment (client)
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    
    // Get user info
    const userResult = await pool.query(
      'SELECT id, name, email, cpf FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // Check if user has access
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(user_id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Create payment preference
    const preference = {
      items: [{
        title: 'Assinatura Cartão Quiro Ferreira - Titular',
        quantity: 1,
        unit_price: 250.00,
        currency_id: 'BRL'
      }],
      payer: {
        name: user.name,
        email: user.email || 'contato@quiroferreira.com.br'
      },
      back_urls: {
        success: `${getBaseUrl()}/client?payment=success&type=subscription`,
        failure: `${getBaseUrl()}/client?payment=failure&type=subscription`,
        pending: `${getBaseUrl()}/client?payment=pending&type=subscription`
      },
      auto_return: 'approved',
      notification_url: `${getBaseUrl()}/api/webhook/mercadopago`,
      external_reference: `subscription_${user.id}`,
      metadata: {
        type: 'subscription_payment',
        user_id: user.id,
        client_id: user.id, // Same as user_id since no separate clients table
        amount: 250.00
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    res.json({
      preference_id: response.body.id,
      init_point: response.body.init_point
    });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;
    const professionalId = req.user.id;
    const urls = getProductionUrls();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido' });
    }
    
    // Get professional data
    const userResult = await pool.query(
      'SELECT name, email, cpf FROM users WHERE id = $1',
      [professionalId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }
    
    const professional = userResult.rows[0];
    
    const preference = {
      items: [{
        title: 'Repasse ao Convênio Quiro Ferreira',
        description: `Pagamento de repasse - ${professional.name}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: parseFloat(amount)
      }],
      payer: {
        name: professional.name,
        email: professional.email || 'profissional@cartaoquiroferreira.com.br',
        identification: {
          type: 'CPF',
          number: professional.cpf
        }
      },
      back_urls: {
        success: `${urls.baseUrl}/professional?payment=success&type=professional`,
        failure: `${urls.baseUrl}/professional?payment=failure&type=professional`,
        pending: `${urls.baseUrl}/professional?payment=pending&type=professional`
      },
      auto_return: 'approved',
      external_reference: `professional_${professionalId}_${Date.now()}`,
      notification_url: `${urls.baseUrl}/api/webhooks/mercadopago`,
      metadata: {
        professional_id: professionalId,
        payment_type: 'professional'
      }
    };
    
    const response = await mercadopago.preferences.create(preference);
    
    // Save payment record
    await pool.query(
      `INSERT INTO professional_payments (professional_id, amount, payment_method, payment_reference, mercadopago_preference_id) 
       VALUES ($1, $2, 'mercadopago', $3, $4)`,
      [professionalId, amount, preference.external_reference, response.body.id]
    );
    
    res.json({
      preference_id: response.body.id,
      init_point: response.body.init_point
    });
    
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Create agenda payment
app.post('/api/agenda/create-payment', authenticate, async (req, res) => {
  try {
    const { consultation_id, amount } = req.body;
    const urls = getProductionUrls();
    
    // Get consultation and client data
    const result = await pool.query(`
      SELECT c.*, cl.name as client_name, cl.cpf as client_cpf, cl.email as client_email,
             s.name as service_name
      FROM consultations c
      JOIN clients cl ON c.client_id = cl.client_id
      JOIN services s ON c.service_id = s.id
      WHERE c.id = $1
    `, [consultation_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }
    
    const consultation = result.rows[0];
    
    const preference = {
      items: [{
        title: `Consulta - ${consultation.service_name}`,
        description: `Pagamento da consulta para ${consultation.client_name}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: parseFloat(amount)
      }],
      payer: {
        name: consultation.client_name,
        email: consultation.client_email || 'cliente@cartaoquiroferreira.com.br',
        identification: {
          type: 'CPF',
          number: consultation.client_cpf
        }
      },
      back_urls: {
        success: `${urls.baseUrl}/client?payment=success&type=agenda`,
        failure: `${urls.baseUrl}/client?payment=failure&type=agenda`,
        pending: `${urls.baseUrl}/client?payment=pending&type=agenda`
      },
      auto_return: 'approved',
      external_reference: `agenda_${consultation_id}_${Date.now()}`,
      notification_url: `${urls.baseUrl}/api/webhooks/mercadopago`,
      metadata: {
        consultation_id: consultation_id,
        client_id: consultation.client_id,
        payment_type: 'agenda'
      }
    };
    
    const response = await mercadopago.preferences.create(preference);
    
    // Save payment record
    await pool.query(
      `INSERT INTO agenda_payments (client_id, consultation_id, amount, payment_method, payment_reference, mercadopago_preference_id) 
       VALUES ($1, $2, $3, 'mercadopago', $4, $5)`,
      [consultation.client_id, consultation_id, amount, preference.external_reference, response.body.id]
    );
    
    res.json({
      preference_id: response.body.id,
      init_point: response.body.init_point
    });
    
  } catch (error) {
    console.error('Error creating agenda payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// ==================== CONSULTATION ROUTES ====================

// Get consultations for a client
app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Check if user has access
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT c.*, 
             s.name as service_name,
             u.name as professional_name,
             COALESCE(d.name, cl.name) as client_name,
             CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.professional_id = u.id
      LEFT JOIN users cl ON c.client_id = cl.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE c.client_id = $1 OR d.client_id = $1
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get all consultations
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT c.*, 
             COALESCE(cl.name, pp.name) as client_name,
             COALESCE(d.name, cl.name, pp.name) as patient_name,
             s.name as service_name,
             u.name as professional_name,
             al.name as location_name,
             CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN users cl ON c.client_id = cl.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.professional_id = u.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
    `;
    
    let queryParams = [];
    
    // Filter by professional if not admin
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
      status = 'completed',
      notes 
    } = req.body;

    // Validate that we have either client_id, dependent_id, or private_patient_id
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    // If dependent_id is provided, get the client_id
    let finalClientId = client_id;
    if (dependent_id) {
      const dependentResult = await pool.query(
        'SELECT client_id FROM dependents WHERE id = $1',
        [dependent_id]
      );
      
      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: 'Dependente não encontrado' });
      }
      
      finalClientId = dependentResult.rows[0].client_id;
    }

    const result = await pool.query(
      `INSERT INTO consultations (client_id, dependent_id, private_patient_id, professional_id, service_id, location_id, value, date, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [finalClientId, dependent_id, private_patient_id, req.user.id, service_id, location_id, value, date, status, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Update consultation status
app.put('/api/consultations/:id/status', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Status inválido' });
    }

    // Check if consultation exists and user has access
    const consultationCheck = await pool.query(
      'SELECT professional_id FROM consultations WHERE id = $1',
      [id]
    );

    if (consultationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    const consultation = consultationCheck.rows[0];

    // Check access (professional can only update their own consultations)
    if (req.user.currentRole === 'professional' && req.user.id !== consultation.professional_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query(
      'UPDATE consultations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, id]
    );

    res.json({ message: 'Status da consulta atualizado com sucesso' });
  } catch (error) {
    console.error('Error updating consultation status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICE ROUTES ====================

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
    
    const result = await pool.query(
      `INSERT INTO services (name, description, base_price, category_id, is_base_service) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, description, base_price, category_id, is_base_service || false]
    );
    
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
    
    const result = await pool.query(
      `UPDATE services 
       SET name = $1, description = $2, base_price = $3, category_id = $4, is_base_service = $5 
       WHERE id = $6 
       RETURNING *`,
      [name, description, base_price, category_id, is_base_service, id]
    );
    
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
    
    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }
    
    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== SERVICE CATEGORY ROUTES ====================

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
    
    const result = await pool.query(
      'INSERT INTO service_categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    
    res.status(201).json({
      message: 'Categoria criada com sucesso',
      category: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== PROFESSIONAL ROUTES ====================

// Get all professionals
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.address, u.address_number, 
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

// ==================== PRIVATE PATIENT ROUTES ====================

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
    
    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }
    
    const result = await pool.query(
      `INSERT INTO private_patients (professional_id, name, cpf, email, phone, birth_date, 
       address, address_number, address_complement, neighborhood, city, state, zip_code) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [req.user.id, name, cpf, email, phone, birth_date, address, address_number,
       address_complement, neighborhood, city, state, zip_code]
    );
    
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
    
    const result = await pool.query(
      `UPDATE private_patients 
       SET name = $1, email = $2, phone = $3, birth_date = $4, address = $5, 
           address_number = $6, address_complement = $7, neighborhood = $8, 
           city = $9, state = $10, zip_code = $11, updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND professional_id = $13 
       RETURNING *`,
      [name, email, phone, birth_date, address, address_number, address_complement,
       neighborhood, city, state, zip_code, id, req.user.id]
    );
    
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

// ==================== MEDICAL RECORDS ROUTES ====================

// Get medical records for professional
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM medical_records WHERE professional_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    
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
      private_patient_id, chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis, treatment_plan, notes, vital_signs
    } = req.body;
    
    if (!private_patient_id) {
      return res.status(400).json({ message: 'Paciente é obrigatório' });
    }
    
    // Get patient name
    const patientResult = await pool.query(
      'SELECT name FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }
    
    const result = await pool.query(
      `INSERT INTO medical_records (professional_id, private_patient_id, patient_name, 
       chief_complaint, history_present_illness, past_medical_history, medications, 
       allergies, physical_examination, diagnosis, treatment_plan, notes, vital_signs) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [req.user.id, private_patient_id, patientResult.rows[0].name, chief_complaint,
       history_present_illness, past_medical_history, medications, allergies,
       physical_examination, diagnosis, treatment_plan, notes, JSON.stringify(vital_signs)]
    );
    
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
      medications, allergies, physical_examination, diagnosis, treatment_plan, notes, vital_signs
    } = req.body;
    
    const result = await pool.query(
      `UPDATE medical_records 
       SET chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
           medications = $4, allergies = $5, physical_examination = $6, diagnosis = $7,
           treatment_plan = $8, notes = $9, vital_signs = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND professional_id = $12 
       RETURNING *`,
      [chief_complaint, history_present_illness, past_medical_history, medications,
       allergies, physical_examination, diagnosis, treatment_plan, notes,
       JSON.stringify(vital_signs), id, req.user.id]
    );
    
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
      return res.status(400).json({ message: 'ID do prontuário e dados do template são obrigatórios' });
    }
    
    // Verify record belongs to professional
    const recordResult = await pool.query(
      'SELECT * FROM medical_records WHERE id = $1 AND professional_id = $2',
      [record_id, req.user.id]
    );
    
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }
    
    const document = await generateDocumentPDF('medical_record', template_data);
    
    res.json({
      message: 'Documento gerado com sucesso',
      documentUrl: document.url
    });
    
  } catch (error) {
    console.error('Error generating medical record document:', error);
    res.status(500).json({ message: 'Erro ao gerar documento' });
  }
});

// ==================== MEDICAL DOCUMENTS ROUTES ====================

// Get medical documents for professional
app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM medical_documents WHERE professional_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    
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
      return res.status(400).json({ message: 'Título, tipo e dados são obrigatórios' });
    }
    
    const document = await generateDocumentPDF(document_type, template_data);
    
    const result = await pool.query(
      `INSERT INTO medical_documents (professional_id, private_patient_id, title, document_type, document_url) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [req.user.id, private_patient_id, title, document_type, document.url]
    );
    
    res.status(201).json({
      message: 'Documento criado com sucesso',
      document: result.rows[0],
      title,
      documentUrl: document.url
    });
    
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento' });
  }
});

// ==================== ATTENDANCE LOCATION ROUTES ====================

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
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // If setting as default, remove default from others
      if (is_default) {
        await client.query(
          'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1',
          [req.user.id]
        );
      }
      
      const result = await client.query(
        `INSERT INTO attendance_locations (professional_id, name, address, address_number, 
         address_complement, neighborhood, city, state, zip_code, phone, is_default) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [req.user.id, name, address, address_number, address_complement,
         neighborhood, city, state, zip_code, phone, is_default || false]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({
        message: 'Local criado com sucesso',
        location: result.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
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
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // If setting as default, remove default from others
      if (is_default) {
        await client.query(
          'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1 AND id != $2',
          [req.user.id, id]
        );
      }
      
      const result = await client.query(
        `UPDATE attendance_locations 
         SET name = $1, address = $2, address_number = $3, address_complement = $4,
             neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9, is_default = $10
         WHERE id = $11 AND professional_id = $12 
         RETURNING *`,
        [name, address, address_number, address_complement, neighborhood,
         city, state, zip_code, phone, is_default, id, req.user.id]
      );
      
      await client.query('COMMIT');
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Local não encontrado' });
      }
      
      res.json({
        message: 'Local atualizado com sucesso',
        location: result.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
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

// ==================== REPORT ROUTES ====================

// Revenue report (admin only)
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get total revenue
    const totalResult = await pool.query(
      'SELECT COALESCE(SUM(value), 0) as total_revenue FROM consultations WHERE date >= $1 AND date <= $2',
      [start_date, end_date]
    );

    // Get revenue by professional
    const professionalResult = await pool.query(`
      SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (u.percentage / 100)), 0) as professional_payment,
        COALESCE(SUM(c.value * ((100 - u.percentage) / 100)), 0) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get revenue by service
    const serviceResult = await pool.query(`
      SELECT 
        s.name as service_name,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    res.json({
      total_revenue: totalResult.rows[0].total_revenue,
      revenue_by_professional: professionalResult.rows,
      revenue_by_service: serviceResult.rows
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
    const professionalId = req.user.id;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }
    
    // Get professional percentage
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [professionalId]
    );
    
    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;
    
    // Get consultations for the period
    const consultationsResult = await pool.query(`
      SELECT c.date, 
             COALESCE(cl.name, d.name, pp.name) as client_name,
             s.name as service_name,
             c.value as total_value,
             CASE 
               WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL 
               THEN c.value * ((100 - $3) / 100)
               ELSE 0
             END as amount_to_pay
      FROM consultations c
      LEFT JOIN clients cl ON c.client_id = cl.client_id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `, [professionalId, start_date, professionalPercentage, end_date]);
    
    // Calculate summary
    const consultations = consultationsResult.rows;
    const totalRevenue = consultations.reduce((sum, c) => sum + parseFloat(c.total_value), 0);
    const amountToPay = consultations.reduce((sum, c) => sum + parseFloat(c.amount_to_pay), 0);
    
    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: totalRevenue,
        consultation_count: consultations.length,
        amount_to_pay: amountToPay
      },
      consultations: consultations
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
    const professionalId = req.user.id;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas são obrigatórias' });
    }
    
    // Get professional percentage
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [professionalId]
    );
    
    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;
    
    // Get consultation statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_consultations,
        COUNT(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 1 END) as convenio_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NOT NULL THEN 1 END) as private_consultations,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN c.value ELSE 0 END), 0) as convenio_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN c.value ELSE 0 END), 0) as private_revenue
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $3
    `, [professionalId, start_date, end_date]);
    
    const stats = statsResult.rows[0];
    const amountToPay = parseFloat(stats.convenio_revenue) * ((100 - professionalPercentage) / 100);
    
    res.json({
      summary: {
        total_consultations: parseInt(stats.total_consultations),
        convenio_consultations: parseInt(stats.convenio_consultations),
        private_consultations: parseInt(stats.private_consultations),
        total_revenue: parseFloat(stats.total_revenue),
        convenio_revenue: parseFloat(stats.convenio_revenue),
        private_revenue: parseFloat(stats.private_revenue),
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      }
    });
    
  } catch (error) {
    console.error('Error generating detailed report:', error);
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
      WHERE 'client' = ANY(roles)
      AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
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
      WHERE 'professional' = ANY(u.roles) 
        AND u.city IS NOT NULL AND u.city != ''
      GROUP BY u.city, u.state
      ORDER BY total_professionals DESC, u.city
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

// ==================== ADMIN ROUTES ====================

// Get all dependents (admin only)
app.get('/api/admin/dependents', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, c.name as client_name
      FROM dependents d
      JOIN clients c ON d.client_id = c.client_id
      ORDER BY d.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Get professionals with scheduling access (admin only)
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, 
             sc.name as category_name,
             false as has_scheduling_access,
             null as access_expires_at,
             null as access_granted_by,
             null as access_granted_at
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
    
    // For now, just return success since this is a campaign feature
    res.json({ message: 'Acesso concedido com sucesso' });
    
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
    
    // For now, just return success since this is a campaign feature
    res.json({ message: 'Acesso revogado com sucesso' });
    
  } catch (error) {
    console.error('Error revoking scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== UPLOAD ROUTES ====================

// Upload image route
app.post('/api/upload-image', authenticate, async (req, res) => {
  try {
    const upload = createUpload();
    
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ message: err.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo enviado' });
      }
      
      try {
        // Update user photo URL
        await pool.query(
          'UPDATE users SET photo_url = $1 WHERE id = $2',
          [req.file.path, req.user.id]
        );
        
        res.json({
          message: 'Imagem enviada com sucesso',
          imageUrl: req.file.path
        });
        
      } catch (dbError) {
        console.error('Database error after upload:', dbError);
        res.status(500).json({ message: 'Erro ao salvar URL da imagem' });
      }
    });
    
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== WEBHOOK ROUTES ====================

// MercadoPago webhook
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    console.log('🔔 MercadoPago webhook received:', { type, data });
    
    if (type === 'payment') {
      const paymentId = data.id;
      
      // Get payment details from MercadoPago
      const payment = await mercadopago.payment.findById(paymentId);
      const paymentData = payment.body;
      
      console.log('💳 Payment data:', paymentData);
      
      if (paymentData.status === 'approved') {
        const externalReference = paymentData.external_reference;
        const metadata = paymentData.metadata;
        
        if (externalReference.startsWith('subscription_')) {
          // Handle subscription payment
          const userId = metadata.user_id;
          
          if (userId) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              
              // Update user subscription
              const expiryDate = new Date();
              expiryDate.setFullYear(expiryDate.getFullYear() + 1);
              
              await client.query(
                `UPDATE users 
                 SET subscription_status = 'active', subscription_expiry = $1 
                 WHERE id = $2`,
                [expiryDate, userId]
              );
              
              // Update client subscription
              await client.query(
                `UPDATE clients 
                 SET subscription_status = 'active', subscription_expiry = $1 
                 WHERE client_id = (SELECT client_id FROM users WHERE id = $2)`,
                [expiryDate, userId]
              );
              
              // Update payment record
              await client.query(
                `UPDATE client_payments 
                 SET payment_status = 'approved', mercadopago_payment_id = $1, paid_at = CURRENT_TIMESTAMP 
                 WHERE payment_reference = $2`,
                [paymentId, externalReference]
              );
              
              await client.query('COMMIT');
              console.log('✅ Subscription activated for user:', userId);
              
            } catch (error) {
              await client.query('ROLLBACK');
              throw error;
            } finally {
              client.release();
            }
          }
        } else if (externalReference.startsWith('dependent_')) {
          // Handle dependent payment
          const dependentId = metadata.dependent_id;
          
          if (dependentId) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              
              // Update dependent subscription
              const expiryDate = new Date();
              expiryDate.setFullYear(expiryDate.getFullYear() + 1);
              
              await client.query(
                `UPDATE dependents 
                 SET subscription_status = 'active', subscription_expiry = $1, activated_at = CURRENT_TIMESTAMP 
                 WHERE id = $2`,
                [expiryDate, dependentId]
              );
              
              // Update payment record
              await client.query(
                `UPDATE dependent_payments 
                 SET payment_status = 'approved', mercadopago_payment_id = $1, paid_at = CURRENT_TIMESTAMP 
                 WHERE payment_reference = $2`,
                [paymentId, externalReference]
              );
              
              await client.query('COMMIT');
              console.log('✅ Dependent activated:', dependentId);
              
            } catch (error) {
              await client.query('ROLLBACK');
              throw error;
            } finally {
              client.release();
            }
          }
        } else if (externalReference.startsWith('professional_')) {
          // Handle professional payment
          await pool.query(
            `UPDATE professional_payments 
             SET payment_status = 'approved', mercadopago_payment_id = $1, paid_at = CURRENT_TIMESTAMP 
             WHERE payment_reference = $2`,
            [paymentId, externalReference]
          );
          
          console.log('✅ Professional payment confirmed:', externalReference);
        } else if (externalReference.startsWith('agenda_')) {
          // Handle agenda payment
          await pool.query(
            `UPDATE agenda_payments 
             SET payment_status = 'approved', mercadopago_payment_id = $1, paid_at = CURRENT_TIMESTAMP 
             WHERE payment_reference = $2`,
            [paymentId, externalReference]
          );
          
          console.log('✅ Agenda payment confirmed:', externalReference);
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// ==================== FALLBACK ROUTE ====================

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

// ==================== ERROR HANDLING ====================

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// ==================== SERVER STARTUP ====================

async function startServer() {
  try {
    // Check and fix database structure
    await checkAndFixDatabaseStructure();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Base URL: ${getProductionUrls().baseUrl}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();