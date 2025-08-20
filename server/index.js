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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure MercadoPago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN || '',
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://www.cartaoquiroferreira.com.br',
    'https://cartaoquiroferreira.com.br'
  ],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
app.use(express.static('dist'));

// 🔥 FUNÇÃO PARA VERIFICAR E CORRIGIR ESTRUTURA DO BANCO
async function checkAndFixDatabaseStructure() {
  console.log('🔄 Verificando e corrigindo estrutura do banco de dados...');
  
  try {
    // 1. VERIFICAR E CORRIGIR TABELA CLIENTS
    console.log('📋 Verificando tabela clients...');
    
    // Verificar se a tabela clients existe
    const clientsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'clients'
      );
    `);
    
    if (!clientsTableCheck.rows[0].exists) {
      console.log('⚠️ Tabela clients não existe, criando...');
      await pool.query(`
        CREATE TABLE clients (
          client_id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE,
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
          subscription_status VARCHAR(20) DEFAULT 'pending',
          subscription_expiry DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Tabela clients criada');
    }

    // Verificar se client_id é a PK correta
    const clientsPKCheck = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'clients' AND constraint_type = 'PRIMARY KEY';
    `);
    
    if (clientsPKCheck.rows.length === 0) {
      console.log('⚠️ Adicionando PRIMARY KEY client_id na tabela clients...');
      await pool.query(`ALTER TABLE clients ADD PRIMARY KEY (client_id);`);
      console.log('✅ PRIMARY KEY client_id adicionada');
    }

    // Verificar colunas necessárias na tabela clients
    const clientsColumns = [
      'client_id', 'user_id', 'name', 'cpf', 'email', 'phone', 'birth_date',
      'address', 'address_number', 'address_complement', 'neighborhood', 
      'city', 'state', 'subscription_status', 'subscription_expiry'
    ];

    for (const column of clientsColumns) {
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'clients' AND column_name = $1
        );
      `, [column]);

      if (!columnCheck.rows[0].exists) {
        let columnDef = 'TEXT';
        if (column === 'client_id') columnDef = 'SERIAL PRIMARY KEY';
        else if (column === 'user_id') columnDef = 'INTEGER UNIQUE';
        else if (column === 'birth_date' || column === 'subscription_expiry') columnDef = 'DATE';
        else if (column === 'subscription_status') columnDef = 'VARCHAR(20) DEFAULT \'pending\'';

        await pool.query(`ALTER TABLE clients ADD COLUMN ${column} ${columnDef};`);
        console.log(`✅ Coluna ${column} adicionada na tabela clients`);
      }
    }

    // 2. VERIFICAR E CORRIGIR TABELA USERS
    console.log('📋 Verificando tabela users...');
    
    const usersColumns = ['roles', 'photo_url', 'category_id', 'professional_percentage', 'crm', 'signature_url'];
    
    for (const column of usersColumns) {
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = $1
        );
      `, [column]);

      if (!columnCheck.rows[0].exists) {
        let columnDef = 'TEXT';
        if (column === 'roles') columnDef = 'TEXT[]';
        else if (column === 'category_id') columnDef = 'INTEGER';
        else if (column === 'professional_percentage') columnDef = 'DECIMAL(5,2) DEFAULT 50.00';

        await pool.query(`ALTER TABLE users ADD COLUMN ${column} ${columnDef};`);
        console.log(`✅ Coluna ${column} adicionada na tabela users`);
      }
    }

    // Migrar dados da coluna role para roles se necessário
    const roleColumnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
      );
    `);

    if (roleColumnCheck.rows[0].exists) {
      console.log('🔄 Migrando dados de role para roles...');
      await pool.query(`
        UPDATE users 
        SET roles = ARRAY[role] 
        WHERE roles IS NULL AND role IS NOT NULL;
      `);
      console.log('✅ Migração de role para roles concluída');
    }

    // 3. VERIFICAR E CORRIGIR TABELA DEPENDENTS
    console.log('📋 Verificando tabela dependents...');
    
    // Verificar se a tabela dependents existe
    const dependentsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'dependents'
      );
    `);
    
    if (!dependentsTableCheck.rows[0].exists) {
      console.log('⚠️ Tabela dependents não existe, criando...');
      await pool.query(`
        CREATE TABLE dependents (
          id SERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL,
          name VARCHAR(255) NOT NULL,
          cpf VARCHAR(11) UNIQUE,
          birth_date DATE,
          subscription_status VARCHAR(20) DEFAULT 'pending',
          subscription_expiry DATE,
          billing_amount DECIMAL(10,2) DEFAULT 50.00,
          payment_reference VARCHAR(255),
          activated_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Tabela dependents criada');
    }

    const dependentsColumns = [
      'client_id', 'subscription_status', 'subscription_expiry', 
      'billing_amount', 'payment_reference', 'activated_at'
    ];

    for (const column of dependentsColumns) {
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'dependents' AND column_name = $1
        );
      `, [column]);

      if (!columnCheck.rows[0].exists) {
        let columnDef = 'TEXT';
        if (column === 'client_id') columnDef = 'INTEGER NOT NULL';
        else if (column === 'subscription_status') columnDef = 'VARCHAR(20) DEFAULT \'pending\'';
        else if (column === 'subscription_expiry') columnDef = 'DATE';
        else if (column === 'billing_amount') columnDef = 'DECIMAL(10,2) DEFAULT 50.00';
        else if (column === 'activated_at') columnDef = 'TIMESTAMP';

        await pool.query(`ALTER TABLE dependents ADD COLUMN ${column} ${columnDef};`);
        console.log(`✅ Coluna ${column} adicionada na tabela dependents`);
      }
    }

    // 4. VERIFICAR E CORRIGIR TABELA CONSULTATIONS
    console.log('📋 Verificando tabela consultations...');
    
    const consultationsColumns = [
      'client_id', 'dependent_id', 'private_patient_id', 'location_id', 'status', 'notes'
    ];

    for (const column of consultationsColumns) {
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'consultations' AND column_name = $1
        );
      `, [column]);

      if (!columnCheck.rows[0].exists) {
        let columnDef = 'INTEGER';
        if (column === 'status') columnDef = 'VARCHAR(20) DEFAULT \'completed\'';
        else if (column === 'notes') columnDef = 'TEXT';

        await pool.query(`ALTER TABLE consultations ADD COLUMN ${column} ${columnDef};`);
        console.log(`✅ Coluna ${column} adicionada na tabela consultations`);
      }
    }

    // 5. VERIFICAR E CORRIGIR OUTRAS TABELAS NECESSÁRIAS
    console.log('📋 Verificando outras tabelas...');

    // Tabela client_payments
    const clientPaymentsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'client_payments'
      );
    `);
    
    if (!clientPaymentsTableCheck.rows[0].exists) {
      await pool.query(`
        CREATE TABLE client_payments (
          id SERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          payment_method VARCHAR(50),
          payment_status VARCHAR(20) DEFAULT 'pending',
          payment_reference VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Tabela client_payments criada');
    }

    // Tabela agenda_payments
    const agendaPaymentsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'agenda_payments'
      );
    `);
    
    if (!agendaPaymentsTableCheck.rows[0].exists) {
      await pool.query(`
        CREATE TABLE agenda_payments (
          id SERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL,
          consultation_id INTEGER,
          amount DECIMAL(10,2) NOT NULL,
          payment_method VARCHAR(50),
          payment_status VARCHAR(20) DEFAULT 'pending',
          payment_reference VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Tabela agenda_payments criada');
    }

    // 6. VERIFICAR E CORRIGIR FOREIGN KEYS
    console.log('🔗 Verificando foreign keys...');
    
    // Verificar FK em dependents
    const dependentsFKCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'dependents' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'client_id'
      );
    `);

    if (!dependentsFKCheck.rows[0].exists) {
      try {
        await pool.query(`
          ALTER TABLE dependents 
          ADD CONSTRAINT fk_dependents_client 
          FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE;
        `);
        console.log('✅ Foreign key dependents.client_id criada');
      } catch (error) {
        console.log('⚠️ Foreign key dependents.client_id já existe ou não pôde ser criada');
      }
    }

    console.log('✅ Verificação e correção da estrutura do banco concluída!');
    
  } catch (error) {
    console.error('❌ Erro ao verificar/corrigir estrutura do banco:', error);
    // Não interromper a aplicação, apenas logar o erro
  }
}

// Database connection and structure check
pool.connect()
  .then(async () => {
    console.log('✅ Conectado ao PostgreSQL');
    await checkAndFixDatabaseStructure();
  })
  .catch(err => {
    console.error('❌ Erro de conexão com PostgreSQL:', err);
  });

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, password, roles FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Parse roles (handle both string and array formats)
    let userRoles = [];
    if (user.roles) {
      if (Array.isArray(user.roles)) {
        userRoles = user.roles;
      } else if (typeof user.roles === 'string') {
        try {
          userRoles = JSON.parse(user.roles);
        } catch {
          userRoles = [user.roles];
        }
      }
    }

    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: userRoles
    };

    console.log('✅ Login successful for user:', userData);

    res.json({
      user: userData,
      needsRoleSelection: userRoles.length > 1
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
      return res.status(400).json({ message: 'UserId e role são obrigatórios' });
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

    // Parse roles
    let userRoles = [];
    if (user.roles) {
      if (Array.isArray(user.roles)) {
        userRoles = user.roles;
      } else if (typeof user.roles === 'string') {
        try {
          userRoles = JSON.parse(user.roles);
        } catch {
          userRoles = [user.roles];
        }
      }
    }

    // Verify user has this role
    if (!userRoles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Create token with selected role
    const token = jwt.sign(
      { id: user.id, currentRole: role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: userRoles,
      currentRole: role
    };

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
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

    // Parse roles
    let userRoles = [];
    if (user.roles) {
      if (Array.isArray(user.roles)) {
        userRoles = user.roles;
      } else if (typeof user.roles === 'string') {
        try {
          userRoles = JSON.parse(user.roles);
        } catch {
          userRoles = [user.roles];
        }
      }
    }

    // Verify user has this role
    if (!userRoles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Create new token with selected role
    const token = jwt.sign(
      { id: user.id, currentRole: role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    const userData = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles: userRoles,
      currentRole: role
    };

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
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

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (name, cpf, email, phone, password, roles, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
         RETURNING id, name, cpf, roles`,
        [name, cleanCpf, email, phone, hashedPassword, ['client']]
      );

      const newUser = userResult.rows[0];

      // Create client record
      const clientResult = await client.query(
        `INSERT INTO clients (
          user_id, name, cpf, email, phone, birth_date, address, address_number,
          address_complement, neighborhood, city, state, subscription_status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
        RETURNING client_id`,
        [
          newUser.id, name, cleanCpf, email, phone, birth_date, address, address_number,
          address_complement, neighborhood, city, state, 'pending'
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: {
          id: newUser.id,
          name: newUser.name,
          cpf: newUser.cpf,
          roles: ['client'],
          client_id: clientResult.rows[0].client_id
        }
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
      res.status(400).json({ message: 'CPF já cadastrado' });
    } else {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// Users routes
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.cpf, u.email, u.phone, u.roles, u.created_at,
             c.client_id, c.subscription_status, c.subscription_expiry
      FROM users u
      LEFT JOIN clients c ON u.id = c.user_id
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
      SELECT u.*, c.client_id, c.subscription_status, c.subscription_expiry,
             sc.name as category_name
      FROM users u
      LEFT JOIN clients c ON u.id = c.user_id
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

app.get('/api/users/:id/subscription-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT c.subscription_status, c.subscription_expiry
      FROM clients c
      WHERE c.user_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ message: 'Erro ao buscar status da assinatura' });
  }
});

