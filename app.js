// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Security middlewares
app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // optional public folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiter (basic)
const apiLimiter = rateLimit({
  windowMs: 10000, // 10s window
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many requests, slow down.'
});
app.use('/wishlist', apiLimiter);

// MongoDB connection (use .env or fallback)
const dbURI = process.env.MONGO_URI || "mongodb+srv://john:john@john.gevwwjw.mongodb.net/wishList?retryWrites=true&w=majority&appName=john";
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Online users tracking (keeps your heartbeat method)
const activeUsers = new Map();
const USER_TIMEOUT = 30000; // 30 seconds

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastActive] of activeUsers.entries()){
    if(now - lastActive > USER_TIMEOUT) activeUsers.delete(sessionId);
  }
}, 10000);

// Serve original index file (if you want to serve index.html from root, keep existing behavior)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Heartbeat endpoint (keeps your original)
app.post('/heartbeat', (req, res) => {
  const sessionId = req.ip + (req.headers['user-agent']||'');
  activeUsers.set(sessionId, Date.now());
  res.status(204).end();
});

app.get('/online-users', (req, res) => {
  res.json({ count: activeUsers.size });
});

// Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// Wishlist schema
const wishlistSchema = new mongoose.Schema({
  name: String,
  username: { type: String, default: 'anon' },
  createdAt: { type: Date, default: Date.now },
  edited: { type: Boolean, default: false },
  replyTo: { type: mongoose.Schema.Types.ObjectId, default: null },
  replyText: { type: String, default: null },
  image: { type: String, default: null },
  reactions: { type: Map, of: Number, default: {} }
});

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

// Utility sanitize
function sanitizeInput(text){
  return sanitizeHtml(text || '', {
    allowedTags: [],
    allowedAttributes: {}
  });
}

// REST endpoints (kept and enhanced)
app.get('/wishlist', async (req, res) => {
  try{
    const items = await Wishlist.find().sort({ createdAt: 1 }).lean();
    res.json(items);
  } catch(err){
    res.status(500).json({ error: 'Failed to fetch wishlist items' });
  }
});

app.post('/wishlist', async (req, res) => {
  try{
    // sanitize
    const name = sanitizeInput(req.body.name || '');
    const username = sanitizeInput(req.body.username || 'anon');
    const image = req.body.image || null;
    const replyTo = req.body.replyTo || null;
    const replyText = sanitizeInput(req.body.replyText || null);

    const newItem = new Wishlist({
      name,
      username,
      image,
      replyTo,
      replyText
    });
    await newItem.save();

    // emit to sockets
    io.emit('newMessage', newItem);

    res.json(newItem);
  } catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to add item to wishlist' });
  }
});

// Edit (PATCH) - new
app.patch('/wishlist/:id', async (req, res) => {
  try{
    const id = req.params.id;
    const name = sanitizeInput(req.body.name || '');
    const updated = await Wishlist.findByIdAndUpdate(id, { name, edited: true }, { new: true });
    if(updated){
      io.emit('messageEdited', updated);
      return res.json(updated);
    }
    res.status(404).json({ error: 'Not found' });
  } catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to edit item' });
  }
});

// Delete (keeps original)
app.delete('/wishlist/:id', async (req, res) => {
  try{
    await Wishlist.findByIdAndDelete(req.params.id);
    io.emit('messageDeleted', req.params.id);
    res.status(200).send('Item deleted successfully');
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Image upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
  if(!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// -------------------------
// Socket.IO real-time logic
// -------------------------
io.on('connection', (socket) => {
  // when client says hello (sends username)
  socket.on('hello', async (data) => {
    socket.username = data.username || 'anon';
    // add to activeUsers using socket id
    activeUsers.set(socket.id, Date.now());
    // send initial messages
    const msgs = await Wishlist.find().sort({ createdAt: 1 }).lean();
    socket.emit('initialMessages', msgs);
    io.emit('online-count', { count: activeUsers.size });
  });

  // new message via sockets (if client used socket directly)
  socket.on('newMessage', async (data) => {
    const name = sanitizeInput(data.name || '');
    const username = sanitizeInput(data.username || 'anon');
    const image = data.image || null;
    const replyTo = data.replyTo || null;
    const replyText = sanitizeInput(data.replyText || null);

    const newItem = new Wishlist({ name, username, image, replyTo, replyText });
    await newItem.save();
    io.emit('newMessage', newItem);
  });

  // typing
  socket.on('typing', (d) => {
    socket.broadcast.emit('typing', { username: socket.username || d.username || 'anon' });
  });

  socket.on('stopTyping', (d) => {
    // optional handling
  });

  // reaction update
  socket.on('react', async (d) => {
    try{
      const id = d.id;
      const emoji = d.emoji;
      const doc = await Wishlist.findById(id);
      if(!doc) return;
      const curr = doc.reactions.get(emoji) || 0;
      doc.reactions.set(emoji, curr + 1);
      await doc.save();
      io.emit('reactUpdated', doc);
    } catch(e){
      console.error('react error', e);
    }
  });

  // disconnect
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('online-count', { count: activeUsers.size });
  });

  // update active timestamp on any activity from socket
  socket.onAny((event, ...args) => {
    activeUsers.set(socket.id, Date.now());
  });
});

// keep original server port behavior
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
