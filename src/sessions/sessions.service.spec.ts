import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { getModelToken } from '@nestjs/mongoose';

describe('SessionsService', () => {
  let service: SessionsService;

  const mockSessionModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };

  const mockConstructor: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  mockConstructor.findOne = mockSessionModel.findOne;
  mockConstructor.updateOne = mockSessionModel.updateOne;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: getModelToken('Session'), useValue: mockConstructor },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea una sesión nueva', async () => {
    const data = { user: 'abc123', refreshToken: 'hash' };
    const result = await service.createSession(data as any);

    expect(mockConstructor).toHaveBeenCalledWith(data);
    expect(result).toMatchObject(data);
  });

  it('busca una sesión activa por hash de refresh token', async () => {
    const session = { _id: 's1', refreshToken: 'hash', isActive: true };
    mockSessionModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(session) }),
    });

    await expect(service.findActiveByRefreshHash('hash')).resolves.toEqual(
      session,
    );
    expect(mockSessionModel.findOne).toHaveBeenCalledWith({
      refreshToken: 'hash',
      isActive: true,
    });
  });

  it('desactiva una sesión por hash de refresh token', async () => {
    mockSessionModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({}),
    });

    await service.deactivateByRefreshHash('hash');

    expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
      { refreshToken: 'hash', isActive: true },
      { isActive: false },
    );
  });
});
