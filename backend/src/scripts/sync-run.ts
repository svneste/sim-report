import { syncService } from '../modules/sync/sync.service.js'

const res = await syncService.run()
console.log(res)
process.exit(0)
