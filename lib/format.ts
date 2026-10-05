export function shortenAddress(address: string): string {
  if (address.length < 10) {
    return address
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/** Sub label of the jackpot stat: how long ago the last hit was, when the indexer knows it. */
export function roundsAgoLabel(roundsAgo: number | null | undefined): string {
  if (roundsAgo === undefined || roundsAgo === null || roundsAgo < 0) {
    return 'Current jackpot'
  }
  if (roundsAgo === 0) {
    return 'Hit this round'
  }
  return `${roundsAgo} ${roundsAgo === 1 ? 'round' : 'rounds'} ago`
}

/** A stable warm hue from an address, so each wallet keeps its own avatar color. */
export function avatarHue(address: string): number {
  return 20 + (parseInt(address.slice(2, 6), 16) % 40)
}
