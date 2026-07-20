require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const chatbotRoutes = require('./routes/chatbot');
const { authMiddleware } = require('./middleware/auth');

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/chatbot', authMiddleware, chatbotRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler — any unmatched route falls here instead of Express's default page.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — catches anything thrown/rejected in a route so a bug
// in one request returns a 500 to that request instead of killing the server.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WellnessHub server running on http://0.0.0.0:${PORT}`);
});
