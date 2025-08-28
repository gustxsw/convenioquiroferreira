import htmlPdf from 'html-pdf-node';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PDF generation options
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
  renderDelay: 1000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
};

// Generate PDF from HTML content and upload to Cloudinary
export const generatePDFFromHTML = async (htmlContent, fileName = 'document') => {
  let tempFilePath = null;
  
  try {
    console.log('🔄 Generating PDF from HTML content...');
    
    // Create temporary HTML file
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
    tempFilePath = path.join(tempDir, tempFileName);
    
    // Write HTML content to temporary file
    fs.writeFileSync(tempFilePath, htmlContent, 'utf8');
    console.log('✅ Temporary HTML file created:', tempFilePath);
    
    // Create PDF from file
    const file = { url: `file://${tempFilePath}` };
    const pdfBuffer = await htmlPdf.generatePdf(file, pdfOptions);
    
    console.log('✅ PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    
    // Upload PDF to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'quiro-ferreira/documents/pdf',
          resource_type: 'raw',
          format: 'pdf',
          public_id: `${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          use_filename: false,
          unique_filename: true
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('✅ PDF uploaded to Cloudinary:', result?.secure_url);
            resolve(result);
          }
        }
      ).end(pdfBuffer);
    });
    
    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id
    };
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw new Error(`Erro ao gerar PDF: ${error.message}`);
  } finally {
    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🧹 Temporary file cleaned up:', tempFilePath);
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up temporary file:', cleanupError);
      }
    }
  }
};