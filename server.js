const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// MongoDB connection string from environment variable
const mongoUrl = process.env.CHURCH_LINK_LIST;

// Add validation to prevent the error
if (!mongoUrl) {
  console.error('MongoDB connection string not provided');
  process.exit(1);
}

// Initialize Express
const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// MongoDB client
let db;

// Connect to MongoDB
async function connectToMongo(retries = 5) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const client = new MongoClient(mongoUrl);
      await client.connect();
      console.log('Connected to MongoDB');
      
      db = client.db();
      
      // Create indexes if they don't exist
      await db.collection('links').createIndex({ votes: -1 });
      await db.collection('links').createIndex({ date: -1 });
      await db.collection('links').createIndex({ category: 1 });
      
      return client;
    } catch (err) {
      console.error(`MongoDB connection error (attempt ${attempt + 1}):`, err);
      attempt++;
      if (attempt === retries) {
        console.error('Max retries reached. Exiting.');
        process.exit(1);
      }
    }
  }
}

// API Routes

// Get all links
app.get('/api/links', async (req, res) => {
  try {
    const sortBy = req.query.sort || 'date';
    let sortOption = {};
    
    if (sortBy === 'votes') {
      sortOption = { votes: -1 };
    } else if (sortBy === 'date') {
      sortOption = { date: -1 };
    } else if (sortBy === 'category') {
      sortOption = { category: 1, votes: -1 };
    }
    
    const links = await db.collection('links').find({}).sort(sortOption).toArray();
    res.json(links);
  } catch (err) {
    console.error('Error fetching links:', err);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// Add a new link
app.post('/api/links', async (req, res) => {
  try {
    const { title, url, description, category } = req.body;
    
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }
    
    const newLink = {
      title,
      url,
      description: description || '',
      category: category || 'Uncategorized',
      votes: 0,
      date: new Date()
    };
    
    const result = await db.collection('links').insertOne(newLink);
    res.status(201).json({ id: result.insertedId, ...newLink });
  } catch (err) {
    console.error('Error adding link:', err);
    res.status(500).json({ error: 'Failed to add link' });
  }
});

// Vote on a link
app.post('/api/links/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;
    
    if (value !== 1 && value !== -1) {
      return res.status(400).json({ error: 'Vote value must be 1 or -1' });
    }
    
    const result = await db.collection('links').updateOne(
      { _id: new ObjectId(id) },
      { $inc: { votes: value } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error voting on link:', err);
    res.status(500).json({ error: 'Failed to vote on link' });
  }
});

// Delete a link
app.delete('/api/links/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.collection('links').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting link:', err);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
async function startServer() {
  // Add this line before starting the server
  console.log(`Attempting to connect to MongoDB at: ${mongoUrl}`);
  
  const client = await connectToMongo();
  
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    await client.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  });
}

startServer().catch(console.error);