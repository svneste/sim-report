import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { bitrix24UsersService } from './bitrix24-users.service.js'

/**
 * Принимает сырых юзеров Bitrix24 (как их отдаёт user.get через BX24.callMethod)
 * и проставляет аватарки в amocrm_users по совпадению ФИО.
 *
 * Запрос инициирует фронт по кнопке "Обновить" — он сидит в iframe Bitrix24,
 * имеет доступ к BX24.js и сам тянет user.get с пагинацией. Бэкенду
 * не нужны ни OAuth, ни вебхуки — он только сопоставляет имена.
 */
const bodySchema = z.object({
  users: z.array(z.object({
    ID:             z.union([z.string(), z.number()]),
    NAME:           z.string().nullable().optional(),
    LAST_NAME:      z.string().nullable().optional(),
    SECOND_NAME:    z.string().nullable().optional(),
    PERSONAL_PHOTO: z.string().nullable().optional(),
  })),
})

export const bitrix24UsersRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/users/avatars-from-bitrix', async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid body', details: parsed.error.flatten() }
    }
    const result = await bitrix24UsersService.syncAvatars(parsed.data.users)
    return result
  })
}
