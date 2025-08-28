import htmlPdf from 'html-pdf-node';
import { v2 as cloudinary } from 'cloudinary';

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
  phantomArgs: ['--web-security=false'],
  args: ['--no-sandbox', '--disable-setuid-sandbox']
};

// Generate PDF from HTML content and upload to Cloudinary
export const generatePDFFromHTML = async (htmlContent, fileName = 'document') => {
  try {
    console.log('🔄 Generating PDF from HTML content...');
    
    // Create PDF buffer from HTML
    const file = { content: htmlContent };
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
  }
};