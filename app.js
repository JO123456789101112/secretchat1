const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB Atlas connection
const dbURI = "mongodb+srv://john:john@john.gevwwjw.mongodb.net/wishList?retryWrites=true&w=majority&appName=john";
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Online users tracking
const activeUsers = new Map();
const USER_TIMEOUT = 30000; // 30 seconds

// Clean up inactive users
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastActive] of activeUsers.entries()) {
    if (now - lastActive > USER_TIMEOUT) {
      activeUsers.delete(sessionId);
    }
  }
}, 10000); // Check every 10 seconds

// Serve static file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Heartbeat endpoint
app.post('/heartbeat', (req, res) => {
  const sessionId = req.ip + req.headers['user-agent'];
  activeUsers.set(sessionId, Date.now());
  res.status(204).end();
});

// Online users count endpoint
app.get('/online-users', (req, res) => {
  res.json({ count: activeUsers.size });
});

// Wishlist model and routes
const wishlistSchema = new mongoose.Schema({
  name: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

app.get('/wishlist', async (req, res) => {
  try {
    const items = await Wishlist.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch wishlist items' });
  }
});

app.post('/wishlist', async (req, res) => {
  try {
    const newItem = new Wishlist({ name: req.body.name });
    await newItem.save();
    res.json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item to wishlist' });
  }
});

app.delete('/wishlist/:id', async (req, res) => {
  try {
    await Wishlist.findByIdAndDelete(req.params.id);
    res.status(200).send('Item deleted successfully');
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
