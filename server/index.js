import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { authenticate, authorize } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://www.cartaoquiroferreira.com.br',
      'https://cartaoquiroferreira.com.br'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// 🔥 PWA ROUTES - SERVIR ARQUIVOS PWA
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '../public/sw.js'));
});

app.get('/browserconfig.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.sendFile(path.join(__dirname, '../public/browserconfig.xml'));
});

// 🔥 FAVICON ROUTE - CORRIGIDO PARA BUSCAR NA PASTA CORRETA
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, '../public/favicon.ico');
  res.sendFile(faviconPath, (err) => {
    if (err) {
      console.log('Favicon not found, sending 204');
      res.status(204).end();
    }
  });
});

// 🔥 PWA ICONS ROUTES
app.get('/icon-192.png', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/icon-192.png'));
});

app.get('/icon-512.png', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/icon-512.png'));
});

// 🔥🔥🔥 ROTA RAIZ - SEMPRE REDIRECIONA PARA LOGIN 🔥🔥🔥
app.get('/', (req, res) => {
  console.log('🔥 Root route accessed - ALWAYS redirecting to /login');
  console.log('🔥 Request URL:', req.url);
  console.log('🔥 Request hostname:', req.hostname);
  res.redirect(301, '/login');
});

// 🔥🔥🔥 ROTA ESPECÍFICA PARA DOMÍNIOS - GARANTINDO REDIRECIONAMENTO 🔥🔥🔥
app.get('/index.html', (req, res) => {
  console.log('🔥 Index.html accessed - redirecting to /login');
  res.redirect(301, '/login');
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// 🔥 HEALTH CHECK ROUTE
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Server is running properly',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Initialize database tables
const initDatabase = async () => {
  try {
    console.log('🔥 Initializing database with payment tables...');
    
    // Create users table with roles array
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
        address_complement TEXT,
        neighborhood VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(2),
        password VARCHAR(255) NOT NULL,
        roles TEXT[] NOT NULL DEFAULT '{}',
        percentage DECIMAL(5,2),
        category_id INTEGER,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create service categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create services table
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

    // Create dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) UNIQUE NOT NULL,
        birth_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create consultations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        service_id INTEGER REFERENCES services(id) NOT NULL,
        date TIMESTAMP NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🔥🔥🔥 CREATE PAYMENT TABLES - SEPARADAS PARA CLIENTES E PROFISSIONAIS 🔥🔥🔥
    console.log('🔥 Creating CLIENT PAYMENTS table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        external_reference VARCHAR(255) UNIQUE NOT NULL,
        preference_id VARCHAR(255),
        payment_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        payment_method VARCHAR(100),
        payment_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('🔥 Creating PROFESSIONAL PAYMENTS table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER REFERENCES users(id) NOT NULL,
        external_reference VARCHAR(255) UNIQUE NOT NULL,
        preference_id VARCHAR(255),
        payment_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        payment_method VARCHAR(100),
        payment_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Payment tables created successfully!');

    // Insert default admin user if not exists
    const adminExists = await pool.query('SELECT id FROM users WHERE cpf = $1', ['00000000000']);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(`
        INSERT INTO users (name, cpf, password, roles) 
        VALUES ($1, $2, $3, $4)
      `, ['Administrador', '00000000000', hashedPassword, ['admin']]);
      console.log('Default admin user created');
    }

    // Insert test users with multiple roles
    const testUsers = [
      { name: 'Cliente Teste', cpf: '12345678901', password: '12345678901', roles: ['client'] },
      { name: 'Profissional Teste', cpf: '98765432100', password: '98765432100', roles: ['professional'], percentage: 60, category_id: 1 },
      { name: 'Multi Role User', cpf: '55555555555', password: '55555555555', roles: ['client', 'professional', 'admin'], percentage: 70, category_id: 1 }
    ];

    for (const user of testUsers) {
      const userExists = await pool.query('SELECT id FROM users WHERE cpf = $1', [user.cpf]);
      if (userExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await pool.query(`
          INSERT INTO users (name, cpf, password, roles, percentage, category_id) 
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [user.name, user.cpf, hashedPassword, user.roles, user.percentage || null, user.category_id || null]);
        console.log(`Test user ${user.name} created`);
      }
    }

    // Insert default service category
    const categoryExists = await pool.query('SELECT id FROM service_categories WHERE name = $1', ['Fisioterapia']);
    if (categoryExists.rows.length === 0) {
      await pool.query(`
        INSERT INTO service_categories (name, description) 
        VALUES ($1, $2)
      `, ['Fisioterapia', 'Serviços de fisioterapia e reabilitação']);
      console.log('Default service category created');
    }

    // Insert default services
    const serviceExists = await pool.query('SELECT id FROM services WHERE name = $1', ['Consulta Fisioterapia']);
    if (serviceExists.rows.length === 0) {
      await pool.query(`
        INSERT INTO services (name, description, base_price, category_id, is_base_service) 
        VALUES ($1, $2, $3, $4, $5)
      `, ['Consulta Fisioterapia', 'Consulta básica de fisioterapia', 80.00, 1, true]);
      console.log('Default service created');
    }

    console.log('✅ Database initialized successfully with payment tables!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};

// 🔥🔥🔥 HELPER FUNCTION TO GET BASE URL 🔥🔥🔥
const getBaseUrl = (req) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
};

// 🔥🔥🔥 MERCADOPAGO SDK v2 ROUTES - IMPLEMENTAÇÃO CORRETA 🔥🔥🔥
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    console.log('🔥 Creating subscription payment with SDK v2');
    console.log('🔥 Request body:', req.body);
    console.log('🔥 User:', req.user);
    
    const { user_id, dependent_ids = [] } = req.body;
    const accessToken = process.env.MP_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.error('❌ MercadoPago access token not configured');
      throw new Error('MercadoPago access token not configured');
    }

    // Calculate amount (R$250 titular + R$50 per dependent)
    const titularPrice = 250;
    const dependentPrice = 50;
    const totalPeople = 1 + dependent_ids.length; // titular + dependents
    const amount = titularPrice + (dependent_ids.length * dependentPrice);
    
    // Generate unique external reference
    const externalReference = `subscription_${user_id}_${Date.now()}`;
    
    // 🔥 GET CORRECT BASE URL
    const baseUrl = getBaseUrl(req);
    
    console.log('🔥 Payment details:', {
      totalPeople,
      amount,
      externalReference,
      baseUrl,
      accessToken: accessToken ? 'CONFIGURED' : 'MISSING'
    });
    
    // 🔥 SDK v2 PREFERENCE STRUCTURE - FORMATO CORRETO COM URLs FIXAS
    const preferenceData = {
      items: [
        {
          id: 'subscription',
          title: `Assinatura Convênio Quiro Ferreira - ${totalPeople} pessoa(s)`,
          description: `Assinatura mensal - Titular (R$ ${titularPrice}) + ${dependent_ids.length} dependente(s) (R$ ${dependentPrice} cada)`,
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL'
        }
      ],
      payer: {
        name: req.user.name,
        email: 'cliente@cartaoquiroferreira.com.br'
      },
      payment_methods: {
        excluded_payment_types: [],
        excluded_payment_methods: [],
        installments: 12
      },
      // 🔥 URLS DE RETORNO CORRIGIDAS - FORMATO CORRETO
      back_urls: {
        success: `${baseUrl}/client?payment=success`,
        failure: `${baseUrl}/client?payment=failure`, 
        pending: `${baseUrl}/client?payment=pending`
      },
      auto_return: 'approved',
      external_reference: externalReference,
      notification_url: `${baseUrl}/api/webhooks/payment-success`,
      statement_descriptor: 'QUIRO FERREIRA',
      expires: false
    };

    console.log('🔥 Creating preference with data:', JSON.stringify(preferenceData, null, 2));
    console.log('🔥 Webhook URL:', preferenceData.notification_url);
    console.log('🔥 Success URL:', preferenceData.back_urls.success);

    // Create preference using MercadoPago API
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferenceData)
    });

    console.log('📡 MercadoPago API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ MercadoPago API Error:', response.status, errorData);
      throw new Error(`MercadoPago API Error: ${response.status} - ${errorData}`);
    }

    const preference = await response.json();
    console.log('✅ Preference created successfully:', preference.id);

    // 🔥 SAVE PAYMENT RECORD IN CLIENT_PAYMENTS TABLE
    await pool.query(`
      INSERT INTO client_payments (user_id, external_reference, preference_id, amount, description, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      user_id,
      externalReference,
      preference.id,
      amount,
      `Assinatura mensal - ${totalPeople} pessoa(s)`,
      'pending'
    ]);

    console.log('✅ Payment record saved in client_payments table');

    res.json({
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      external_reference: externalReference
    });

  } catch (error) {
    console.error('❌ Error creating subscription:', error);
    res.status(500).json({ 
      message: 'Erro ao criar pagamento',
      error: error.message 
    });
  }
});

app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    console.log('🔥 Creating professional payment with SDK v2');
    console.log('🔥 Request body:', req.body);
    console.log('🔥 User:', req.user);
    
    const { amount } = req.body;
    const accessToken = process.env.MP_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.error('❌ MercadoPago access token not configured');
      throw new Error('MercadoPago access token not configured');
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido' });
    }

    // Generate unique external reference
    const externalReference = `professional_${req.user.id}_${Date.now()}`;
    
    // 🔥 GET CORRECT BASE URL
    const baseUrl = getBaseUrl(req);
    
    console.log('🔥 Payment details:', {
      amount,
      externalReference,
      baseUrl,
      accessToken: accessToken ? 'CONFIGURED' : 'MISSING'
    });
    
    // 🔥 SDK v2 PREFERENCE STRUCTURE - FORMATO CORRETO COM URLs FIXAS
    const preferenceData = {
      items: [
        {
          id: 'professional_payment',
          title: `Pagamento ao Convênio - ${req.user.name}`,
          description: `Repasse ao convênio referente às consultas realizadas`,
          quantity: 1,
          unit_price: parseFloat(amount),
          currency_id: 'BRL'
        }
      ],
      payer: {
        name: req.user.name,
        email: 'profissional@cartaoquiroferreira.com.br'
      },
      payment_methods: {
        excluded_payment_types: [],
        excluded_payment_methods: [],
        installments: 12
      },
      // 🔥 URLS DE RETORNO CORRIGIDAS - FORMATO CORRETO
      back_urls: {
        success: `${baseUrl}/professional?payment=success`,
        failure: `${baseUrl}/professional?payment=failure`,
        pending: `${baseUrl}/professional?payment=pending`
      },
      auto_return: 'approved',
      external_reference: externalReference,
      notification_url: `${baseUrl}/api/webhooks/payment-success`,
      statement_descriptor: 'QUIRO FERREIRA',
      expires: false
    };

    console.log('🔥 Creating professional preference with data:', JSON.stringify(preferenceData, null, 2));
    console.log('🔥 Webhook URL:', preferenceData.notification_url);
    console.log('🔥 Success URL:', preferenceData.back_urls.success);

    // Create preference using MercadoPago API
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferenceData)
    });

    console.log('📡 MercadoPago API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ MercadoPago API Error:', response.status, errorData);
      throw new Error(`MercadoPago API Error: ${response.status} - ${errorData}`);
    }

    const preference = await response.json();
    console.log('✅ Professional preference created successfully:', preference.id);

    // 🔥 SAVE PAYMENT RECORD IN PROFESSIONAL_PAYMENTS TABLE
    await pool.query(`
      INSERT INTO professional_payments (professional_id, external_reference, preference_id, amount, description, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user.id,
      externalReference,
      preference.id,
      amount,
      'Repasse ao convênio',
      'pending'
    ]);

    console.log('✅ Payment record saved in professional_payments table');

    res.json({
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      external_reference: externalReference
    });

  } catch (error) {
    console.error('❌ Error creating professional payment:', error);
    res.status(500).json({ 
      message: 'Erro ao criar pagamento',
      error: error.message 
    });
  }
});

// 🔥🔥🔥 WEBHOOK ROUTES - SDK v2 COMPATIBLE 🔥🔥🔥
app.post('/api/webhooks/payment-success', async (req, res) => {
  try {
    console.log('🔥 Webhook received - SDK v2:', JSON.stringify(req.body, null, 2));
    console.log('🔥 Headers:', JSON.stringify(req.headers, null, 2));
    
    const { type, data } = req.body;
    
    if (type === 'payment') {
      const paymentId = data.id;
      console.log('🔥 Processing payment webhook for ID:', paymentId);
      
      // Get payment details from MercadoPago
      const accessToken = process.env.MP_ACCESS_TOKEN;
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (paymentResponse.ok) {
        const paymentData = await paymentResponse.json();
        console.log('✅ Payment data received:', JSON.stringify(paymentData, null, 2));
        
        const externalReference = paymentData.external_reference;
        const status = paymentData.status;
        
        if (status === 'approved') {
          // Update payment status in database
          if (externalReference.startsWith('subscription_')) {
            console.log('🔥 Updating CLIENT payment status...');
            await pool.query(`
              UPDATE client_payments 
              SET status = $1, payment_id = $2, payment_method = $3, payment_date = NOW(), updated_at = NOW()
              WHERE external_reference = $4
            `, ['approved', paymentId, paymentData.payment_method_id, externalReference]);
            
            // Update user subscription status
            const userId = externalReference.split('_')[1];
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month from now
            
            await pool.query(`
              UPDATE users 
              SET subscription_status = 'active', subscription_expiry = $1, updated_at = NOW()
              WHERE id = $2
            `, [expiryDate, userId]);
            
            console.log('✅ Client subscription activated for user:', userId);
          } else if (externalReference.startsWith('professional_')) {
            console.log('🔥 Updating PROFESSIONAL payment status...');
            await pool.query(`
              UPDATE professional_payments 
              SET status = $1, payment_id = $2, payment_method = $3, payment_date = NOW(), updated_at = NOW()
              WHERE external_reference = $4
            `, ['approved', paymentId, paymentData.payment_method_id, externalReference]);
            
            console.log('✅ Professional payment processed for reference:', externalReference);
          }
        }
      }
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alternative webhook endpoint for compatibility
app.post('/api/webhooks/mercadopago', async (req, res) => {
  console.log('🔥 Alternative webhook called:', req.body);
  // Redirect to main webhook
  req.url = '/api/webhooks/payment-success';
  return app._router.handle(req, res);
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt:', { cpf: req.body.cpf, hasPassword: !!req.body.password });
    
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      console.log('Missing credentials');
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Clean CPF (remove formatting)
    const cleanCpf = cpf.replace(/\D/g, '');
    console.log('Cleaned CPF:', cleanCpf);

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, password, roles FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    console.log('User query result:', { found: result.rows.length > 0 });

    if (result.rows.length === 0) {
      console.log('User not found');
      return res.status(401).json({ message: 'CPF ou senha inválidos' });
    }

    const user = result.rows[0];
    console.log('User found:', { id: user.id, name: user.name, roles: user.roles });

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password');
      return res.status(401).json({ message: 'CPF ou senha inválidos' });
    }

    // Return user data for role selection (don't create JWT yet)
    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: user.roles || []
    };

    console.log('Login successful, returning user data:', userData);

    res.json({
      message: 'Login realizado com sucesso',
      user: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/select-role', async (req, res) => {
  try {
    console.log('Role selection:', req.body);
    
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: 'ID do usuário e role são obrigatórios' });
    }

    // Get user data
    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    // Verify user has the selected role
    if (!user.roles || !user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Create JWT token with current role
    const token = jwt.sign(
      { 
        id: user.id, 
        cpf: user.cpf,
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

    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: user.roles,
      currentRole: role
    };

    console.log('Role selected successfully:', userData);

    res.json({
      message: 'Role selecionada com sucesso',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Role selection error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    console.log('Role switch request:', req.body);
    
    const { role } = req.body;
    const userId = req.user.id;

    if (!role) {
      return res.status(400).json({ message: 'Role é obrigatória' });
    }

    // Get user data
    const result = await pool.query(
      'SELECT id, name, cpf, roles FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    // Verify user has the selected role
    if (!user.roles || !user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Create new JWT token with new current role
    const token = jwt.sign(
      { 
        id: user.id, 
        cpf: user.cpf,
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

    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: user.roles,
      currentRole: role
    };

    console.log('Role switched successfully:', userData);

    res.json({
      message: 'Role alterada com sucesso',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Role switch error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', { ...req.body, password: '***' });
    
    const {
      name, cpf, email, phone, birth_date,
      address, address_number, address_complement,
      neighborhood, city, state, password
    } = req.body;

    // Validate required fields
    if (!name || !cpf || !password) {
      return res.status(400).json({ message: 'Nome, CPF e senha são obrigatórios' });
    }

    // Clean CPF
    const cleanCpf = cpf.replace(/\D/g, '');

    if (cleanCpf.length !== 11) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE cpf = $1', [cleanCpf]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user (clients only)
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date,
        address, address_number, address_complement,
        neighborhood, city, state, password, roles
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
      ['client'] // Only clients can register
    ]);

    const newUser = result.rows[0];

    console.log('User registered successfully:', { id: newUser.id, name: newUser.name });

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: {
        id: newUser.id,
        name: newUser.name,
        cpf: newUser.cpf,
        roles: newUser.roles
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ message: 'CPF já cadastrado' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// Protected routes
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.roles, u.percentage,
        u.category_id, u.created_at,
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

// 🔥 PROFESSIONALS ROUTE - CORRIGIDO
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    console.log('🔄 Fetching professionals...');
    
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.roles,
        sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);
    
    console.log('✅ Professionals found:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro ao buscar profissionais' });
  }
});

app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Erro ao buscar usuário' });
  }
});

// Service categories routes
app.get('/api/service-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM service_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service categories:', error);
    res.status(500).json({ message: 'Erro ao buscar categorias' });
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
    res.status(500).json({ message: 'Erro ao buscar serviços' });
  }
});

// Client lookup route
app.get('/api/clients/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;
    
    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    const result = await pool.query(
      'SELECT id, name, cpf FROM users WHERE cpf = $1 AND $2 = ANY(roles)',
      [cleanCpf, 'client']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({ message: 'Erro ao buscar cliente' });
  }
});

// Dependents routes
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
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

// 🔥 DEPENDENTS CRUD ROUTES - IMPLEMENTAÇÃO COMPLETA
app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;
    
    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'client_id, name e cpf são obrigatórios' });
    }
    
    const cleanCpf = cpf.replace(/\D/g, '');
    
    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [client_id, name, cleanCpf, birth_date]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating dependent:', error);
    if (error.code === '23505') {
      res.status(409).json({ message: 'CPF já cadastrado' });
    } else {
      res.status(500).json({ message: 'Erro ao criar dependente' });
    }
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
    
    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }
    
    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro ao excluir dependente' });
  }
});

// 🔥 CONSULTATIONS CRUD ROUTES - IMPLEMENTAÇÃO COMPLETA
app.post('/api/consultations', authenticate, async (req, res) => {
  try {
    const { client_id, dependent_id, professional_id, service_id, value, date } = req.body;
    
    if (!professional_id || !service_id || !value || !date) {
      return res.status(400).json({ message: 'professional_id, service_id, value e date são obrigatórios' });
    }
    
    const result = await pool.query(`
      INSERT INTO consultations (client_id, dependent_id, professional_id, service_id, value, date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [client_id, dependent_id, professional_id, service_id, value, date]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro ao criar consulta' });
  }
});

