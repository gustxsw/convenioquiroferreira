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
      LEFT JOIN users u_client ON