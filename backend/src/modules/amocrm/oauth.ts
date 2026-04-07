import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { tokensRepo, type StoredTokens } from './tokens.repo.js'

interface AmoTokenResponse {
  token_type:    'Bearer'
  expires_in:    number
  access_token:  string
  refresh_token: string
}

const baseUrl = () => `https://${config.AMOCRM_SUBDOMAIN}.amocrm.ru`

async function exchange(payload: Record<string, string>): Promise<StoredTokens> {
  const res = await fetch(`${baseUrl()}/oauth2/access_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`amoCRM OAuth error ${res.status}: ${text}`)
  }
  const data = await res.json() as AmoTokenResponse
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    new Date(Date.now() + data.expires_in * 1000),
  }
}

/**
 * Первичный обмен authorization_code на токены. Запускается один раз вручную.
 */
export async function bootstrapTokensFromAuthCode(): Promise<StoredTokens> {
  if (!config.AMOCRM_AUTH_CODE) throw new Error('AMOCRM_AUTH_CODE is empty')
  const tokens = await exchange({
    client_id:     config.AMOCRM_CLIENT_ID,
    client_secret: config.AMOCRM_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code:          config.AMOCRM_AUTH_CODE,
    redirect_uri:  config.AMOCRM_REDIRECT_URI,
  })
  await tokensRepo.save(config.AMOCRM_SUBDOMAIN, tokens)
  logger.info('amoCRM tokens bootstrapped')
  return tokens
}

async function refresh(refreshToken: string): Promise<StoredTokens> {
  const tokens = await exchange({
    client_id:     config.AMOCRM_CLIENT_ID,
    client_secret: config.AMOCRM_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    redirect_uri:  config.AMOCRM_REDIRECT_URI,
  })
  await tokensRepo.save(config.AMOCRM_SUBDOMAIN, tokens)
  logger.info('amoCRM tokens refreshed')
  return tokens
}

/**
 * Главный entry-point: возвращает валидный access_token, при необходимости рефрешит.
 */
export async function getAccessToken(): Promise<string> {
  let tokens = await tokensRepo.get(config.AMOCRM_SUBDOMAIN)
  if (!tokens) {
    tokens = await bootstrapTokensFromAuthCode()
  }
  // 60s safety margin
  if (tokens.expiresAt.getTime() - Date.now() < 60_000) {
    tokens = await refresh(tokens.refreshToken)
  }
  return tokens.accessToken
}
