import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// 🔥 FIXED: Import cloudinary properly
const createCloudinaryConfig = async () => {
  try {
    const { v2: cloudinary } = await import('cloudinary');
    
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dqkxvjqzx',
      api_key: process.env.CLOUDINARY_API_KEY || '821272447129281',
      api_secret: process.env.CLOUDINARY_API_SECRET || 'gGxjMQPEQxwZ2Z7u4FiJSHxA4pc',
    });

    console.log('✅ Cloudinary configured successfully');
    return cloudinary;
  } catch (error) {
    console.error('❌ Error configuring Cloudinary:', error);
    throw error;
  }
};

// Initialize cloudinary
const cloudinary = await createCloudinaryConfig();

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'quiro-ferreira/professionals', // Folder in Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto:good'
      }
    ]
  },
});

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('🔄 File filter - File type:', file.mimetype);
    
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
  },
});

export default upload;