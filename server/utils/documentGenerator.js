import { v2 as cloudinary } from 'cloudinary';
import puppeteer from 'puppeteer';

// Document templates with improved styling for PDF generation
const templates = {
  certificate: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atestado Médico</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 8px;
        }
        .subtitle {
            font-size: 16px;
            color: #666;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 40px 0 30px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 20px;
            border-left: 5px solid #c11c22;
            margin: 30px 0;
            border-radius: 5px;
        }
        .content {
            margin: 30px 0;
            text-align: justify;
            font-size: 16px;
            line-height: 1.8;
        }
        .highlight {
            background: #fff3cd;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #ffc107;
            margin: 20px 0;
        }
        .signature {
            margin-top: 80px;
            text-align: center;
        }
        .signature-line {
            border-top: 2px solid #333;
            width: 350px;
            margin: 50px auto 15px;
        }
        .professional-info {
            font-size: 16px;
            line-height: 1.4;
        }
        .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Atestado Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    <div class="content">
        <p>Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados médicos e apresenta quadro clínico que o(a) impossibilita de exercer suas atividades habituais.</p>
        
        <div class="highlight">
            <strong>Descrição do quadro clínico:</strong><br>
            ${data.description}
        </div>
        
        ${data.cid ? `<p><strong>Classificação Internacional de Doenças (CID):</strong> ${data.cid}</p>` : ''}
        
        <p><strong>Período de afastamento recomendado:</strong> ${data.days} dia(s) a partir de ${new Date().toLocaleDateString('pt-BR')}.</p>
        
        <p>Este atestado é válido para todos os fins legais e administrativos necessários.</p>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div class="professional-info">
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
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
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 8px;
        }
        .subtitle {
            font-size: 16px;
            color: #666;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 40px 0 30px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 20px;
            border-left: 5px solid #c11c22;
            margin: 30px 0;
            border-radius: 5px;
        }
        .prescription-box {
            background: #fff;
            border: 2px solid #c11c22;
            padding: 30px;
            margin: 30px 0;
            min-height: 200px;
            border-radius: 8px;
        }
        .prescription-text {
            font-size: 16px;
            line-height: 2;
            white-space: pre-line;
            font-family: 'Courier New', monospace;
        }
        .signature {
            margin-top: 80px;
            text-align: center;
        }
        .signature-line {
            border-top: 2px solid #333;
            width: 350px;
            margin: 50px auto 15px;
        }
        .professional-info {
            font-size: 16px;
            line-height: 1.4;
        }
        .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Receituário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    <div class="prescription-box">
        <h3 style="margin-top: 0; color: #c11c22;">Prescrição Médica:</h3>
        <div class="prescription-text">${data.prescription}</div>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div class="professional-info">
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
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
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 13px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 8px;
        }
        .subtitle {
            font-size: 16px;
            color: #666;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 20px;
            border-left: 5px solid #c11c22;
            margin: 20px 0;
            border-radius: 5px;
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
            background: #fafafa;
        }
        .section h3 {
            color: #c11c22;
            margin-top: 0;
            font-size: 16px;
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
            border-top: 2px solid #333;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento Livre e Esclarecido</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
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
            <div>
                <strong>Paciente ou Responsável</strong><br>
                ${data.patientName}
            </div>
        </div>
        
        <div class="signature-box">
            <div class="signature-line"></div>
            <div>
                <strong>Profissional Responsável</strong><br>
                ${data.professionalName}<br>
                ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
            </div>
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  exam_request: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitação de Exames</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 8px;
        }
        .subtitle {
            font-size: 16px;
            color: #666;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 40px 0 30px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 20px;
            border-left: 5px solid #c11c22;
            margin: 30px 0;
            border-radius: 5px;
        }
        .exam-list {
            background: #fff;
            border: 2px solid #c11c22;
            padding: 30px;
            margin: 30px 0;
            min-height: 200px;
            border-radius: 8px;
        }
        .exam-content {
            white-space: pre-line;
            font-size: 16px;
            line-height: 2;
            font-family: 'Courier New', monospace;
        }
        .signature {
            margin-top: 80px;
            text-align: center;
        }
        .signature-line {
            border-top: 2px solid #333;
            width: 350px;
            margin: 50px auto 15px;
        }
        .professional-info {
            font-size: 16px;
            line-height: 1.4;
        }
        .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Solicitação de Exames</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    <div class="exam-list">
        <h3 style="margin-top: 0; color: #c11c22; font-size: 18px;">Exames Solicitados:</h3>
        <div class="exam-content">${data.content}</div>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div class="professional-info">
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  declaration: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Declaração Médica</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 8px;
        }
        .subtitle {
            font-size: 16px;
            color: #666;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 40px 0 30px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 20px;
            border-left: 5px solid #c11c22;
            margin: 30px 0;
            border-radius: 5px;
        }
        .content {
            margin: 30px 0;
            text-align: justify;
            font-size: 16px;
            line-height: 1.8;
            min-height: 200px;
            white-space: pre-line;
            background: #fafafa;
            padding: 25px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        .signature {
            margin-top: 80px;
            text-align: center;
        }
        .signature-line {
            border-top: 2px solid #333;
            width: 350px;
            margin: 50px auto 15px;
        }
        .professional-info {
            font-size: 16px;
            line-height: 1.4;
        }
        .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Declaração Médica</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    <div class="content">${data.content}</div>

    <div class="signature">
        <div class="signature-line"></div>
        <div class="professional-info">
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  lgpd: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termo LGPD</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 12px;
        }
        .header {
            text-align: center;
            margin-bottom: 25px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 15px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 5px;
        }
        .subtitle {
            font-size: 14px;
            color: #666;
        }
        .title {
            font-size: 18px;
            font-weight: bold;
            margin: 25px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 15px;
            border-left: 5px solid #c11c22;
            margin: 20px 0;
            border-radius: 5px;
        }
        .content {
            margin: 20px 0;
            text-align: justify;
            font-size: 13px;
        }
        .section {
            margin: 15px 0;
            padding: 12px;
            background: #fafafa;
            border-radius: 5px;
        }
        .section h4 {
            color: #c11c22;
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        .section ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .section li {
            margin: 5px 0;
        }
        .signature-area {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
        }
        .signature-box {
            text-align: center;
            width: 45%;
        }
        .signature-line {
            border-top: 2px solid #333;
            margin: 30px 0 10px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 15px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento para Tratamento de Dados Pessoais (LGPD)</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    <div class="content">
        <div class="section">
            <h4>1. FINALIDADE DO TRATAMENTO DE DADOS</h4>
            <p>Os dados pessoais coletados serão utilizados exclusivamente para:</p>
            <ul>
                <li>Prestação de serviços de saúde e acompanhamento médico;</li>
                <li>Manutenção do histórico médico e prontuário;</li>
                <li>Comunicação sobre consultas e tratamentos;</li>
                <li>Cumprimento de obrigações legais e regulamentares.</li>
            </ul>
        </div>

        <div class="section">
            <h4>2. DADOS COLETADOS</h4>
            <p>Serão tratados dados pessoais como nome, CPF, endereço, telefone, email, informações de saúde e histórico médico.</p>
        </div>

        <div class="section">
            <h4>3. COMPARTILHAMENTO</h4>
            <p>Os dados não serão compartilhados com terceiros, exceto quando necessário para a prestação do serviço médico ou por determinação legal.</p>
        </div>

        <div class="section">
            <h4>4. DIREITOS DO TITULAR</h4>
            <p>Você tem direito a acessar, corrigir, excluir ou solicitar a portabilidade de seus dados, conforme a Lei Geral de Proteção de Dados (LGPD).</p>
        </div>

        <div class="section">
            <h4>5. CONSENTIMENTO</h4>
            <p>Ao assinar este termo, declaro que:</p>
            <ul>
                <li>Fui informado(a) sobre o tratamento dos meus dados pessoais;</li>
                <li>Compreendo as finalidades do tratamento;</li>
                <li>Consinto com o tratamento dos meus dados conforme descrito;</li>
                <li>Posso revogar este consentimento a qualquer momento.</li>
            </ul>
        </div>
    </div>

    <div class="signature-area">
        <div class="signature-box">
            <div class="signature-line"></div>
            <div>
                <strong>Paciente ou Responsável</strong><br>
                ${data.patientName}
            </div>
        </div>
        
        <div class="signature-box">
            <div class="signature-line"></div>
            <div>
                <strong>Profissional Responsável</strong><br>
                ${data.professionalName}<br>
                ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
            </div>
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  other: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 8px;
        }
        .subtitle {
            font-size: 16px;
            color: #666;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin: 40px 0 30px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 20px;
            border-left: 5px solid #c11c22;
            margin: 30px 0;
            border-radius: 5px;
        }
        .content {
            margin: 30px 0;
            text-align: justify;
            font-size: 16px;
            line-height: 1.8;
            min-height: 200px;
            white-space: pre-line;
            background: #fafafa;
            padding: 25px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        .signature {
            margin-top: 80px;
            text-align: center;
        }
        .signature-line {
            border-top: 2px solid #333;
            width: 350px;
            margin: 50px auto 15px;
        }
        .professional-info {
            font-size: 16px;
            line-height: 1.4;
        }
        .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">${data.title}</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    <div class="content">${data.content}</div>

    <div class="signature">
        <div class="signature-line"></div>
        <div class="professional-info">
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`,

  medical_record: (data) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prontuário Médico</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            font-size: 13px;
        }
        .header {
            text-align: center;
            margin-bottom: 25px;
            border-bottom: 3px solid #c11c22;
            padding-bottom: 15px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 5px;
        }
        .subtitle {
            font-size: 14px;
            color: #666;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0 25px 0;
            text-align: center;
            color: #c11c22;
        }
        .patient-info {
            background: #f8f9fa;
            padding: 15px;
            border-left: 5px solid #c11c22;
            margin: 20px 0;
            border-radius: 5px;
        }
        .section {
            margin: 15px 0;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background: #fafafa;
            page-break-inside: avoid;
        }
        .section h3 {
            margin: 0 0 8px 0;
            color: #c11c22;
            font-size: 15px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        .section p {
            margin: 8px 0;
            text-align: justify;
        }
        .vital-signs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
            background: #f0f8ff;
            padding: 12px;
            border-radius: 5px;
            margin: 12px 0;
        }
        .vital-sign {
            text-align: center;
            padding: 8px;
            background: white;
            border-radius: 3px;
            border: 1px solid #e9ecef;
        }
        .vital-sign-label {
            font-size: 11px;
            color: #666;
            margin-bottom: 3px;
            font-weight: bold;
        }
        .vital-sign-value {
            font-weight: bold;
            color: #c11c22;
            font-size: 13px;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 2px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .professional-info {
            font-size: 14px;
            line-height: 1.3;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 15px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div class="subtitle">Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Prontuário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data do Atendimento:</strong> ${new Date(data.date).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
    </div>

    ${data.vital_signs && Object.values(data.vital_signs).some(v => v) ? `
    <div class="section">
        <h3>Sinais Vitais</h3>
        <div class="vital-signs">
            ${data.vital_signs.blood_pressure ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Pressão Arterial</div>
                <div class="vital-sign-value">${data.vital_signs.blood_pressure}</div>
            </div>` : ''}
            ${data.vital_signs.heart_rate ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Freq. Cardíaca</div>
                <div class="vital-sign-value">${data.vital_signs.heart_rate}</div>
            </div>` : ''}
            ${data.vital_signs.temperature ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Temperatura</div>
                <div class="vital-sign-value">${data.vital_signs.temperature}</div>
            </div>` : ''}
            ${data.vital_signs.respiratory_rate ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Freq. Respiratória</div>
                <div class="vital-sign-value">${data.vital_signs.respiratory_rate}</div>
            </div>` : ''}
            ${data.vital_signs.oxygen_saturation ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Sat. O₂</div>
                <div class="vital-sign-value">${data.vital_signs.oxygen_saturation}</div>
            </div>` : ''}
            ${data.vital_signs.weight ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Peso</div>
                <div class="vital-sign-value">${data.vital_signs.weight}</div>
            </div>` : ''}
            ${data.vital_signs.height ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Altura</div>
                <div class="vital-sign-value">${data.vital_signs.height}</div>
            </div>` : ''}
        </div>
    </div>` : ''}

    ${data.chief_complaint ? `
    <div class="section">
        <h3>Queixa Principal</h3>
        <p>${data.chief_complaint}</p>
    </div>` : ''}

    ${data.history_present_illness ? `
    <div class="section">
        <h3>História da Doença Atual</h3>
        <p>${data.history_present_illness}</p>
    </div>` : ''}

    ${data.past_medical_history ? `
    <div class="section">
        <h3>História Médica Pregressa</h3>
        <p>${data.past_medical_history}</p>
    </div>` : ''}

    ${data.medications ? `
    <div class="section">
        <h3>Medicamentos em Uso</h3>
        <p>${data.medications}</p>
    </div>` : ''}

    ${data.allergies ? `
    <div class="section">
        <h3>Alergias</h3>
        <p>${data.allergies}</p>
    </div>` : ''}

    ${data.physical_examination ? `
    <div class="section">
        <h3>Exame Físico</h3>
        <p>${data.physical_examination}</p>
    </div>` : ''}

    ${data.diagnosis ? `
    <div class="section">
        <h3>Diagnóstico</h3>
        <p>${data.diagnosis}</p>
    </div>` : ''}

    ${data.treatment_plan ? `
    <div class="section">
        <h3>Plano de Tratamento</h3>
        <p>${data.treatment_plan}</p>
    </div>` : ''}

    ${data.notes ? `
    <div class="section">
        <h3>Observações Gerais</h3>
        <p>${data.notes}</p>
    </div>` : ''}

    <div class="signature">
        <div class="signature-line"></div>
        <div class="professional-info">
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty || 'Profissional de Saúde'}<br>
            ${data.crm ? `Registro: ${data.crm}` : 'Registro Profissional'}
        </div>
    </div>

    <div class="footer">
        <p><strong>Convênio Quiro Ferreira</strong> - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199 | Email: contato@quiroferreira.com.br</p>
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`
};

// Enhanced PDF generation function
export const generateDocumentPDF = async (documentType, templateData) => {
  let browser = null;
  
  try {
    console.log('🔄 [PDF-GEN] Starting PDF generation for type:', documentType);
    console.log('🔄 [PDF-GEN] Template data keys:', Object.keys(templateData));
    
    // Get the template function
    const templateFunction = templates[documentType] || templates.other;
    
    // Generate HTML content
    const htmlContent = templateFunction(templateData);
    console.log('✅ [PDF-GEN] HTML template generated, length:', htmlContent.length);
    
    // Configure Puppeteer for WebContainer environment
    const puppeteerConfig = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--run-all-compositor-stages-before-draw',
        '--memory-pressure-off',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      timeout: 60000
    };

    console.log('🚀 [PDF-GEN] Launching Puppeteer browser...');
    browser = await puppeteer.launch(puppeteerConfig);
    
    console.log('📄 [PDF-GEN] Creating new page...');
    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 1600 });
    
    console.log('🔄 [PDF-GEN] Setting HTML content...');
    await page.setContent(htmlContent, { 
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 30000 
    });
    
    console.log('🔄 [PDF-GEN] Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '2cm',
        right: '2cm',
        bottom: '2cm',
        left: '2cm'
      },
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });
    
    console.log('✅ [PDF-GEN] PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    
    // Close browser
    await browser.close();
    browser = null;
    
    console.log('🔄 [PDF-GEN] Uploading PDF to Cloudinary...');
    
    // Upload PDF to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
      {
        folder: 'quiro-ferreira/documents',
        resource_type: 'raw',
        format: 'pdf',
        public_id: `${documentType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        use_filename: false,
        unique_filename: true,
        access_mode: 'public'
      }
    );
    
    console.log('✅ [PDF-GEN] PDF uploaded to Cloudinary:', uploadResult.secure_url);
    
    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: 'pdf'
    };
  } catch (error) {
    console.error('❌ [PDF-GEN] Error generating PDF:', error);
    
    // Ensure browser is closed even on error
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('❌ [PDF-GEN] Error closing browser:', closeError);
      }
    }
    
    throw new Error(`Erro ao gerar PDF: ${error.message}`);
  }
};

// Helper function to validate template data
export const validateTemplateData = (documentType, data) => {
  const requiredFields = {
    certificate: ['patientName', 'description', 'days', 'professionalName'],
    prescription: ['patientName', 'prescription', 'professionalName'],
    consent_form: ['patientName', 'procedure', 'description', 'risks', 'professionalName'],
    exam_request: ['patientName', 'content', 'professionalName'],
    declaration: ['patientName', 'content', 'professionalName'],
    lgpd: ['patientName', 'professionalName'],
    other: ['patientName', 'content', 'professionalName'],
    medical_record: ['patientName', 'professionalName']
  };

  const required = requiredFields[documentType] || requiredFields.other;
  const missing = required.filter(field => !data[field] || data[field].trim() === '');
  
  if (missing.length > 0) {
    throw new Error(`Campos obrigatórios faltando: ${missing.join(', ')}`);
  }
  
  return true;
};