// Clients routes
app.get('/api/clients/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.toString().replace(/\D/g, '');

    const result = await pool.query(`
      SELECT c.client_id as id, c.name, c.cpf, c.subscription_status, c.subscription_expiry
      FROM clients c
      WHERE c.cpf = $1
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

// Dependents routes
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const result = await pool.query(`
      SELECT d.*, 
             CASE 
               WHEN d.subscription_status = 'active' AND d.subscription_expiry > CURRENT_DATE THEN 'active'
               WHEN d.subscription_status = 'active' AND d.subscription_expiry <= CURRENT_DATE THEN 'expired'
               ELSE d.subscription_status
             END as current_status
      FROM dependents d
      WHERE d.client_id = (SELECT client_id FROM clients WHERE user_id = $1)
      ORDER BY d.created_at DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro ao buscar dependentes' });
  }
});

app.get('/api/dependents/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.toString().replace(/\D/g, '');

    const result = await pool.query(`
      SELECT d.id, d.name, d.cpf, d.birth_date, d.client_id,
             c.name as client_name, c.subscription_status as client_subscription_status,
             d.subscription_status as dependent_subscription_status,
             d.subscription_expiry
      FROM dependents d
      JOIN clients c ON d.client_id = c.client_id
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
    const userId = req.user.id;

    if (!name || !cpf) {
      return res.status(400).json({ message: 'Nome e CPF são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    // Get client_id from clients table using user_id
    const clientResult = await pool.query(
      'SELECT client_id FROM clients WHERE user_id = $1',
      [userId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const actualClientId = clientResult.rows[0].client_id;

    // Check if CPF already exists
    const existingDependent = await pool.query(
      'SELECT id FROM dependents WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingDependent.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado como dependente' });
    }

    // Check if CPF exists as user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado como usuário' });
    }

    const result = await pool.query(
      `INSERT INTO dependents (client_id, name, cpf, birth_date, subscription_status, billing_amount, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', 50.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [actualClientId, name, cleanCpf, birth_date]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating dependent:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'CPF já cadastrado' });
    } else {
      res.status(500).json({ message: 'Erro ao criar dependente' });
    }
  }
});

