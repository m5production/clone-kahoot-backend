import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/modules/auth/password.util'

const prisma = new PrismaClient()

// Local development seed only. Passwords are disposable dev credentials,
// never reuse them outside a throwaway database.
const main = async () => {
  const [host, player] = await Promise.all([
    prisma.user.upsert({
      where: { name: 'host' },
      update: {},
      create: { name: 'host', passwordHash: await hashPassword('host-dev') },
    }),
    prisma.user.upsert({
      where: { name: 'player' },
      update: {},
      create: { name: 'player', passwordHash: await hashPassword('player-dev') },
    }),
  ])

  const game = await prisma.game.upsert({
    where: { id: 'dev-seed-game' },
    update: {},
    create: { id: 'dev-seed-game', adminId: host.id, title: 'Dev quiz' },
  })

  const questionData = [
    { order: 1, text: '2 + 2 = ?', answers: ['4', 'four'] },
    { order: 2, text: 'Capital of France?', answers: ['Paris'] },
  ]

  for (const q of questionData) {
    const question = await prisma.question.upsert({
      where: { gameId_order: { gameId: game.id, order: q.order } },
      update: { text: q.text },
      create: { gameId: game.id, order: q.order, text: q.text },
    })
    await prisma.acceptedAnswer.deleteMany({ where: { questionId: question.id } })
    await prisma.acceptedAnswer.createMany({
      data: q.answers.map((text) => ({ questionId: question.id, text })),
    })
  }

  console.log(`Seeded host=${host.name}, player=${player.name}, game=${game.id}`)
}

main().finally(() => prisma.$disconnect())
