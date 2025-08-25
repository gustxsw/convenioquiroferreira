import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { pool } from "./db.js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import path from "path";
import { fileURLToPath } from "url";
import { generateDocumentPDF } from "./utils/documentGenerator.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Configure MercadoPago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://www.cartaoquiroferreira.com.br',
    'https://cartaoquiroferreira.com.br'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Database initialization with all tables
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database tables...');

    // Users table with roles array and scheduling access
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
        password VARCHAR(255) NOT NULL,
        roles TEXT[] DEFAULT ARRAY['client'],
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        percentage DECIMAL(5,2) DEFAULT 50.00,
        category_id INTEGER,
        crm VARCHAR(50),
        photo_url TEXT,
        has_scheduling_access BOOLEAN DEFAULT FALSE,
        access_expires_at TIMESTAMP,
        access_granted_by INTEGER,
        access_granted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES service_categories(id),
        FOREIGN KEY (access_granted_by) REFERENCES users(id)
      )
    `);

    // Service categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Services table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER,
        is_base_service BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES service_categories(id)
      )
    `);

    // Dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        birth_date DATE,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        billing_amount DECIMAL(10,2) DEFAULT 50.00,
        payment_reference VARCHAR(255),
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Private patients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Attendance locations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_locations (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        address_number VARCHAR(20),
        address_complement VARCHAR(100),
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        zip_code VARCHAR(8),
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Consultations table with proper patient type tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        dependent_id INTEGER,
        private_patient_id INTEGER,
        professional_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        location_id INTEGER,
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (dependent_id) REFERENCES dependents(id),
        FOREIGN KEY (private_patient_id) REFERENCES private_patients(id),
        FOREIGN KEY (professional_id) REFERENCES users(id),
        FOREIGN KEY (service_id) REFERENCES services(id),
        FOREIGN KEY (location_id) REFERENCES attendance_locations(id)
      )
    `);

    // Appointments table for scheduling system
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        private_patient_id INTEGER,
        service_id INTEGER,
        location_id INTEGER,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (private_patient_id) REFERENCES private_patients(id),
        FOREIGN KEY (service_id) REFERENCES services(id),
        FOREIGN KEY (location_id) REFERENCES attendance_locations(id)
      )
    `);

    // Medical records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        private_patient_id INTEGER NOT NULL,
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (private_patient_id) REFERENCES private_patients(id) ON DELETE CASCADE
      )
    `);

    // Medical documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        private_patient_id INTEGER,
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        template_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (private_patient_id) REFERENCES private_patients(id)
      )
    `);

    // Client payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'subscription',
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Dependent payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependent_payments (
        id SERIAL PRIMARY KEY,
        dependent_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dependent_id) REFERENCES dependents(id) ON DELETE CASCADE
      )
    `);

    // Professional payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'clinic_fee',
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Agenda payments table (NEW)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        duration_days INTEGER DEFAULT 30,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_reference VARCHAR(255),
        mp_payment_id VARCHAR(255),
        mp_preference_id VARCHAR(255),
        access_granted_at TIMESTAMP,
        access_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Audit logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100),
        record_id INTEGER,
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // System settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default system settings
    await pool.query(`
      INSERT INTO system_settings (key, value, description) 
      VALUES 
        ('default_scheduling_access_days', '7', 'Default days for admin-granted scheduling access'),
        ('agenda_subscription_price', '100', 'Monthly price for agenda subscription in BRL'),
        ('client_subscription_price', '250', 'Client subscription price in BRL'),
        ('dependent_subscription_price', '50', 'Dependent subscription price in BRL')
      ON CONFLICT (key) DO NOTHING
    `);

    // Insert default service categories
    await pool.query(`
      INSERT INTO service_categories (name, description) 
      VALUES 
        ('Medicina', 'Serviços médicos gerais'),
        ('Fisioterapia', 'Serviços de fisioterapia e reabilitação'),
        ('Psicologia', 'Serviços de psicologia e terapia'),
        ('Nutrição', 'Serviços de nutrição e dietética'),
        ('Odontologia', 'Serviços odontológicos'),
        ('Quiropraxia', 'Serviços de quiropraxia'),
        ('Outros', 'Outros serviços de saúde')
      ON CONFLICT (name) DO NOTHING
    `);

    // Insert default services
    await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      SELECT 
        'Consulta Médica', 
        'Consulta médica geral', 
        150.00, 
        sc.id, 
        true
      FROM service_categories sc 
      WHERE sc.name = 'Medicina'
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      SELECT 
        'Sessão de Fisioterapia', 
        'Sessão individual de fisioterapia', 
        80.00, 
        sc.id, 
        true
      FROM service_categories sc 
      WHERE sc.name = 'Fisioterapia'
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service)
      SELECT 
        'Consulta Psicológica', 
        'Sessão de psicoterapia individual', 
        120.00, 
        sc.id, 
        true
      FROM service_categories sc 
      WHERE sc.name = 'Psicologia'
      ON CONFLICT DO NOTHING
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
      'SELECT id, name, cpf, roles, has_scheduling_access, access_expires_at FROM users WHERE id = $1',
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
      currentRole: decoded.currentRole || (user.roles && user.roles[0]),
      hasSchedulingAccess: user.has_scheduling_access,
      schedulingAccessExpiresAt: user.access_expires_at
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
    if (!req.user) {
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    // Check if user has scheduling access
    const result = await pool.query(
      'SELECT has_scheduling_access, access_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    if (!user.has_scheduling_access) {
      return res.status(403).json({ 
        message: 'Acesso à agenda não autorizado',
        code: 'NO_SCHEDULING_ACCESS'
      });
    }

    // Check if access has expired
    if (user.access_expires_at) {
      const expiryDate = new Date(user.access_expires_at);
      const now = new Date();
      
      if (expiryDate < now) {
        // Revoke expired access
        await pool.query(
          'UPDATE users SET has_scheduling_access = FALSE WHERE id = $1',
          [req.user.id]
        );
        
        return res.status(403).json({ 
          message: 'Acesso à agenda expirado',
          code: 'SCHEDULING_ACCESS_EXPIRED'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Scheduling access check error:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'quiro-ferreira/professionals',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto:good',
      },
    ],
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
  },
});

// Utility functions
const generateToken = (user, currentRole) => {
  return jwt.sign(
    { 
      id: user.id, 
      currentRole: currentRole || (user.roles && user.roles[0]) 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// 🔥 FIXED: Corrected calculation logic for convenio consultations
const calculateProfessionalRevenue = async (professionalId, startDate, endDate) => {
  try {
    console.log('🔄 Calculating revenue for professional:', professionalId);
    console.log('🔄 Date range:', { startDate, endDate });

    // Get professional percentage
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [professionalId]
    );

    if (professionalResult.rows.length === 0) {
      throw new Error('Profissional não encontrado');
    }

    const professionalPercentage = Number(professionalResult.rows[0].percentage) || 50;
    console.log('🔄 Professional percentage:', professionalPercentage);

    // Get all consultations for the period
    const consultationsResult = await pool.query(`
      SELECT 
        c.*,
        s.name as service_name,
        CASE 
          WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 'convenio'
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'unknown'
        END as patient_type,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE 'Desconhecido'
        END as patient_name
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 
        AND c.date <= $3
      ORDER BY c.date DESC
    `, [professionalId, startDate, endDate]);

    const consultations = consultationsResult.rows;
    console.log('🔄 Found consultations:', consultations.length);

    // Separate convenio and private consultations
    const convenioConsultations = consultations.filter(c => c.patient_type === 'convenio');
    const privateConsultations = consultations.filter(c => c.patient_type === 'private');

    console.log('🔄 Convenio consultations:', convenioConsultations.length);
    console.log('🔄 Private consultations:', privateConsultations.length);

    // Calculate revenues
    const convenioRevenue = convenioConsultations.reduce((sum, c) => sum + Number(c.value), 0);
    const privateRevenue = privateConsultations.reduce((sum, c) => sum + Number(c.value), 0);
    const totalRevenue = convenioRevenue + privateRevenue;

    console.log('🔄 Convenio revenue:', convenioRevenue);
    console.log('🔄 Private revenue:', privateRevenue);
    console.log('🔄 Total revenue:', totalRevenue);

    // Calculate amount to pay to clinic (only from convenio consultations)
    const clinicPercentage = 100 - professionalPercentage;
    const amountToPay = (convenioRevenue * clinicPercentage) / 100;

    console.log('🔄 Clinic percentage:', clinicPercentage);
    console.log('🔄 Amount to pay to clinic:', amountToPay);

    return {
      summary: {
        total_consultations: consultations.length,
        convenio_consultations: convenioConsultations.length,
        private_consultations: privateConsultations.length,
        total_revenue: totalRevenue,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      },
      consultations: consultations.map(c => ({
        date: c.date,
        client_name: c.patient_name,
        service_name: c.service_name,
        total_value: Number(c.value),
        patient_type: c.patient_type,
        amount_to_pay: c.patient_type === 'convenio' ? (Number(c.value) * clinicPercentage) / 100 : 0
      }))
    };
  } catch (error) {
    console.error('❌ Error calculating professional revenue:', error);
    throw error;
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    console.log('🔄 Login attempt for CPF:', cpf);

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }

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

    console.log('✅ Login successful for user:', user.name);
    console.log('✅ User roles:', user.roles);

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
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/select-role', async (req, res) => {
  try {
    const { userId, role } = req.body;

    console.log('🎯 Role selection:', { userId, role });

    if (!userId || !role) {
      return res.status(400).json({ message: 'UserId e role são obrigatórios' });
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

    const token = generateToken(user, role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log('✅ Role selected successfully:', role);

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
    console.error('❌ Role selection error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

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

    console.log('🔄 Registration attempt for:', name);

    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Senha deve ter pelo menos 6 caracteres' });
    }

    // Check if CPF already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado no sistema' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number, 
        address_complement, neighborhood, city, state, password, roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, name, cpf, roles
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
      ['client']
    ]);

    const newUser = result.rows[0];

    console.log('✅ User registered successfully:', newUser.name);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: newUser
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// User management routes
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.roles, 
        u.subscription_status, u.subscription_expiry, u.percentage,
        u.has_scheduling_access, u.access_expires_at,
        sc.name as category_name,
        u.created_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

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
        u.neighborhood, u.city, u.state, u.roles,
        u.subscription_status, u.subscription_expiry, u.percentage,
        u.crm, u.photo_url, u.has_scheduling_access, u.access_expires_at,
        sc.name as category_name,
        u.created_at, u.updated_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/users/:id/subscription-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only check their own status unless they're admin
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(
      'SELECT subscription_status, subscription_expiry FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching subscription status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, currentPassword, newPassword, percentage, category_id, crm } = req.body;

    // Users can only update their own data unless they're admin
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha' });
      }

      const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await pool.query(
        'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [hashedPassword, id]
      );
    }

    // Update other fields
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCount}`);
      updateValues.push(name);
      paramCount++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramCount}`);
      updateValues.push(email || null);
      paramCount++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCount}`);
      updateValues.push(phone || null);
      paramCount++;
    }

    // Admin-only fields
    if (req.user.currentRole === 'admin') {
      if (percentage !== undefined) {
        updateFields.push(`percentage = $${paramCount}`);
        updateValues.push(percentage);
        paramCount++;
      }

      if (category_id !== undefined) {
        updateFields.push(`category_id = $${paramCount}`);
        updateValues.push(category_id || null);
        paramCount++;
      }

      if (crm !== undefined) {
        updateFields.push(`crm = $${paramCount}`);
        updateValues.push(crm || null);
        paramCount++;
      }
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);

      const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount}`;
      await pool.query(query, updateValues);
    }

    res.json({ message: 'Usuário atualizado com sucesso' });
  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Service categories routes
app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM service_categories ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching service categories:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

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

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating service category:', error);
    if (error.code === '23505') {
      res.status(409).json({ message: 'Categoria já existe' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

// Services routes
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.*,
        sc.name as category_name
      FROM services s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ORDER BY sc.name, s.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching services:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

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
    `, [name, description, base_price, category_id || null, is_base_service || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
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
    `, [name, description, base_price, category_id || null, is_base_service || false, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting service:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Professionals routes
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
    console.error('❌ Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 NEW: Scheduling access management routes
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone,
        sc.name as category_name,
        u.has_scheduling_access,
        u.access_expires_at,
        granted_by.name as access_granted_by,
        u.access_granted_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      LEFT JOIN users granted_by ON u.access_granted_by = granted_by.id
      WHERE 'professional' = ANY(u.roles)
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching professionals scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/admin/grant-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id, expires_at, reason } = req.body;

    if (!professional_id || !expires_at) {
      return res.status(400).json({ message: 'ID do profissional e data de expiração são obrigatórios' });
    }

    // Verify professional exists
    const professionalResult = await pool.query(
      'SELECT id, name FROM users WHERE id = $1 AND \'professional\' = ANY(roles)',
      [professional_id]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    // Grant access
    await pool.query(`
      UPDATE users 
      SET 
        has_scheduling_access = TRUE,
        access_expires_at = $1,
        access_granted_by = $2,
        access_granted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [expires_at, req.user.id, professional_id]);

    // Log the action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      req.user.id,
      'GRANT_SCHEDULING_ACCESS',
      'users',
      professional_id,
      JSON.stringify({ expires_at, reason, granted_by: req.user.name })
    ]);

    res.json({ message: 'Acesso à agenda concedido com sucesso' });
  } catch (error) {
    console.error('❌ Error granting scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/admin/revoke-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id } = req.body;

    if (!professional_id) {
      return res.status(400).json({ message: 'ID do profissional é obrigatório' });
    }

    // Revoke access
    await pool.query(`
      UPDATE users 
      SET 
        has_scheduling_access = FALSE,
        access_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [professional_id]);

    // Log the action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      req.user.id,
      'REVOKE_SCHEDULING_ACCESS',
      'users',
      professional_id,
      JSON.stringify({ revoked_by: req.user.name })
    ]);

    res.json({ message: 'Acesso à agenda revogado com sucesso' });
  } catch (error) {
    console.error('❌ Error revoking scheduling access:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 NEW: Professional scheduling access status check
app.get('/api/professional/scheduling-access-status', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT has_scheduling_access, access_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    const now = new Date();
    let hasAccess = user.has_scheduling_access;
    let isExpired = false;

    // Check if access has expired
    if (user.access_expires_at) {
      const expiryDate = new Date(user.access_expires_at);
      if (expiryDate < now) {
        isExpired = true;
        hasAccess = false;
        
        // Auto-revoke expired access
        await pool.query(
          'UPDATE users SET has_scheduling_access = FALSE WHERE id = $1',
          [req.user.id]
        );
      }
    }

    res.json({
      hasAccess,
      isExpired,
      expiresAt: user.access_expires_at,
      canPurchase: true // Always allow purchase
    });
  } catch (error) {
    console.error('❌ Error checking scheduling access status:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Dependents routes
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Verify access
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT 
        d.*,
        CASE 
          WHEN d.subscription_expiry IS NULL THEN d.subscription_status
          WHEN d.subscription_expiry < CURRENT_TIMESTAMP THEN 'expired'
          ELSE d.subscription_status
        END as current_status
      FROM dependents d
      WHERE d.user_id = $1
      ORDER BY d.created_at DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/dependents/lookup', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.user_id,
        u.name as client_name,
        CASE 
          WHEN d.subscription_expiry IS NULL THEN d.subscription_status
          WHEN d.subscription_expiry < CURRENT_TIMESTAMP THEN 'expired'
          ELSE d.subscription_status
        END as dependent_subscription_status
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.cpf = $1
    `, [cleanCpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error looking up dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { user_id, name, cpf, birth_date } = req.body;

    // Verify access
    if (req.user.currentRole !== 'admin' && req.user.id !== user_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    if (!name || !cpf) {
      return res.status(400).json({ message: 'Nome e CPF são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }

    // Check if CPF already exists
    const existingDependent = await pool.query(
      'SELECT id FROM dependents WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingDependent.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado como dependente' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado como usuário' });
    }

    const result = await pool.query(`
      INSERT INTO dependents (user_id, name, cpf, birth_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [user_id, name, cleanCpf, birth_date || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    // Verify dependent exists and user has access
    const dependentResult = await pool.query(
      'SELECT user_id FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];

    if (req.user.currentRole !== 'admin' && req.user.id !== dependent.user_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [name, birth_date || null, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify dependent exists and user has access
    const dependentResult = await pool.query(
      'SELECT user_id FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];

    if (req.user.currentRole !== 'admin' && req.user.id !== dependent.user_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query('DELETE FROM dependents WHERE id = $1', [id]);

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Client lookup route
app.get('/api/clients/lookup', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        id, name, cpf,
        CASE 
          WHEN subscription_expiry IS NULL THEN subscription_status
          WHEN subscription_expiry < CURRENT_TIMESTAMP THEN 'expired'
          ELSE subscription_status
        END as subscription_status
      FROM users 
      WHERE cpf = $1 AND 'client' = ANY(roles)
    `, [cleanCpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error looking up client:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Private patients routes
app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM private_patients 
      WHERE professional_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    // Check CPF uniqueness if provided
    if (cpf) {
      const cleanCpf = cpf.replace(/\D/g, '');
      
      if (!/^\d{11}$/.test(cleanCpf)) {
        return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
      }

      const existingPatient = await pool.query(
        'SELECT id FROM private_patients WHERE cpf = $1',
        [cleanCpf]
      );

      if (existingPatient.rows.length > 0) {
        return res.status(409).json({ message: 'CPF já cadastrado' });
      }
    }

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood, city, state, zip_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      req.user.id, name, cpf || null, email || null, phone || null, birth_date || null,
      address || null, address_number || null, address_complement || null,
      neighborhood || null, city || null, state || null, zip_code || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    // Verify patient belongs to professional
    const patientResult = await pool.query(
      'SELECT professional_id FROM private_patients WHERE id = $1',
      [id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    if (patientResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      UPDATE private_patients 
      SET 
        name = $1, email = $2, phone = $3, birth_date = $4,
        address = $5, address_number = $6, address_complement = $7,
        neighborhood = $8, city = $9, state = $10, zip_code = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [
      name, email || null, phone || null, birth_date || null,
      address || null, address_number || null, address_complement || null,
      neighborhood || null, city || null, state || null, zip_code || null, id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify patient belongs to professional
    const patientResult = await pool.query(
      'SELECT professional_id FROM private_patients WHERE id = $1',
      [id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    if (patientResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query('DELETE FROM private_patients WHERE id = $1', [id]);

    res.json({ message: 'Paciente excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting private patient:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Attendance locations routes
app.get('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM attendance_locations 
      WHERE professional_id = $1 
      ORDER BY is_default DESC, created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching attendance locations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
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
        'UPDATE attendance_locations SET is_default = FALSE WHERE professional_id = $1',
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
      req.user.id, name, address || null, address_number || null,
      address_complement || null, neighborhood || null, city || null,
      state || null, zip_code || null, phone || null, is_default || false
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
    } = req.body;

    // Verify location belongs to professional
    const locationResult = await pool.query(
      'SELECT professional_id FROM attendance_locations WHERE id = $1',
      [id]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    if (locationResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // If setting as default, remove default from other locations
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = FALSE WHERE professional_id = $1 AND id != $2',
        [req.user.id, id]
      );
    }

    const result = await pool.query(`
      UPDATE attendance_locations 
      SET 
        name = $1, address = $2, address_number = $3, address_complement = $4,
        neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9,
        is_default = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [
      name, address || null, address_number || null, address_complement || null,
      neighborhood || null, city || null, state || null, zip_code || null,
      phone || null, is_default || false, id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify location belongs to professional
    const locationResult = await pool.query(
      'SELECT professional_id FROM attendance_locations WHERE id = $1',
      [id]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    if (locationResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query('DELETE FROM attendance_locations WHERE id = $1', [id]);

    res.json({ message: 'Local excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting attendance location:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 FIXED: Consultations routes with corrected calculation logic
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.value, c.date, c.notes,
        s.name as service_name,
        u_prof.name as professional_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u_client.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE 'Desconhecido'
        END as client_name,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN TRUE
          ELSE FALSE
        END as is_private_patient,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN TRUE
          ELSE FALSE
        END as is_dependent
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN users u_client ON c.user_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
    `;

    const params = [];

    if (req.user.currentRole === 'professional') {
      query += ' WHERE c.professional_id = $1';
      params.push(req.user.id);
    }

    query += ' ORDER BY c.date DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Verify access
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(clientId)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT 
        c.id, c.value, c.date,
        s.name as service_name,
        u_prof.name as professional_name,
        CASE 
          WHEN c.user_id IS NOT NULL THEN u_client.name
          WHEN c.dependent_id IS NOT NULL THEN d.name
          ELSE 'Desconhecido'
        END as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN TRUE
          ELSE FALSE
        END as is_dependent
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN users u_client ON c.user_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE (c.user_id = $1 OR d.user_id = $1)
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/consultations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      user_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      value,
      date,
      appointment_date,
      appointment_time,
      create_appointment
    } = req.body;

    console.log('🔄 Creating consultation:', req.body);

    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    if (!user_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    // Verify service exists
    const serviceResult = await pool.query('SELECT id FROM services WHERE id = $1', [service_id]);
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    // Create consultation
    const consultationResult = await pool.query(`
      INSERT INTO consultations (
        user_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      user_id || null,
      dependent_id || null,
      private_patient_id || null,
      req.user.id,
      service_id,
      location_id || null,
      value,
      date
    ]);

    const consultation = consultationResult.rows[0];

    // Create appointment if requested
    let appointment = null;
    if (create_appointment && appointment_date && appointment_time && private_patient_id) {
      const appointmentResult = await pool.query(`
        INSERT INTO appointments (
          professional_id, private_patient_id, service_id, location_id,
          appointment_date, appointment_time, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        req.user.id,
        private_patient_id,
        service_id,
        location_id || null,
        appointment_date,
        appointment_time,
        'scheduled'
      ]);

      appointment = appointmentResult.rows[0];
    }

    console.log('✅ Consultation created:', consultation.id);
    if (appointment) {
      console.log('✅ Appointment created:', appointment.id);
    }

    res.status(201).json({
      consultation,
      appointment,
      message: 'Consulta registrada com sucesso'
    });
  } catch (error) {
    console.error('❌ Error creating consultation:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// 🔥 NEW: Appointments routes (requires scheduling access)
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

    const params = [req.user.id];

    if (date) {
      query += ' AND a.appointment_date = $2';
      params.push(date);
    }

    query += ' ORDER BY a.appointment_date, a.appointment_time';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching appointments:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/appointments', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const {
      private_patient_id,
      service_id,
      location_id,
      appointment_date,
      appointment_time,
      notes
    } = req.body;

    if (!private_patient_id || !appointment_date || !appointment_time) {
      return res.status(400).json({ message: 'Paciente, data e horário são obrigatórios' });
    }

    // Verify patient belongs to professional
    const patientResult = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    // Check for conflicts
    const conflictResult = await pool.query(`
      SELECT id FROM appointments 
      WHERE professional_id = $1 
        AND appointment_date = $2 
        AND appointment_time = $3
        AND status != 'cancelled'
    `, [req.user.id, appointment_date, appointment_time]);

    if (conflictResult.rows.length > 0) {
      return res.status(409).json({ message: 'Já existe um agendamento para este horário' });
    }

    const result = await pool.query(`
      INSERT INTO appointments (
        professional_id, private_patient_id, service_id, location_id,
        appointment_date, appointment_time, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user.id,
      private_patient_id,
      service_id || null,
      location_id || null,
      appointment_date,
      appointment_time,
      notes || null,
      'scheduled'
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/appointments/:id', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      private_patient_id,
      service_id,
      location_id,
      appointment_date,
      appointment_time,
      status,
      notes
    } = req.body;

    // Verify appointment belongs to professional
    const appointmentResult = await pool.query(
      'SELECT professional_id FROM appointments WHERE id = $1',
      [id]
    );

    if (appointmentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    if (appointmentResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      UPDATE appointments 
      SET 
        private_patient_id = $1, service_id = $2, location_id = $3,
        appointment_date = $4, appointment_time = $5, status = $6,
        notes = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [
      private_patient_id || null,
      service_id || null,
      location_id || null,
      appointment_date,
      appointment_time,
      status || 'scheduled',
      notes || null,
      id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/appointments/:id', authenticate, authorize(['professional']), requireSchedulingAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify appointment belongs to professional
    const appointmentResult = await pool.query(
      'SELECT professional_id FROM appointments WHERE id = $1',
      [id]
    );

    if (appointmentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    if (appointmentResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query('DELETE FROM appointments WHERE id = $1', [id]);

    res.json({ message: 'Agendamento excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting appointment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Medical records routes
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.*,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
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
      vital_signs
    } = req.body;

    if (!private_patient_id) {
      return res.status(400).json({ message: 'Paciente é obrigatório' });
    }

    // Verify patient belongs to professional
    const patientResult = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
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

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
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
      vital_signs
    } = req.body;

    // Verify record belongs to professional
    const recordResult = await pool.query(
      'SELECT professional_id FROM medical_records WHERE id = $1',
      [id]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    if (recordResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      UPDATE medical_records 
      SET 
        chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
        medications = $4, allergies = $5, physical_examination = $6,
        diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
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

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify record belongs to professional
    const recordResult = await pool.query(
      'SELECT professional_id FROM medical_records WHERE id = $1',
      [id]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    if (recordResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    await pool.query('DELETE FROM medical_records WHERE id = $1', [id]);

    res.json({ message: 'Prontuário excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting medical record:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/medical-records/generate-document', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { record_id, template_data } = req.body;

    if (!record_id || !template_data) {
      return res.status(400).json({ message: 'ID do prontuário e dados do template são obrigatórios' });
    }

    // Verify record belongs to professional
    const recordResult = await pool.query(
      'SELECT professional_id FROM medical_records WHERE id = $1',
      [record_id]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    if (recordResult.rows[0].professional_id !== req.user.id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF('medical_record', template_data);

    res.json({
      message: 'Prontuário gerado com sucesso',
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('❌ Error generating medical record document:', error);
    res.status(500).json({ message: 'Erro ao gerar prontuário' });
  }
});

// Medical documents routes
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
    console.error('❌ Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
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
        document_url, template_data
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      req.user.id,
      private_patient_id || null,
      title,
      document_type,
      documentResult.url,
      JSON.stringify(template_data)
    ]);

    res.status(201).json({
      ...result.rows[0],
      title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('❌ Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento' });
  }
});

// 🔥 FIXED: Reports routes with corrected calculation logic
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    console.log('🔄 Generating revenue report for period:', { start_date, end_date });

    // Get all consultations for the period with professional percentages
    const consultationsResult = await pool.query(`
      SELECT 
        c.*,
        u_prof.name as professional_name,
        u_prof.percentage as professional_percentage,
        s.name as service_name,
        CASE 
          WHEN c.user_id IS NOT NULL OR c.dependent_id IS NOT NULL THEN 'convenio'
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'unknown'
        END as patient_type
      FROM consultations c
      JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2
      ORDER BY c.date DESC
    `, [start_date, end_date]);

    const consultations = consultationsResult.rows;
    console.log('🔄 Found consultations for report:', consultations.length);

    // Calculate total revenue (only from convenio consultations)
    const convenioConsultations = consultations.filter(c => c.patient_type === 'convenio');
    const totalRevenue = convenioConsultations.reduce((sum, c) => sum + Number(c.value), 0);

    console.log('🔄 Convenio consultations:', convenioConsultations.length);
    console.log('🔄 Total revenue from convenio:', totalRevenue);

    // Group by professional (only convenio consultations)
    const revenueByProfessional = {};
    convenioConsultations.forEach(consultation => {
      const profId = consultation.professional_id;
      if (!revenueByProfessional[profId]) {
        revenueByProfessional[profId] = {
          professional_name: consultation.professional_name,
          professional_percentage: Number(consultation.professional_percentage) || 50,
          revenue: 0,
          consultation_count: 0,
          professional_payment: 0,
          clinic_revenue: 0
        };
      }

      const revenue = Number(consultation.value);
      const professionalPercentage = Number(consultation.professional_percentage) || 50;
      const clinicPercentage = 100 - professionalPercentage;

      revenueByProfessional[profId].revenue += revenue;
      revenueByProfessional[profId].consultation_count += 1;
      revenueByProfessional[profId].professional_payment += (revenue * professionalPercentage) / 100;
      revenueByProfessional[profId].clinic_revenue += (revenue * clinicPercentage) / 100;
    });

    // Group by service (only convenio consultations)
    const revenueByService = {};
    convenioConsultations.forEach(consultation => {
      const serviceName = consultation.service_name || 'Serviço não especificado';
      if (!revenueByService[serviceName]) {
        revenueByService[serviceName] = {
          service_name: serviceName,
          revenue: 0,
          consultation_count: 0
        };
      }

      revenueByService[serviceName].revenue += Number(consultation.value);
      revenueByService[serviceName].consultation_count += 1;
    });

    const report = {
      total_revenue: totalRevenue,
      revenue_by_professional: Object.values(revenueByProfessional),
      revenue_by_service: Object.values(revenueByService)
    };

    console.log('✅ Revenue report generated:', report);

    res.json(report);
  } catch (error) {
    console.error('❌ Error generating revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    const report = await calculateProfessionalRevenue(req.user.id, start_date, end_date);

    res.json(report);
  } catch (error) {
    console.error('❌ Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.get('/api/reports/professional-detailed', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    const report = await calculateProfessionalRevenue(req.user.id, start_date, end_date);

    res.json(report);
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
        COUNT(CASE WHEN subscription_status = 'expired' OR 
                    (subscription_expiry IS NOT NULL AND subscription_expiry < CURRENT_TIMESTAMP) 
                    THEN 1 END) as expired_clients
      FROM users 
      WHERE 'client' = ANY(roles) AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error generating clients by city report:', error);
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

    // Process categories to group by category name
    const processedResult = result.rows.map(row => {
      const categoryMap = {};
      row.categories.forEach(cat => {
        const categoryName = cat.category_name;
        if (categoryMap[categoryName]) {
          categoryMap[categoryName].count += cat.count;
        } else {
          categoryMap[categoryName] = { category_name: categoryName, count: cat.count };
        }
      });

      return {
        ...row,
        categories: Object.values(categoryMap)
      };
    });

    res.json(processedResult);
  } catch (error) {
    console.error('❌ Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Image upload route
app.post('/api/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
    }

    console.log('✅ Image uploaded to Cloudinary:', req.file.path);

    // Update user photo URL
    await pool.query(
      'UPDATE users SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [req.file.path, req.user.id]
    );

    res.json({
      message: 'Imagem enviada com sucesso',
      imageUrl: req.file.path
    });
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({ message: 'Erro ao enviar imagem' });
  }
});

// 🔥 FIXED: MercadoPago payment routes with corrected logic

// Client subscription payment
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ message: 'user_id é obrigatório' });
    }

    // Create payment record first
    const external_reference = `subscription_${user_id}_${Date.now()}`;
    
    const paymentResult = await pool.query(
      'INSERT INTO client_payments (client_id, amount, status, external_reference, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [user_id, 250, 'pending', external_reference]
    );
    
    const payment_id = paymentResult.rows[0].id;

    const preference = {
      items: [
        {
          title: 'Assinatura Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: 250,
        },
      ],
      external_reference: external_reference,
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success&type=subscription`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure&type=subscription`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending&type=subscription`,
      },
      auto_return: 'approved',
      metadata: {
        payment_type: 'subscription',
        user_id: user_id,
        payment_id: payment_id
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    // Update payment record with MP preference ID
    await pool.query(
      'UPDATE client_payments SET mp_preference_id = $1 WHERE id = $2',
      [response.body.id, payment_id]
    );

    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create dependent payment
app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const dependentId = parseInt(req.params.id);
    
    if (!dependentId) {
      return res.status(400).json({ message: 'ID do dependente é obrigatório' });
    }

    // Get dependent info
    const dependentResult = await pool.query(
      'SELECT * FROM dependents WHERE id = $1',
      [dependentId]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];
    const payment_reference = `dependent_${dependentId}_${Date.now()}`;
    
    // Create payment record first
    const paymentResult = await pool.query(
      'INSERT INTO dependent_payments (dependent_id, amount, status, payment_reference, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [dependentId, 50, 'pending', payment_reference]
    );
    
    const payment_id = paymentResult.rows[0].id;

    const preference = {
      items: [
        {
          title: `Ativação de Dependente - ${dependent.name}`,
          quantity: 1,
          unit_price: 50,
        },
      ],
      external_reference: payment_reference,
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success&type=dependent`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure&type=dependent`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending&type=dependent`,
      },
      auto_return: 'approved',
      metadata: {
        payment_type: 'dependent',
        dependent_id: dependentId,
        payment_id: payment_id
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    // Update payment record with MP preference ID
    await pool.query(
      'UPDATE dependent_payments SET mp_preference_id = $1 WHERE id = $2',
      [response.body.id, payment_id]
    );

    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;
    const professionalId = req.user.id;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }

    const external_reference = `professional_${professionalId}_${Date.now()}`;
    
    // Create payment record first
    const paymentResult = await pool.query(
      'INSERT INTO professional_payments (professional_id, amount, status, external_reference, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [professionalId, amount, 'pending', external_reference]
    );
    
    const payment_id = paymentResult.rows[0].id;

    const preference = {
      items: [
        {
          title: 'Repasse ao Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: parseFloat(amount),
        },
      ],
      external_reference: external_reference,
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/professional?payment=success&type=professional`,
        failure: `${req.protocol}://${req.get('host')}/professional?payment=failure&type=professional`,
        pending: `${req.protocol}://${req.get('host')}/professional?payment=pending&type=professional`,
      },
      auto_return: 'approved',
      metadata: {
        payment_type: 'professional',
        professional_id: professionalId,
        payment_id: payment_id
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    // Update payment record with MP preference ID
    await pool.query(
      'UPDATE professional_payments SET mp_preference_id = $1 WHERE id = $2',
      [response.body.id, payment_id]
    );

    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Create agenda payment
app.post('/api/professional/create-agenda-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { duration_days = 30 } = req.body;
    const professionalId = req.user.id;
    
    const external_reference = `agenda_${professionalId}_${Date.now()}`;
    
    // Create payment record first
    const paymentResult = await pool.query(
      'INSERT INTO agenda_payments (professional_id, amount, status, external_reference, duration_days, mp_preference_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id',
      [professionalId, 24.99, 'pending', external_reference, duration_days, null]
    );
    
    const payment_id = paymentResult.rows[0].id;

    const preference = {
      items: [
        {
          title: 'Acesso à Agenda - Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: 24.99,
        },
      ],
      external_reference: external_reference,
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/professional/scheduling?payment=success&type=agenda`,
        failure: `${req.protocol}://${req.get('host')}/professional/scheduling?payment=failure&type=agenda`,
        pending: `${req.protocol}://${req.get('host')}/professional/scheduling?payment=pending&type=agenda`,
      },
      auto_return: 'approved',
      metadata: {
        payment_type: 'agenda',
        professional_id: professionalId,
        payment_id: payment_id,
        duration_days: duration_days
      }
    };

    const response = await mercadopago.preferences.create(preference);
    
    // Update payment record with MP preference ID
    await pool.query(
      'UPDATE agenda_payments SET mp_preference_id = $1 WHERE id = $2',
      [response.body.id, payment_id]
    );

    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error('Error creating agenda payment:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Dependent payment
app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify dependent exists and user has access
    const dependentResult = await pool.query(`
      SELECT d.*, u.name as client_name 
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1
    `, [id]);

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];

    if (req.user.currentRole !== 'admin' && req.user.id !== dependent.user_id) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Ativação de Dependente - ${dependent.name}`,
          quantity: 1,
          unit_price: 50,
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: 'cliente@quiroferreira.com.br',
      },
      back_urls: {
        success: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/client?payment=success&type=dependent`,
        failure: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/client?payment=failure&type=dependent`,
        pending: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/client?payment=pending&type=dependent`
      },
      auto_return: 'all',
      external_reference: `dependent_${id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Save payment record
    await pool.query(`
      INSERT INTO dependent_payments (dependent_id, amount, payment_reference, mp_preference_id)
      VALUES ($1, $2, $3, $4)
    `, [id, 50, preferenceData.external_reference, response.id]);

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
    });
  } catch (error) {
    console.error('❌ Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// Professional payment to clinic
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: 'Repasse ao Convênio Quiro Ferreira',
          quantity: 1,
          unit_price: Number(amount),
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: 'profissional@quiroferreira.com.br',
      },
      back_urls: {
        success: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/professional?payment=success&type=clinic`,
        failure: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/professional?payment=failure&type=clinic`,
        pending: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/professional?payment=pending&type=clinic`
      },
      auto_return: 'all',
      external_reference: `professional_${req.user.id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Save payment record
    await pool.query(`
      INSERT INTO professional_payments (professional_id, amount, payment_reference, mp_preference_id)
      VALUES ($1, $2, $3, $4)
    `, [req.user.id, amount, preferenceData.external_reference, response.id]);

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
    });
  } catch (error) {
    console.error('❌ Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento' });
  }
});

// 🔥 NEW: Agenda subscription payment
app.post('/api/professional/create-agenda-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { duration_days = 30 } = req.body;

    // Check if user already has active scheduling access
    const userResult = await pool.query(
      'SELECT has_scheduling_access, access_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];
    
    // Check if access is already active and not expired
    if (user.has_scheduling_access && user.access_expires_at) {
      const expiryDate = new Date(user.access_expires_at);
      if (expiryDate > new Date()) {
        return res.status(400).json({ message: 'Você já possui acesso ativo à agenda' });
      }
    }

    const preference = new Preference(client);

    const preferenceData = {
      items: [
        {
          title: `Acesso à Agenda - ${duration_days} dias`,
          quantity: 1,
          unit_price: 24.99, // Fixed price for agenda access
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: 'profissional@quiroferreira.com.br',
      },
      back_urls: {
        success: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/professional/scheduling?payment=success&type=agenda`,
        failure: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/professional/scheduling?payment=failure&type=agenda`,
        pending: `${process.env.NODE_ENV === 'production' ? 'https://www.cartaoquiroferreira.com.br' : 'http://localhost:5173'}/professional/scheduling?payment=pending&type=agenda`
      },
      auto_return: 'all',
      external_reference: `agenda_${req.user.id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`,
    };

    const response = await preference.create({ body: preferenceData });

    // Save payment record
    await pool.query(`
      INSERT INTO agenda_payments (professional_id, amount, duration_days, payment_reference, mp_preference_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [req.user.id, 24.99, duration_days, preferenceData.external_reference, response.id]);

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
    });
  } catch (error) {
    console.error('❌ Error creating agenda payment:', error);
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
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch payment details from MercadoPago');
        return res.status(200).json({ message: 'OK' });
      }

      const payment = await response.json();
      console.log('💰 Payment details:', payment);

      const externalReference = payment.external_reference;
      const status = payment.status;

      if (status === 'approved') {
        // Parse external reference to determine payment type
        if (externalReference.startsWith('subscription_')) {
          // Client subscription payment
          const userId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE users 
            SET 
              subscription_status = 'active',
              subscription_expiry = CURRENT_TIMESTAMP + INTERVAL '1 year',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [userId]);

          await pool.query(`
            UPDATE client_payments 
            SET payment_status = 'approved', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Client subscription activated for user:', userId);

        } else if (externalReference.startsWith('dependent_')) {
          // Dependent payment
          const dependentId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE dependents 
            SET 
              subscription_status = 'active',
              subscription_expiry = CURRENT_TIMESTAMP + INTERVAL '1 year',
              activated_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [dependentId]);

          await pool.query(`
            UPDATE dependent_payments 
            SET payment_status = 'approved', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Dependent subscription activated for dependent:', dependentId);

        } else if (externalReference.startsWith('professional_')) {
          // Professional payment to clinic
          const professionalId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE professional_payments 
            SET payment_status = 'approved', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);

          console.log('✅ Professional payment approved for professional:', professionalId);

        } else if (externalReference.startsWith('agenda_')) {
          // 🔥 NEW: Agenda access payment
          const professionalId = externalReference.split('_')[1];
          
          // Get payment details to determine duration
          const paymentResult = await pool.query(
            'SELECT duration_days FROM agenda_payments WHERE payment_reference = $1',
            [externalReference]
          );

          const durationDays = paymentResult.rows[0]?.duration_days || 30;
          
          // Calculate expiry date
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + durationDays);

          // Grant scheduling access
          await pool.query(`
            UPDATE users 
            SET 
              has_scheduling_access = TRUE,
              access_expires_at = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [expiryDate, professionalId]);

          // Update payment record
          await pool.query(`
            UPDATE agenda_payments 
            SET 
              payment_status = 'approved', 
              mp_payment_id = $1,
              access_granted_at = CURRENT_TIMESTAMP,
              access_expires_at = $2,
              updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $3
          `, [paymentId, expiryDate, externalReference]);

          console.log('✅ Scheduling access granted for professional:', professionalId);
        }
      } else if (status === 'rejected' || status === 'cancelled') {
        // Update payment status to failed
        if (externalReference.startsWith('subscription_')) {
          await pool.query(`
            UPDATE client_payments 
            SET payment_status = 'failed', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);
        } else if (externalReference.startsWith('dependent_')) {
          await pool.query(`
            UPDATE dependent_payments 
            SET payment_status = 'failed', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);
        } else if (externalReference.startsWith('professional_')) {
          await pool.query(`
            UPDATE professional_payments 
            SET payment_status = 'failed', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);
        } else if (externalReference.startsWith('agenda_')) {
          await pool.query(`
            UPDATE agenda_payments 
            SET payment_status = 'failed', mp_payment_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE payment_reference = $2
          `, [paymentId, externalReference]);
        }

        console.log('❌ Payment failed for reference:', externalReference);
      }
    }

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Admin routes for user management
app.post('/api/admin/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, roles, percentage, category_id, crm, password
    } = req.body;

    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }

    // Check if CPF already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cleanCpf]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, password, roles, percentage, category_id, crm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, cpf, email, phone, roles, percentage, category_id, crm
    `, [
      name,
      cleanCpf,
      email || null,
      phone || null,
      hashedPassword,
      roles || ['client'],
      percentage || 50,
      category_id || null,
      crm || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.put('/api/admin/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, roles, subscription_status, percentage, category_id, crm
    } = req.body;

    const result = await pool.query(`
      UPDATE users 
      SET 
        name = $1, email = $2, phone = $3, roles = $4, 
        subscription_status = $5, percentage = $6, category_id = $7, crm = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [
      name, email || null, phone || null, roles, subscription_status,
      percentage, category_id || null, crm || null, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.delete('/api/admin/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: 'Você não pode excluir sua própria conta' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Admin dependents route
app.get('/api/admin/dependents', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        u.name as client_name,
        CASE 
          WHEN d.subscription_expiry IS NULL THEN d.subscription_status
          WHEN d.subscription_expiry < CURRENT_TIMESTAMP THEN 'expired'
          ELSE d.subscription_status
        END as current_status
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching all dependents:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Arquivo muito grande. Máximo 5MB.' });
    }
  }
  
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
const startServer = async () => {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database connected successfully`);
      console.log(`💳 MercadoPago configured`);
      console.log(`☁️ Cloudinary configured`);
      console.log(`✅ All systems operational`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();