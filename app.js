const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
const dbURI = "mongodb+srv://john:john@john.gevwwjw.mongodb.net/wishList?retryWrites=true&w=majority&appName=john";
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Online users tracking
const activeUsers = new Map();
const USER_TIMEOUT = 30000; // 30 seconds
const sseClients = new Set();

// Clean up inactive users
setInterval(() => {
  const now = Date.now();
  let changed = false;
  
  for (const [sessionId, lastActive] of activeUsers.entries()) {
    if (now - lastActive > USER_TIMEOUT) {
      activeUsers.delete(sessionId);
      changed = true;
    }
  }
  
  if (changed) {
    broadcastOnlineCount();
  }
}, 10000);

function broadcastOnlineCount() {
  const count = activeUsers.size;
  const data = `data: ${JSON.stringify({ count })}\n\n`;
  
  sseClients.forEach(client => {
    try {
      client.res.write(data);
    } catch (err) {
      console.error('SSE write error:', err);
      sseClients.delete(client);
    }
  });
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/heartbeat', (req, res) => {
  const sessionId = req.ip + req.headers['user-agent'];
  const previousCount = activeUsers.size;
  activeUsers.set(sessionId, Date.now());
  
  if (activeUsers.size !== previousCount) {
    broadcastOnlineCount();
  }
  
  res.status(204).end();
});

app.get('/online-users-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  // Send initial count
  res.write(`data: ${JSON.stringify({ count: activeUsers.size })}\n\n`);
  
  // Add client to the set
  const client = { res };
  sseClients.add(client);
  
  // Remove client when connection closes
  req.on('close', () => {
    sseClients.delete(client);
  });
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
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.post('/wishlist', async (req, res) => {
  try {
    const newItem = new Wishlist({ name: req.body.name });
    await newItem.save();
    res.json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item' });
  }
});

app.delete('/wishlist/:id', async (req, res) => {
  try {
    await Wishlist.findByIdAndDelete(req.params.id);
    res.status(200).send('Item deleted');
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
