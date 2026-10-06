require('dotenv').config();

if (!process.env.JWT_SECRET && require.main === module) {
  throw new Error('JWT_SECRET must be set in the environment.');
}

const express = require('express');
const authRoutes = require('./routes/authRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const agentRoutes = require('./routes/agentRoutes');
const clientRoutes = require('./routes/clientRoutes');
const db = require('./config/database');
const { readImage } = require('./storage/imageStore');

const app = express();

app.use(express.json());

// In the serverless function a startup throw surfaces only as an opaque 502, so report the misconfiguration instead.
app.use((req, res, next) => {
  if (process.env.JWT_SECRET) return next();
  console.error('JWT_SECRET must be set in the environment.');
  res.status(500).json({ message: 'The server is missing its JWT_SECRET configuration.' });
});
app.get(['/', '/.netlify/functions/api'], (req, res) => {
  res.status(200).json({ message: 'API is running.' });
});

function initializeDatabase(req, res, next) {
  db.initialize().then(() => next()).catch((error) => {
    console.error('Database initialization failed:', error);
    res.status(503).json({ message: 'The database is temporarily unavailable.' });
  });
}

app.use(['/api', '/.netlify/functions/api'], initializeDatabase);

function mountApi(prefix) {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/invoices`, invoiceRoutes);
  app.use(`${prefix}/agents`, agentRoutes);
  app.use(`${prefix}/clients`, clientRoutes);
}

mountApi('/api');
mountApi('/.netlify/functions/api');

app.get(['/uploads/:folder/:key', '/.netlify/functions/api/uploads/:folder/:key'], async (req, res) => {
  try {
    const image = await readImage(req.params.folder, req.params.key);
    if (!image) return res.status(404).json({ message: 'Image not found.' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(image.contentType).send(image.buffer);
  } catch (error) {
    console.error('Image retrieval failed:', error);
    res.status(500).json({ message: 'Unable to retrieve image.' });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  db.initialize().then(() => {
    app.listen(port, () => console.log(`API listening on port ${port}`));
  }).catch((error) => {
    console.error('API startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.initializeDatabase = db.initialize;