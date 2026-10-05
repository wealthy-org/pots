/**
 * The chat surface is shown only when the deployment has the database and the owner switched it on
 * (D-34). A build without the flag renders no chat control (parity rule).
 */
export const chatEnabled = process.env.NEXT_PUBLIC_CHAT_ENABLED === 'true'
