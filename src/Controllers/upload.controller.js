const multer = require('multer');
const cloudinary = require('../Configs/cloudinary');
const { errorResponse, successResponse } = require('../Utils/responseHelper');

// Configure multer with memory storage and size limits
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Allowed formats: JPEG, PNG, WEBP, PDF (max 5MB)'));
    }
  }
});

/**
 * Controller to upload a single document/image to Cloudinary
 */
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No file uploaded');
    }

    const docType = req.body.docType || 'general';

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `installment_documents/${docType}`,
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      uploadStream.end(req.file.buffer);
    });

    return successResponse(res, 200, 'File uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes
    });

  } catch (error) {
    console.error('Upload document controller error:', error);
    return errorResponse(res, 500, error.message || 'File upload failed');
  }
};

module.exports = {
  upload,
  uploadDocument
};
