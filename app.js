const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Initialize app and middleware
const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB Atlas connection string
const dbURI = "mongodb+srv://john:john@john.gevwwjw.mongodb.net/wishList?retryWrites=true&w=majority&appName=john";
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true }).then(() => console.log('Connected to MongoDB')).catch(err => console.log('Error connecting to MongoDB: ', err));

// Serve the static index.html file when accessing the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));  // Serves the index.html file
});

// Define Wishlist schema and model
const wishlistSchema = new mongoose.Schema({
    name: String
});

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

// Routes
// GET route to fetch all wishlist items
app.get('/wishlist', async (req, res) => {
    try {
        const items = await Wishlist.find();
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wishlist items' });
    }
});

// POST route to add a new item to the wishlist
app.post('/wishlist', async (req, res) => {
    const newItem = new Wishlist({ name: req.body.name });

    try {
        await newItem.save();
        res.json(newItem);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add item to wishlist' });
    }
});

// DELETE route to remove an item from the wishlist
app.delete('/wishlist/:id', async (req, res) => {
    try {
        await Wishlist.findByIdAndDelete(req.params.id);
        res.status(200).send('Item deleted successfully');
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);


});