import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dqkxvjqzx',
  api_key: process.env.CLOUDINARY_API_KEY || '821272447129281',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'gGxjMQPEQxwZ2Z7u4FiJSHxA4pc',
});

export default cloudinary;