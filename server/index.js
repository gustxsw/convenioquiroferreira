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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use(express.static('dist'));

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
      return res.status(400).json({ message: 'User ID e role são obrigatórios' });
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
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
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
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        roles: userRoles,
        currentRole: role
      }
    });
  } catch (error) {
    console.error('Role switch error:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Register
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

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        subscription_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING id, name, cpf, roles`,
      [
        name, cleanCpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, hashedPassword,
        JSON.stringify(['client']), 'pending'
      ]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        roles: user.roles
      }
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

// ==================== USER ROUTES ====================

// Get all users (admin only)
app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.roles,
        u.subscription_status, u.subscription_expiry,
        u.created_at, u.updated_at, u.photo_url,
        u.category_name, u.percentage, u.crm
      FROM users u
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Erro ao buscar usuários' });
  }
});

// Get user by ID
app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.cpf, u.email, u.phone, u.birth_date,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.roles,
        u.subscription_status, u.subscription_expiry,
        u.created_at, u.updated_at, u.photo_url,
        u.category_name, u.percentage, u.crm
      FROM users u
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
    res.status(500).json({ message: 'Erro ao buscar status da assinatura' });
  }
});

// Create user (admin only)
app.post('/api/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const {
      name, cpf, email, phone, birth_date, address, address_number,
      address_complement, neighborhood, city, state, roles, password,
      subscription_status, subscription_expiry, category_name, percentage, crm
    } = req.body;

    if (!name || !roles || roles.length === 0) {
      return res.status(400).json({ message: 'Nome e pelo menos uma role são obrigatórios' });
    }

    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;

    if (cleanCpf) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE cpf = $1',
        [cleanCpf]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ message: 'CPF já cadastrado' });
      }
    }

    let hashedPassword;
    let temporaryPassword = null;

    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    } else {
      temporaryPassword = Math.random().toString(36).slice(-8);
      hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    }

    const result = await pool.query(
      `INSERT INTO users (
        name, cpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, password, roles,
        subscription_status, subscription_expiry, category_name, percentage, crm,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING id, name, cpf, roles`,
      [
        name, cleanCpf, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, hashedPassword,
        JSON.stringify(roles), subscription_status, subscription_expiry,
        category_name, percentage, crm
      ]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: {
        ...user,
        temporaryPassword
      }
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
      subscription_status, subscription_expiry, category_name, percentage, crm,
      currentPassword, newPassword
    } = req.body;

    // Check if user can edit this profile
    if (req.user.id !== parseInt(id) && !req.user.roles?.includes('admin')) {
      return res.status(403).json({ message: 'Não autorizado a editar este perfil' });
    }

    let updateFields = [];
    let updateValues = [];
    let paramCount = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCount}`);
      updateValues.push(name);
      paramCount++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramCount}`);
      updateValues.push(email);
      paramCount++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCount}`);
      updateValues.push(phone);
      paramCount++;
    }

    if (birth_date !== undefined) {
      updateFields.push(`birth_date = $${paramCount}`);
      updateValues.push(birth_date);
      paramCount++;
    }

    if (address !== undefined) {
      updateFields.push(`address = $${paramCount}`);
      updateValues.push(address);
      paramCount++;
    }

    if (address_number !== undefined) {
      updateFields.push(`address_number = $${paramCount}`);
      updateValues.push(address_number);
      paramCount++;
    }

    if (address_complement !== undefined) {
      updateFields.push(`address_complement = $${paramCount}`);
      updateValues.push(address_complement);
      paramCount++;
    }

    if (neighborhood !== undefined) {
      updateFields.push(`neighborhood = $${paramCount}`);
      updateValues.push(neighborhood);
      paramCount++;
    }

    if (city !== undefined) {
      updateFields.push(`city = $${paramCount}`);
      updateValues.push(city);
      paramCount++;
    }

    if (state !== undefined) {
      updateFields.push(`state = $${paramCount}`);
      updateValues.push(state);
      paramCount++;
    }

    if (roles !== undefined && req.user.roles?.includes('admin')) {
      updateFields.push(`roles = $${paramCount}`);
      updateValues.push(JSON.stringify(roles));
      paramCount++;
    }

    if (subscription_status !== undefined && req.user.roles?.includes('admin')) {
      updateFields.push(`subscription_status = $${paramCount}`);
      updateValues.push(subscription_status);
      paramCount++;
    }

    if (subscription_expiry !== undefined && req.user.roles?.includes('admin')) {
      updateFields.push(`subscription_expiry = $${paramCount}`);
      updateValues.push(subscription_expiry);
      paramCount++;
    }

    if (category_name !== undefined && req.user.roles?.includes('admin')) {
      updateFields.push(`category_name = $${paramCount}`);
      updateValues.push(category_name);
      paramCount++;
    }

    if (percentage !== undefined && req.user.roles?.includes('admin')) {
      updateFields.push(`percentage = $${paramCount}`);
      updateValues.push(percentage);
      paramCount++;
    }

    if (crm !== undefined && req.user.roles?.includes('admin')) {
      updateFields.push(`crm = $${paramCount}`);
      updateValues.push(crm);
      paramCount++;
    }

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Senha atual é obrigatória para alterar a senha' });
      }

      const userResult = await pool.query(
        'SELECT password FROM users WHERE id = $1',
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);

      if (!isValidPassword) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push(`password = $${paramCount}`);
      updateValues.push(hashedNewPassword);
      paramCount++;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, cpf, email, phone, roles
    `;

    const result = await pool.query(query, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

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

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Erro ao excluir usuário' });
  }
});

// ==================== CONSULTATIONS ROUTES ====================

// Get all consultations/appointments
app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.id,
        c.date,
        c.value,
        c.status,
        c.payment_reference,
        c.created_at,
        s.name as service_name,
        COALESCE(
          CASE 
            WHEN c.user_id IS NOT NULL THEN u.name
            WHEN c.dependent_id IS NOT NULL THEN d.name
            WHEN c.private_patient_id IS NOT NULL THEN pp.name
          END
        ) as patient_name,
        COALESCE(
          CASE 
            WHEN c.user_id IS NOT NULL THEN u.phone
            WHEN c.dependent_id IS NOT NULL THEN cu.phone
            WHEN c.private_patient_id IS NOT NULL THEN pp.phone
          END
        ) as patient_phone,
        prof.name as professional_name,
        al.name as location_name,
        al.address as location_address
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN users cu ON d.user_id = cu.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN users prof ON c.professional_id = prof.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
    `;

    const params = [];
    let paramCount = 1;

    if (req.user.currentRole === 'professional') {
      query += ` WHERE c.professional_id = $${paramCount}`;
      params.push(req.user.id);
      paramCount++;
    } else if (req.user.currentRole === 'client') {
      query += ` WHERE (c.user_id = $${paramCount} OR c.dependent_id IN (
        SELECT id FROM dependents WHERE user_id = $${paramCount}
      ))`;
      params.push(req.user.id);
      paramCount++;
    }

    query += ' ORDER BY c.date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro ao buscar consultas' });
  }
});

