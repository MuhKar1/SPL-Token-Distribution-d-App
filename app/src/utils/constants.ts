import { web3 } from '@coral-xyz/anchor'
import { Buffer } from 'buffer'

// PDA Seeds (must match on-chain program)
export const STATE_SEED = Buffer.from('state')
export const CLAIMER_SEED = Buffer.from('claimer')
export const MINT_AUTHORITY_SEED = Buffer.from('mint_authority')
export const MINT_SEED = Buffer.from('mint')

// Token fallback decimals
export const TOKEN_DECIMALS_FALLBACK = 6

// System program IDs
export const SYSTEM_PROGRAM_ID = web3.SystemProgram.programId
export const RENT_SYSVAR_ID = web3.SYSVAR_RENT_PUBKEY

/**
 * Derive state PDA
 */
export const getStatePDA = (programId: web3.PublicKey): [web3.PublicKey, number] => {
  return web3.PublicKey.findProgramAddressSync([STATE_SEED], programId)
}

/**
 * Derive claimer PDA for a user
 */
export const getClaimerPDA = (
  userPublicKey: web3.PublicKey,
  programId: web3.PublicKey
): [web3.PublicKey, number] => {
  return web3.PublicKey.findProgramAddressSync(
    [CLAIMER_SEED, userPublicKey.toBuffer()],
    programId
  )
}

/**
 * Derive mint authority PDA
 */
export const getMintAuthorityPDA = (programId: web3.PublicKey): [web3.PublicKey, number] => {
  return web3.PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], programId)
}
