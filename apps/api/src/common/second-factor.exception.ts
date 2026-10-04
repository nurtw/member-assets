import { HttpException, HttpStatus } from '@nestjs/common';

import type { ValidationIssue } from './error-response.js';

/**
 * A sign-in that needs the second factor, or whose code was not accepted
 * (item 28).
 *
 * Answers 401 like every other failed sign-in, and names the `code` field so
 * the form can ask for it. It is raised only once the password has been
 * accepted, so it tells a caller nothing they could not already see: that the
 * password they hold is right.
 */
export class SecondFactorRequiredException extends HttpException {
  override readonly name = 'SecondFactorRequiredException';

  constructor(readonly issues: readonly ValidationIssue[]) {
    super('Second factor required', HttpStatus.UNAUTHORIZED);
  }
}
