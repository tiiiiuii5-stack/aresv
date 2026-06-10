export class SecurityError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "security_error",
    public details?: Record<string, unknown>,
    public headers?: Headers,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}
