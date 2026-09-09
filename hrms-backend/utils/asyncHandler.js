/**
 * Wraps an async Express handler so a rejected promise reaches next(), and
 * therefore the global error handler in index.js, instead of becoming an
 * unhandled rejection.
 *
 *   getAll: asyncHandler(async (req, res) => { ... }, 500),
 *
 * WHY THE SECOND ARGUMENT EXISTS.
 *
 * The controllers here were not written in the "catch and call next(err)"
 * style that a plain asyncHandler replaces. Every one of their catch blocks
 * built the response itself, and carried an HTTP status chosen per endpoint:
 *
 *   } catch (error) {
 *     res.status(404).json({ success: false, message: error.message,
 *                            code: error.code, params: error.params });
 *   }
 *
 * That status is not recoverable from the error — 91 of the 110
 * `new AppError(...)` throws in this repo pass no status argument. Wrapping
 * with a plain asyncHandler would have collapsed all of them to the global
 * handler's 500 default, silently turning documented 400/403/404/409
 * responses into server errors. So the status moves here, as the handler's
 * default, and nothing about the error objects had to change.
 *
 * The rule — "the error's own status wins, this default fills the gap" — is
 * not invented for the migration. 32 of the original catches already read
 * `res.status(error.status || 400)`; this generalises that idiom to all of
 * them. The other 84 hardcoded their status and ignored `error.status`, so
 * for those an AppError that explicitly asked for 404 inside a handler
 * defaulted to 400 now gets the 404 it asked for. That is the intended
 * convergence, and the 320 status assertions in tests/ pin it.
 *
 * `params` reaches the client because index.js's handler forwards it; the
 * frontend's translateApiError interpolates it into the translated message.
 */
export function asyncHandler(handler, defaultStatus = 500) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch((err) => {
      if (err && err.status == null) err.status = defaultStatus;
      next(err);
    });
}

export default asyncHandler;
