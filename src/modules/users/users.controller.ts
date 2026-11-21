import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { RateLimit } from '../../common/guards/rate-limit.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthService, type PublicUser } from '../auth/auth.service'
import { CurrentUser, SessionToken } from '../auth/current-user.decorator'
import { CredentialsDto } from '../auth/dto/credentials.dto'
import { UsersService } from './users.service'

interface AuthResponse {
  id: string
  name: string
  token: string
}

const toAuthResponse = ({ user, token }: { user: PublicUser; token: string }): AuthResponse => ({
  id: user.id,
  name: user.name,
  token,
})

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @UseGuards(RateLimit(20, 60))
  register(@Body() dto: CredentialsDto): Promise<AuthResponse> {
    return this.auth.register(dto.name, dto.password).then(toAuthResponse)
  }

  // the second bucket keys on the login name — unlike req.ip, a brute-forcing
  // client cannot rotate it through X-Forwarded-For
  @Post('auth')
  @HttpCode(200)
  @UseGuards(
    RateLimit(10, 60, (req) =>
      typeof req.body?.name === 'string' ? `name:${req.body.name.toLowerCase()}` : undefined,
    ),
  )
  login(@Body() dto: CredentialsDto): Promise<AuthResponse> {
    return this.auth.login(dto.name, dto.password).then(toAuthResponse)
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  logout(@SessionToken() token: string): Promise<void> {
    return this.auth.logout(token)
  }

  // declared before :id so the literal path wins
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async getById(@Param('id') id: string): Promise<PublicUser> {
    const user = await this.users.findPublic(id)
    if (!user) throw new NotFoundException('User was not found')
    return user
  }

  @Put(':id')
  @UseGuards(AuthGuard)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: CredentialsDto,
  ): Promise<PublicUser> {
    if (user.id !== id) throw new ForbiddenException('Cannot modify another user')
    return this.users.update(id, dto.name, dto.password)
  }

  @Delete(':id')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async delete(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<PublicUser> {
    if (user.id !== id) throw new ForbiddenException('Cannot delete another user')
    return this.users.delete(id)
  }
}
