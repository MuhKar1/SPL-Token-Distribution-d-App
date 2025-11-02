import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

/**
 * Format a wallet address for display
 * @param address - PublicKey or string address
 * @param chars - Number of characters to show at start/end
 */
export const formatAddress = (address: PublicKey | string, chars = 4): string => {
  const addr = address.toString()
  return `${addr.substring(0, chars)}...${addr.substring(addr.length - chars)}`
}

/**
 * Safely format token amounts with proper decimal handling
 * Uses BigInt to avoid precision loss with large numbers
 * @param amount - BN amount in base units
 * @param decimals - Token decimals
 */
export const formatAmount = (amount: BN, decimals: number): string => {
  try {
    const raw = BigInt(amount.toString())
    const base = BigInt(10) ** BigInt(decimals)
    const whole = raw / base
    const fraction = raw % base

    if (fraction === BigInt(0)) {
      return whole.toLocaleString()
    }

    const fractionStr = fraction
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '')
    
    // Limit decimal display to 6 digits for readability
    const compactFraction = fractionStr.length > 6 
      ? `${fractionStr.slice(0, 6)}…` 
      : fractionStr

    return `${whole.toLocaleString()}.${compactFraction}`
  } catch (error) {
    console.error('Error formatting amount:', error)
    return '0'
  }
}

/**
 * Format Unix timestamp to readable date
 * @param timestamp - Unix timestamp in seconds
 */
export const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp || timestamp <= 0) return 'Never'
  try {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
  } catch (error) {
    return 'Invalid date'
  }
}

/**
 * Format cooldown duration in human-readable format
 * @param seconds - Duration in seconds
 */
export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return 'Ready'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
  
  return parts.join(' ')
}

/**
 * Validate that a string is a valid Solana public key
 * @param address - Address string to validate
 */
export const isValidPublicKey = (address: string): boolean => {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}