// Get consultations for specific client
app.get('/api/consultations/client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await pool.query(`
      SELECT 
        c.id,
        c.date,
        c.value,
        c.status,
        s.name as service_name,
        prof.name as professional_name,
        COALESCE(
          CASE 
            WHEN c.user_id IS NOT NULL THEN u.name
            WHEN c.dependent_id IS NOT NULL THEN d.name
          END
        ) as client_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN users prof ON c.professional_id = prof.id
      WHERE (c.user_id = $1 OR c.dependent_id IN (
        SELECT id FROM dependents WHERE user_id = $1
      )) AND c.status = 'completed'
      ORDER BY c.date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro ao buscar consultas do cliente' });
  }
});

// Create consultation/appointment
app.post('/api/consultations', authenticate, async (req, res) => {
  try {
    const {
      user_id, dependent_id, private_patient_id, professional_id,
      service_id, location_id, value, date, status = 'scheduled'
    } = req.body;

    if (!professional_id || !service_id || !value || !date) {
      return res.status(400).json({ message: 'Dados obrigatórios não fornecidos' });
    }

    if (!user_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ message: 'É necessário especificar um paciente' });
    }

    const consultationDate = new Date(date);

    const result = await pool.query(
      `INSERT INTO consultations (
        user_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, date, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *`,
      [
        user_id, dependent_id, private_patient_id, professional_id,
        service_id, location_id, value, consultationDate, status
      ]
    );

    res.status(201).json({
      message: 'Consulta registrada com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating consultation:', error);
    res.status(500).json({ message: 'Erro ao registrar consulta' });
  }
});

