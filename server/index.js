import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import serviceRoutes from "./routes/services.js";
import consultationRoutes from "./routes/consultations.js";
import dependentRoutes from "./routes/dependents.js";
import reportRoutes from "./routes/reports.js";
import paymentRoutes from "./routes/payments.js";
import professionalRoutes from "./routes/professional.js";
import adminRoutes from "./routes/admin.js";
import privatePatientRoutes from "./routes/privatePatients.js";
import medicalRecordRoutes from "./routes/medicalRecords.js";
import documentRoutes from "./routes/documents.js";
import attendanceLocationRoutes from "./routes/attendanceLocations.js";
import uploadRoutes from "./routes/upload.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://www.cartaoquiroferreira.com.br",
    "https://cartaoquiroferreira.com.br",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// 🔥 VERIFICAÇÃO E CRIAÇÃO DA COLUNA USER_ID (SEM AFETAR DADOS EXISTENTES)
const ensureRequiredColumns = async () => {
  try {
    console.log('🔍 Verificando estrutura do banco de dados...');
    
    // Lista de colunas que podem estar faltando
    const columnsToCheck = [
      {
        table: 'users',
        column: 'user_id',
        sql: 'ALTER TABLE users ADD COLUMN user_id INTEGER'
      },
      {
        table: 'users',
        column: 'roles',
        sql: 'ALTER TABLE users ADD COLUMN roles TEXT[] DEFAULT ARRAY[\'client\']'
      },
      {
        table: 'users',
        column: 'photo_url',
        sql: 'ALTER TABLE users ADD COLUMN photo_url TEXT'
      },
      {
        table: 'users',
        column: 'professional_percentage',
        sql: 'ALTER TABLE users ADD COLUMN professional_percentage DECIMAL(5,2) DEFAULT 50.00'
      },
      {
        table: 'users',
        column: 'category_id',
        sql: 'ALTER TABLE users ADD COLUMN category_id INTEGER'
      },
      {
        table: 'users',
        column: 'crm',
        sql: 'ALTER TABLE users ADD COLUMN crm VARCHAR(20)'
      }
    ];

    for (const { table, column, sql } of columnsToCheck) {
      try {
        // Verificar se a coluna existe
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        `, [table, column]);

        if (columnCheck.rows.length === 0) {
          console.log(`➕ Adicionando coluna ${column} na tabela ${table}...`);
          await pool.query(sql);
          console.log(`✅ Coluna ${column} adicionada com sucesso`);
        } else {
          console.log(`✅ Coluna ${column} já existe na tabela ${table}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao verificar/criar coluna ${column}:`, error.message);
        // Continuar mesmo se uma coluna falhar
      }
    }

    // Migrar dados da coluna 'role' para 'roles' se necessário
    try {
      const roleColumnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
      `);

      if (roleColumnCheck.rows.length > 0) {
        console.log('🔄 Migrando dados da coluna role para roles...');
        
        // Verificar se há usuários com role mas sem roles
        const usersToMigrate = await pool.query(`
          SELECT id, role 
          FROM users 
          WHERE role IS NOT NULL AND (roles IS NULL OR array_length(roles, 1) IS NULL)
        `);

        if (usersToMigrate.rows.length > 0) {
          for (const user of usersToMigrate.rows) {
            await pool.query(`
              UPDATE users 
              SET roles = ARRAY[$1] 
              WHERE id = $2
            `, [user.role, user.id]);
          }
          console.log(`✅ ${usersToMigrate.rows.length} usuários migrados`);
        }
      }
    } catch (error) {
      console.error('⚠️ Erro na migração role -> roles:', error.message);
    }

    console.log('✅ Verificação de colunas concluída');
  } catch (error) {
    console.error('❌ Erro geral na verificação do banco:', error);
    // Não interromper a aplicação, apenas logar o erro
  }
};

// Database initialization
const initializeDatabase = async () => {
  try {
    console.log("🔄 Inicializando conexão com o banco de dados...");
    
    // Test database connection
    const client = await pool.connect();
    console.log("✅ Conexão com o banco estabelecida");
    client.release();

    // Verificar e criar colunas necessárias
    await ensureRequiredColumns();
    
    console.log("✅ Banco de dados inicializado com sucesso");
  } catch (error) {
    console.error("❌ Falha na inicialização do banco:", error);
    // Em produção, você pode querer que a aplicação continue mesmo com erro no banco
    // throw error; // Descomente se quiser que pare a aplicação
  }
};

// Initialize database before starting server
await initializeDatabase();

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/service-categories", serviceRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/dependents", dependentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api", paymentRoutes);
app.use("/api/professional", professionalRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/clients", userRoutes);
app.use("/api/professionals", userRoutes);
app.use("/api/private-patients", privatePatientRoutes);
app.use("/api/medical-records", medicalRecordRoutes);
app.use("/api/medical-documents", documentRoutes);
app.use("/api/attendance-locations", attendanceLocationRoutes);
app.use("/api", uploadRoutes);

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));

  // Handle React Router (return `index.html` for all non-API routes)
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(500).json({ 
    message: "Erro interno do servidor",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler for API routes
app.use("/api/*", (req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});