import htmlPdf from 'html-pdf-node';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateHTMLContent, generateValidationReport } from './htmlValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced PDF generation options for reliable rendering
 */
const getPDFOptions = () => ({
  format: 'A4',
  margin: {
    top: '20mm',
    right: '15mm',
    bottom: '20mm',
    left: '15mm'
  },
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false,
  timeout: 30000, // 30 seconds timeout
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--run-all-compositor-stages-before-draw',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-ipc-flooding-protection',
    '--disable-ipc-flooding-protection',
    '--font-render-hinting=none'
    '--font-render-hinting=none'
  ]
});

/**
 * Ensures temp directory exists and is writable
 */
const ensureTempDirectory = () => {
  const tempDir = path.join(__dirname, '../../temp');
  
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('DEBUG Created temp directory:', tempDir);
    }
    
    // Test write permissions
    const testFile = path.join(tempDir, 'test_write.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log('DEBUG Temp directory verified and writable:', tempDir);
    return tempDir;
  } catch (error) {
    console.error('ERROR Temp directory setup failed:', error.message);
    throw new Error(`Cannot create or write to temp directory: ${error.message}`);
  }
};

/**
 * Creates a temporary HTML file with enhanced content for PDF generation
 */
const createTempHTMLFile = (htmlContent, fileName) => {
  console.log('DEBUG Creating temporary HTML file');
  
  try {
    const tempDir = ensureTempDirectory();
    const tempFileName = `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    // Enhanced HTML with better CSS loading and print optimization
    const enhancedHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
        @page {
            size: A4;
            margin: 20mm 15mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: #000 !important;
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        .document-container {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px;
            background: white;
        }
        
        .document-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #c11c22;
        }
        
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 14px;
            color: #666;
        }
        
        .document-title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            text-align: center;
            margin: 30px 0;
            color: #000;
        }
        
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            margin: 20px 0;
            border-left: 4px solid #c11c22;
            border-radius: 4px;
        }
        
        .content-section {
            margin: 20px 0;
            padding: 15px;
            background: #fff;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        
        .signature-area {
            margin-top: 60px;
            text-align: center;
        }
        
        .signature-line {
            border-top: 1px solid #000;
            width: 300px;
            margin: 40px auto 10px;
        }
        
        .document-footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        
        p {
            margin: 10px 0;
            text-align: justify;
        }
        
        strong {
            font-weight: bold;
        }
        
        ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        li {
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="document-container">
        ${htmlContent.replace(/^.*<body[^>]*>|<\/body>.*$/gi, '').replace(/^.*<!DOCTYPE[^>]*>|<\/html>.*$/gi, '')}
    </div>
</body>
</html>`;
    
    // Write to file
    fs.writeFileSync(tempFilePath, enhancedHTML, 'utf8');
    
    // Verify file was written correctly
    const writtenContent = fs.readFileSync(tempFilePath, 'utf8');
    if (writtenContent.length === 0) {
      throw new Error('Failed to write HTML content to temporary file');
    }
    
    console.log('SUCCESS Temporary HTML file created:', tempFilePath);
    console.log('DEBUG File size:', writtenContent.length, 'bytes');
    
    return tempFilePath;
  } catch (error) {
    console.error('ERROR Creating temporary HTML file:', error.message);
    throw new Error(`Failed to create temporary HTML file: ${error.message}`);
  }
};

/**
 * Validates PDF buffer content
 */
const validatePDFBuffer = (buffer) => {
  console.log('DEBUG Validating PDF buffer');
  
  if (!buffer) {
    throw new Error('PDF buffer is null or undefined');
  }
  
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('PDF content is not a valid buffer');
  }
  
  if (buffer.length === 0) {
    throw new Error('PDF buffer is empty');
  }
  
  // Check PDF header
  const header = buffer.slice(0, 4).toString();
  if (header !== '%PDF') {
    console.error('ERROR Invalid PDF header:', header);
    throw new Error(`Invalid PDF header: expected '%PDF', got '${header}'`);
  }
  
  // Check for PDF footer
  const footer = buffer.slice(-6).toString();
  if (!footer.includes('%%EOF')) {
    console.log('WARNING PDF may be incomplete - no EOF marker found');
  }
  
  console.log('SUCCESS PDF buffer validation passed');
  console.log('DEBUG PDF size:', buffer.length, 'bytes');
  
  return true;
};

/**
 * Uploads PDF buffer to Cloudinary with proper configuration
 */
