/** Cloudinary config + a Promise wrapper over upload_stream, so callers respond only once the URL exists. */

import { v2 as cloudinary } from "cloudinary";

/** Configured lazily: at import time dotenv has not populated process.env yet. */
function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key:    process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  });
}

export function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUD_NAME && process.env.API_KEY && process.env.API_SECRET);
}

/** @param {object} options passed through to upload_stream. @returns {Promise<{secure_url: string, public_id: string}>} */
export function uploadBufferToCloudinary(buffer, options = {}) {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    uploadStream.end(buffer);
  });
}

export function destroyCloudinaryAsset(publicId) {
  if (!publicId) return Promise.resolve(null);
  configureCloudinary();
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

export default cloudinary;
