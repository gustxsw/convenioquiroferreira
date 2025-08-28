import { v2 as cloudinary } from 'cloudinary';

// Simplified and robust document templates
const templates = {
  certificate: (data) => {
    console.log('DEBUG Creating certificate template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const description = data.description || 'Atestado médico';
    const days = data.days || '1';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const professionalSpecialty = data.professionalSpecialty || '';
    const crm = data.crm || '';
    const cid = data.cid || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atestado Médico</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
        .signature-line {
            border-top: 1px solid black;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Atestado Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data de Emissão:</strong> ${currentDate}
    </div>

    <div class="content">
        <p>Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados médicos e apresenta quadro clínico que o(a) impossibilita de exercer suas atividades habituais.</p>
        
        <p><strong>Descrição:</strong> ${description}</p>
        
        ${cid ? `<p><strong>CID:</strong> ${cid}</p>` : ''}
        
        <p><strong>Período de afastamento:</strong> ${days} dia(s) a partir de ${currentDate}.</p>
        
        <p>Este atestado é válido para todos os fins legais e administrativos.</p>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${professionalName}</strong><br>
            ${professionalSpecialty}<br>
            ${crm ? `CRM: ${crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Certificate HTML generated, length:', html.length);
    return html;
  },

  prescription: (data) => {
    console.log('DEBUG Creating prescription template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const prescription = data.prescription || 'Prescrição não informada';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const professionalSpecialty = data.professionalSpecialty || '';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receituário Médico</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
            background: white;
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
        .signature-line {
            border-top: 1px solid black;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Receituário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data de Emissão:</strong> ${currentDate}
    </div>

    <div class="prescription-content">
        <div class="prescription-text">${prescription}</div>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${professionalName}</strong><br>
            ${professionalSpecialty}<br>
            ${crm ? `CRM: ${crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Prescription HTML generated, length:', html.length);
    return html;
  },

  consent_form: (data) => {
    console.log('DEBUG Creating consent form template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const procedure = data.procedure || 'Procedimento não informado';
    const description = data.description || 'Descrição não informada';
    const risks = data.risks || 'Riscos não informados';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termo de Consentimento</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
            border-top: 1px solid black;
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
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento Livre e Esclarecido</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data:</strong> ${currentDate}
    </div>

    <div class="content">
        <div class="section">
            <h3>Procedimento a ser realizado:</h3>
            <p><strong>${procedure}</strong></p>
            <p>${description}</p>
        </div>

        <div class="section">
            <h3>Riscos e Benefícios:</h3>
            <p>${risks}</p>
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
                ${patientName}
            </div>
        </div>
        
        <div class="signature-box">
            <div class="signature-line"></div>
            <div>
                <strong>Profissional Responsável</strong><br>
                ${professionalName}<br>
                ${crm ? `CRM: ${crm}` : ''}
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Certificate HTML template completed, length:', html.length);
    return html;
  },

  exam_request: (data) => {
    console.log('DEBUG Creating exam request template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const content = data.content || 'Exames não especificados';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const professionalSpecialty = data.professionalSpecialty || '';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitação de Exames</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
        .exam-list {
            background: white;
            border: 2px solid #c11c22;
            padding: 20px;
            margin: 20px 0;
            min-height: 150px;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid black;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Solicitação de Exames</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data de Emissão:</strong> ${currentDate}
    </div>

    <div class="exam-list">
        <h3>Exames Solicitados:</h3>
        <div style="white-space: pre-line; font-size: 16px; line-height: 2;">
${content}
        </div>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${professionalName}</strong><br>
            ${professionalSpecialty}<br>
            ${crm ? `CRM: ${crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Exam request HTML generated, length:', html.length);
    return html;
  },

  declaration: (data) => {
    console.log('DEBUG Creating declaration template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const content = data.content || 'Conteúdo da declaração não informado';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const professionalSpecialty = data.professionalSpecialty || '';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Declaração Médica</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
        .content {
            margin: 30px 0;
            text-align: justify;
            min-height: 200px;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid black;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Declaração Médica</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data de Emissão:</strong> ${currentDate}
    </div>

    <div class="content">
        <p>${content}</p>
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${professionalName}</strong><br>
            ${professionalSpecialty}<br>
            ${crm ? `CRM: ${crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Declaration HTML generated, length:', html.length);
    return html;
  },

  lgpd: (data) => {
    console.log('DEBUG Creating LGPD template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termo LGPD</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 12px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
        }
        .section {
            margin: 15px 0;
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
            border-top: 1px solid black;
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
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento para Tratamento de Dados Pessoais (LGPD)</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data:</strong> ${currentDate}
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
                ${patientName}
            </div>
        </div>
        
        <div class="signature-box">
            <div class="signature-line"></div>
            <div>
                <strong>Profissional Responsável</strong><br>
                ${professionalName}<br>
                ${crm ? `CRM: ${crm}` : ''}
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Exam request HTML generated, length:', html.length);
    return html;
  },

  other: (data) => {
    console.log('DEBUG Creating other document template with data:', JSON.stringify(data, null, 2));
    
    const title = data.title || 'Documento Médico';
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || 'CPF não informado';
    const content = data.content || 'Conteúdo não informado';
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const professionalSpecialty = data.professionalSpecialty || '';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
            margin: 30px 0;
            text-align: justify;
            min-height: 200px;
            white-space: pre-line;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid black;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">${title}</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        <strong>CPF:</strong> ${patientCpf}<br>
        <strong>Data de Emissão:</strong> ${currentDate}
    </div>

    <div class="content">
        ${content}
    </div>

    <div class="signature">
        <div class="signature-line"></div>
        <div>
            <strong>${professionalName}</strong><br>
            ${professionalSpecialty}<br>
            ${crm ? `CRM: ${crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Other document HTML generated, length:', html.length);
    return html;
  },

  medical_record: (data) => {
    console.log('DEBUG Creating medical record template with data:', JSON.stringify(data, null, 2));
    
    const patientName = data.patientName || 'Nome não informado';
    const patientCpf = data.patientCpf || '';
    const date = data.date || new Date().toISOString();
    const professionalName = data.professionalName || 'Profissional de Saúde';
    const professionalSpecialty = data.professionalSpecialty || '';
    const crm = data.crm || '';
    const currentDate = new Date().toLocaleDateString('pt-BR');
    const attendanceDate = new Date(date).toLocaleDateString('pt-BR');
    
    // Safely access vital signs
    const vitalSigns = data.vital_signs || {};
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prontuário Médico</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: black;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
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
        .section {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .section h3 {
            margin: 0 0 10px 0;
            color: #c11c22;
            font-size: 16px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        .vital-signs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .vital-sign {
            text-align: center;
            padding: 10px;
            background: white;
            border-radius: 3px;
            border: 1px solid #e9ecef;
        }
        .vital-sign-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }
        .vital-sign-value {
            font-weight: bold;
            color: #c11c22;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid black;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Prontuário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${patientName}<br>
        ${patientCpf ? `<strong>CPF:</strong> ${patientCpf}<br>` : ''}
        <strong>Data do Atendimento:</strong> ${attendanceDate}<br>
        <strong>Data de Emissão:</strong> ${currentDate}
    </div>

    ${Object.values(vitalSigns).some(v => v) ? `
    <div class="section">
        <h3>Sinais Vitais</h3>
        <div class="vital-signs">
            ${vitalSigns.blood_pressure ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Pressão Arterial</div>
                <div class="vital-sign-value">${vitalSigns.blood_pressure}</div>
            </div>` : ''}
            ${vitalSigns.heart_rate ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Freq. Cardíaca</div>
                <div class="vital-sign-value">${vitalSigns.heart_rate}</div>
            </div>` : ''}
            ${vitalSigns.temperature ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Temperatura</div>
                <div class="vital-sign-value">${vitalSigns.temperature}</div>
            </div>` : ''}
            ${vitalSigns.respiratory_rate ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Freq. Respiratória</div>
                <div class="vital-sign-value">${vitalSigns.respiratory_rate}</div>
            </div>` : ''}
            ${vitalSigns.oxygen_saturation ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Sat. O₂</div>
                <div class="vital-sign-value">${vitalSigns.oxygen_saturation}</div>
            </div>` : ''}
            ${vitalSigns.weight ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Peso</div>
                <div class="vital-sign-value">${vitalSigns.weight}</div>
            </div>` : ''}
            ${vitalSigns.height ? `
            <div class="vital-sign">
                <div class="vital-sign-label">Altura</div>
                <div class="vital-sign-value">${vitalSigns.height}</div>
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
        <div>
            <strong>${professionalName}</strong><br>
            ${professionalSpecialty}<br>
            ${crm ? `CRM: ${crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    console.log('SUCCESS Medical record HTML generated, length:', html.length);
    return html;
  }
};

// Main function to generate documents
export const generateDocumentPDF = async (documentType, templateData) => {
  try {
    console.log('DEBUG Starting document generation process...');
    console.log('DEBUG Document type:', documentType);
    console.log('DEBUG Template data received:', JSON.stringify(templateData, null, 2));
    
    // Validate inputs
    if (!documentType) {
      throw new Error('Document type is required');
    }
    
    if (!templateData || typeof templateData !== 'object') {
      throw new Error('Template data is required and must be an object');
    }
    
    // Get the template function
    const templateFunction = templates[documentType] || templates.other;
    console.log('DEBUG Template function found:', typeof templateFunction);
    console.log('DEBUG Available templates:', Object.keys(templates));
    
    if (typeof templateFunction !== 'function') {
      throw new Error(`Template function not found for type: ${documentType}`);
    }
    
    // Generate HTML content
    console.log('DEBUG Calling template function...');
    const htmlContent = templateFunction(templateData);
    
    console.log('DEBUG HTML generation completed');
    console.log('DEBUG HTML content type:', typeof htmlContent);
    console.log('DEBUG HTML content length:', htmlContent ? htmlContent.length : 0);
    
    // Validate HTML content
    if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
      console.error('ERROR HTML content validation failed');
      console.error('ERROR HTML content:', htmlContent);
      throw new Error('Generated HTML content is empty or invalid');
    }
    
    // Additional HTML validation
    if (!htmlContent.includes('<html') || !htmlContent.includes('</html>')) {
      console.error('ERROR HTML structure validation failed');
      console.error('ERROR Missing HTML tags in content');
      throw new Error('Generated HTML content is not valid HTML structure');
    }
    
    console.log('SUCCESS HTML content validation passed');
    console.log('DEBUG HTML preview (first 500 chars):', htmlContent.substring(0, 500));
    
    // Upload HTML to Cloudinary as raw file
    console.log('DEBUG Starting Cloudinary upload for HTML...');
    const uploadResult = await cloudinary.uploader.upload(
      `data:text/html;base64,${Buffer.from(htmlContent).toString('base64')}`,
      {
        folder: 'quiro-ferreira/documents',
        resource_type: 'raw',
        format: 'html',
        public_id: `document_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        use_filename: false,
        unique_filename: true
      }
    );
    
    console.log('SUCCESS HTML uploaded to Cloudinary:', uploadResult.secure_url);
    
    // Generate PDF version
    let pdfResult = null;
    try {
      console.log('DEBUG Starting PDF generation...');
      const { generatePDFFromHTML } = await import('./pdfGenerator.js');
      
      const cleanFileName = templateData.title
        ? templateData.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')
        : `document_${documentType}`;
      
      pdfResult = await generatePDFFromHTML(htmlContent, cleanFileName);
      console.log('SUCCESS PDF generated and uploaded:', pdfResult.url);
    } catch (pdfError) {
      console.error('WARNING PDF generation failed, continuing with HTML only:', pdfError.message);
      // Don't throw error - continue with HTML only
    }
    
    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      pdfUrl: pdfResult?.url || null,
      pdfPublicId: pdfResult?.public_id || null
    };
  } catch (error) {
    console.error('ERROR Error generating document:', error.message);
    console.error('ERROR Stack trace:', error.stack);
    throw new Error(`Erro ao gerar documento: ${error.message}`);
  }
};