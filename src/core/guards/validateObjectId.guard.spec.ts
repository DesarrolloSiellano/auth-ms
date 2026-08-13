import { BadRequestException } from '@nestjs/common';
import { ValidateObjectIdGuard } from './validateObjectId.guard';

describe('ValidateObjectIdGuard', () => {
  let guard: ValidateObjectIdGuard;

  beforeEach(() => {
    guard = new ValidateObjectIdGuard();
  });

  function context(params: any): any {
    return {
      switchToHttp: () => ({ getRequest: () => ({ params }) }),
    };
  }

  it('permite un ObjectId válido', () => {
    expect(
      guard.canActivate(context({ id: '67f6c8a9b12d4a0012345678' })),
    ).toBe(true);
  });

  it('lanza BadRequest si el id no es un ObjectId válido', () => {
    expect(() =>
      guard.canActivate(context({ id: 'no-es-un-id' })),
    ).toThrow(BadRequestException);
  });

  it('lanza BadRequest si falta el id', () => {
    expect(() => guard.canActivate(context({}))).toThrow(
      BadRequestException,
    );
  });
});
