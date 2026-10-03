import { keeperHandlers } from '@/lib/keeper-default'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export function GET(request: Request): Promise<Response> {
  return keeperHandlers.get(request)
}
