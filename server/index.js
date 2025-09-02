import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../db.js';
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";

// Configure signature upload storage
const signatureStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "quiro-ferreira/signatures",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [
      {
        width: 400,
        height: 120,
        crop: "fit",
        quality: "auto:good",
        background: "transparent",
      },
    ],
  },
});

const signatureUpload = multer({
  storage: signatureStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for signatures
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos de imagem são permitidos"), false);
    }
  },
});

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
            <p><strong>Assinatura do Paciente</strong><br>
            ${data.patientName}<br>
            CPF: ${data.patientCpf}</p>
        </div>
        
        <div class="signature-box">
            ${data.signatureUrl ? `<img src="${data.signatureUrl}" alt="Assinatura" style="max-width: 200px; max-height: 60px; margin: 0 auto 10px; display: block;" />` : '<div class="signature-line"></div>'}
            <p><strong>Assinatura do Profissional</strong><br>
            ${data.professionalName}<br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
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

// Generate document HTML
export const generateDocument = (type, data) => {
  const template = templates[type];
  if (!template) {
    throw new Error(`Template not found for type: ${type}`);
  }
  return template(data);
};

// Save document to database
export const saveDocument = async (documentData) => {
  const {
    type,
    patient_id,
    professional_id,
    content,
    metadata
  } = documentData;

  const result = await pool.query(
    `INSERT INTO documents (type, patient_id, professional_id, content, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [type, patient_id, professional_id, content, JSON.stringify(metadata)]
  );

  return result.rows[0];
};

// Get documents by patient
export const getDocumentsByPatient = async (patientId) => {
  const result = await pool.query(
    `SELECT d.*, u.name as professional_name, p.name as patient_name
     FROM documents d
     JOIN users u ON d.professional_id = u.id
     JOIN patients p ON d.patient_id = p.id
     WHERE d.patient_id = $1
     ORDER BY d.created_at DESC`,
    [patientId]
  );

  return result.rows;
};

// Get documents by professional
export const getDocumentsByProfessional = async (professionalId) => {
  const result = await pool.query(
    `SELECT d.*, u.name as professional_name, p.name as patient_name
     FROM documents d
     JOIN users u ON d.professional_id = u.id
     JOIN patients p ON d.patient_id = p.id
     WHERE d.professional_id = $1
     ORDER BY d.created_at DESC`,
    [professionalId]
  );

  return result.rows;
};

// Get document by ID
export const getDocumentById = async (documentId) => {
  const result = await pool.query(
    `SELECT d.*, u.name as professional_name, p.name as patient_name
     FROM documents d
     JOIN users u ON d.professional_id = u.id
     JOIN patients p ON d.patient_id = p.id
     WHERE d.id = $1`,
    [documentId]
  );

  return result.rows[0];
};

// Professional signature routes
export const uploadSignature = async (req, res) => {
  try {
    const professionalId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log('🔄 [SIGNATURE] Upload request for professional:', professionalId, 'by user:', userId);

    // Verify that the user is updating their own signature or is admin
    if (userId !== professionalId && !req.user.roles?.includes('admin')) {
      return res.status(403).json({ message: 'Não autorizado a alterar esta assinatura' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo de assinatura foi enviado' });
    }

    console.log('✅ [SIGNATURE] File uploaded to Cloudinary:', req.file.path);

    // Update user's signature URL in database
    const result = await pool.query(
      'UPDATE users SET signature_url = $1 WHERE id = $2 RETURNING signature_url',
      [req.file.path, professionalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    console.log('✅ [SIGNATURE] Signature URL saved to database');

    res.json({
      message: 'Assinatura digital salva com sucesso',
      signature_url: result.rows[0].signature_url
    });
  } catch (error) {
    console.error('❌ [SIGNATURE] Error uploading signature:', error);
    res.status(500).json({ message: 'Erro ao fazer upload da assinatura' });
  }
};

export const getSignature = async (req, res) => {
  try {
    const professionalId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log('🔄 [SIGNATURE] Get signature request for professional:', professionalId, 'by user:', userId);

    // Verify that the user is accessing their own signature or is admin
    if (userId !== professionalId && !req.user.roles?.includes('admin')) {
      return res.status(403).json({ message: 'Não autorizado a acessar esta assinatura' });
    }

    const result = await pool.query(
      'SELECT signature_url FROM users WHERE id = $1',
      [professionalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const signatureUrl = result.rows[0].signature_url;
    console.log('✅ [SIGNATURE] Signature URL retrieved:', signatureUrl ? 'Found' : 'Not found');

    res.json({
      signature_url: signatureUrl
    });
  } catch (error) {
    console.error('❌ [SIGNATURE] Error getting signature:', error);
    res.status(500).json({ message: 'Erro ao carregar assinatura' });
  }
};

export const deleteSignature = async (req, res) => {
  try {
    const professionalId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log('🔄 [SIGNATURE] Delete signature request for professional:', professionalId, 'by user:', userId);

    // Verify that the user is deleting their own signature or is admin
    if (userId !== professionalId && !req.user.roles?.includes('admin')) {
      return res.status(403).json({ message: 'Não autorizado a remover esta assinatura' });
    }

    // Get current signature URL before deleting
    const currentResult = await pool.query(
      'SELECT signature_url FROM users WHERE id = $1',
      [professionalId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profissional não encontrado' });
    }

    const currentSignatureUrl = currentResult.rows[0].signature_url;

    // Remove signature URL from database
    await pool.query(
      'UPDATE users SET signature_url = NULL WHERE id = $1',
      [professionalId]
    );

    console.log('✅ [SIGNATURE] Signature URL removed from database');

    // Try to delete from Cloudinary (optional, don't fail if it doesn't work)
    if (currentSignatureUrl) {
      try {
        const publicId = currentSignatureUrl.split('/').pop()?.split('.')[0];
        if (publicId) {
          await cloudinary.uploader.destroy(`quiro-ferreira/signatures/${publicId}`);
          console.log('✅ [SIGNATURE] Signature deleted from Cloudinary');
        }
      } catch (cloudinaryError) {
        console.warn('⚠️ [SIGNATURE] Could not delete from Cloudinary:', cloudinaryError);
      }
    }

    res.json({ message: 'Assinatura removida com sucesso' });
  } catch (error) {
    console.error('❌ [SIGNATURE] Error deleting signature:', error);
    res.status(500).json({ message: 'Erro ao remover assinatura' });
  }
};

export { signatureUpload };