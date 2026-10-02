export const WEI_PER_ETH = 10n ** 18n

export function parseEthToWei(value: string): bigint | null {
  const trimmed = value.trim().replace(',', '.')
  if (!/^\d+(\.\d{0,18})?$/.test(trimmed)) {
    return null
  }
  const [whole, fraction = ''] = trimmed.split('.')
  const padded = fraction.padEnd(18, '0')
  return BigInt(whole) * WEI_PER_ETH + BigInt(padded)
}

export function formatWeiToEth(wei: bigint, maxDecimals = 5): string {
  const negative = wei < 0n
  const abs = negative ? -wei : wei
  const whole = abs / WEI_PER_ETH
  const fraction = (abs % WEI_PER_ETH).toString().padStart(18, '0')
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, '')
  const text = trimmed ? `${whole}.${trimmed}` : whole.toString()
  return negative ? `-${text}` : text
}

export function multiplyWei(amount: bigint, count: number): bigint {
  return amount * BigInt(count)
}
