import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { authenticate, authorize } from "./middleware/auth.js";
import createUpload from "./middleware/upload.js";
import { generateDocumentPDF } from "./utils/documentGenerator.js";
import { MercadoPago } from "mercadopago";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize MercadoPago
const client = new MercadoPago({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

// Get base URL for back URLs
const getBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://www.cartaoquiroferreira.com.br';
  }
  return 'http://localhost:5173'; // Vite dev server port
};

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

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// ==================== AUTHENTICATION ROUTES ====================

// Register new user (client only)
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

    console.log('🔄 Registration attempt for CPF:', cpf);

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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) 
      RETURNING id, name, cpf, email, roles, subscription_status`,
      [
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, hashedPassword,
        JSON.stringify(['client']), 'pending'
      ]
    );

    const user = result.rows[0];
    console.log('✅ User registered successfully:', user.id);

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

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { cpf, password } = req.body;

    console.log('🔄 Login attempt for CPF:', cpf);

    // Validate input
    if (!cpf || !password) {
      return res.status(400).json({ message: 'CPF e senha são obrigatórios' });
    }

    // Find user by CPF
    const result = await pool.query(
      'SELECT id, name, cpf, email, password_hash, roles FROM users WHERE cpf = $1',
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

    console.log('✅ Login successful for user:', user.id);

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

    console.log('🎯 Role selection:', { userId, role });

    // Validate input
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

    console.log('✅ Role selected and token created');

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

// Switch role for authenticated user
app.post('/api/auth/switch-role', authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.user.id;

    console.log('🔄 Role switch request:', { userId, role });

    // Verify user has the requested role
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ message: 'Role não autorizada para este usuário' });
    }

    // Create new JWT token with new role
    const token = jwt.sign(
      { 
        id: userId, 
        cpf: req.user.cpf,
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

    console.log('✅ Role switched successfully');

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

// Logout user
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso' });
});

// ==================== PAYMENT ROUTES ====================

// Create subscription payment for clients
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id, dependent_ids = [] } = req.body;
    const baseUrl = getBaseUrl();

    console.log('🔄 Creating subscription payment for user:', user_id);

    // Get user data
    const userResult = await pool.query(
      'SELECT name, email, cpf FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // Calculate total amount (R$250 for titular + R$50 per dependent)
    const dependentCount = dependent_ids.length;
    const totalAmount = 250 + (dependentCount * 50);

    console.log('💰 Subscription payment details:', {
      user_id,
      dependentCount,
      totalAmount
    });

    // Create preference
    const preference = {
      items: [
        {
          title: `Assinatura Cartão Quiro Ferreira - ${user.name}`,
          description: `Assinatura mensal do convênio (Titular + ${dependentCount} dependente(s))`,
          quantity: 1,
          unit_price: totalAmount,
          currency_id: 'BRL'
        }
      ],
      payer: {
        name: user.name,
        email: user.email || `${user.cpf}@temp.com`,
        identification: {
          type: 'CPF',
          number: user.cpf
        }
      },
      back_urls: {
        success: `${baseUrl}/client?payment=success`,
        failure: `${baseUrl}/client?payment=failure`,
        pending: `${baseUrl}/client?payment=pending`
      },
      auto_return: 'approved',
      external_reference: `subscription_${user_id}_${Date.now()}`,
      notification_url: `${baseUrl}/api/payments/webhook`,
      statement_descriptor: 'QUIRO FERREIRA'
    };

    console.log('🔄 Creating MercadoPago preference:', preference);

    const response = await client.preferences.create({ body: preference });
    
    console.log('✅ MercadoPago preference created:', response);

    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point
    });

  } catch (error) {
    console.error('❌ Error creating subscription payment:', error);
    res.status(500).json({ 
      message: 'Erro ao criar pagamento de assinatura',
      error: error.message 
    });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, async (req, res) => {
  try {
    const { amount } = req.body;
    const professional_id = req.user.id;
    const baseUrl = getBaseUrl();

    console.log('🔄 Creating professional payment:', { professional_id, amount });

    // Get professional data
    const professionalResult = await pool.query(
      'SELECT name, email, cpf FROM users WHERE id = $1',
      [professional_id]
    );

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const professional = professionalResult.rows[0];

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Valor inválido para pagamento' });
    }

    console.log('💰 Professional payment details:', {
      professional_id,
      professional_name: professional.name,
      amount: numericAmount
    });

    // Create preference
    const preference = {
      items: [
        {
          title: `Repasse ao Convênio - ${professional.name}`,
          description: `Pagamento de repasse ao Convênio Quiro Ferreira referente às consultas realizadas`,
          quantity: 1,
          unit_price: numericAmount,
          currency_id: 'BRL'
        }
      ],
      payer: {
        name: professional.name,
        email: professional.email || `${professional.cpf}@temp.com`,
        identification: {
          type: 'CPF',
          number: professional.cpf
        }
      },
      back_urls: {
        success: `${baseUrl}/professional?payment=success`,
        failure: `${baseUrl}/professional?payment=failure`,
        pending: `${baseUrl}/professional?payment=pending`
      },
      auto_return: 'approved',
      external_reference: `professional_${professional_id}_${Date.now()}`,
      notification_url: `${baseUrl}/api/payments/webhook`,
      statement_descriptor: 'QUIRO FERREIRA'
    };

    console.log('🔄 Creating MercadoPago preference for professional:', preference);

    const response = await client.preferences.create({ body: preference });
    
    console.log('✅ MercadoPago preference created for professional:', response);

    res.json({
      preference_id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point
    });

  } catch (error) {
    console.error('❌ Error creating professional payment:', error);
    res.status(500).json({ 
      message: 'Erro ao criar pagamento profissional',
      error: error.message 
    });
  }
});

// Webhook to handle payment notifications
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('🔔 Payment webhook received');
    
    const body = req.body;
    const query = req.query;
    
    console.log('📦 Webhook body:', body);
    console.log('📦 Webhook query:', query);

    // Process payment notification
    if (query.type === 'payment') {
      const paymentId = query['data.id'] || query.id;
      
      if (paymentId) {
        console.log('💳 Processing payment notification for ID:', paymentId);
        
        // Get payment details from MercadoPago
        const payment = await client.payments.get({ id: paymentId });
        console.log('💳 Payment details:', payment);
        
        const externalReference = payment.external_reference;
        const status = payment.status;
        
        console.log('📋 Payment info:', { externalReference, status });
        
        if (externalReference) {
          // Handle subscription payments
          if (externalReference.startsWith('subscription_')) {
            const userId = externalReference.split('_')[1];
            
            if (status === 'approved') {
              // Update user subscription status
              await pool.query(
                'UPDATE users SET subscription_status = $1, subscription_expiry = $2 WHERE id = $3',
                ['active', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), userId] // 30 days from now
              );
              
              console.log('✅ Subscription activated for user:', userId);
            }
          }
          
          // Handle professional payments
          if (externalReference.startsWith('professional_')) {
            const professionalId = externalReference.split('_')[1];
            
            if (status === 'approved') {
              // Record professional payment (you may need to create this table)
              try {
                await pool.query(
                  'INSERT INTO professional_payments (professional_id, amount, payment_id, status, paid_at) VALUES ($1, $2, $3, $4, $5)',
                  [professionalId, payment.transaction_amount, paymentId, 'paid', new Date()]
                );
                
                console.log('✅ Professional payment recorded for:', professionalId);
              } catch (dbError) {
                console.log('ℹ️ Professional payments table may not exist yet, skipping record');
              }
            }
          }
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
});

// ==================== USER MANAGEMENT ROUTES ====================

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
        u.created_at, u.photo_url, sc.name as category_name
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Set default subscription status for clients
    const subscriptionStatus = roles.includes('client') ? 'pending' : null;

    // Create user
    const result = await pool.query(`
      INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password_hash,
        roles, percentage, category_id, subscription_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING id, name, cpf, email, roles
    `, [
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, hashedPassword,
      JSON.stringify(roles), percentage, category_id, subscriptionStatus
    ]);

    console.log('✅ User created by admin:', result.rows[0].id);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Erro ao criar usuário' });
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

    // Users can only update their own data unless they're admin
    if (req.user.currentRole !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha' });
      }

      const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }
    }

    // Build update query
    let updateFields = [];
    let values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCount}`);
      values.push(phone);
      paramCount++;
    }

    if (birth_date !== undefined) {
      updateFields.push(`birth_date = $${paramCount}`);
      values.push(birth_date);
      paramCount++;
    }

    if (address !== undefined) {
      updateFields.push(`address = $${paramCount}`);
      values.push(address);
      paramCount++;
    }

    if (address_number !== undefined) {
      updateFields.push(`address_number = $${paramCount}`);
      values.push(address_number);
      paramCount++;
    }

    if (address_complement !== undefined) {
      updateFields.push(`address_complement = $${paramCount}`);
      values.push(address_complement);
      paramCount++;
    }

    if (neighborhood !== undefined) {
      updateFields.push(`neighborhood = $${paramCount}`);
      values.push(neighborhood);
      paramCount++;
    }

    if (city !== undefined) {
      updateFields.push(`city = $${paramCount}`);
      values.push(city);
      paramCount++;
    }

    if (state !== undefined) {
      updateFields.push(`state = $${paramCount}`);
      values.push(state);
      paramCount++;
    }

    if (roles !== undefined && req.user.currentRole === 'admin') {
      updateFields.push(`roles = $${paramCount}`);
      values.push(JSON.stringify(roles));
      paramCount++;
    }

    if (percentage !== undefined && req.user.currentRole === 'admin') {
      updateFields.push(`percentage = $${paramCount}`);
      values.push(percentage);
      paramCount++;
    }

    if (category_id !== undefined && req.user.currentRole === 'admin') {
      updateFields.push(`category_id = $${paramCount}`);
      values.push(category_id);
      paramCount++;
    }

    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push(`password_hash = $${paramCount}`);
      values.push(hashedPassword);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    // Add updated_at
    updateFields.push(`updated_at = NOW()`);

    // Add user ID for WHERE clause
    values.push(id);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, cpf, email, roles
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    console.log('✅ User updated:', result.rows[0].id);

    res.json({
      message: 'Usuário atualizado com sucesso',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Erro ao atualizar usuário' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    console.log('✅ User deleted:', id);

    res.json({ message: 'Usuário excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Erro ao excluir usuário' });
  }
});

