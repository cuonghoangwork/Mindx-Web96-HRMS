/**
 * Routes a rejected handler promise to the global error handler. The second
 * argument is the status an error gets when it carries none — the error's
 * own status always wins:
 *
 *   getAll: asyncHandler(async (req, res) => { ... }, 500),
 *
 * It exists because most `new AppError(...)` throws in this codebase pass no
 * status; the per-endpoint default is what keeps them 400/403/404 rather
 * than collapsing to 500. The 320 status assertions in tests/ pin this.
 */
export function asyncHandler(handler, defaultStatus = 500) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch((err) => {
      if (err && err.status == null) err.status = defaultStatus;
      next(err);
    });
}

export default asyncHandler;
