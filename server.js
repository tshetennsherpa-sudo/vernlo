process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/analyze', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    console.log('API response status:', response.status);
    if (!response.ok) console.log('API error:', JSON.stringify(data));
    res.json(data);
  } catch (err) {
    console.log('Server error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log('Vernlo proxy running on port 3001'));