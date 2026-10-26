import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | undefined;

export async function connectDatabase(uri = process.env.MONGODB_URI): Promise<void> {
  if (!uri) {
    throw new Error("MONGODB_URI is required. Add your MongoDB Atlas connection string to .env.");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  connectionPromise ??= mongoose.connect(uri).catch((error: unknown) => {
    connectionPromise = undefined;
    throw error;
  });

  await connectionPromise;
  console.info(`Connected to MongoDB database "${mongoose.connection.name}".`);
}

export async function disconnectDatabase(): Promise<void> {
  connectionPromise = undefined;
  await mongoose.disconnect();
}

mongoose.connection.on("error", (error: Error) => {
  console.error("MongoDB connection error:", error);
});

mongoose.connection.on("disconnected", () => {
  connectionPromise = undefined;
  console.warn("MongoDB connection closed.");
});