// Activate client subscription (admin only)
app.put('/api/users/:id/activate', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { expiry_date } = req.body;

    if (!expiry_date) {
      return res.status(400).json({ message: 'Data de expiração é obrigatória' });
    }

    // Update user subscription
    const result = await pool.query(`
      UPDATE users 
      SET subscription_status = 'active', subscription_expiry = $1, updated_at = NOW()
      WHERE id = $2 AND 'client' = ANY(roles)
      RETURNING id, name, subscription_status, subscription_expiry
    `, [expiry_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    console.log('✅ Client activated:', result.rows[0]);

    res.json({
      message: 'Cliente ativado com sucesso',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Error activating client:', error);
    res.status(500).json({ message: 'Erro ao ativar cliente' });
  }
});

// ==================== SERVICE CATEGORIES ROUTES ====================

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
    res.status(500).json({ message: 'Erro ao carregar categorias de serviços' });
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
      RETURNING id, name, description, created_at
    `, [name, description]);

    console.log('✅ Service category created:', result.rows[0].id);

    res.status(201).json({
      message: 'Categoria criada com sucesso',
      category: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro ao criar categoria' });
  }
});

// ==================== SERVICES ROUTES ====================

// Get all services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id, s.name, s.description, s.base_price, s.category_id, 
        s.is_base_service, s.created_at, sc.name as category_name
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

    const result = await pool.query(`
      INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, name, description, base_price, category_id, is_base_service
    `, [name, description, base_price, category_id, is_base_service || false]);

    console.log('✅ Service created:', result.rows[0].id);

    res.status(201).json({
      message: 'Serviço criado com sucesso',
      service: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Erro ao criar serviço' });
  }
});

// Update service (admin only)
app.put('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, category_id, is_base_service } = req.body;

    const result = await pool.query(`
      UPDATE services 
      SET name = $1, description = $2, base_price = $3, category_id = $4, 
          is_base_service = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING id, name, description, base_price, category_id, is_base_service
    `, [name, description, base_price, category_id, is_base_service, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    console.log('✅ Service updated:', result.rows[0].id);

    res.json({
      message: 'Serviço atualizado com sucesso',
      service: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Erro ao atualizar serviço' });
  }
});

// Delete service (admin only)
app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service is being used in consultations
    const consultationCheck = await pool.query(
      'SELECT id FROM consultations WHERE service_id = $1 LIMIT 1',
      [id]
    );

    if (consultationCheck.rows.length > 0) {
      return res.status(400).json({ 
        message: 'Não é possível excluir este serviço pois ele possui consultas associadas' 
      });
    }

    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    console.log('✅ Service deleted:', id);

    res.json({ message: 'Serviço excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Erro ao excluir serviço' });
  }
});

// ==================== PROFESSIONALS ROUTES ====================

// Get all professionals (for clients)
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.address, u.address_number,
        u.address_complement, u.neighborhood, u.city, u.state, u.roles,
        u.photo_url, sc.name as category_name
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro ao carregar profissionais' });
  }
});

// Get professionals with scheduling access (admin only)
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, sc.name as category_name,
        u.has_scheduling_access, u.access_expires_at, u.access_granted_by, u.access_granted_at
      FROM users u
      LEFT JOIN service_categories sc ON u.category_id = sc.id
      WHERE 'professional' = ANY(u.roles)
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

    const result = await pool.query(`
      UPDATE users 
      SET has_scheduling_access = true, access_expires_at = $1, 
          access_granted_by = $2, access_granted_at = NOW(), updated_at = NOW()
      WHERE id = $3 AND 'professional' = ANY(roles)
      RETURNING id, name, has_scheduling_access, access_expires_at
    `, [expires_at, req.user.name, professional_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    console.log('✅ Scheduling access granted to professional:', professional_id);

    res.json({
      message: 'Acesso à agenda concedido com sucesso',
      professional: result.rows[0]
    });

  } catch (error) {
    console.error('Error granting scheduling access:', error);
    res.status(500).json({ message: 'Erro ao conceder acesso à agenda' });
  }
});

// Revoke scheduling access (admin only)
app.post('/api/admin/revoke-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id } = req.body;

    if (!professional_id) {
      return res.status(400).json({ message: 'ID do profissional é obrigatório' });
    }

    const result = await pool.query(`
      UPDATE users 
      SET has_scheduling_access = false, access_expires_at = NULL, 
          access_granted_by = NULL, access_granted_at = NULL, updated_at = NOW()
      WHERE id = $1 AND 'professional' = ANY(roles)
      RETURNING id, name, has_scheduling_access
    `, [professional_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    console.log('✅ Scheduling access revoked from professional:', professional_id);

    res.json({
      message: 'Acesso à agenda revogado com sucesso',
      professional: result.rows[0]
    });

  } catch (error) {
    console.error('Error revoking scheduling access:', error);
    res.status(500).json({ message: 'Erro ao revogar acesso à agenda' });
  }
});

// ==================== CLIENTS ROUTES ====================

// Lookup client by CPF
app.get('/api/clients/lookup', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const result = await pool.query(`
      SELECT id, name, cpf, email, phone, subscription_status, subscription_expiry
      FROM users 
      WHERE cpf = $1 AND 'client' = ANY(roles)
    `, [cpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({ message: 'Erro ao buscar cliente' });
  }
});

// ==================== DEPENDENTS ROUTES ====================

// Get dependents for a client
app.get('/api/dependents/:client_id', authenticate, async (req, res) => {
  try {
    const { client_id } = req.params;

    // Verify access - clients can only see their own dependents
    if (req.user.currentRole === 'client' && req.user.id !== parseInt(client_id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await pool.query(`
      SELECT id, name, cpf, birth_date, created_at
      FROM dependents 
      WHERE client_id = $1
      ORDER BY name
    `, [client_id]);

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

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.birth_date, d.client_id,
        u.name as client_name, u.subscription_status as client_subscription_status
      FROM dependents d
      JOIN users u ON d.client_id = u.id
      WHERE d.cpf = $1
    `, [cpf]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error looking up dependent:', error);
    res.status(500).json({ message: 'Erro ao buscar dependente' });
  }
});