app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    const result = await pool.query(
      `UPDATE dependents 
       SET name = $1, birth_date = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 
       RETURNING *`,
      [name, birth_date, id]
    );

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

    const result = await pool.query(
      'DELETE FROM dependents WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json({ message: 'Dependente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro ao excluir dependente' });
  }
});

// Consultations routes
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT c.*, s.name as service_name, u.name as professional_name,
             COALESCE(cl.name, pp.name, d.name) as client_name,
             CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.professional_id = u.id
      LEFT JOIN clients cl ON c.client_id = cl.client_id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
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
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro ao buscar consultas' });
  }
});

app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get client_id from clients table
    const clientResult = await pool.query(
      'SELECT client_id FROM clients WHERE user_id = $1',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const actualClientId = clientResult.rows[0].client_id;

    const result = await pool.query(`
      SELECT c.*, s.name as service_name, u.name as professional_name,
             COALESCE(cl.name, d.name) as client_name,
             CASE WHEN d.id IS NOT NULL THEN true ELSE false END as is_dependent
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.professional_id = u.id
      LEFT JOIN clients cl ON c.client_id = cl.client_id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE c.client_id = $1 OR c.dependent_id IN (
        SELECT id FROM dependents WHERE client_id = $1
      )
      ORDER BY c.date DESC
    `, [actualClientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro ao buscar consultas do cliente' });
  }
});

