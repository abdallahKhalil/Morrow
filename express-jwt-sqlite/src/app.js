require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the environment.');
}

const express = require('express');
const authRoutes = require('./routes/authRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const agentRoutes = require('./routes/agentRoutes');
const clientRoutes = require('./routes/clientRoutes');
const path = require('node:path');

const app = express();

app.use(express.json());
app.get('/', (req, res) => {
  res.status(200).json({ message: 'API is running.' });
});
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/clients', clientRoutes);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

module.exports = app;