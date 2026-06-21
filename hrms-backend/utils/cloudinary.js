/**
 * cloudinary.js — config + upload helper.
 *
 * WEB96_BACKEND_REFERENCE.md §10 documents the course's lesson9 upload route, but flags
 * a real bug in it: `res.json(...)` fires *before* the `cloudinary.uploader.upload(...)`
 * callback resolves, so `secure_url` is logged but never actually returned to the client.
 *
 * This wraps the same callback-based `cloudinary.uploader.upload_stream` API in a Promise
 * so callers can `await` it and only respond once the URL is actually available.
 */

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

export function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUD_NAME && process.env.API_KEY && process.env.API_SECRET);
}

/**
 * Uploads a buffer (e.g. from multer's memoryStorage) to Cloudinary and resolves with
 * the result once it's actually done - no race with the HTTP response.
 *
 * @param {Buffer} buffer
 * @param {object} options - passed through to cloudinary.uploader.upload_stream
 * @returns {Promise<{secure_url: string, public_id: string}>}
 */
export function uploadBufferToCloudinary(buffer, options = {}) {
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
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

export default cloudinary;
