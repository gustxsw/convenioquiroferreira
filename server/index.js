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
import { MercadoPago } from "mercadopago";

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
app.use(express.static('dist'));

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
              // Record professional payment
              await pool.query(
                'INSERT INTO professional_payments (professional_id, amount, payment_id, status, paid_at) VALUES ($1, $2, $3, $4, $5)',
                [professionalId, payment.transaction_amount, paymentId, 'paid', new Date()]
              );
              
              console.log('✅ Professional payment recorded for:', professionalId);
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

export default router;