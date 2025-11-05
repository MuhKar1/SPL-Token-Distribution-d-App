/**
 * Custom React Hook for Anchor Program Integration
 *
 * This hook provides a convenient interface to interact with the SPL Token
 * Distribution smart contract using Anchor framework. It handles:
 * - Wallet connection and provider setup
 * - Program instantiation with proper IDL
 * - Memoized program instance to prevent unnecessary re-creation
 *
 * Returns null values when wallet is not connected, ensuring safe usage.
 */

import { useMemo } from 'react'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor'
import type { Token } from '../../../target/types/token'
import idl from '../idl/token.json'

// Build Anchor-compatible IDL from the generated IDL JSON
// The IDL contains all program instructions, accounts, and types
const anchorIdl = idl as Token

// Program ID from the deployed contract address
const programID = new web3.PublicKey(idl.address)

/**
 * Custom hook that provides Anchor program instance and related utilities
 *
 * @returns Object containing:
 * - program: Anchor Program instance (null if wallet not connected)
 * - provider: Anchor Provider instance (null if wallet not connected)
 * - programID: Public key of the deployed program
 */
export const useProgram = () => {
  const { connection } = useConnection()  // Solana RPC connection
  const wallet = useAnchorWallet()        // Connected wallet (Anchor-compatible)

  /**
   * Memoized Anchor provider
   * Only recreates when connection or wallet changes
   * Returns null if no wallet is connected
   */
  const provider = useMemo(() => {
    if (!wallet) return null
    return new AnchorProvider(
      connection,                           // RPC connection
      wallet,                              // Wallet adapter
      AnchorProvider.defaultOptions()      // Default commitment levels
    )
  }, [connection, wallet])

  /**
   * Memoized Anchor program instance
   * Only recreates when provider changes
   * Returns null if no provider is available
   */
  const program = useMemo(() => {
    if (!provider) return null
    return new Program(anchorIdl, provider) as any
  }, [provider])

  return { program, provider, programID }
}