// Update consultation status
app.put('/api/consultations/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status é obrigatório' });
    }

    const result = await pool.query(
      'UPDATE consultations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    res.json({
      message: 'Status atualizado com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating consultation status:', error);
    res.status(500).json({ message: 'Erro ao atualizar status da consulta' });
  }
});

// Reschedule consultation
app.put('/api/consultations/:id/reschedule', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'Nova data é obrigatória' });
    }

    const newDate = new Date(date);

    const result = await pool.query(
      'UPDATE consultations SET date = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newDate, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    res.json({
      message: 'Consulta reagendada com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('Error rescheduling consultation:', error);
    res.status(500).json({ message: 'Erro ao reagendar consulta' });
  }
});

// Get recurring consultations
app.get('/api/consultations/recurring', authenticate, async (req, res) => {
  try {
    // Placeholder for recurring consultations
    res.json([]);
  } catch (error) {
    console.error('Error fetching recurring consultations:', error);
    res.status(500).json({ message: 'Erro ao buscar consultas recorrentes' });
  }
});

// ==================== SERVICES ROUTES ====================

// Get all services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id, s.name, s.description, s.base_price, s.category_id, s.is_base_service,
        sc.name as category_name
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

// Create service (admin only)
app.post('/api/services', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description, base_price, category_id, is_base_service } = req.body;

    if (!name || !description || !base_price) {
      return res.status(400).json({ message: 'Nome, descrição e preço são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO services (name, description, base_price, category_id, is_base_service, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [name, description, base_price, category_id, is_base_service || false]
    );

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

    const result = await pool.query(
      `UPDATE services 
       SET name = $1, description = $2, base_price = $3, category_id = $4, 
           is_base_service = $5, updated_at = NOW()
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
    res.status(500).json({ message: 'Erro ao atualizar serviço' });
  }
});

// Delete service (admin only)
app.delete('/api/services/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM services WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Erro ao excluir serviço' });
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
    res.status(500).json({ message: 'Erro ao buscar categorias de serviços' });
  }
});

// Create service category (admin only)
app.post('/api/service-categories', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({ message: 'Nome e descrição são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO service_categories (name, description, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING *`,
      [name, description]
    );

    res.status(201).json({
      message: 'Categoria criada com sucesso',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating service category:', error);
    res.status(500).json({ message: 'Erro ao criar categoria' });
  }
});

// ==================== PRIVATE PATIENTS ROUTES ====================

// Get private patients for professional
app.get('/api/private-patients', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement,
        neighborhood, city, state, zip_code, created_at
      FROM private_patients
      WHERE professional_id = $1
      ORDER BY name
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching private patients:', error);
    res.status(500).json({ message: 'Erro ao buscar pacientes particulares' });
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

    if (cleanCpf) {
      const existingPatient = await pool.query(
        'SELECT id FROM private_patients WHERE cpf = $1 AND professional_id = $2',
        [cleanCpf, req.user.id]
      );

      if (existingPatient.rows.length > 0) {
        return res.status(409).json({ message: 'Paciente com este CPF já cadastrado' });
      }
    }

    const result = await pool.query(
      `INSERT INTO private_patients (
        professional_id, name, cpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *`,
      [
        req.user.id, name, cleanCpf, email, phone, birth_date,
        address, address_number, address_complement, neighborhood,
        city, state, zip_code
      ]
    );

    res.status(201).json({
      message: 'Paciente criado com sucesso',
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating private patient:', error);
    res.status(500).json({ message: 'Erro ao criar paciente' });
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
       SET name = $1, email = $2, phone = $3, birth_date = $4,
           address = $5, address_number = $6, address_complement = $7,
           neighborhood = $8, city = $9, state = $10, zip_code = $11,
           updated_at = NOW()
       WHERE id = $12 AND professional_id = $13
       RETURNING *`,
      [
        name, email, phone, birth_date, address, address_number,
        address_complement, neighborhood, city, state, zip_code, id, req.user.id
      ]
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
    res.status(500).json({ message: 'Erro ao atualizar paciente' });
  }
});

// Delete private patient
app.delete('/api/private-patients/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM private_patients WHERE id = $1 AND professional_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    res.json({ message: 'Paciente excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting private patient:', error);
    res.status(500).json({ message: 'Erro ao excluir paciente' });
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
    res.status(500).json({ message: 'Erro ao buscar locais de atendimento' });
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

    const result = await pool.query(
      `INSERT INTO attendance_locations (
        professional_id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        req.user.id, name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default || false
      ]
    );

    res.status(201).json({
      message: 'Local criado com sucesso',
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

    const result = await pool.query(
      `UPDATE attendance_locations 
       SET name = $1, address = $2, address_number = $3, address_complement = $4,
           neighborhood = $5, city = $6, state = $7, zip_code = $8, phone = $9,
           is_default = $10, updated_at = NOW()
       WHERE id = $11 AND professional_id = $12
       RETURNING *`,
      [
        name, address, address_number, address_complement,
        neighborhood, city, state, zip_code, phone, is_default,
        id, req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    res.json({
      message: 'Local atualizado com sucesso',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating attendance location:', error);
    res.status(500).json({ message: 'Erro ao atualizar local' });
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
      return res.status(404).json({ message: 'Local não encontrado' });
    }

    res.json({ message: 'Local excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting attendance location:', error);
    res.status(500).json({ message: 'Erro ao excluir local' });
  }
});

// ==================== DEPENDENTS ROUTES ====================

// Get dependents for client
app.get('/api/dependents/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await pool.query(`
      SELECT 
        id, name, cpf, birth_date, subscription_status, subscription_expiry,
        billing_amount, payment_reference, activated_at, created_at,
        subscription_status as current_status
      FROM dependents
      WHERE user_id = $1
      ORDER BY name
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    res.status(500).json({ message: 'Erro ao buscar dependentes' });
  }
});

// Lookup dependent by CPF
app.get('/api/dependents/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.subscription_status as dependent_subscription_status,
        d.user_id as client_id, u.name as client_name
      FROM dependents d
      JOIN users u ON d.user_id = u.id
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

// Create dependent
app.post('/api/dependents', authenticate, async (req, res) => {
  try {
    const { client_id, name, cpf, birth_date } = req.body;

    if (!client_id || !name || !cpf) {
      return res.status(400).json({ message: 'Client ID, nome e CPF são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    if (!/^\d{11}$/.test(cleanCpf)) {
      return res.status(400).json({ message: 'CPF deve conter 11 dígitos numéricos' });
    }

    const existingDependent = await pool.query(
      'SELECT id FROM dependents WHERE cpf = $1',
      [cleanCpf]
    );

    if (existingDependent.rows.length > 0) {
      return res.status(409).json({ message: 'CPF já cadastrado como dependente' });
    }

    const result = await pool.query(
      `INSERT INTO dependents (
        user_id, name, cpf, birth_date, subscription_status, billing_amount, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', 50, NOW(), NOW())
      RETURNING *`,
      [client_id, name, cleanCpf, birth_date]
    );

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

    const result = await pool.query(
      `UPDATE dependents 
       SET name = $1, birth_date = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name, birth_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

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

    const result = await pool.query(
      'DELETE FROM dependents WHERE id = $1 RETURNING id',
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

// Create dependent payment
app.post('/api/dependents/:id/create-payment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const dependentResult = await pool.query(
      'SELECT * FROM dependents WHERE id = $1',
      [id]
    );

    if (dependentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dependente não encontrado' });
    }

    const dependent = dependentResult.rows[0];

    const preference = {
      items: [{
        title: `Ativação de Dependente - ${dependent.name}`,
        quantity: 1,
        unit_price: dependent.billing_amount || 50
      }],
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success&type=dependent`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure&type=dependent`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending&type=dependent`
      },
      auto_return: 'approved',
      payment_reference: `DEP_${dependent.id}_${Date.now()}`
    };

    // Update dependent with payment reference
    await pool.query(
      'UPDATE dependents SET payment_reference = $1 WHERE id = $2',
      [preference.payment_reference, id]
    );

    res.json({
      init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${preference.payment_reference}`,
      preference_id: preference.payment_reference
    });
  } catch (error) {
    console.error('Error creating dependent payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento do dependente' });
  }
});

// ==================== CLIENT LOOKUP ROUTES ====================

// Lookup client by CPF
app.get('/api/clients/lookup', authenticate, async (req, res) => {
  try {
    const { cpf } = req.query;

    if (!cpf) {
      return res.status(400).json({ message: 'CPF é obrigatório' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT 
        id, name, cpf, subscription_status, subscription_expiry
      FROM users
      WHERE cpf = $1 AND roles::jsonb ? 'client'
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

// ==================== PROFESSIONALS ROUTES ====================

// Get all professionals (for clients)
app.get('/api/professionals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.roles,
        u.address, u.address_number, u.address_complement,
        u.neighborhood, u.city, u.state, u.category_name, u.photo_url
      FROM users u
      WHERE u.roles::jsonb ? 'professional'
      ORDER BY u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals:', error);
    res.status(500).json({ message: 'Erro ao buscar profissionais' });
  }
});

// ==================== PAYMENT ROUTES ====================

// Create subscription payment
app.post('/api/create-subscription', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    const preference = {
      items: [{
        title: `Assinatura Convênio Quiro Ferreira - ${user.name}`,
        quantity: 1,
        unit_price: 250
      }],
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/client?payment=success`,
        failure: `${req.protocol}://${req.get('host')}/client?payment=failure`,
        pending: `${req.protocol}://${req.get('host')}/client?payment=pending`
      },
      auto_return: 'approved',
      payment_reference: `SUB_${user_id}_${Date.now()}`
    };

    res.json({
      init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${preference.payment_reference}`,
      preference_id: preference.payment_reference
    });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento da assinatura' });
  }
});

// Create professional payment
app.post('/api/professional/create-payment', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valor inválido' });
    }

    const preference = {
      items: [{
        title: `Repasse ao Convênio - ${req.user.name}`,
        quantity: 1,
        unit_price: amount
      }],
      back_urls: {
        success: `${req.protocol}://${req.get('host')}/professional?payment=success`,
        failure: `${req.protocol}://${req.get('host')}/professional?payment=failure`,
        pending: `${req.protocol}://${req.get('host')}/professional?payment=pending`
      },
      auto_return: 'approved',
      payment_reference: `PROF_${req.user.id}_${Date.now()}`
    };

    res.json({
      init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${preference.payment_reference}`,
      preference_id: preference.payment_reference
    });
  } catch (error) {
    console.error('Error creating professional payment:', error);
    res.status(500).json({ message: 'Erro ao criar pagamento do profissional' });
  }
});

// ==================== REPORTS ROUTES ====================

// Revenue report (admin only)
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
      WHERE date >= $1 AND date <= $2 AND status = 'completed'
    `, [start_date, end_date]);

    // Revenue by professional
    const professionalResult = await pool.query(`
      SELECT 
        u.name as professional_name,
        u.percentage as professional_percentage,
        COALESCE(SUM(c.value), 0) as revenue,
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value * (u.percentage / 100.0)), 0) as professional_payment,
        COALESCE(SUM(c.value * ((100 - u.percentage) / 100.0)), 0) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2 AND c.status = 'completed'
      GROUP BY u.id, u.name, u.percentage
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
      WHERE c.date >= $1 AND c.date <= $2 AND c.status = 'completed'
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

// Professional revenue report
app.get('/api/reports/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional percentage
    const userResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = userResult.rows[0]?.percentage || 50;

    // Get consultations summary
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as consultation_count,
        COALESCE(SUM(value), 0) as total_revenue,
        COALESCE(SUM(value * ((100 - $3) / 100.0)), 0) as amount_to_pay
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $4 AND status = 'completed'
    `, [req.user.id, start_date, professionalPercentage, end_date]);

    // Get detailed consultations
    const consultationsResult = await pool.query(`
      SELECT 
        c.date,
        COALESCE(
          CASE 
            WHEN c.user_id IS NOT NULL THEN u.name
            WHEN c.dependent_id IS NOT NULL THEN d.name
            WHEN c.private_patient_id IS NOT NULL THEN pp.name
          END
        ) as client_name,
        s.name as service_name,
        c.value as total_value,
        c.value * ((100 - $3) / 100.0) as amount_to_pay
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.professional_id = $1 AND c.date >= $2 AND c.date <= $4 AND c.status = 'completed'
      ORDER BY c.date DESC
    `, [req.user.id, start_date, professionalPercentage, end_date]);

    res.json({
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: summaryResult.rows[0].total_revenue,
        consultation_count: summaryResult.rows[0].consultation_count,
        amount_to_pay: summaryResult.rows[0].amount_to_pay
      },
      consultations: consultationsResult.rows
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
      return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
    }

    // Get professional percentage
    const userResult = await pool.query(
      'SELECT percentage FROM users WHERE id = $1',
      [req.user.id]
    );

    const professionalPercentage = userResult.rows[0]?.percentage || 50;

    // Total consultations
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total_consultations
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $3 AND status = 'completed'
    `, [req.user.id, start_date, end_date]);

    // Convenio consultations (user_id or dependent_id)
    const convenioResult = await pool.query(`
      SELECT 
        COUNT(*) as convenio_consultations,
        COALESCE(SUM(value), 0) as convenio_revenue
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $3 
        AND status = 'completed' AND (user_id IS NOT NULL OR dependent_id IS NOT NULL)
    `, [req.user.id, start_date, end_date]);

    // Private consultations
    const privateResult = await pool.query(`
      SELECT 
        COUNT(*) as private_consultations,
        COALESCE(SUM(value), 0) as private_revenue
      FROM consultations
      WHERE professional_id = $1 AND date >= $2 AND date <= $3 
        AND status = 'completed' AND private_patient_id IS NOT NULL
    `, [req.user.id, start_date, end_date]);

    const totalRevenue = Number(convenioResult.rows[0].convenio_revenue) + Number(privateResult.rows[0].private_revenue);
    const amountToPay = Number(convenioResult.rows[0].convenio_revenue) * ((100 - professionalPercentage) / 100);

    res.json({
      summary: {
        total_consultations: Number(totalResult.rows[0].total_consultations),
        convenio_consultations: Number(convenioResult.rows[0].convenio_consultations),
        private_consultations: Number(privateResult.rows[0].private_consultations),
        total_revenue: totalRevenue,
        convenio_revenue: Number(convenioResult.rows[0].convenio_revenue),
        private_revenue: Number(privateResult.rows[0].private_revenue),
        professional_percentage: professionalPercentage,
        amount_to_pay: amountToPay
      }
    });
  } catch (error) {
    console.error('Error generating detailed professional report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório detalhado' });
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
      WHERE roles::jsonb ? 'client' AND city IS NOT NULL AND city != ''
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
        city,
        state,
        COUNT(*) as total_professionals,
        json_agg(
          json_build_object(
            'category_name', COALESCE(category_name, 'Sem categoria'),
            'count', 1
          )
        ) as categories
      FROM users
      WHERE roles::jsonb ? 'professional' AND city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY total_professionals DESC, city
    `);

    // Process categories to group by category_name
    const processedResult = result.rows.map(row => {
      const categoryMap = new Map();
      
      row.categories.forEach(cat => {
        const categoryName = cat.category_name;
        if (categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, categoryMap.get(categoryName) + cat.count);
        } else {
          categoryMap.set(categoryName, cat.count);
        }
      });

      return {
        ...row,
        categories: Array.from(categoryMap.entries()).map(([category_name, count]) => ({
          category_name,
          count
        }))
      };
    });

    res.json(processedResult);
  } catch (error) {
    console.error('Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de profissionais por cidade' });
  }
});

// ==================== MEDICAL RECORDS ROUTES ====================

// Get medical records for professional
app.get('/api/medical-records', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mr.id, mr.chief_complaint, mr.history_present_illness,
        mr.past_medical_history, mr.medications, mr.allergies,
        mr.physical_examination, mr.diagnosis, mr.treatment_plan,
        mr.notes, mr.vital_signs, mr.created_at, mr.updated_at,
        pp.name as patient_name
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE pp.professional_id = $1
      ORDER BY mr.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical records:', error);
    res.status(500).json({ message: 'Erro ao buscar prontuários' });
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
      return res.status(400).json({ message: 'ID do paciente é obrigatório' });
    }

    // Verify patient belongs to this professional
    const patientCheck = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    const result = await pool.query(
      `INSERT INTO medical_records (
        private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, vital_signs, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        private_patient_id, chief_complaint, history_present_illness,
        past_medical_history, medications, allergies, physical_examination,
        diagnosis, treatment_plan, notes, JSON.stringify(vital_signs)
      ]
    );

    res.status(201).json({
      message: 'Prontuário criado com sucesso',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Erro ao criar prontuário' });
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

    // Verify record belongs to this professional's patient
    const recordCheck = await pool.query(`
      SELECT mr.id 
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.id = $1 AND pp.professional_id = $2
    `, [id, req.user.id]);

    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    const result = await pool.query(
      `UPDATE medical_records 
       SET chief_complaint = $1, history_present_illness = $2,
           past_medical_history = $3, medications = $4, allergies = $5,
           physical_examination = $6, diagnosis = $7, treatment_plan = $8,
           notes = $9, vital_signs = $10, updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        chief_complaint, history_present_illness, past_medical_history,
        medications, allergies, physical_examination, diagnosis,
        treatment_plan, notes, JSON.stringify(vital_signs), id
      ]
    );

    res.json({
      message: 'Prontuário atualizado com sucesso',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating medical record:', error);
    res.status(500).json({ message: 'Erro ao atualizar prontuário' });
  }
});

// Delete medical record
app.delete('/api/medical-records/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify record belongs to this professional's patient
    const recordCheck = await pool.query(`
      SELECT mr.id 
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.id = $1 AND pp.professional_id = $2
    `, [id, req.user.id]);

    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    await pool.query('DELETE FROM medical_records WHERE id = $1', [id]);

    res.json({ message: 'Prontuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting medical record:', error);
    res.status(500).json({ message: 'Erro ao excluir prontuário' });
  }
});

// Generate medical record document
app.post('/api/medical-records/generate-document', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { record_id, template_data } = req.body;

    if (!record_id || !template_data) {
      return res.status(400).json({ message: 'ID do prontuário e dados do template são obrigatórios' });
    }

    // Verify record belongs to this professional
    const recordCheck = await pool.query(`
      SELECT mr.id 
      FROM medical_records mr
      JOIN private_patients pp ON mr.private_patient_id = pp.id
      WHERE mr.id = $1 AND pp.professional_id = $2
    `, [record_id, req.user.id]);

    if (recordCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Prontuário não encontrado' });
    }

    const documentResult = await generateDocumentPDF('medical_record', template_data);

    res.json({
      message: 'Documento gerado com sucesso',
      documentUrl: documentResult.url
    });
  } catch (error) {
    console.error('Error generating medical record document:', error);
    res.status(500).json({ message: 'Erro ao gerar documento do prontuário' });
  }
});

