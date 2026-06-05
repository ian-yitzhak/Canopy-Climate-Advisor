// A client-safe error. Raw upstream bodies and stack traces are never attached;
// only a vetted message and a local HTTP status survive to the browser.

export class AdvisoryError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AdvisoryError";
    this.statusCode = statusCode;
  }
}

// Map an upstream WeatherAI status into a safe, readable message + local status.
export function mapUpstreamError(status: number): AdvisoryError {
  switch (status) {
    case 401:
      return new AdvisoryError("Service configuration error. Please try again later.", 500);
    case 403:
      return new AdvisoryError("This feature is not available on the current plan.", 403);
    case 429:
      return new AdvisoryError("The service is temporarily over quota. Try again later.", 429);
    case 400:
      return new AdvisoryError("The image or location could not be processed.", 400);
    default:
      return new AdvisoryError("The analysis service is unavailable. Please retry shortly.", 502);
  }
}
