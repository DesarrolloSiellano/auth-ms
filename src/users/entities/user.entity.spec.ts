import { hashPasswordIfModified } from './user.entity';

jest.mock('bcrypt', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('hashPasswordIfModified', () => {
  it('no hashea si la contraseña no fue modificada', async () => {
    const next = jest.fn();
    const doc = { isModified: jest.fn().mockReturnValue(false) };

    await hashPasswordIfModified.call(doc, next);

    expect(doc.isModified).toHaveBeenCalledWith('password');
    expect(next).toHaveBeenCalled();
  });

  it('hashea la contraseña cuando fue modificada', async () => {
    const next = jest.fn();
    const doc = {
      isModified: jest.fn().mockReturnValue(true),
      password: 'plain',
    };

    await hashPasswordIfModified.call(doc, next);

    expect(doc.password).toBe('hashed-password');
    expect(next).toHaveBeenCalled();
  });
});
