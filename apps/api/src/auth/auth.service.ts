import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
	constructor(
		private readonly usersService: UsersService,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
	) {}

	async login(dto: LoginDto) {
		const user = await this.usersService.findByEmailWithPassword(dto.email);
		if (!user || !user.isActive) {
			throw new UnauthorizedException('Invalid credentials');
		}

		let isValid = false;

		if (user.passwordHash) {
			isValid = await compare(dto.password, user.passwordHash);
		} else {
			const demoPassword = this.configService.get<string>('AUTH_DEMO_PASSWORD', '123456');
			if (dto.password === demoPassword) {
				isValid = true;
				const newHash = await hash(dto.password, 10);
				await this.usersService.setPasswordHash(user.id, newHash);
			}
		}

		if (!isValid) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const accessToken = await this.jwtService.signAsync({
			sub: user.id,
			role: user.role,
			specialty: user.specialty,
			email: user.email,
		});

		return {
			accessToken,
			user: {
				id: user.id,
				fullName: user.fullName,
				email: user.email,
				role: user.role,
				specialty: user.specialty,
			},
		};
	}
}