// Consultations routes
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.date, c.value,
        s.name as service_name,
        u_prof.name as professional_name,
        COALESCE(d.name, u_client.name) as client_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u_prof ON c.professional_id = u_prof.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
    `;
    
    const params = [];
    
    // Filter based on user role
    if (req.user.currentRole === 'client') {
      query += ' WHERE (c.client_id = $1 OR c.dependent_id IN (SELECT id FROM dependents WHERE client_id = $1))';
      params.push(req.user.id);
    } else if (req.user.currentRole === 'professional') {
      query += ' WHERE c.professional_id = $1';
      params.push(req.user.id);
    }
    
    query += ' ORDER BY c.date DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro ao buscar consultas' });
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
    const professionalRevenueQuery = `
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
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC
    `;

    // Get revenue by service
    const serviceRevenueQuery = `
      SELECT 
        s.name as service_name,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `;

    // Get total revenue
    const totalRevenueQuery = `
      SELECT SUM(value) as total_revenue
      FROM consultations
      WHERE date >= $1 AND date <= $2
    `;

    const [professionalResult, serviceResult, totalResult] = await Promise.all([
      pool.query(professionalRevenueQuery, [start_date, end_date]),
      pool.query(serviceRevenueQuery, [start_date, end_date]),
      pool.query(totalRevenueQuery, [start_date, end_date])
    ]);

    res.json({
      total_revenue: parseFloat(totalResult.rows[0]?.total_revenue || 0),
      revenue_by_professional: professionalResult.rows.map(row => ({
        professional_name: row.professional_name,
        professional_percentage: parseFloat(row.professional_percentage || 0),
        revenue: parseFloat(row.revenue || 0),
        consultation_count: parseInt(row.consultation_count || 0),
        professional_payment: parseFloat(row.professional_payment || 0),
        clinic_revenue: parseFloat(row.clinic_revenue || 0)
      })),
      revenue_by_service: serviceResult.rows.map(row => ({
        service_name: row.service_name,
        revenue: parseFloat(row.revenue || 0),
        consultation_count: parseInt(row.consultation_count || 0)
      }))
    });
  } catch (error) {
    console.error('Error fetching revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

// Professional revenue report
app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    console.log('🔄 Fetching professional revenue for user:', req.user.id);
    console.log('🔄 Date range:', { start_date, end_date });

    // Get professional data
    const professionalQuery = `
      SELECT percentage FROM users WHERE id = $1
    `;
    
    const professionalResult = await pool.query(professionalQuery, [req.user.id]);
    const percentage = parseFloat(professionalResult.rows[0]?.percentage || 50);
    
    console.log('🔄 Professional percentage:', percentage);

    // Get consultations for this professional
    const consultationsQuery = `
      SELECT 
        c.date,
        c.value as total_value,
        s.name as service_name,
        COALESCE(d.name, u_client.name) as client_name,
        (c.value * (100 - $3) / 100) as amount_to_pay
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u_client ON c.client_id = u_client.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `;

    // Get summary
    const summaryQuery = `
      SELECT 
        COUNT(c.id) as consultation_count,
        SUM(c.value) as total_revenue,
        SUM(c.value * (100 - $2) / 100) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 AND c.date >= $3 AND c.date <= $4
    `;

    const [consultationsResult, summaryResult] = await Promise.all([
      pool.query(consultationsQuery, [req.user.id, start_date, percentage, end_date]),
      pool.query(summaryQuery, [req.user.id, percentage, start_date, end_date])
    ]);

    console.log('🔄 Consultations found:', consultationsResult.rows.length);
    console.log('🔄 Summary:', summaryResult.rows[0]);

    const summary = summaryResult.rows[0];

    const response = {
      summary: {
        professional_percentage: percentage,
        total_revenue: parseFloat(summary?.total_revenue || 0),
        consultation_count: parseInt(summary?.consultation_count || 0),
        amount_to_pay: parseFloat(summary?.amount_to_pay || 0)
      },
      consultations: consultationsResult.rows.map(row => ({
        date: row.date,
        client_name: row.client_name || 'N/A',
        service_name: row.service_name || 'N/A',
        total_value: parseFloat(row.total_value || 0),
        amount_to_pay: parseFloat(row.amount_to_pay || 0)
      }))
    };

    console.log('✅ Professional revenue response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching professional revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

// 🔥🔥🔥 CATCH-ALL HANDLER - DEVE VIR POR ÚLTIMO 🔥🔥🔥
// Catch-all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
  console.log('🔥 Catch-all route accessed for:', req.url);
  
  // Se for uma rota de API que não existe, retornar 404
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  
  // Para todas as outras rotas, servir o React app
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// Start server
const startServer = async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('🔥 MercadoPago SDK v2 configured with webhook: /api/webhooks/payment-success');
      console.log('🔥 Payment tables: client_payments & professional_payments created!');
      console.log('🔥 PWA configured with manifest.json and service worker!');
      console.log('🔥🔥🔥 ROOT ROUTE ALWAYS REDIRECTS TO /login - PERFECT FOR MOBILE PWA! 🔥🔥🔥');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();