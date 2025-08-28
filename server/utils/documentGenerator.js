  
  const startTime = Date.now();
  
  console.log('DEBUG Template data keys:', Object.keys(templateData || {}));
  console.log('DEBUG Document type:', documentType);
  console.log('DEBUG Starting document generation pipeline');
/**
 * Main document generation function with complete validation pipeline
 */
export const generateDocumentPDF = async (documentType, templateData) => {
  const startTime = Date.now();
  
  console.log('DEBUG Template data keys:', Object.keys(templateData || {}));
  console.log('DEBUG Document type:', documentType);
  console.log('DEBUG Starting document generation pipeline');
  
  try {
    // Step 1: Validate input parameters
    console.log('DEBUG Step 1: Validating input parameters');
    if (!documentType || !TEMPLATE_FUNCTIONS[documentType]) {
      throw new Error(`Unsupported document type: ${documentType}. Supported types: ${Object.keys(TEMPLATE_FUNCTIONS).join(', ')}`);
    }
    
    if (!templateData || typeof templateData !== 'object') {
      throw new Error('Template data is required and must be an object');
    }
    
    console.log('SUCCESS Document parameters validated');
    
    // Step 2: Generate HTML content
    console.log('DEBUG Step 2: Generating HTML content');
    const templateFunction = TEMPLATE_FUNCTIONS[documentType];
    if (typeof templateFunction !== 'function') {
      throw new Error(`Template function for ${documentType} is not a function`);
    }
    
    const htmlContent = templateFunction(templateData);
    
    // Step 3: Validate generated HTML
    console.log('DEBUG Step 3: Validating generated HTML');
    if (!htmlContent || typeof htmlContent !== 'string') {
      throw new Error('Template function returned empty or invalid HTML content');
    }
    
    const validation = validateHTMLContent(htmlContent, documentType);
    const validationReport = generateValidationReport(validation);
    
    console.log('DEBUG HTML validation report:', validationReport);
    
    if (!validation.isValid) {
      const errorDetails = {
        documentType,
        errors: validation.errors,
        warnings: validation.warnings,
        htmlLength: htmlContent.length,
        htmlPreview: htmlContent.substring(0, 200)
      };
      
      console.error('ERROR HTML validation failed:', JSON.stringify(errorDetails, null, 2));
      throw new Error(`Generated HTML is invalid: ${validation.errors.join(', ')}`);
    }
    
    console.log('SUCCESS HTML content generated and validated');
    console.log('DEBUG HTML content length:', htmlContent.length);
    
    // Step 4: Upload HTML as backup
    console.log('DEBUG Step 4: Uploading HTML backup');
    const fileName = (templateData.title || `${documentType}_document`)
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase();
    
    const htmlUploadResult = await uploadHTMLToCloudinary(htmlContent, fileName);
    
    // Step 5: Generate PDF
    console.log('DEBUG Step 5: Generating PDF from validated HTML');
    let pdfResult = null;
    
    try {
      pdfResult = await generatePDFFromHTML(htmlContent, fileName);
      console.log('SUCCESS PDF generated successfully');
    } catch (pdfError) {
      console.error('ERROR PDF generation failed, but HTML is available:', pdfError.message);
      
      // Return HTML-only result if PDF fails
      return {
        success: true,
        htmlUrl: htmlUploadResult.secure_url,
        htmlPublicId: htmlUploadResult.public_id,
        pdfUrl: null,
        pdfPublicId: null,
        error: `PDF generation failed: ${pdfError.message}`,
        fallbackMode: true,
        validation: validationReport,
        processingTime: Date.now() - startTime
      };
    }
    
    // Step 6: Return complete result
    const result = {
      success: true,
      htmlUrl: htmlUploadResult.secure_url,
      htmlPublicId: htmlUploadResult.public_id,
      pdfUrl: pdfResult.url,
      pdfPublicId: pdfResult.public_id,
      validation: validationReport,
      processingTime: Date.now() - startTime
    };
    
    console.log('SUCCESS Document generation pipeline completed');
    console.log('DEBUG Processing time:', result.processingTime, 'ms');
    
    return result;
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error('ERROR Document generation pipeline failed:', error.message);
    console.error('ERROR Processing time before failure:', processingTime, 'ms');
    
    // Create detailed error report
    const errorReport = {
      success: false,
      error: error.message,
      documentType,
      templateDataKeys: Object.keys(templateData || {}),
      processingTime,
      timestamp: new Date().toISOString()
    };
    
    console.error('ERROR Detailed error report:', JSON.stringify(errorReport, null, 2));
    
    throw new Error(`Document generation failed: ${error.message}`);
  }
};