app.post('/api/consultations', authenticate, async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, service_id, location_id,
      value, date, status, notes
    } = req.body;

    const professional_id = req.user.id;

    // Validate required fields
    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    // Validate that at least one patient type is selected
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário selecionar um cliente, dependente ou paciente particular' });
    }

    let actualClientId = client_id;

    // If dependent_id is provided, get the client_id from dependents table
    if (dependent_id) {
      const dependentResult = await pool.query(
        'SELECT client_id FROM dependents WHERE id = $1',
        [dependent_id]
      );

      if (dependentResult.rows.length === 0) {
        return res.status(404).json({ message: 'Dependente não encontrado' });
      }

      actualClientId = dependentResult.rows[0].client_id;
    }

    const result = await pool.query(
      `INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, service_id, 
        location_id, value, date, status, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
      RETURNING *`,
      [
        actualClientId, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, status || 'completed', notes
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro ao criar consulta' });
  }
});

app.put('/api/consultations/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status é obrigatório' });
    }

    const result = await pool.query(
      `UPDATE consultations 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating consultation status:', error);
    res.status(500).json({ message: 'Erro ao atualizar status da consulta' });
  }
});

// Services routes
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
    res.status(500).json({ message: 'Erro ao buscar serviços' });
  }
});

app.post('/api/services', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !description || !base_price) {
      return res.status(400).json({ message: 'Nome, descrição e preço são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, description, base_price, category_id, is_base_service || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Erro ao criar serviço' });
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

app.post('/api/service-categories', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({ message: 'Nome e descrição são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO service_categories (name, description, created_at, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro ao criar categoria' });
  }
});

// Professionals routes
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.roles, u.address, u.address_number,
             u.address_complement, u.neighborhood, u.city, u.state, u.photo_url,
             sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE u.roles @> '["professional"]'
      ORDER BY u.name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro ao buscar profissionais' });
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
    console.error('Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro ao buscar pacientes particulares' });
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

    const result = await pool.query(
      `INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        req.user.id, name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating private patient:', error);
    res.status(500).json({ message: 'Erro ao criar paciente particular' });
  }
});

