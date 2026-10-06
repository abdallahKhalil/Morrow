const multer = require('multer');
const { isValidImageSignature } = require('../storage/imageStore');

function createImageUpload(folder, fieldName) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        return callback(new Error('Upload a JPG, PNG, or WebP image under 3 MB.'));
      }
      return callback(null, true);
    },
  });

  return (req, res, next) => upload.single(fieldName)(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message || 'Unable to upload image.' });
    if (req.file && !isValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ message: 'The uploaded file is not a valid JPG, PNG, or WebP image.' });
    }
    return next();
  });
}

module.exports = createImageUpload;