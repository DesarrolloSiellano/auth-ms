import { BadRequestException } from '@nestjs/common';
import { ParamFormatGuard } from './param-format.guard';
import { ParamFormatRule } from '../decorators/param-format.decorator';

function httpContext(params: Record<string, any>): any {
  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  };
}

function guardFor(rules: ParamFormatRule[]): ParamFormatGuard {
  const reflector: any = {
    getAllAndOverride: jest.fn().mockReturnValue(rules),
  };
  return new ParamFormatGuard(reflector);
}

describe('ParamFormatGuard', () => {
  it('permite un ObjectId válido', () => {
    const g = guardFor([{ param: 'id', kind: 'objectId' }]);
    expect(
      g.canActivate(httpContext({ id: '507f1f77bcf86cd799439011' })),
    ).toBe(true);
  });

  it('rechaza un ObjectId inválido con 400', () => {
    const g = guardFor([{ param: 'id', kind: 'objectId' }]);
    expect(() => g.canActivate(httpContext({ id: 'no-es-id' }))).toThrow(
      BadRequestException,
    );
  });

  it('permite un token seguro y rechaza caracteres raros', () => {
    const g = guardFor([{ param: 'key', kind: 'token' }]);
    expect(g.canActivate(httpContext({ key: 'features.pbx' }))).toBe(true);
    expect(() =>
      g.canActivate(httpContext({ key: 'a;DROP' })),
    ).toThrow(BadRequestException);
  });

  it('no valida si no hay reglas o el param no viene', () => {
    expect(guardFor([]).canActivate(httpContext({ id: 'x' }))).toBe(true);
    const g = guardFor([{ param: 'id', kind: 'objectId' }]);
    expect(g.canActivate(httpContext({}))).toBe(true);
  });
});