const uploadPDFToCloudinary = async (pdfBuffer, fileName) => {
  console.log('DEBUG Starting PDF upload to Cloudinary');
  console.log('DEBUG File name:', fileName);
  console.log('DEBUG Buffer size:', pdfBuffer.length, 'bytes');
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'quiro-ferreira/documents/pdf',
        resource_type: 'raw',
        format: 'pdf',
        public_id: `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        use_filename: false,
        unique_filename: true,
        content_type: 'application/pdf',
        timeout: 60000 // 60 seconds timeout
      },
      (error, result) => {
        if (error) {
          console.error('ERROR Cloudinary upload failed:', error.message);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else if (!result || !result.secure_url) {
          console.error('ERROR Cloudinary upload completed but no URL returned');
          reject(new Error('Upload completed but no URL returned'));
        } else {
          console.log('SUCCESS PDF uploaded to Cloudinary');
          console.log('DEBUG Upload result URL:', result.secure_url);
          console.log('DEBUG Upload result size:', result.bytes, 'bytes');
          resolve(result);
        }
      }
    );
    
    uploadStream.end(pdfBuffer);
  });
};

/**
 * Main PDF generation function with complete validation and error handling
/**
 * Ensures temp directory exists and is writable
 */
const ensureTempDirectory = () => {
  const tempDir = path.join(__dirname, '../../temp');
  
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('DEBUG Created temp directory:', tempDir);
    }
    
    // Test write permissions
    const testFile = path.join(tempDir, 'test_write.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log('DEBUG Temp directory verified and writable:', tempDir);
    return tempDir;
  } catch (error) {
    console.error('ERROR Temp directory setup failed:', error.message);
    throw new Error(`Cannot create or write to temp directory: ${error.message}`);
  }
};

/**
 * Creates a temporary HTML file with enhanced content for PDF generation
 */
const createTempHTMLFile = (htmlContent, fileName) => {
  console.log('DEBUG Creating temporary HTML file');
  
  try {
    const tempDir = ensureTempDirectory();
    const tempFileName = `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    // Enhanced HTML with better CSS loading and print optimization
    const enhancedHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
        @page {
            size: A4;
            margin: 20mm 15mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: #000 !important;
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        .document-container {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px;
            background: white;
        }
        
        .document-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #c11c22;
        }
        
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 14px;
            color: #666;
        }
        
        .document-title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            text-align: center;
            margin: 30px 0;
            color: #000;
        }
        
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            margin: 20px 0;
            border-left: 4px solid #c11c22;
            border-radius: 4px;
        }
        
        .content-section {
            margin: 20px 0;
            padding: 15px;
            background: #fff;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        
        .signature-area {
            margin-top: 60px;
            text-align: center;
        }
        
        .signature-line {
            border-top: 1px solid #000;
            width: 300px;
            margin: 40px auto 10px;
        }
        
        .document-footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        
        p {
            margin: 10px 0;
            text-align: justify;
        }
        
        strong {
            font-weight: bold;
        }
        
        ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        li {
            margin: 5px 0;
        }
        
        @media print {
            body { margin: 0; padding: 20px; }
            .document-header { page-break-after: avoid; }
            .signature-area { page-break-before: avoid; }
        }
    </style>
</head>
<body>
    <div class="document-container">
        ${htmlContent.replace(/^.*<body[^>]*>|<\/body>.*$/gi, '').replace(/^.*<!DOCTYPE[^>]*>|<\/html>.*$/gi, '')}
    </div>
</body>
</html>`;
    
    // Write to file
    fs.writeFileSync(tempFilePath, enhancedHTML, 'utf8');
    
    // Verify file was written correctly
    const writtenContent = fs.readFileSync(tempFilePath, 'utf8');
    if (writtenContent.length === 0) {
      throw new Error('Failed to write HTML content to temporary file');
    }
    
    console.log('SUCCESS Temporary HTML file created:', tempFilePath);
    console.log('DEBUG File size:', writtenContent.length, 'bytes');
    
    return tempFilePath;
  } catch (error) {
    console.error('ERROR Creating temporary HTML file:', error.message);
    throw new Error(`Failed to create temporary HTML file: ${error.message}`);
  }
};

/**
 * Validates PDF buffer content
 */
const validatePDFBuffer = (buffer) => {
  console.log('DEBUG Validating PDF buffer');
  
  if (!buffer) {
    throw new Error('PDF buffer is null or undefined');
  }
  
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('PDF content is not a valid buffer');
  }
  
  if (buffer.length === 0) {
    throw new Error('PDF buffer is empty');
  }
  
  // Check PDF header
  const header = buffer.slice(0, 4).toString();
  if (header !== '%PDF') {
    console.error('ERROR Invalid PDF header:', header);
    throw new Error(`Invalid PDF header: expected '%PDF', got '${header}'`);
  }
  
  // Check for PDF footer
  const footer = buffer.slice(-6).toString();
  if (!footer.includes('%%EOF')) {
    console.log('WARNING PDF may be incomplete - no EOF marker found');
  }
  
  console.log('SUCCESS PDF buffer validation passed');
  console.log('DEBUG PDF size:', buffer.length, 'bytes');
  
  return true;
};

/**
 * Uploads PDF buffer to Cloudinary with proper configuration
 */
const uploadPDFToCloudinary = async (pdfBuffer, fileName) => {
  console.log('DEBUG Starting PDF upload to Cloudinary');
  console.log('DEBUG File name:', fileName);
  console.log('DEBUG Buffer size:', pdfBuffer.length, 'bytes');
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'quiro-ferreira/documents/pdf',
        resource_type: 'raw',
        format: 'pdf',
        public_id: `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        use_filename: false,
        unique_filename: true,
        content_type: 'application/pdf',
        timeout: 60000 // 60 seconds timeout
      },
      (error, result) => {
        if (error) {
          console.error('ERROR Cloudinary upload failed:', error.message);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else if (!result || !result.secure_url) {
          console.error('ERROR Cloudinary upload completed but no URL returned');
          reject(new Error('Upload completed but no URL returned'));
        } else {
          console.log('SUCCESS PDF uploaded to Cloudinary');
          console.log('DEBUG Upload result URL:', result.secure_url);
          console.log('DEBUG Upload result size:', result.bytes, 'bytes');
          resolve(result);
        }
      }
    );
    
    uploadStream.end(pdfBuffer);
  });
};

