import htmlPdf from 'html-pdf-node';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced PDF generation options
const pdfOptions = {
  format: 'A4',
  border: {
    top: '0.5in',
    right: '0.5in',
    bottom: '0.5in',
    left: '0.5in'
  },
  type: 'pdf',
  quality: '75',
  renderDelay: 5000, // Wait 5 seconds for CSS to load
  waitUntil: 'networkidle0',
  args: [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--run-all-compositor-stages-before-draw',
    '--disable-backgrounding-occluded-windows',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ]
};

// Generate PDF from HTML content and upload to Cloudinary
export const generatePDFFromHTML = async (htmlContent, fileName = 'document') => {
  let tempFilePath = null;
  
  try {
    console.log('DEBUG Starting PDF generation process...');
    console.log('DEBUG HTML content length:', htmlContent ? htmlContent.length : 0);
    console.log('DEBUG File name:', fileName);
    
    // Validate HTML content first
    if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
      console.error('ERROR HTML content is empty or invalid for PDF generation');
      throw new Error('HTML content is empty or invalid');
    }
    
    console.log('DEBUG HTML content preview (first 200 chars):', htmlContent.substring(0, 200));
    
    // Create temporary directory
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('DEBUG Created temp directory:', tempDir);
    }
    
    // Create temporary HTML file
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
    tempFilePath = path.join(tempDir, tempFileName);
    
    // Enhanced HTML with better CSS loading
    const enhancedHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { 
            box-sizing: border-box; 
            margin: 0; 
            padding: 0; 
        }
        body { 
            font-family: Arial, sans-serif !important;
            line-height: 1.6 !important;
            margin: 0 !important;
            padding: 40px !important;
            background: white !important;
            color: black !important;
            font-size: 14px !important;
        }
        .header, .title, .content, .signature, .footer { 
            display: block !important; 
        }
        h1, h2, h3, h4, h5, h6 {
            color: #c11c22 !important;
            margin: 10px 0 !important;
        }
        p {
            margin: 10px 0 !important;
        }
        strong {
            font-weight: bold !important;
        }
    </style>
</head>
${htmlContent.replace(/<head>.*?<\/head>/s, '').replace('<html lang="pt-BR">', '').replace('</html>', '')}
</body>
</html>`;
    
    // Write HTML content to temporary file
    fs.writeFileSync(tempFilePath, enhancedHTML, 'utf8');
    console.log('SUCCESS Temporary HTML file created:', tempFilePath);
    
    // Verify file was written correctly
    const writtenContent = fs.readFileSync(tempFilePath, 'utf8');
    if (writtenContent.length === 0) {
      throw new Error('Failed to write HTML content to temporary file');
    }
    console.log('SUCCESS File verification passed, content length:', writtenContent.length);
    
    // Create PDF from file
    const file = { url: `file://${tempFilePath}` };
    
    console.log('DEBUG Starting PDF conversion with options:', JSON.stringify(pdfOptions, null, 2));
    const pdfBuffer = await htmlPdf.generatePdf(file, pdfOptions);
    
    // Validate PDF buffer
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF generation resulted in empty buffer');
    }
    
    console.log('SUCCESS PDF generated successfully');
    console.log('DEBUG PDF buffer size:', pdfBuffer.length, 'bytes');
    
    // Validate PDF content
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    if (pdfHeader !== '%PDF') {
      console.error('ERROR Generated buffer is not a valid PDF. Header:', pdfHeader);
      throw new Error('Generated file is not a valid PDF');
    }
    console.log('SUCCESS PDF validation passed - valid PDF header found');
    
    // Upload PDF to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'quiro-ferreira/documents/pdf',
          resource_type: 'raw',
          format: 'pdf',
          public_id: `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          use_filename: false,
          unique_filename: true,
          content_type: 'application/pdf'
        },
        (error, result) => {
          if (error) {
            console.error('ERROR Cloudinary upload error:', error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log('SUCCESS PDF uploaded to Cloudinary successfully');
            console.log('DEBUG PDF URL:', result?.secure_url);
            console.log('DEBUG Uploaded file size:', result?.bytes, 'bytes');
            resolve(result);
          }
        }
      );
      
      uploadStream.end(pdfBuffer);
    });
    
    // Validate upload result
    if (!uploadResult || !uploadResult.secure_url) {
      throw new Error('Cloudinary upload completed but no URL returned');
    }
    
    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      bytes: uploadResult.bytes
    };
  } catch (error) {
    console.error('ERROR in PDF generation process:', error.message);
    console.error('ERROR stack:', error.stack);
    throw new Error(`Erro ao gerar PDF: ${error.message}`);
  } finally {
    // Cleanup temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('DEBUG Temporary file cleaned up:', tempFilePath);
      } catch (cleanupError) {
        console.warn('WARNING Could not clean up temporary file:', cleanupError.message);
      }
    }
  }
};