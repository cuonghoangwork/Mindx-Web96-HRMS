import mongoose from "mongoose";

export async function connectDB() {
  const connectString = process.env.CONNECT_STRING;
  if (!connectString) {
    throw new Error("CONNECT_STRING is not defined in the environment file.");
  }
  await mongoose.connect(connectString);
  console.log("Connected to MongoDB");
}
