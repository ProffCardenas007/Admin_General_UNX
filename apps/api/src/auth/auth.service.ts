import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { normalizeLeadSpecialties } from '../common/specialties';

@Injectable()
export class AuthService {
  private readonly failedAttempts = new Map<
    string,
    { count: number; firstFailureAt: number; blockedUntil?: number }
  >();
  private readonly maxFailedAttempts = 5;
  private readonly failureWindowMs = 15 * 60 * 1000;
  private readonly blockDurationMs = 15 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto, clientIp?: string) {
    const attemptKey = this.getAttemptKey(dto.email, clientIp);
    this.assertLoginAllowed(attemptKey);
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || !user.isActive) {
      this.recordFailedAttempt(attemptKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = user.passwordHash
      ? await compare(dto.password, user.passwordHash)
      : false;

    if (!isValid) {
      this.recordFailedAttempt(attemptKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.failedAttempts.delete(attemptKey);

    const specialties = normalizeLeadSpecialties(
      user.specialties ?? user.specialty,
    );
    const specialty = specialties[0] ?? null;

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      specialty,
      specialties,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        specialty,
        specialties,
      },
    };
  }

  private getAttemptKey(email: string, clientIp?: string) {
    return `${clientIp ?? 'unknown'}:${email.trim().toLowerCase()}`;
  }

  private assertLoginAllowed(attemptKey: string) {
    const attempt = this.failedAttempts.get(attemptKey);
    if (!attempt) {
      return;
    }

    const now = Date.now();
    if (attempt.blockedUntil && attempt.blockedUntil > now) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (attempt.firstFailureAt + this.failureWindowMs <= now) {
      this.failedAttempts.delete(attemptKey);
    }
  }

  private recordFailedAttempt(attemptKey: string) {
    const now = Date.now();
    const current = this.failedAttempts.get(attemptKey);
    const attempt =
      !current || current.firstFailureAt + this.failureWindowMs <= now
        ? { count: 1, firstFailureAt: now }
        : { ...current, count: current.count + 1 };

    if (attempt.count >= this.maxFailedAttempts) {
      attempt.blockedUntil = now + this.blockDurationMs;
    }
    this.failedAttempts.set(attemptKey, attempt);
  }
}