// Create dependent
app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    // Verify access - clients can only create dependents for themselves
    if (req.user.currentRole === 'client' && req.user.id !== parseInt(client_id)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'ID do cliente, nome e CPF são obrigatórios' });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Check if CPF already exists
    const existingCpf = await pool.query(
      'SELECT id FROM users WHERE cpf = $1 UNION SELECT id FROM dependents WHERE cpf = $1',
      [cpf]
    );

    if (existingCpf.rows.length > 0) {
      return res.status(400).json({ message: 'CPF já cadastrado no sistema' });
    }

    // Check dependent limit (10 per client)
    const dependentCount = await pool.query(
      'SELECT COUNT(*) as count FROM dependents WHERE client_id = $1',
      [client_id]
    );

    if (parseInt(dependentCount.rows[0].count) >= 10) {
      return res.status(400).json({ message: 'Limite máximo de 10 dependentes por cliente' });
    }

    const result = await pool.query(`
      INSERT INTO dependents (client_id, name, cpf, birth_date, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, name, cpf, birth_date, created_at
    `, [client_id, name, cpf, birth_date]);

    console.log('✅ Dependent created:', result.rows[0].id);

    res.status(201).json({
      message: 'Dependente criado com sucesso',
      dependent: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating dependent:', error);
    res.status(500).json({ message: 'Erro ao criar dependente' });
  }
});