// ==================== MEDICAL DOCUMENTS ROUTES ====================

// Get medical documents for professional
app.get('/api/documents/medical', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        md.id, md.title, md.document_type, md.document_url, md.created_at,
        pp.name as patient_name, pp.cpf as patient_cpf
      FROM medical_documents md
      JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE pp.professional_id = $1
      ORDER BY md.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medical documents:', error);
    res.status(500).json({ message: 'Erro ao buscar documentos médicos' });
  }
});

// Create medical document
app.post('/api/documents/medical', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { title, document_type, private_patient_id, template_data } = req.body;

    if (!title || !document_type || !private_patient_id || !template_data) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }

    // Verify patient belongs to this professional
    const patientCheck = await pool.query(
      'SELECT id FROM private_patients WHERE id = $1 AND professional_id = $2',
      [private_patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    // Generate document
    const documentResult = await generateDocumentPDF(document_type, template_data);

    // Save document record
    const result = await pool.query(
      `INSERT INTO medical_documents (
        private_patient_id, title, document_type, document_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *`,
      [private_patient_id, title, document_type, documentResult.url]
    );

    res.status(201).json({
      message: 'Documento criado com sucesso',
      title: title,
      documentUrl: documentResult.url,
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating medical document:', error);
    res.status(500).json({ message: 'Erro ao criar documento médico' });
  }
});

// Delete medical document
app.delete('/api/documents/medical/:id', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify document belongs to this professional
    const documentCheck = await pool.query(`
      SELECT md.id 
      FROM medical_documents md
      JOIN private_patients pp ON md.private_patient_id = pp.id
      WHERE md.id = $1 AND pp.professional_id = $2
    `, [id, req.user.id]);

    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Documento não encontrado' });
    }

    await pool.query('DELETE FROM medical_documents WHERE id = $1', [id]);

    res.json({ message: 'Documento excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting medical document:', error);
    res.status(500).json({ message: 'Erro ao excluir documento' });
  }
});

