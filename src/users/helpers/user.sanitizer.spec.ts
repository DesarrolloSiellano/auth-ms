import { toPublicUser } from './user.sanitizer';

describe('toPublicUser', () => {
  it('elimina campos sensibles del usuario', () => {
    const user = {
      _id: 'abc',
      name: 'Juan',
      email: 'juan@mail.com',
      password: 'hash',
      passwordResetToken: 'token',
      passwordResetExpires: new Date(),
    };

    const result = toPublicUser(user as any);

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordResetToken');
    expect(result).not.toHaveProperty('passwordResetExpires');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('email');
  });

  it('no muta el objeto original', () => {
    const user: any = { _id: 'abc', password: 'hash' };
    const result = toPublicUser(user);

    expect(result).not.toHaveProperty('password');
    expect(user).toHaveProperty('password');
  });
});
