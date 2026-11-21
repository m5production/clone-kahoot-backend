import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { AuthService, type PublicUser, toPublicUser } from '../auth/auth.service'
import { hashPassword } from '../auth/password.util'

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async findPublic(id: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } })
    return user ? toPublicUser(user) : null
  }

  async update(id: string, name: string, password: string): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { name, passwordHash: await hashPassword(password) },
      })
      // a credentials update invalidates every existing session, including
      // the caller's — the client has to sign in again
      await this.auth.revokeAllUserSessions(id)
      return toPublicUser(user)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('There is a user with such a name. Please make a unique name')
      }
      if ((error as { code?: string }).code === 'P2025') {
        throw new NotFoundException('User was not found')
      }
      throw error
    }
  }

  async delete(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException('User was not found')
    await this.prisma.user.delete({ where: { id } })
    return toPublicUser(user)
  }
}
