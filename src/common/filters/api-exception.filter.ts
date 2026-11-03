import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
} from '@nestjs/common';
import type { Response } from 'express';

const SERVER_ERROR = 'Something went wrong on our side. Please try again.';
const BAD_REQUEST = 'This request could not be processed.';
const NOT_FOUND = 'We could not find what you were looking for.';

/** Framework default messages, reworded because the UI shows them as-is. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  Unauthorized: 'Your session has expired. Please sign in again.',
  'Forbidden resource': 'You do not have permission to do this.',
  'Validation failed (uuid is expected)': 'This link is not valid.',
};

/** Text Nest passes through from the JSON body parser. */
const BODY_PARSE_ERROR = /\bJSON\b/;
/** Nest's "Cannot GET /path" for routes that do not exist. */
const UNKNOWN_ROUTE = /^Cannot [A-Z]+ \//;

const FIELD_LABELS: Record<string, string> = {
  country_code: 'Country',
  delegate_id: 'Delegate',
  member_ids: 'Members',
  from: 'Start of the range',
  to: 'End of the range',
};

function fieldLabel(property: string): string {
  const words = property.replace(/_/g, ' ');
  return (
    FIELD_LABELS[property] ?? words.charAt(0).toUpperCase() + words.slice(1)
  );
}

/** One readable message per invalid field, e.g. "Start date must be a ...". */
export function toValidationException(
  errors: ValidationError[],
): BadRequestException {
  const messages = errors.flatMap((error) => {
    const [first] = Object.values(error.constraints ?? {});
    if (!first) return [];
    // Only "$property ..." messages name the field; custom ones are left alone.
    return first.startsWith(error.property)
      ? [fieldLabel(error.property) + first.slice(error.property.length)]
      : [first];
  });
  return new BadRequestException(messages);
}

/** Every error leaves the API as `{ message: string | string[] }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    const { status, message } = this.describe(exception);
    res.status(status).json({ message });
  }

  private describe(exception: unknown): {
    status: number;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) return this.serverError(exception);
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message;
      return { status, message: this.friendly(message ?? exception.message) };
    }
    return this.serverError(exception);
  }

  private friendly(message: string | string[]): string | string[] {
    if (Array.isArray(message)) return message;
    if (BODY_PARSE_ERROR.test(message)) return BAD_REQUEST;
    if (UNKNOWN_ROUTE.test(message)) return NOT_FOUND;
    return FRIENDLY_MESSAGES[message] ?? message;
  }

  private serverError(exception: unknown) {
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception) : exception,
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: SERVER_ERROR,
    };
  }
}
