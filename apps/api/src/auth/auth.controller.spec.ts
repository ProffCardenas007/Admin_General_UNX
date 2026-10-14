import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('logs in with the body credentials and the client IP', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({ accessToken: 't' }),
    };
    const controller = new AuthController(authService as any);

    const dto = { email: 'ana@unx.mx', password: 'x' };
    const result = await controller.login(dto as any, { ip: '10.0.0.7' } as any);

    expect(authService.login).toHaveBeenCalledWith(dto, '10.0.0.7');
    expect(result).toEqual({ accessToken: 't' });
  });
});
