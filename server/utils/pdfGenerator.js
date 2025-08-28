import htmlPdf from 'html-pdf-node';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced PDF generation options with better rendering
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
  // 🔥 INCREASED RENDER DELAY - Wait for CSS to load
  renderDelay: 3000,
  // 🔥 WAIT FOR NETWORK IDLE - Ensure all resources are loaded
  waitUntil: 'networkidle0',
  args: [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    // 🔥 FORCE CSS RENDERING
    '--run-all-compositor-stages-before-draw',
    '--disable-backgrounding-occluded-windows'
  ]
};

// Generate PDF from HTML content and upload to Cloudinary
export const generatePDFFromHTML = async (htmlContent, fileName = 'document') => {
  let tempFilePath = null;
  
  try {
    console.log('🔄 Starting PDF generation process...');
    console.log('📄 HTML content length:', htmlContent.length);
    
    // Validate HTML content
    if (!htmlContent || htmlContent.trim().length === 0) {
      throw new Error('HTML content is empty or invalid');
    }
    
    // Create temporary directory
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('📁 Created temp directory:', tempDir);
    }
    
    // Create temporary HTML file
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
    tempFilePath = path.join(tempDir, tempFileName);
    
    // 🔥 ENHANCED HTML WITH INLINE STYLES - Ensure CSS loads properly
    const enhancedHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Force all styles to be inline and loaded */
        * { box-sizing: border-box; }
        body { 
            font-family: 'Times New Roman', serif !important;
            line-height: 1.6 !important;
            margin: 0 !important;
            padding: 40px !important;
            background: white !important;
            color: #333 !important;
        }
        /* Ensure all styles are applied immediately */
        .header, .title, .content, .signature, .footer { display: block !important; }
    </style>
</head>
${htmlContent.replace('<head>', '<head>').replace('</head>', '</head>')}
</html>`;
    
    // Write enhanced HTML content to temporary file
    fs.writeFileSync(tempFilePath, enhancedHTML, 'utf8');
    console.log('✅ Temporary HTML file created:', tempFilePath);
    console.log('📄 Enhanced HTML length:', enhancedHTML.length);
    
    // 🔥 VERIFY FILE WAS WRITTEN CORRECTLY
    const writtenContent = fs.readFileSync(tempFilePath, 'utf8');
    if (writtenContent.length === 0) {
      throw new Error('Failed to write HTML content to temporary file');
    }
    console.log('✅ File verification passed, content length:', writtenContent.length);
    
    // Create PDF from file with enhanced options
    const file = { url: `file://${tempFilePath}` };
    
    console.log('🔄 Starting PDF conversion...');
    const pdfBuffer = await htmlPdf.generatePdf(file, pdfOptions);
    
    // 🔥 VALIDATE PDF BUFFER
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF generation resulted in empty buffer');
    }
    
    console.log('✅ PDF generated successfully');
    console.log('📊 PDF buffer size:', pdfBuffer.length, 'bytes');
    console.log('📊 PDF buffer type:', typeof pdfBuffer);
    
    // 🔥 VALIDATE PDF CONTENT - Check if it's actually a PDF
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    if (pdfHeader !== '%PDF') {
      console.error('❌ Generated buffer is not a valid PDF. Header:', pdfHeader);
      throw new Error('Generated file is not a valid PDF');
    }
    console.log('✅ PDF validation passed - valid PDF header found');
    
    // 🔥 CORRECT CLOUDINARY UPLOAD FOR PDF
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'quiro-ferreira/documents/pdf',
          // 🔥 CRITICAL: Use 'raw' for PDF files
          resource_type: 'raw',
          format: 'pdf',
          public_id: `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          use_filename: false,
          unique_filename: true,
          // 🔥 ENSURE PROPER CONTENT TYPE
          content_type: 'application/pdf'
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log('✅ PDF uploaded to Cloudinary successfully');
            console.log('🔗 PDF URL:', result?.secure_url);
            console.log('📊 Uploaded file size:', result?.bytes, 'bytes');
            resolve(result);
          }
        }
      );
      
      // 🔥 WRITE BUFFER TO STREAM PROPERLY
      uploadStream.end(pdfBuffer);
    });
    
    // 🔥 VALIDATE UPLOAD RESULT
    if (!uploadResult || !uploadResult.secure_url) {
      throw new Error('Cloudinary upload completed but no URL returned');
    }
    
    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      bytes: uploadResult.bytes
    };
  } catch (error) {
    console.error('❌ Error in PDF generation process:', error);
    console.error('❌ Error stack:', error.stack);
    throw new Error(`Erro ao gerar PDF: ${error.message}`);
  } finally {
    // 🔥 ENSURE CLEANUP ALWAYS HAPPENS
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🧹 Temporary file cleaned up:', tempFilePath);
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up temporary file:', cleanupError.message);
      }
    }
  }
};