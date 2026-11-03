import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiExceptionFilter,
  toValidationException,
} from './api-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const res = { headersSent: false, status: jest.fn(() => ({ json })) };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return {
    status: (res.status.mock.calls as unknown[][])[0][0],
    body: (json.mock.calls as unknown[][])[0][0],
  };
}

describe('ApiExceptionFilter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('keeps our own messages and returns only { message }', () => {
    expect(
      run(new BadRequestException('Vacation cannot start in the past')),
    ).toEqual({
      status: 400,
      body: { message: 'Vacation cannot start in the past' },
    });
  });

  it('rewords framework defaults', () => {
    expect(run(new UnauthorizedException()).body).toEqual({
      message: 'Your session has expired. Please sign in again.',
    });
    expect(run(new ForbiddenException('Forbidden resource')).body).toEqual({
      message: 'You do not have permission to do this.',
    });
  });

  it('never leaks unexpected errors', () => {
    expect(run(new Error('relation "x" does not exist'))).toEqual({
      status: 500,
      body: { message: 'Something went wrong on our side. Please try again.' },
    });
  });

  it('hides body parser and routing details', () => {
    const parseError = new BadRequestException(
      "Expected property name or '}' in JSON at position 1",
    );
    expect(run(parseError)).toEqual({
      status: 400,
      body: { message: 'This request could not be processed.' },
    });
    expect(run(new NotFoundException('Cannot GET /nope'))).toEqual({
      status: 404,
      body: { message: 'We could not find what you were looking for.' },
    });
  });
});

describe('toValidationException', () => {
  it('gives one readable message per field', () => {
    const exception = toValidationException([
      {
        property: 'emergency_contact_phone',
        constraints: {
          matches: 'emergency_contact_phone must be a valid phone number',
        },
      },
      {
        property: 'start_date',
        constraints: {
          matches: 'start_date must be a valid date',
          isIso8601: 'start_date must be a valid date',
        },
      },
    ]);

    expect(exception.getResponse()).toMatchObject({
      message: [
        'Emergency contact phone must be a valid phone number',
        'Start date must be a valid date',
      ],
    });
  });
});