// Medical records routes
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mr.*, pp.name as patient_name
      FROM medical_records mr
      LEFT JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
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
      private_patient_id, chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis, treatment_plan, notes, vital_signs
    } = req.body;

    if (!private_patient_id) {
      return res.status(400).json({ message: 'Paciente é obrigatório' });
    }

    const result = await pool.query(
      `INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination, diagnosis,
        treatment_plan, notes, vital_signs, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        req.user.id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination, diagnosis,
        treatment_plan, notes, JSON.stringify(vital_signs)
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Erro ao criar prontuário' });
  }
});

// Medical documents routes
app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT md.*, pp.name as patient_name
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

    // Save to database
    const result = await pool.query(
      `INSERT INTO medical_documents (
        professional_id, private_patient_id, title, document_type, document_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING *`,
      [req.user.id, private_patient_id, title, document_type, documentResult.url]
    );

    res.status(201).json({
      ...result.rows[0],
      title,
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento' });
  }
});

// Reports routes
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Total revenue
    const totalResult = await pool.query(`
      SELECT COALESCE(SUM(value), 0) as total_revenue
      FROM consultations
      WHERE date >= $1 AND date <= $2
    `, [start_date, end_date]);

    // Revenue by professional
    const professionalResult = await pool.query(`
      SELECT 
        u.name as professional_name,
        COALESCE(u.professional_percentage, 50) as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (COALESCE(u.professional_percentage, 50) / 100)), 0) as professional_payment,
        COALESCE(SUM(c.value * ((100 - COALESCE(u.professional_percentage, 50)) / 100)), 0) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2
      GROUP BY u.id, u.name, u.professional_percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Revenue by service
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
    res.status(500).json({ message: 'Erro ao gerar relatório de receita' });
  }
});

app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const professionalId = req.user.id;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional percentage
    const userResult = await pool.query(
      'SELECT COALESCE(professional_percentage, 50) as professional_percentage FROM users WHERE id = $1',
      [professionalId]
    );

    const professionalPercentage = userResult.rows[0]?.professional_percentage || 50;

    // Get consultations summary
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as consultation_count,
        COALESCE(SUM(value), 0) as total_revenue,
        COALESCE(SUM(value * ((100 - $3) / 100)), 0) as amount_to_pay
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $4
    `, [professionalId, start_date, professionalPercentage, end_date]);

    // Get detailed consultations
    const consultationsResult = await pool.query(`
      SELECT 
        c.date,
        COALESCE(cl.name, pp.name, d.name) as client_name,
        s.name as service_name,
        c.value as total_value,
        c.value * ((100 - $3) / 100) as amount_to_pay
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN clients cl ON c.client_id = cl.client_id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4
      ORDER BY c.date DESC
    `, [professionalId, start_date, professionalPercentage, end_date]);

    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: parseFloat(summaryResult.rows[0].total_revenue),
        consultation_count: parseInt(summaryResult.rows[0].consultation_count),
        amount_to_pay: parseFloat(summaryResult.rows[0].amount_to_pay)
      },
      consultations: consultationsResult.rows
    });
  } catch (error) {
    console.error('Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de receita do profissional' });
  }
});

// Payment routes
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    const userId = user_id || req.user.id;

    // Get client data
    const clientResult = await pool.query(`
      SELECT c.client_id, c.name, c.cpf, c.subscription_status
      FROM clients c
      WHERE c.user_id = $1
    `, [userId]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const client = clientResult.rows[0];

    if (client.subscription_status === 'active') {
      return res.status(400).json({ message: 'Cliente já possui assinatura ativa' });
    }

    const preference = {
      items: [{
        title: `Assinatura Convênio Quiro Ferreira - ${client.name}`,
        quantity: 1,
        unit_price: 250.00,
        currency_id: 'BRL'
      }],
      payer: {
        name: client.name,
        identification: {
          type: 'CPF',
          number: client.cpf
        }
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending`
      },
      auto_return: 'approved',
      external_reference: `subscription_${client.client_id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`
    };

    const response = await mercadopago.preferences.create(preference);
    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento da assinatura' });
  }
});

