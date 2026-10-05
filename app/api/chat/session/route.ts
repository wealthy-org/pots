import { chatHandlers } from '@/lib/chat-default'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export function POST(request: Request): Promise<Response> {
  return chatHandlers.session(request)
}