// Update dependent
app.put('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date } = req.body;

    // Verify access - clients can only update their own dependents
    if (req.user.currentRole === 'client') {
      const dependentCheck = await pool.query(
        'SELECT client_id FROM dependents WHERE id = $1',
        [id]
      );

      if (dependentCheck.rows.length === 0 || dependentCheck.rows[0].client_id !== req.user.id) {
        return res.status(403).json({ message: 'Acesso não autorizado' });
      }
    }

    const result = await pool.query(`
      UPDATE dependents 
      SET name = $1, birth_date = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, cpf, birth_date
    `, [name, birth_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    console.log('✅ Dependent updated:', result.rows[0].id);

    res.json({
      message: 'Dependente atualizado com sucesso',
      dependent: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating dependent:', error);
    res.status(500).json({ message: 'Erro ao atualizar dependente' });
  }
});

// Delete dependent
app.delete('/api/dependents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify access - clients can only delete their own dependents
    if (req.user.currentRole === 'client') {
      const dependentCheck = await pool.query(
        'SELECT client_id FROM dependents WHERE id = $1',
        [id]
      );

      if (dependentCheck.rows.length === 0 || dependentCheck.rows[0].client_id !== req.user.id) {
        return res.status(403).json({ message: 'Acesso não autorizado' });
      }
    }

    const result = await pool.query('DELETE FROM dependents WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    console.log('✅ Dependent deleted:', id);

    res.json({ message: 'Dependente excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting dependent:', error);
    res.status(500).json({ message: 'Erro ao excluir dependente' });
  }
});

// ==================== PRIVATE PATIENTS ROUTES ====================

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
    res.status(500).json({ message: 'Erro ao carregar pacientes particulares' });
  }
});

// Create private patient
app.post('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code
    } = req.body;

    if (!name || !cpf) {
      return res.status(400).json({ message: 'Nome e CPF são obrigatórios' });
    }

    // Validate CPF format
    if (!/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    // Check if CPF already exists for this professional
    const existingPatient = await pool.query(
      'SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2',
      [cpf, req.user.id]
    );

    if (existingPatient.rows.length > 0) {
      return res.status(400).json({ message: 'Paciente com este CPF já cadastrado' });
    }

    const result = await pool.query(`
      INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date, address,
        address_number, address_complement, neighborhood, city, state, zip_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING id, name, cpf, email, phone, birth_date, created_at
    `, [
      req.user.id, name, cpf, email, phone, birth_date, address,
      address_number, address_complement, neighborhood, city, state, zip_code
    ]);

    console.log('✅ Private patient created:', result.rows[0].id);

    res.status(201).json({
      message: 'Paciente particular criado com sucesso',
      patient: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating private patient:', error);
    res.status(500).json({ message: 'Erro ao criar paciente particular' });
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
          city = $9, state = $10, zip_code = $11, updated_at = NOW()
      WHERE id = $12 AND professional_id = $13
      RETURNING id, name, cpf, email, phone, birth_date
    `, [
      name, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, zip_code, id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente particular não encontrado' });
    }

    console.log('✅ Private patient updated:', result.rows[0].id);

    res.json({
      message: 'Paciente particular atualizado com sucesso',
      patient: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating private patient:', error);
    res.status(500).json({ message: 'Erro ao atualizar paciente particular' });
  }
});

// Delete private patient
app.delete('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if patient has consultations
    const consultationCheck = await pool.query(
      'SELECT id FROM consultations WHERE private_patient_id = $1 LIMIT 1',
      [id]
    );

    if (consultationCheck.rows.length > 0) {
      return res.status(400).json({ 
        message: 'Não é possível excluir este paciente pois ele possui consultas registradas' 
      });
    }

    const result = await pool.query(
      'DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente particular não encontrado' });
    }

    console.log('✅ Private patient deleted:', id);

    res.json({ message: 'Paciente particular excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting private patient:', error);
    res.status(500).json({ message: 'Erro ao excluir paciente particular' });
  }
});

// ==================== CONSULTATIONS ROUTES ====================

// Get consultations
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id, c.date, c.value, c.status, c.notes, c.created_at,
        s.name as service_name,
        u.name as professional_name,
        COALESCE(u2.name, pp.name, d.name) as client_name,
        CASE 
          WHEN d.id IS NOT NULL THEN true 
          ELSE false 
        END as is_dependent
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN users u ON c.professional_id = u.id
      LEFT JOIN users u2 ON c.client_id = u2.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
    `;

    let params = [];
    let whereConditions = [];

    // Filter based on user role
    if (req.user.currentRole === 'client') {
      whereConditions.push('(c.client_id = $1 OR d.client_id = $1)');
      params.push(req.user.id);
    } else if (req.user.currentRole === 'professional') {
      whereConditions.push('c.professional_id = $1');
      params.push(req.user.id);
    }

    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    query += ' ORDER BY c.date DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro ao carregar consultas' });
  }
});

