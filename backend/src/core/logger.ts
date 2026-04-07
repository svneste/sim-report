// Тонкая обёртка над console — потом легко заменить на pino без правок вызовов.
export const logger = {
  info:  (...a: unknown[]) => console.log('[info]',  ...a),
  warn:  (...a: unknown[]) => console.warn('[warn]', ...a),
  error: (...a: unknown[]) => console.error('[error]', ...a),
  debug: (...a: unknown[]) => { if (process.env.DEBUG) console.log('[debug]', ...a) },
}
