import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      const errorMsg = 'MONGO_URI environment variable is required';
      console.error(`❌ ${errorMsg}`);
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
      throw new Error(errorMsg);
    }
    
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ MongoDB connection error: ${error.message || error}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    // In development, allow the app to continue but log the error
    throw error;
  }
};