// Create consultation
app.post('/api/consultations', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const {
      client_id, dependent_id, private_patient_id, service_id, location_id,
      value, date, status = 'completed', notes, appointment_date, appointment_time, create_appointment
    } = req.body;

    console.log('🔄 Creating consultation:', {
      client_id, dependent_id, private_patient_id, service_id, value, date, status
    });

    if (!service_id || !value || !date) {
      return res.status(400).json({ message: 'Serviço, valor e data são obrigatórios' });
    }

    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um cliente, dependente ou paciente particular' });
    }

    // Validate that only one patient type is specified
    const patientCount = [client_id, dependent_id, private_patient_id].filter(Boolean).length;
    if (patientCount !== 1) {
      return res.status(400).json({ message: 'Especifique apenas um tipo de paciente' });
    }

    // If it's a convenio consultation, verify subscription status
    if (client_id || dependent_id) {
      let subscriptionQuery;
      let subscriptionParams;

      if (dependent_id) {
        subscriptionQuery = `
          SELECT u.subscription_status 
          FROM dependents d 
          JOIN users u ON d.client_id = u.id 
          WHERE d.id = $1
        `;
        subscriptionParams = [dependent_id];
      } else {
        subscriptionQuery = 'SELECT subscription_status FROM users WHERE id = $1';
        subscriptionParams = [client_id];
      }

      const subscriptionResult = await pool.query(subscriptionQuery, subscriptionParams);

      if (subscriptionResult.rows.length === 0) {
        return res.status(404).json({ message: 'Cliente não encontrado' });
      }

      if (subscriptionResult.rows[0].subscription_status !== 'active') {
        return res.status(400).json({ message: 'Cliente não possui assinatura ativa' });
      }
    }

    // Create consultation
    const result = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, service_id,
        location_id, value, date, status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id, date, value, status, notes, created_at
    `, [
      client_id, dependent_id, private_patient_id, req.user.id, service_id,
      location_id, value, date, status, notes
    ]);

    const consultation = result.rows[0];
    console.log('✅ Consultation created:', consultation.id);

    // Create appointment if requested
    let appointment = null;
    if (create_appointment && appointment_date && appointment_time) {
      try {
        const appointmentDateTime = new Date(`${appointment_date}T${appointment_time}`);
        
        const appointmentResult = await pool.query(`
          INSERT INTO appointments (
            consultation_id, client_id, dependent_id, private_patient_id,
            professional_id, service_id, location_id, date, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING id, date, status
        `, [
          consultation.id, client_id, dependent_id, private_patient_id,
          req.user.id, service_id, location_id, appointmentDateTime, 'scheduled'
        ]);

        appointment = appointmentResult.rows[0];
        console.log('✅ Appointment created:', appointment.id);
      } catch (appointmentError) {
        console.error('❌ Error creating appointment:', appointmentError);
        // Don't fail the consultation creation if appointment fails
      }
    }

    res.status(201).json({
      message: 'Consulta registrada com sucesso',
      consultation,
      appointment
    });

  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro ao registrar consulta' });
  }
});

// Update consultation status
app.put('/api/consultations/:id/status', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status é obrigatório' });
    }

    const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Status inválido' });
    }

    const result = await pool.query(`
      UPDATE consultations 
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND professional_id = $3
      RETURNING id, status, updated_at
    `, [status, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    console.log('✅ Consultation status updated:', { id, status });

    res.json({
      message: 'Status da consulta atualizado com sucesso',
      consultation: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating consultation status:', error);
    res.status(500).json({ message: 'Erro ao atualizar status da consulta' });
  }
});

// ==================== MEDICAL RECORDS ROUTES ====================

// Get medical records for professional
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.id, mr.chief_complaint, mr.history_present_illness, mr.past_medical_history,
        mr.medications, mr.allergies, mr.physical_examination, mr.diagnosis,
        mr.treatment_plan, mr.notes, mr.vital_signs, mr.created_at, mr.updated_at,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro ao carregar prontuários médicos' });
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
      return res.status(400).json({ message: 'ID do paciente particular é obrigatório' });
    }

    // Verify patient belongs to this professional
    const patientCheck = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente particular não encontrado' });
    }

    const result = await pool.query(`
      INSERT INTO medical_records (
        professional_id, private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id, chief_complaint, diagnosis, created_at
    `, [
      req.user.id, private_patient_id, chief_complaint, history_present_illness,
      past_medical_history, medications, allergies, physical_examination,
      diagnosis, treatment_plan, notes, JSON.stringify(vital_signs)
    ]);

    console.log('✅ Medical record created:', result.rows[0].id);

    res.status(201).json({
      message: 'Prontuário médico criado com sucesso',
      record: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Erro ao criar prontuário médico' });
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

    const result = await pool.query(`
      UPDATE medical_records 
      SET chief_complaint = $1, history_present_illness = $2, past_medical_history = $3,
          medications = $4, allergies = $5, physical_examination = $6,
          diagnosis = $7, treatment_plan = $8, notes = $9, vital_signs = $10, updated_at = NOW()
      WHERE id = $11 AND professional_id = $12
      RETURNING id, chief_complaint, diagnosis, updated_at
    `, [
      chief_complaint, history_present_illness, past_medical_history,
      medications, allergies, physical_examination, diagnosis, treatment_plan, 
      notes, JSON.stringify(vital_signs), id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário médico não encontrado' });
    }

    console.log('✅ Medical record updated:', result.rows[0].id);

    res.json({
      message: 'Prontuário médico atualizado com sucesso',
      record: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating medical record:', error);
    res.status(500).json({ message: 'Erro ao atualizar prontuário médico' });
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
      return res.status(404).json({ message: 'Prontuário médico não encontrado' });
    }

    console.log('✅ Medical record deleted:', id);

    res.json({ message: 'Prontuário médico excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting medical record:', error);
    res.status(500).json({ message: 'Erro ao excluir prontuário médico' });
  }
});

// ==================== MEDICAL DOCUMENTS ROUTES ====================

// Get medical documents for professional
app.get('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        md.id, md.title, md.document_type, md.document_url, md.created_at,
        COALESCE(pp.name, d.name, u.name) as patient_name
      FROM medical_documents md
      LEFT JOIN private_patients pp ON md.private_patient_id = pp.id
      LEFT JOIN dependents d ON md.dependent_id = d.id
      LEFT JOIN users u ON md.client_id = u.id
      WHERE md.professional_id = $1
      ORDER BY md.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro ao carregar documentos médicos' });
  }
});

// Create medical document
app.post('/api/medical-documents', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, client_id, dependent_id, template_data } = req.body;

    if (!title || !document_type || !template_data) {
      return res.status(400).json({ message: 'Título, tipo de documento e dados do template são obrigatórios' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(`
      INSERT INTO medical_documents (
        professional_id, private_patient_id, client_id, dependent_id,
        title, document_type, document_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, title, document_type, document_url, created_at
    `, [
      req.user.id, private_patient_id, client_id, dependent_id,
      title, document_type, documentResult.url
    ]);

    console.log('✅ Medical document created:', result.rows[0].id);

    res.status(201).json({
      message: 'Documento médico criado com sucesso',
      title: result.rows[0].title,
      documentUrl: result.rows[0].document_url,
      document: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento médico' });
  }
});

// ==================== ATTENDANCE LOCATIONS ROUTES ====================

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
    res.status(500).json({ message: 'Erro ao carregar locais de atendimento' });
  }
});

// Create attendance location
app.post('/api/attendance-locations', authenticate, authorize(['professional']), async (req, res) => {
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id, name, address, is_default, created_at
    `, [
      req.user.id, name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default || false
    ]);

    console.log('✅ Attendance location created:', result.rows[0].id);

    res.status(201).json({
      message: 'Local de atendimento criado com sucesso',
      location: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating attendance location:', error);
    res.status(500).json({ message: 'Erro ao criar local de atendimento' });
  }
});

// Update attendance location
app.put('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default
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
          neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9,
          is_default = $10, updated_at = NOW()
      WHERE id = $11 AND professional_id = $12
      RETURNING id, name, address, is_default, updated_at
    `, [
      name, address, address_number, address_complement,
      neighborhood, city, state, zip_code, phone, is_default,
      id, req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local de atendimento não encontrado' });
    }

    console.log('✅ Attendance location updated:', result.rows[0].id);

    res.json({
      message: 'Local de atendimento atualizado com sucesso',
      location: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating attendance location:', error);
    res.status(500).json({ message: 'Erro ao atualizar local de atendimento' });
  }
});

// Delete attendance location
app.delete('/api/attendance-locations/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM attendance_locations WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local de atendimento não encontrado' });
    }

    console.log('✅ Attendance location deleted:', id);

    res.json({ message: 'Local de atendimento excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting attendance location:', error);
    res.status(500).json({ message: 'Erro ao excluir local de atendimento' });
  }
});

// ==================== IMAGE UPLOAD ROUTES ====================

// Upload professional image
app.post('/api/upload-image', authenticate, authorize(['professional']), async (req, res) => {
  try {
    console.log('🔄 Starting image upload process...');
    
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
        console.error('❌ No file received');
        return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
      }

      console.log('✅ File uploaded to Cloudinary:', req.file);

      try {
        // Update user photo URL in database
        const result = await pool.query(
          'UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING photo_url',
          [req.file.path, req.user.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        console.log('✅ User photo URL updated in database');

        res.json({
          message: 'Imagem enviada com sucesso',
          imageUrl: req.file.path,
          publicId: req.file.filename
        });

      } catch (dbError) {
        console.error('❌ Database error after upload:', dbError);
        res.status(500).json({ message: 'Erro ao salvar URL da imagem no banco de dados' });
      }
    });

  } catch (error) {
    console.error('❌ Upload route error:', error);
    res.status(500).json({ message: 'Erro interno no upload da imagem' });
  }
});

// ==================== REPORTS ROUTES ====================

// Revenue report (admin only)
app.get('/api/reports/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get revenue by professional
    const professionalRevenueResult = await pool.query(`
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
        AND c.status = 'completed'
      GROUP BY u.id, u.name, u.percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get revenue by service
    const serviceRevenueResult = await pool.query(`
      SELECT 
        s.name as service_name,
        SUM(c.value) as revenue,
        COUNT(c.id) as consultation_count
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2 AND c.status = 'completed'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Calculate total revenue
    const totalRevenueResult = await pool.query(`
      SELECT SUM(value) as total_revenue
      FROM consultations
      WHERE date >= $1 AND date <= $2 AND status = 'completed'
    `, [start_date, end_date]);

    const totalRevenue = parseFloat(totalRevenueResult.rows[0]?.total_revenue || 0);

    res.json({
      total_revenue: totalRevenue,
      revenue_by_professional: professionalRevenueResult.rows.map(row => ({
        ...row,
        revenue: parseFloat(row.revenue),
        professional_payment: parseFloat(row.professional_payment),
        clinic_revenue: parseFloat(row.clinic_revenue)
      })),
      revenue_by_service: serviceRevenueResult.rows.map(row => ({
        ...row,
        revenue: parseFloat(row.revenue)
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

    // Get professional's percentage
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;

    // Get consultations summary
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as consultation_count,
        SUM(value) as total_revenue
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $3 
        AND (client_id IS NOT NULL OR dependent_id IS NOT NULL)
        AND status = 'completed'
    `, [req.user.id, start_date, end_date]);

    const summary = summaryResult.rows[0];
    const totalRevenue = parseFloat(summary.total_revenue || 0);
    const consultationCount = parseInt(summary.consultation_count || 0);
    const amountToPay = totalRevenue * ((100 - professionalPercentage) / 100);

    // Get detailed consultations
    const consultationsResult = await pool.query(`
      SELECT 
        c.date, c.value as total_value,
        COALESCE(u.name, d.name) as client_name,
        s.name as service_name,
        (c.value * ((100 - $4) / 100.0)) as amount_to_pay
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $3 
        AND (c.client_id IS NOT NULL OR c.dependent_id IS NOT NULL)
        AND c.status = 'completed'
      ORDER BY c.date DESC
    `, [req.user.id, start_date, end_date, professionalPercentage]);

    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: totalRevenue,
        consultation_count: consultationCount,
        amount_to_pay: amountToPay
      },
      consultations: consultationsResult.rows.map(row => ({
        ...row,
        total_value: parseFloat(row.total_value),
        amount_to_pay: parseFloat(row.amount_to_pay)
      }))
    });

  } catch (error) {
    console.error('Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de receita do profissional' });
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
    const professionalResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = professionalResult.rows[0]?.percentage || 50;

    // Get convenio consultations
    const convenioResult = await pool.query(`
      SELECT 
        COUNT(*) as convenio_consultations,
        SUM(value) as convenio_revenue
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $3 
        AND (client_id IS NOT NULL OR dependent_id IS NOT NULL)
        AND status = 'completed'
    `, [req.user.id, start_date, end_date]);

    // Get private consultations
    const privateResult = await pool.query(`
      SELECT 
        COUNT(*) as private_consultations,
        SUM(value) as private_revenue
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $3 
        AND private_patient_id IS NOT NULL
        AND status = 'completed'
    `, [req.user.id, start_date, end_date]);

    const convenioData = convenioResult.rows[0];
    const privateData = privateResult.rows[0];

    const convenioConsultations = parseInt(convenioData.convenio_consultations || 0);
    const privateConsultations = parseInt(privateData.private_consultations || 0);
    const convenioRevenue = parseFloat(convenioData.convenio_revenue || 0);
    const privateRevenue = parseFloat(privateData.private_revenue || 0);
    const totalRevenue = convenioRevenue + privateRevenue;
    const amountToPay = convenioRevenue * ((100 - professionalPercentage) / 100);

    res.json({
      summary: {
        total_consultations: convenioConsultations + privateConsultations,
        convenio_consultations: convenioConsultations,
        private_consultations: privateConsultations,
        total_revenue: totalRevenue,
        convenio_revenue: convenioRevenue,
        private_revenue: privateRevenue,
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      }
    });

  } catch (error) {
    console.error('Error generating professional detailed report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório detalhado do profissional' });
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
      WHERE 'client' = ANY(roles) AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    res.json(result.rows.map(row => ({
      ...row,
      client_count: parseInt(row.client_count),
      active_clients: parseInt(row.active_clients),
      pending_clients: parseInt(row.pending_clients),
      expired_clients: parseInt(row.expired_clients)
    })));

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
      WHERE 'professional' = ANY(u.roles) AND u.city IS NOT NULL AND u.city != ''
      GROUP BY u.city, u.state
      ORDER BY total_professionals DESC, u.city
    `);

    // Process the aggregated data
    const processedData = result.rows.map(row => {
      const categoryMap = new Map();
      
      row.categories.forEach((cat: any) => {
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
        total_professionals: parseInt(row.total_professionals),
        categories: Array.from(categoryMap.entries()).map(([category_name, count]) => ({
          category_name,
          count
        }))
      };
    });

    res.json(processedData);

  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de profissionais por cidade' });
  }
});

// ==================== DATABASE INITIALIZATION ====================

// Initialize database tables
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database tables...');

    // Create users table
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
        password_hash VARCHAR(255) NOT NULL,
        roles JSONB NOT NULL DEFAULT '["client"]',
        percentage INTEGER DEFAULT 50,
        category_id INTEGER,
        subscription_status VARCHAR(20) DEFAULT 'pending',
        subscription_expiry TIMESTAMP,
        has_scheduling_access BOOLEAN DEFAULT false,
        access_expires_at TIMESTAMP,
        access_granted_by VARCHAR(255),
        access_granted_at TIMESTAMP,
        photo_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create service_categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create services table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        base_price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES service_categories(id),
        is_base_service BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create dependents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dependents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        birth_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(cpf)
      )
    `);

    // Create private_patients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_patients (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(cpf, professional_id)
      )
    `);

    // Create consultations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        professional_id INTEGER NOT NULL REFERENCES users(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        location_id INTEGER,
        value DECIMAL(10,2) NOT NULL,
        date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (
          (client_id IS NOT NULL AND dependent_id IS NULL AND private_patient_id IS NULL) OR
          (client_id IS NULL AND dependent_id IS NOT NULL AND private_patient_id IS NULL) OR
          (client_id IS NULL AND dependent_id IS NULL AND private_patient_id IS NOT NULL)
        )
      )
    `);

    // Create medical_records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id),
        private_patient_id INTEGER NOT NULL REFERENCES private_patients(id),
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

    // Create medical_documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create attendance_locations table
    await pool.query(`
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create appointments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        consultation_id INTEGER REFERENCES consultations(id),
        client_id INTEGER REFERENCES users(id),
        dependent_id INTEGER REFERENCES dependents(id),
        private_patient_id INTEGER REFERENCES private_patients(id),
        professional_id INTEGER NOT NULL REFERENCES users(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        location_id INTEGER REFERENCES attendance_locations(id),
        date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create professional_payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_payments (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL REFERENCES users(id),
        amount DECIMAL(10,2) NOT NULL,
        payment_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
      CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);
      CREATE INDEX IF NOT EXISTS idx_consultations_professional ON consultations(professional_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_client ON consultations(client_id);
      CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
      CREATE INDEX IF NOT EXISTS idx_dependents_cpf ON dependents(cpf);
      CREATE INDEX IF NOT EXISTS idx_private_patients_professional ON private_patients(professional_id);
    `);

    console.log('✅ Database tables initialized successfully');

    // Insert default admin user if not exists
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE cpf = '00000000000'"
    );

    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await pool.query(`
        INSERT INTO users (
          name, cpf, email, password_hash, roles, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        'Administrador',
        '00000000000',
        'admin@quiroferreira.com.br',
        hashedPassword,
        JSON.stringify(['admin'])
      ]);

      console.log('✅ Default admin user created');
    }

    // Insert default service categories if not exist
    const categoryCheck = await pool.query('SELECT COUNT(*) as count FROM service_categories');
    
    if (parseInt(categoryCheck.rows[0].count) === 0) {
      const defaultCategories = [
        ['Fisioterapia', 'Serviços de fisioterapia e reabilitação'],
        ['Quiropraxia', 'Tratamentos quiropráticos'],
        ['Massoterapia', 'Massagens terapêuticas e relaxantes'],
        ['Psicologia', 'Atendimento psicológico'],
        ['Nutrição', 'Consultas nutricionais'],
        ['Medicina', 'Consultas médicas gerais'],
        ['Odontologia', 'Tratamentos odontológicos']
      ];

      for (const [name, description] of defaultCategories) {
        await pool.query(
          'INSERT INTO service_categories (name, description, created_at) VALUES ($1, $2, NOW())',
          [name, description]
        );
      }

      console.log('✅ Default service categories created');
    }

    // Insert default services if not exist
    const serviceCheck = await pool.query('SELECT COUNT(*) as count FROM services');
    
    if (parseInt(serviceCheck.rows[0].count) === 0) {
      // Get category IDs
      const categoriesResult = await pool.query('SELECT id, name FROM service_categories');
      const categoryMap = new Map();
      categoriesResult.rows.forEach(cat => {
        categoryMap.set(cat.name, cat.id);
      });

      const defaultServices = [
        ['Consulta Fisioterapêutica', 'Avaliação e tratamento fisioterapêutico', 80.00, 'Fisioterapia', true],
        ['Sessão de Fisioterapia', 'Sessão de tratamento fisioterapêutico', 60.00, 'Fisioterapia', false],
        ['Consulta Quiroprática', 'Avaliação e ajuste quiroprático', 100.00, 'Quiropraxia', true],
        ['Massagem Terapêutica', 'Massagem para alívio de tensões', 70.00, 'Massoterapia', true],
        ['Consulta Psicológica', 'Atendimento psicológico individual', 120.00, 'Psicologia', true],
        ['Consulta Nutricional', 'Avaliação e orientação nutricional', 90.00, 'Nutrição', true],
        ['Consulta Médica', 'Consulta médica geral', 150.00, 'Medicina', true],
        ['Consulta Odontológica', 'Avaliação odontológica', 80.00, 'Odontologia', true]
      ];

      for (const [name, description, price, categoryName, isBase] of defaultServices) {
        const categoryId = categoryMap.get(categoryName);
        if (categoryId) {
          await pool.query(
            'INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
            [name, description, price, categoryId, isBase]
          );
        }
      }

      console.log('✅ Default services created');
    }

  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};

// ==================== ERROR HANDLING ====================

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error handler:', error);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON format' });
  }
  
  res.status(500).json({ 
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ==================== SERVER STARTUP ====================

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Base URL: ${getBaseUrl()}`);
      
      if (process.env.NODE_ENV === 'production') {
        console.log('🔒 Production mode - serving static files from dist/');
      } else {
        console.log('🔧 Development mode - CORS enabled for localhost:5173');
      }
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

// Start the server
startServer();