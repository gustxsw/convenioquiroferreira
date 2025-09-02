import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../db.js';

// Document templates
const templates = {
  certificate: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atestado Médico</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .content {
            margin: 30px 0;
            text-align: justify;
            font-size: 14px;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-image {
            max-width: 200px;
            max-height: 60px;
            margin: 0 auto 10px;
            display: block;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Atestado Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        <p>Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados médicos e apresenta quadro clínico que o(a) impossibilita de exercer suas atividades habituais.</p>
        
        <p><strong>Descrição:</strong> ${data.description}</p>
        
        ${data.cid ? `<p><strong>CID:</strong> ${data.cid}</p>` : ''}
        
        <p><strong>Período de afastamento:</strong> ${data.days} dia(s) a partir de ${new Date().toLocaleDateString('pt-BR')}.</p>
        
        <p>Este atestado é válido para todos os fins legais e administrativos.</p>
    </div>

    <div class="signature">
        ${data.signatureUrl ? `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : '<div class="signature-line"></div>'}
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  prescription: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receituário Médico</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .prescription-content {
            background: #fff;
            border: 2px solid #c11c22;
            padding: 20px;
            margin: 20px 0;
            min-height: 200px;
        }
        .prescription-text {
            font-size: 16px;
            line-height: 2;
            white-space: pre-line;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-image {
            max-width: 200px;
            max-height: 60px;
            margin: 0 auto 10px;
            display: block;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Receituário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="prescription-content">
        <div class="prescription-text">${data.prescription}</div>
    </div>

    <div class="signature">
        ${data.signatureUrl ? `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : '<div class="signature-line"></div>'}
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  consent_form: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termo de Consentimento</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 18px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .content {
            margin: 20px 0;
            text-align: justify;
            font-size: 14px;
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .signature-area {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
        }
        .signature-box {
            text-align: center;
            width: 45%;
        }
        .signature-line {
            border-top: 1px solid #333;
            margin: 40px 0 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento Livre e Esclarecido</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        <strong>CPF:</strong> ${data.patientCpf}<br>
        <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        <div class="section">
            <h3>Procedimento a ser realizado:</h3>
            <p><strong>${data.procedure}</strong></p>
            <p>${data.description}</p>
        </div>

        <div class="section">
            <h3>Riscos e Benefícios:</h3>
            <p>${data.risks}</p>
        </div>

        <div class="section">
            <h3>Declaração de Consentimento:</h3>
            <p>Declaro que fui devidamente informado(a) sobre o procedimento acima descrito, seus riscos, benefícios e alternativas. Todas as minhas dúvidas foram esclarecidas e consinto com a realização do procedimento.</p>
            
            <p>Estou ciente de que nenhum procedimento médico é 100% isento de riscos e que complicações podem ocorrer, mesmo com todos os cuidados técnicos adequados.</p>
            
            <p>Autorizo o profissional de saúde a realizar o procedimento proposto e declaro que este consentimento é dado de forma livre e esclarecida.</p>
        </div>
    </div>

    <div class="signature-area">
        <div class="signature-box">
            <div class="signature-line"></div>
            <p><strong>Paciente ou Responsável</strong><br>
            ${data.patientName}<br>
            CPF: ${data.patientCpf}</p>
        </div>
        
        <div class="signature-box">
            ${data.signatureUrl ? `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : '<div class="signature-line"></div>'}
            <p><strong>Profissional de Saúde</strong><br>
            ${data.professionalName}<br>
            ${data.crm ? `CRM: ${data.crm}` : ''}</p>
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`
};

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export const generateDocument = async (req, res) => {
  try {
    const { type, data } = req.body;
    const professionalId = req.user.id;

    // Validate document type
    if (!templates[type]) {
      return res.status(400).json({ error: 'Tipo de documento inválido' });
    }

    // Get professional data including signature
    const professionalQuery = `
      SELECT p.*, ps.signature_url 
      FROM professionals p 
      LEFT JOIN professional_signatures ps ON p.id = ps.professional_id 
      WHERE p.id = $1
    `;
    const professionalResult = await pool.query(professionalQuery, [professionalId]);
    
    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profissional não encontrado' });
    }

    const professional = professionalResult.rows[0];

    // Prepare document data
    const documentData = {
      ...data,
      professionalName: professional.name,
      professionalSpecialty: professional.specialty,
      crm: professional.crm,
      signatureUrl: professional.signature_url
    };

    // Generate HTML content
    const htmlContent = templates[type](documentData);

    // Save document to database
    const insertQuery = `
      INSERT INTO documents (professional_id, type, patient_name, patient_cpf, content, data)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `;
    
    const result = await pool.query(insertQuery, [
      professionalId,
      type,
      data.patientName,
      data.patientCpf,
      htmlContent,
      JSON.stringify(documentData)
    ]);

    const document = result.rows[0];

    res.json({
      id: document.id,
      html: htmlContent,
      createdAt: document.created_at
    });

  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getDocuments = async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { page = 1, limit = 10, type, search } = req.query;
    
    let query = `
      SELECT id, type, patient_name, patient_cpf, created_at
      FROM documents 
      WHERE professional_id = $1
    `;
    
    const params = [professionalId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (search) {
      paramCount++;
      query += ` AND (patient_name ILIKE $${paramCount} OR patient_cpf ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM documents WHERE professional_id = $1`;
    const countParams = [professionalId];
    let countParamCount = 1;

    if (type) {
      countParamCount++;
      countQuery += ` AND type = $${countParamCount}`;
      countParams.push(type);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (patient_name ILIKE $${countParamCount} OR patient_cpf ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      documents: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    const query = `
      SELECT * FROM documents 
      WHERE id = $1 AND professional_id = $2
    `;
    
    const result = await pool.query(query, [id, professionalId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user.id;

    const query = `
      DELETE FROM documents 
      WHERE id = $1 AND professional_id = $2
      RETURNING id
    `;
    
    const result = await pool.query(query, [id, professionalId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    res.json({ message: 'Documento excluído com sucesso' });

  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};