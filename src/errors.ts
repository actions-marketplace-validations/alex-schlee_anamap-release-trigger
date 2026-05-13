export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(`HTTP ${statusCode}: ${responseBody}`);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class DuplicateEventError extends Error {
  constructor() {
    super("Anamap returned 409 Conflict: duplicate event.");
    this.name = "DuplicateEventError";
  }
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}
