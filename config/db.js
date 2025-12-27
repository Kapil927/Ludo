const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        console.log('Make sure your MongoDB connection string is correct');
        process.exit(1);
    }
};

module.exports = connectDB;