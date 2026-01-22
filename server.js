const app = require('./app');
const mongoose = require('mongoose');
const connectDB = require('./src/Configs/connection');



// Connect to MongoDB
connectDB();

// Define a simple route
app.get('/', (req, res) => {
  res.send('API is running...');
});
// Start the server
const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
