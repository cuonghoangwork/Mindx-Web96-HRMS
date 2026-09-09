import multer from "multer";

/**
 * The single Express error handler, shared by the real server (index.js) and
 * the test harness (tests/testHelpers.js createApp).
 *
 * WHY IT IS SHARED. It used to be written out twice: index.js had the real
 * one, and createApp had a "minimal error handler" that replied with only
 * `{ success, message }` — no `code`, no `params`. That divergence was
 * invisible while every controller built its own error response inside a
 * catch block, because the handler was never reached.
 *
 * Once the controllers moved to asyncHandler, this became the only thing
 * producing error responses, and the test app started returning bodies the
 * real server never would: the right status, but `code: undefined`. Tests
 * asserting `res.body.code` failed for a reason that did not exist in
 * production. One definition, used by both, is what stops that recurring.
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
    // AppError carries `params` for message interpolation, and the frontend's
    // translateApiError needs it to fill in leave types, position levels,
    // payroll statuses and field lists. Every controller catch used to
    // forward it; this handler must too, or a translated message renders with
    // holes where its values should be.
    ...(err.params ? { params: err.params } : {}),
  });
}

export default errorHandler;
