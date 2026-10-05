import { chatHandlers } from '@/lib/chat-default'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export function GET(request: Request): Promise<Response> {
  return chatHandlers.profile(request)
}

export function PUT(request: Request): Promise<Response> {
  return chatHandlers.profile(request)
}

export function DELETE(request: Request): Promise<Response> {
  return chatHandlers.profile(request)
}