// ==================== SCHEDULING ACCESS ROUTES ====================

// Get professionals with scheduling access (admin only)
app.get('/api/admin/professionals-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.category_name,
        u.has_scheduling_access, u.access_expires_at,
        u.access_granted_by, u.access_granted_at, u.access_reason
      FROM users u
      WHERE u.roles::jsonb ? 'professional'
      ORDER BY u.has_scheduling_access DESC, u.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professionals scheduling access:', error);
    res.status(500).json({ message: 'Erro ao buscar acesso à agenda dos profissionais' });
  }
});

// Grant scheduling access (admin only)
app.post('/api/admin/grant-scheduling-access', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { professional_id, expires_at, reason } = req.body;

    if (!professional_id || !expires_at) {
      return res.status(400).json({ message: 'ID do profissional e data de expiração são obrigatórios' });
    }

    const result = await pool.query(
      `UPDATE users 
       SET has_scheduling_access = true, access_expires_at = $1,
           access_granted_by = $2, access_granted_at = NOW(), access_reason = $3,
           updated_at = NOW()
       WHERE id = $4 AND roles::jsonb ? 'professional'
       RETURNING id, name, has_scheduling_access`,
      [expires_at, req.user.name, reason, professional_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

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

    const result = await pool.query(
      `UPDATE users 
       SET has_scheduling_access = false, access_expires_at = NULL,
           access_granted_by = NULL, access_granted_at = NULL, access_reason = NULL,
           updated_at = NOW()
       WHERE id = $1 AND roles::jsonb ? 'professional'
       RETURNING id, name, has_scheduling_access`,
      [professional_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    res.json({
      message: 'Acesso à agenda revogado com sucesso',
      professional: result.rows[0]
    });
  } catch (error) {
    console.error('Error revoking scheduling access:', error);
    res.status(500).json({ message: 'Erro ao revogar acesso à agenda' });
  }
});

// ==================== UPLOAD ROUTES ====================

// Upload image
app.post('/api/upload-image', authenticate, async (req, res) => {
  try {
    const upload = createUpload();
    
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ message: err.message || 'Erro no upload da imagem' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Nenhuma imagem foi enviada' });
      }

      // Update user photo URL
      await pool.query(
        'UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2',
        [req.file.path, req.user.id]
      );

      res.json({
        message: 'Imagem enviada com sucesso',
        imageUrl: req.file.path
      });
    });
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ==================== ADMIN DEPENDENTS ROUTE ====================

// Get all dependents (admin only)
app.get('/api/admin/dependents', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.id, d.name, d.cpf, d.birth_date, d.subscription_status,
        d.subscription_expiry, d.billing_amount, d.created_at,
        u.name as client_name
      FROM dependents d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all dependents:', error);
    res.status(500).json({ message: 'Erro ao buscar dependentes' });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});