/**
 * Uploads HTML content to Cloudinary as backup
 */
const uploadHTMLToCloudinary = async (htmlContent, fileName) => {
  try {
    const uploadResult = await cloudinary.uploader.upload(`data:text/html;base64,${Buffer.from(htmlContent).toString('base64')}`, {
      resource_type: 'raw',
      folder: 'quiro-ferreira/documents/html',
      public_id: `${fileName}_${Date.now()}`,
      use_filename: false,
      unique_filename: true
    });
    
    console.log('SUCCESS HTML uploaded to Cloudinary:', uploadResult.secure_url);
    return uploadResult;
  } catch (error) {
    console.error('ERROR HTML upload to Cloudinary failed:', error.message);
    throw new Error(`HTML upload failed: ${error.message}`);
  }
};

/**
 * Validates document generation parameters
 */
const validateDocumentParameters = (documentType, templateData) => {
  const requiredFields = getRequiredFieldsForDocumentType(documentType);
  const missingFields = [];
  
  for (const field of requiredFields) {
    const value = getNestedValue(templateData, field);
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(field);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
};

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current && current[key], obj);
};

const getRequiredFieldsForDocumentType = (documentType) => {
  const commonFields = ['patientName', 'date'];
  
  switch (documentType) {
    case 'medical_record':
      return [...commonFields]; // Medical records can be created with minimal data
    case 'prescription':
      return [...commonFields, 'prescription'];
    case 'exam_request':
      return [...commonFields, 'examType'];
    default:
      return commonFields;
  }
};

/**
 * Generate medical record document specifically
 */
export const generateMedicalRecordDocument = async (recordData) => {
  console.log('DEBUG Starting medical record document generation');
  console.log('DEBUG Record data received:', JSON.stringify(recordData, null, 2));
  
  try {
    // Prepare template data specifically for medical records
    const templateData = {
      title: 'Prontuário Médico',
      patientName: recordData.patientName || 'Nome não informado',
      patientCpf: recordData.patientCpf || '',
      date: recordData.date || new Date().toISOString(),
  
      // Medical record specific fields
      chief_complaint: recordData.chief_complaint || '',
      history_present_illness: recordData.history_present_illness || '',
      past_medical_history: recordData.past_medical_history || '',
      medications: recordData.medications || '',
      allergies: recordData.allergies || '',
      physical_examination: recordData.physical_examination || '',
      diagnosis: recordData.diagnosis || '',
      treatment_plan: recordData.treatment_plan || '',
      notes: recordData.notes || '',
      vital_signs: recordData.vital_signs || {},
      
      // Professional information
      professionalName: recordData.professionalName || 'Profissional de Saúde',
      professionalSpecialty: recordData.professionalSpecialty || '',
      crm: recordData.crm || ''
    };
    
    console.log('DEBUG Template data prepared for medical record');
    
    const result = await generateDocumentPDF('medical_record', templateData);
    
    console.log('SUCCESS Medical record document generated');
    return result;
    
  } catch (error) {
    console.error('ERROR Medical record document generation failed:', error.message);
    throw new Error(`Medical record generation failed: ${error.message}`);
  }
};

/**
 * Document type to template function mapping
 */
const TEMPLATE_FUNCTIONS = {
  certificate: generateCertificateHTML,
  prescription: generatePrescriptionHTML,
  consent_form: generateConsentFormHTML,
  exam_request: generateExamRequestHTML,
  declaration: generateDeclarationHTML,
  lgpd: generateLGPDHTML,
  medical_record: generateMedicalRecordHTML
};