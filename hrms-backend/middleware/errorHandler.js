import multer from "multer";

/**
 * The single Express error handler, shared by index.js and the test harness
 * (tests/testHelpers.js) so the two can never produce different bodies.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  // Multer errors (oversized file, fileFilter rejection) are a bad request, not a server fault.
  const isMulterError = err instanceof multer.MulterError || /image/i.test(err.message || "");
  const status = err.status || (isMulterError ? 400 : 500);
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
    code: err.code || (isMulterError ? "FILE_UPLOAD_ERROR" : "INTERNAL_ERROR"),
    // The frontend's translateApiError interpolates `params` into the translated message.
    ...(err.params ? { params: err.params } : {}),
  });
}

export default errorHandler;
