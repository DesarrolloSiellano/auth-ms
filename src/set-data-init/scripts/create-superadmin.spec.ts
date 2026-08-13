import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { main } from './create-superadmin';

jest.mock('mongoose', () => ({
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    connection: { db: { collection: jest.fn() } },
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

jest.mock('dotenv', () => ({ config: jest.fn() }));

const companiesCollection = {
  findOne: jest.fn(),
  insertOne: jest.fn().mockResolvedValue({ insertedId: 'company-1' }),
};
const usersCollection = {
  findOne: jest.fn(),
  insertOne: jest.fn().mockResolvedValue({}),
};
const emptyFind = { find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }) };

describe('create-superadmin', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.MONGO_URI = 'mongodb://localhost/test';
    process.env.ADMIN_EMAIL = 'admin@empresa.com';
    process.env.ADMIN_PASSWORD = 'clave-fuerte';

    const db = mongoose.connection.db as any;
    db.collection.mockImplementation((name: string) => {
      if (name === 'companies') return companiesCollection;
      if (name === 'users') return usersCollection;
      return emptyFind;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sale con error si faltan variables obligatorias', async () => {
    delete process.env.ADMIN_PASSWORD;
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('exit'); }) as any);

    await expect(main()).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('crea la compañía BPONET si no existe y crea el superadmin', async () => {
    companiesCollection.findOne.mockResolvedValue(null);
    usersCollection.findOne.mockResolvedValue(null);

    await main();

    expect(companiesCollection.insertOne).toHaveBeenCalled();
    expect(bcrypt.hash).toHaveBeenCalledWith('clave-fuerte', 10);
    expect(usersCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@empresa.com',
        password: 'hashed-password',
        isSuperAdmin: true,
        isAdmin: true,
        isNewUser: true,
        company: 'BPONET',
      }),
    );
    expect(mongoose.disconnect).toHaveBeenCalled();
  });

  it('reutiliza la compañía existente y no duplica al usuario', async () => {
    companiesCollection.findOne.mockResolvedValue({ _id: 'existing-company' });
    usersCollection.findOne.mockResolvedValue({ _id: 'existing-user' });

    await main();

    expect(companiesCollection.insertOne).not.toHaveBeenCalled();
    expect(usersCollection.insertOne).not.toHaveBeenCalled();
    expect(mongoose.disconnect).toHaveBeenCalled();
  });

  it('usa ADMIN_NAME/ADMIN_LASTNAME/ADMIN_USERNAME si se definen', async () => {
    companiesCollection.findOne.mockResolvedValue({ _id: 'existing-company' });
    usersCollection.findOne.mockResolvedValue(null);
    process.env.ADMIN_NAME = 'Root';
    process.env.ADMIN_LASTNAME = 'System';
    process.env.ADMIN_USERNAME = 'root';

    await main();

    expect(usersCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Root',
        lastName: 'System',
        username: 'root',
      }),
    );
  });
});
