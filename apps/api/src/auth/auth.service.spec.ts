import { HttpException, UnauthorizedException } from '@nestjs/common';
import { hashSync } from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmailWithPassword: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let now: number;

  const user = {
    id: 'user-1',
    fullName: 'Ana Lider',
    email: 'ana@unx.mx',
    role: 'lead',
    isActive: true,
    passwordHash: hashSync('correcta-123', 4),
    specialties: ['edicion'],
    specialty: null,
  };

  const login = (password: string, ip = '10.0.0.1', email = 'ana@unx.mx') =>
    service.login({ email, password }, ip);

  beforeEach(() => {
    now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    usersService = { findByEmailWithPassword: jest.fn().mockResolvedValue(user) };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    service = new AuthService(usersService as any, jwtService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a token and the public user on valid credentials', async () => {
    const result = await login('correcta-123');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toMatchObject({
      id: 'user-1',
      email: 'ana@unx.mx',
      role: 'lead',
      specialties: ['edicion'],
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', role: 'lead', email: 'ana@unx.mx' }),
    );
  });

  it('rejects a wrong password, an unknown user and an inactive user the same way', async () => {
    await expect(login('mala')).rejects.toBeInstanceOf(UnauthorizedException);

    usersService.findByEmailWithPassword.mockResolvedValue(null);
    await expect(login('correcta-123', '10.0.0.2')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    usersService.findByEmailWithPassword.mockResolvedValue({ ...user, isActive: false });
    await expect(login('correcta-123', '10.0.0.3')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('blocks further attempts after 5 failures, even with the right password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(login('mala')).rejects.toBeInstanceOf(UnauthorizedException);
    }

    const blocked = await login('correcta-123').catch((error) => error);
    expect(blocked).toBeInstanceOf(HttpException);
    expect((blocked as HttpException).getStatus()).toBe(429);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('lets the user back in once the block expires', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login('mala').catch(() => undefined);
    }

    now += 16 * 60 * 1000;

    await expect(login('correcta-123')).resolves.toMatchObject({
      accessToken: 'signed.jwt.token',
    });
  });

  it('tracks failures per IP and email, not globally', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login('mala', '10.0.0.1').catch(() => undefined);
    }

    usersService.findByEmailWithPassword.mockImplementation(async (email: string) =>
      email === user.email ? user : null,
    );

    // Another IP is not blocked.
    await expect(login('correcta-123', '10.0.0.99')).resolves.toBeDefined();

    // Another email from the blocked IP is not blocked either: it fails as a
    // normal 401 (unknown user), not as a 429 lockout.
    const otherEmail = await login('correcta-123', '10.0.0.1', 'otra@unx.mx').catch(
      (error) => error,
    );
    expect(otherEmail).toBeInstanceOf(UnauthorizedException);
    expect((otherEmail as HttpException).getStatus()).toBe(401);
  });

  it('a successful login clears earlier failures', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login('mala').catch(() => undefined);
    }
    await login('correcta-123');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(login('mala')).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(login('correcta-123')).resolves.toBeDefined();
  });
});
