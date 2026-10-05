const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const multer = require('multer');

const imageExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

function hasValidImageSignature(file) {
  // MIME types come from the client, so verify the uploaded bytes before accepting the file.
  const image = fs.readFileSync(file.path);
  if (file.mimetype === 'image/jpeg') {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  }
  if (file.mimetype === 'image/png') {
    return image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return file.mimetype === 'image/webp' && image.length >= 12 &&
    image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
}

function createImageUpload(folder, fieldName) {
  const directory = path.join(__dirname, '..', '..', 'uploads', folder);
  fs.mkdirSync(directory, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: directory,
      filename: (req, file, callback) => callback(null, `${randomUUID()}${imageExtensions.get(file.mimetype)}`),
    }),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      if (!imageExtensions.has(file.mimetype)) {
        return callback(new Error('Upload a JPG, PNG, or WebP image under 3 MB.'));
      }
      return callback(null, true);
    },
  });

  return (req, res, next) => upload.single(fieldName)(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message || 'Unable to upload image.' });
    if (req.file && !hasValidImageSignature(req.file)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'The uploaded file is not a valid JPG, PNG, or WebP image.' });
    }
    return next();
  });
}

module.exports = createImageUpload;