import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerHybridGuard } from './throttler-hybrid.guard';

describe('ThrottlerHybridGuard', () => {
  let guard: ThrottlerHybridGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      providers: [ThrottlerHybridGuard],
    }).compile();

    guard = module.get<ThrottlerHybridGuard>(ThrottlerHybridGuard);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('permite contextos RPC sin throttling', async () => {
    const ctx = { getType: () => 'rpc' };
    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
  });

  it('aplica throttling en contextos HTTP bajo el límite', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValue(true as any);

    const ctx = {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '10.0.0.1' }),
      }),
    };

    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  describe('getTracker', () => {
    it('usa el primer IP de x-forwarded-for', async () => {
      const tracker = await (guard as any).getTracker({
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      });
      expect(tracker).toBe('1.2.3.4');
    });

    it('maneja x-forwarded-for como arreglo', async () => {
      const tracker = await (guard as any).getTracker({
        headers: { 'x-forwarded-for': ['9.9.9.9', '8.8.8.8'] },
      });
      expect(tracker).toBe('9.9.9.9');
    });

    it('usa req.ip si no hay x-forwarded-for', async () => {
      const tracker = await (guard as any).getTracker({
        headers: {},
        ip: '7.7.7.7',
      });
      expect(tracker).toBe('7.7.7.7');
    });
  });
});
