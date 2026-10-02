export function shareAmount(pool: bigint, entry: bigint, totalOnSquare: bigint): bigint {
  if (totalOnSquare === 0n) {
    return 0n
  }
  return (pool * entry) / totalOnSquare
}

export function netEth(claimed: bigint, deposited: bigint): bigint {
  return claimed - deposited
}
