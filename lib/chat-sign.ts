/** The text the wallet signs. The server and the client build it from the same template. */
export function signInMessage(input: {
  wallet: string
  chainId: number
  issuedAt: string
}): string {
  return [
    'POTS chat sign-in',
    `Wallet: ${input.wallet}`,
    `Chain: ${input.chainId}`,
    `Issued: ${input.issuedAt}`,
  ].join('\n')
}
