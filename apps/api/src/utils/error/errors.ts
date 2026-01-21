export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public name: string = "AppError",
  ) {
    super(message);
    this.name = name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request") {
    super(message, 400, "BadRequestError");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UnauthorizedError");
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message: string = "Invalid credentials") {
    super(message, 401, "InvalidCredentialsError");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "ForbiddenError");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NotFoundError");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(message, 409, "ConflictError");
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation error") {
    super(message, 422, "ValidationError");
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error") {
    super(message, 500, "InternalServerError");
  }
}
