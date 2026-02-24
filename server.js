const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./src/Configs/connection');

// Connect to MongoDB
connectDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust this for production
    methods: ["GET", "POST"]
  }
});

// Attach io to app for access in controllers
app.set('io', io);

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log('--- Socket Connected ---');
  console.log('ID:', socket.id);

  // Join a room based on the user's role/id
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`[Socket] User ${userId} joined personal room`);
  });

  // Join a specific ride room for live tracking
  socket.on('joinRide', (rideId) => {
    socket.join(rideId);
    console.log(`[Socket] Ride Room Joined: ${rideId}`);
  });

  // Handle rider location updates and broadcast to the ride room
  socket.on('updateLocation', (data) => {
    const { rideId, location } = data;
    // Broadcast to everyone in the ride room EXCEPT the sender
    socket.to(rideId).emit('driverLocationUpdate', { location });
    console.log(`[Socket] Location Broadcast for Ride ${rideId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Define a simple route
app.get('/', (req, res) => {
  res.send('API is running with Socket.io...');
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