/**
 * Main PDF generation function with complete validation and error handling
 */
export const generatePDFFromHTML = async (htmlContent, fileName = 'document') => {
  let tempFilePath = null;
  
  console.log('DEBUG Starting PDF generation process');
  console.log('DEBUG Input file name:', fileName);
  console.log('DEBUG Input HTML length:', htmlContent ? htmlContent.length : 0);
  
  console.log('DEBUG Starting PDF generation process');
  console.log('DEBUG Input file name:', fileName);
  console.log('DEBUG Input HTML length:', htmlContent ? htmlContent.length : 0);
  
  try {
    // Step 1: Validate input parameters
    if (!htmlContent || typeof htmlContent !== 'string') {
      throw new Error('HTML content is required and must be a string');
    }
    
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('File name is required and must be a string');
    }
    
    // Step 2: Validate HTML content structure
    console.log('DEBUG Step 2: Validating HTML content structure');
    const validation = validateHTMLContent(htmlContent, 'medical_document');
    const validationReport = generateValidationReport(validation);
    
    console.log('DEBUG HTML validation report:', validationReport);
    
    // Step 4: Generate PDF from HTML file
    console.log('DEBUG Step 4: Generating PDF from HTML file');
    const file = { url: `file://${tempFilePath}` };
    const pdfOptions = getPDFOptions();
      throw new Error(errorMessage);
    console.log('DEBUG PDF generation options:', JSON.stringify(pdfOptions, null, 2));
    tempFilePath = createTempHTMLFile(htmlContent, fileName);
    const pdfBuffer = await htmlPdf.generatePdf(file, pdfOptions);
    console.log('DEBUG Step 4: Generating PDF from HTML file');
    // Step 5: Validate PDF buffer
    console.log('DEBUG Step 5: Validating PDF buffer');
    validatePDFBuffer(pdfBuffer);
    
    // Step 6: Upload to Cloudinary
    console.log('DEBUG Step 6: Uploading PDF to Cloudinary');
    const uploadResult = await uploadPDFToCloudinary(pdfBuffer, fileName);
    // Step 5: Validate PDF buffer
    console.log('SUCCESS PDF generation process completed successfully');
    
    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      bytes: uploadResult.bytes,
      validation: validationReport
    };
      url: uploadResult.secure_url,
  } catch (error) {
    console.error('ERROR PDF generation process failed:', error.message);
    console.error('ERROR Stack trace:', error.stack);
      errorContext.step = 'pdf_generation';
    // Provide detailed error context
    const errorContext = {
      step: 'unknown',
      htmlLength: htmlContent ? htmlContent.length : 0,
      fileName: fileName,
      tempFile: tempFilePath,
      timestamp: new Date().toISOString()
    };
    
    if (error.message.includes('HTML validation failed')) {
      errorContext.step = 'html_validation';
    } else if (error.message.includes('temporary HTML file')) {
      errorContext.step = 'temp_file_creation';
    } else if (error.message.includes('PDF buffer')) {
      errorContext.step = 'pdf_buffer_validation';
    } else if (error.message.includes('Cloudinary')) {
      errorContext.step = 'cloudinary_upload';
    } else {
      errorContext.step = 'pdf_generation';
    }
    console.log('DEBUG Step 3: Creating temporary HTML file');
    tempFilePath = createTempHTMLFile(htmlContent, fileName);
    console.error('ERROR Context:', JSON.stringify(errorContext, null, 2));
    
    throw new Error(`PDF generation failed at ${errorContext.step}: ${error.message}`);
  } finally {
    // Step 7: Cleanup temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('DEBUG Temporary file cleaned up:', tempFilePath);
      } catch (cleanupError) {
        console.log('WARNING Could not clean up temporary file:', cleanupError.message);
      }
    }
  }
};

/**
 * Test function to validate the PDF generation pipeline
 */
export const testPDFGeneration = async () => {
  console.log('DEBUG Starting PDF generation test');
  
  const testHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Test Document</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #c11c22; }
    </style>
</head>
<body>
    console.error('ERROR PDF generation test failed:', error.message);
    throw error;
  }
};
}
}