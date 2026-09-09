import {
  ArgumentsHost,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import type { ErrorResponse } from './error-response.js';

/**
 * PRD Requirement 14.3 — not-found responses are generic. A caller must not be
 * able to distinguish "no such route" from "no such record" from "not permitted
 * to see that record", because those differences describe the record set.
 */
describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  let header: ReturnType<typeof vi.fn>;

  const hostFor = (): ArgumentsHost => {
    const response = { status, json } as unknown as Response;
    const request = {
      method: 'GET',
      url: '/api/v1/anything',
      header,
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  };

  const bodyOf = (): ErrorResponse => json.mock.calls[0]?.[0] as ErrorResponse;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn().mockReturnValue({ json });
    header = vi.fn().mockReturnValue(undefined);
    filter = new AllExceptionsFilter();
    // Silence the deliberate server-side logging during assertions.
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('returns JSON, never an HTML error page', () => {
    filter.catch(new NotFoundException(), hostFor());

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(bodyOf().error.message).toBe('No matching resource was found.');
  });

  it('does not leak the framework or the requested path', () => {
    // Express's default page returns "Cannot GET /api/v1/...", which announces
    // both the framework and the exact path probed.
    filter.catch(new NotFoundException(), hostFor());

    const serialised = JSON.stringify(bodyOf());
    expect(serialised).not.toMatch(/express|cannot get|\/api\/v1\/anything/i);
  });

  it('does not leak an internal error message or stack', () => {
    filter.catch(
      new Error('relation "member" does not exist at character 15'),
      hostFor(),
    );

    const serialised = JSON.stringify(bodyOf());
    expect(serialised).not.toMatch(/relation|member|character/i);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('gives forbidden and not-found distinguishable codes but generic messages', () => {
    // The status code must remain honest for clients and load balancers; it is
    // the *message* that carries no detail about why.
    filter.catch(
      new ForbiddenException('member 42 is out of your branch'),
      hostFor(),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(JSON.stringify(bodyOf())).not.toMatch(/42|branch/);
  });

  it('echoes a caller-supplied request id', () => {
    header.mockReturnValue('8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e');

    filter.catch(new NotFoundException(), hostFor());

    expect(bodyOf().error.requestId).toBe(
      '8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e',
    );
  });

  it('mints a request id when the caller supplies none', () => {
    filter.catch(new NotFoundException(), hostFor());

    // Every failure stays traceable to a log line even when the client omits it.
    expect(bodyOf().error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores an absurdly long caller-supplied request id', () => {
    header.mockReturnValue('x'.repeat(5000));

    filter.catch(new NotFoundException(), hostFor());

    expect(bodyOf().error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
