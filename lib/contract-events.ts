import { parseAbiItem } from 'viem'

export const entryPlacedEvent = parseAbiItem(
  'event EntryPlaced(uint256 indexed roundId, address indexed wallet, uint8[] squareIds, uint256 amountPerSquare, uint256 total)',
)
export const rewardClaimedEvent = parseAbiItem(
  'event RewardClaimed(uint256 indexed roundId, address indexed wallet, uint8 kind, uint256 amount)',
)
export const refundClaimedEvent = parseAbiItem(
  'event RefundClaimed(uint256 indexed roundId, address indexed wallet, uint256 amount)',
)
export const roundSettledEvent = parseAbiItem(
  'event RoundSettled(uint256 indexed roundId, uint8 winningSquare, uint256 totalEth, uint256 winningSquareEth, uint256 pool, uint256 rolloverOut, bool jackpotHit)',
)
export const jackpotPaidEvent = parseAbiItem(
  'event JackpotPaid(uint256 indexed roundId, uint256 amount)',
)
