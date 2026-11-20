import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import { CredentialsDto } from '../auth/auth.controller'
import type { PublicUser } from '../auth/auth.service'
import { UsersService } from './users.service'

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
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
