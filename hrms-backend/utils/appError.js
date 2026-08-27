export class AppError extends Error {
  constructor(message, code, params, status) {
    super(message);
    this.code = code;
    if (params) this.params = params;
    if (status) this.status = status;
  }
}
