/**
 * Claim Component
 *
 * This component provides the user interface for authorized claimers to receive tokens
 * from the SPL Token Distribution program. It handles:
 * - Token claiming with cooldown enforcement
 * - Real-time balance and claim history display
 * - Automatic associated token account creation
 * - Cooldown timer and claim availability checking
 * - Transaction processing and error handling
 *
 * Only whitelisted users (claimers) can access this interface.
 */

import { useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { BN, web3 } from '@coral-xyz/anchor'
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint
} from '@solana/spl-token'
import { useProgram } from '../hooks/useProgram'
import { formatAmount, formatTimestamp, formatDuration } from '../utils/formatters'
import {
  getStatePDA,
  getClaimerPDA,
  getMintAuthorityPDA,
  TOKEN_DECIMALS_FALLBACK
} from '../utils/constants'
import { Loading } from './Loading'
import './Claim.css'

/**
 * TypeScript interface for program state data
 * Contains all the configuration and status information from the blockchain
 */
type ProgramState = {
  claimAmount: BN              // Number of tokens per claim
  claimCooldownSeconds: number // Cooldown period between claims
  isPaused: boolean           // Whether claiming is currently paused
  maxSupply: BN              // Maximum total tokens that can be minted
  totalMinted: BN            // Total tokens minted across all claims
  mint: web3.PublicKey        // Public key of the token mint
  decimals: number           // Number of decimal places for the token
}

/**
 * TypeScript interface for individual claimer state
 * Tracks a user's claiming activity and history
 */
type ClaimerState = {
  totalClaimed: BN           // Total tokens this user has claimed
  lastClaimTimestamp: number | null // Unix timestamp of last claim (null if never)
  history: Array<{           // Recent claim history
    amount: BN              // Amount claimed in this transaction
    timestamp: number       // When the claim occurred
  }>
}

/**
 * Main Claim component function
 * Provides the complete token claiming interface for authorized users
 */
