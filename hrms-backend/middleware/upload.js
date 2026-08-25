/**
 * upload.js — Multer config for avatar/image uploads.
 *
 * memoryStorage() per WEB96_BACKEND_REFERENCE.md §10 - required because the buffer is
 * piped straight to Cloudinary (utils/cloudinary.js), never written to local disk.
 */

import multer from "multer";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed."));
  }
  cb(null, true);
}

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

// Task 1.4 — contract PDF upload. Same memoryStorage rationale as above;
// piped straight to Cloudinary as a "raw" resource (see
// utils/cloudinary.js / employeeController.uploadContract), never written
// to local disk. A higher size cap than avatars since scanned/signed
// contract PDFs run larger than a profile photo.
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_PDF_MIME_TYPES = new Set(["application/pdf"]);

function pdfFileFilter(req, file, cb) {
  if (!ALLOWED_PDF_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Only PDF files are allowed."));
  }
  cb(null, true);
}

export const uploadPdf = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: MAX_PDF_SIZE_BYTES, files: 1 },
});

// Solo Gaps Milestone 1 — multi-document upload. Same storage/filter as
// uploadPdf above, just a higher files cap (a batch of offer letters/ID
// scans/etc, not a single contract).
export const uploadDocuments = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: MAX_PDF_SIZE_BYTES, files: 5 },
});

/**
 * handleUploadErrors — wraps a multer middleware (e.g. `uploadImage.single("avatar")`)
 * so its errors (wrong mimetype from fileFilter, file too large, too many files, ...)
 * resolve to a clean 400 with `err.message` instead of falling through to the app's
 * generic error handler as an uncaught 500. Multer calls `next(err)` on failure rather
 * than throwing inside the request handler, so a route-level try/catch never sees it —
 * this has to sit between the multer middleware and the route to catch it.
 *
 * Usage: router.post("/:id/avatar", verifyToken, handleUploadErrors(uploadImage.single("avatar")), controller.uploadAvatar)
 */
export function handleUploadErrors(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  };
}