app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get dependent and client data
    const result = await pool.query(`
      SELECT d.*, c.name as client_name, c.cpf as client_cpf
      FROM dependents d
      JOIN clients c ON d.client_id = c.client_id
      WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = result.rows[0];

    if (dependent.subscription_status === 'active') {
      return res.status(400).json({ message: 'Dependente já possui assinatura ativa' });
    }

    const preference = {
      items: [{
        title: `Assinatura Dependente - ${dependent.name}`,
        quantity: 1,
        unit_price: dependent.billing_amount || 50.00,
        currency_id: 'BRL'
      }],
      payer: {
        name: dependent.client_name,
        identification: {
          type: 'CPF',
          number: dependent.client_cpf
        }
      },
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success&type=dependent`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure&type=dependent`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending&type=dependent`
      },
      auto_return: 'approved',
      external_reference: `dependent_${dependent.id}_${Date.now()}`,
      notification_url: `${req.protocol}://${req.get('host')}/api/webhooks/mercadopago`
    };

    const response = await mercadopago.preferences.create(preference);
    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento do dependente' });
  }
});

// Webhooks
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      
      // Get payment details from MercadoPago
      const payment = await mercadopago.payment.findById(paymentId);
      const paymentData = payment.body;

      if (paymentData.status === 'approved') {
        const externalReference = paymentData.external_reference;
        
        if (externalReference.startsWith('subscription_')) {
          // Handle subscription payment
          const clientId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE clients 
            SET subscription_status = 'active',
                subscription_expiry = CURRENT_DATE + INTERVAL '1 year',
                updated_at = CURRENT_TIMESTAMP
            WHERE client_id = $1
          `, [clientId]);
          
        } else if (externalReference.startsWith('dependent_')) {
          // Handle dependent payment
          const dependentId = externalReference.split('_')[1];
          
          await pool.query(`
            UPDATE dependents 
            SET subscription_status = 'active',
                subscription_expiry = CURRENT_DATE + INTERVAL '1 year',
                activated_at = CURRENT_TIMESTAMP,
                payment_reference = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [paymentId, dependentId]);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Erro no webhook' });
  }
});

// Attendance locations routes
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
      name, address, address_number, address_complement, neighborhood,
      city, state, zip_code, phone, is_default
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nome é obrigatório' });
    }

    // If setting as default, remove default from others
    if (is_default) {
      await pool.query(
        'UPDATE attendance_locations SET is_default = false WHERE professional_id = $1',
        [req.user.id]
      );
    }

    const result = await pool.query(
      `INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        req.user.id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default || false
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating attendance location:', error);
    res.status(500).json({ message: 'Erro ao criar local de atendimento' });
  }
});

// Image upload route
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

      const imageUrl = req.file.path;

      // Update user photo_url
      await pool.query(
        'UPDATE users SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [imageUrl, req.user.id]
      );

      res.json({ imageUrl });
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Erro ao fazer upload da imagem' });
  }
});

// Serve static files
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});