export const Claim = () => {
  // ============================================================================
  // HOOKS & CONTEXT
  // ============================================================================

  const { program, programID } = useProgram()  // Anchor program instance and ID
  const wallet = useWallet()                   // Solana wallet connection
  const { connection } = useConnection()       // Solana RPC connection

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Loading and processing states
  const [loading, setLoading] = useState(true)         // Initial data loading
  const [refreshing, setRefreshing] = useState(false)  // Manual refresh in progress
  const [claiming, setClaiming] = useState(false)      // Claim transaction in progress
  const [error, setError] = useState<string | null>(null)     // Error messages
  const [success, setSuccess] = useState<string | null>(null) // Success messages

  // Program and user data states
  const [programState, setProgramState] = useState<ProgramState | null>(null) // Global program configuration
  const [claimerState, setClaimerState] = useState<ClaimerState | null>(null) // User's claiming data
  const [cooldownRemaining, setCooldownRemaining] = useState(0) // Seconds until next claim allowed
  const [tokenBalance, setTokenBalance] = useState<BN>(new BN(0)) // User's current token balance

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const userPublicKey = wallet.publicKey

  /**
   * Determines if the user can currently make a claim
   * Checks program status, cooldown, and user authorization
   */
  const canClaim = useMemo(() => {
    if (!programState || !claimerState) return false    // Data not loaded
    if (programState.isPaused) return false            // Program is paused
    if (cooldownRemaining > 0) return false            // Cooldown active
    return true                                        // All checks passed
  }, [programState, claimerState, cooldownRemaining])

  /**
   * Refresh all data from the blockchain
   * Fetches program state, user claimer data, token balance, and calculates cooldown
   * @param showSpinner - Whether to show loading spinner during refresh
   */
  const refreshData = async (showSpinner = true) => {
    if (!program || !userPublicKey || !programID) return

    if (showSpinner) setRefreshing(true)
    setError(null)

    try {
      // Fetch global program state
      const [statePda] = getStatePDA(programID)
      const stateAccount = await program.account.programState.fetch(statePda) as any

      // Get token decimals from mint info (fallback to default if unavailable)
      let decimals = TOKEN_DECIMALS_FALLBACK
      try {
        const mintInfo = await getMint(connection, stateAccount.mint)
        decimals = mintInfo.decimals
      } catch (e) {
        console.warn('Failed to fetch mint decimals:', e)
      }

      // Store program state with proper typing
      setProgramState({
        claimAmount: stateAccount.claimAmount as BN,
        claimCooldownSeconds: Number(stateAccount.claimCooldownSeconds),
        isPaused: stateAccount.isPaused,
        maxSupply: stateAccount.maxSupply as BN,
        totalMinted: stateAccount.totalMinted as BN,
        mint: stateAccount.mint,
        decimals
      })

      // Fetch user's claimer state (may not exist if not whitelisted)
      const [claimerPda] = getClaimerPDA(userPublicKey, programID)
      try {
        const claimerAccount = await program.account.claimerState.fetch(claimerPda) as any
        const lastClaim = Number(claimerAccount.lastClaimTimestamp)

        // Store claimer state with claim history
        setClaimerState({
          totalClaimed: claimerAccount.totalClaimed as BN,
          lastClaimTimestamp: lastClaim > 0 ? lastClaim : null,
          history: (claimerAccount.claimerHistory || [])
            .filter((e: any) => e.timestamp.toNumber() > 0)  // Filter valid entries
            .map((e: any) => ({
              amount: e.amount as BN,
              timestamp: e.timestamp.toNumber()
            }))
        })

        // Calculate remaining cooldown time
        const now = Math.floor(Date.now() / 1000)
        const elapsed = now - (lastClaim > 0 ? lastClaim : 0)
        const remaining = Math.max(0, Number(stateAccount.claimCooldownSeconds) - elapsed)
        setCooldownRemaining(remaining)
      } catch (e) {
        // User is not registered as a claimer
        setClaimerState(null)
        setCooldownRemaining(0)
      }

      // Fetch user's token balance
      try {
        const ata = getAssociatedTokenAddressSync(stateAccount.mint, userPublicKey)
        const tokenAccount = await getAccount(connection, ata)
        setTokenBalance(new BN(tokenAccount.amount.toString()))
      } catch (e) {
        // No token account exists yet
        setTokenBalance(new BN(0))
      }
    } catch (e: any) {
      console.error('Failed to refresh:', e)
      setError(e.message || 'Failed to load data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Load initial data when component mounts or dependencies change
   * Automatically fetches program and user data when wallet connects
   */
  useEffect(() => {
    if (program && userPublicKey && programID) {
      refreshData()
    } else {
      setLoading(false)
    }
  }, [program, userPublicKey, programID])

  /**
   * Countdown timer for cooldown period
   * Updates cooldown remaining every second when active
   */
  useEffect(() => {
    if (cooldownRemaining <= 0) return
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownRemaining])

  // ============================================================================
  // CLAIM HANDLING
  // ============================================================================

  /**
   * Execute a token claim transaction
   * Handles associated token account creation, transaction building, and submission
   */
  const handleClaim = async () => {
    if (!program || !userPublicKey || !programID || claiming) return

    setClaiming(true)
    setError(null)
    setSuccess(null)

    try {
      // Derive all necessary PDAs
      const [statePda] = getStatePDA(programID)
      const [claimerPda] = getClaimerPDA(userPublicKey, programID)
      const [mintAuthority] = getMintAuthorityPDA(programID)

      // Get program state for mint address
      const stateAccount = await program.account.programState.fetch(statePda) as any
      const mint = stateAccount.mint as web3.PublicKey
      const ata = getAssociatedTokenAddressSync(mint, userPublicKey)

      // Build transaction with optional ATA creation
      const tx = new web3.Transaction()

      // Check if associated token account exists, create if not
      try {
        await getAccount(connection, ata)
      } catch {
        // ATA doesn't exist, add creation instruction
        tx.add(
          createAssociatedTokenAccountInstruction(
            userPublicKey,      // Payer
            ata,               // ATA address
            userPublicKey,     // Owner
            mint,              // Mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        )
      }

      // Add the claim instruction
      const claimIx = await program.methods
        .claim()
        .accounts({
          state: statePda,
          claimerState: claimerPda,
          mint,
          mintAuthority,
          user: userPublicKey,
          userTokenAccount: ata,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY
        })
        .instruction()

      tx.add(claimIx)

      // Get recent blockhash for transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.feePayer = userPublicKey

      // Send and confirm transaction
      const signature = await wallet.sendTransaction(tx, connection, {
        skipPreflight: false,
        maxRetries: 3
      })

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed')

      // Success handling
      setSuccess(`✓ Success! Tx: ${signature.slice(0, 8)}...`)
      await refreshData(false)  // Refresh data without spinner
    } catch (e: any) {
      console.error('Claim failed:', e)
      setError(e.message || 'Transaction failed')
    } finally {
      setClaiming(false)
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  // Show wallet connection prompt if not connected
  if (!userPublicKey) {
    return (
      <div className="claim-container">
        <div className="claim-card">
          <h2>Claim Tokens</h2>
          <p>Please connect your wallet</p>
        </div>
      </div>
    )
  }

  // Show loading spinner during initial data fetch
  if (loading) {
    return (
      <div className="claim-container">
        <div className="claim-card">
          <Loading />
        </div>
      </div>
    )
  }

  // Show error if program state couldn't be loaded
  if (!programState) {
    return (
      <div className="claim-container">
        <div className="claim-card">
          <h2>Error</h2>
          <p>Program unavailable</p>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  // Show registration prompt if user is not whitelisted
  if (!claimerState) {
    return (
      <div className="claim-container">
        <div className="claim-card">
          <h2>Not Registered</h2>
          <p>You are not registered as a claimer</p>
          <button onClick={() => refreshData()} disabled={refreshing}>
            {refreshing ? 'Checking...' : 'Check Again'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // MAIN CLAIM INTERFACE
  // ============================================================================

  return (
    <div className="claim-container">
      <div className="claim-card">
        {/* Header with refresh button */}
        <div className="card-header">
          <h2>Claim Tokens</h2>
          <button onClick={() => refreshData()} disabled={refreshing}>
            {refreshing ? '⟳' : '↻'}
          </button>
        </div>

        {/* Statistics Grid - Shows key information */}
        <div className="stats-grid">
          <div className="stat-box">
            <span className="stat-label">Claim Amount</span>
            <span className="stat-value">
              {formatAmount(programState.claimAmount, programState.decimals)}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Cooldown</span>
            <span className="stat-value">{formatDuration(cooldownRemaining)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Total Claimed</span>
            <span className="stat-value">
              {formatAmount(claimerState.totalClaimed, programState.decimals)}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Your Balance</span>
            <span className="stat-value">
              {formatAmount(tokenBalance, programState.decimals)}
            </span>
          </div>
        </div>

        {/* Status Alerts */}
        {programState.isPaused && (
          <div className="alert warning">⚠️ Program paused</div>
        )}

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        {/* Main Claim Button */}
        <button
          onClick={handleClaim}
          disabled={!canClaim || claiming}
          className={!canClaim ? 'disabled' : ''}
        >
          {claiming ? 'Processing...' : canClaim ? 'Claim Tokens' : 'Unavailable'}
        </button>

        {/* Claim History Section - Shows recent claims */}
        {claimerState.history.length > 0 && (
          <div className="history">
            <h3>Recent Claims</h3>
            {claimerState.history.slice(-5).reverse().map((entry, idx) => (
              <div key={idx} className="history-item">
                <span>{formatAmount(entry.amount, programState.decimals)}</span>
                <span>{formatTimestamp(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
