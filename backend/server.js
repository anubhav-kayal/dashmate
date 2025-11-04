// --- server.js ---

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');


dotenv.config();


const authRoutes = require('./routes/auth');


const app = express();

app.use(cors({
  origin: 'http://localhost:3000' // Or your frontend's URL
}));
// 2. Allow Express to parse JSON in request bodies
app.use(express.json());

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

app.get('/api', (req, res) => {
  res.json({ message: 'Hello from the DashMate backend!' });
});

app.use('/api/auth', authRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});