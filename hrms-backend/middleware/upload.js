/** Multer config. memoryStorage() because every buffer is piped straight to Cloudinary, never to disk. */

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

// Contract PDFs — a higher cap than avatars; scanned contracts run large.
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

// Same as uploadPdf with a higher files cap.
export const uploadDocuments = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: MAX_PDF_SIZE_BYTES, files: 5 },
});

/**
 * Wraps a multer middleware so its errors become a clean 400. Multer calls
 * next(err) rather than throwing, so a route-level try/catch never sees them.
 *   router.post("/:id/avatar", verifyToken, handleUploadErrors(uploadImage.single("avatar")), controller.uploadAvatar)
 */
export function handleUploadErrors(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  };
}
