/**
 * Admin Dashboard Component
 *
 * This component provides a comprehensive administrative interface for managing
 * the SPL Token Distribution program. It allows the program admin to:
 * - View real-time program statistics and status
 * - Manage the whitelist of authorized claimers
 * - Control emergency pause/unpause functionality
 * - Update claim settings (amount and cooldown)
 * - Monitor claimer activity and history
 *
 * The dashboard is only accessible to the program administrator and provides
 * secure, user-friendly controls for all administrative operations.
 */

import { useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { BN, web3 } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { useProgram } from '../hooks/useProgram'
import { formatAmount, formatDuration, formatTimestamp, formatAddress, isValidPublicKey } from '../utils/formatters'
import { getStatePDA, TOKEN_DECIMALS_FALLBACK } from '../utils/constants'
import { Loading } from './Loading'
import './Admin.css'

/**
 * TypeScript interface for program state data
 * Mirrors the on-chain ProgramState struct with proper typing
 */
type ProgramState = {
  admin: PublicKey          // Public key of the program administrator
  claimAmount: BN           // Number of tokens per claim transaction
  claimCooldownSeconds: number  // Minimum seconds between claims
  isPaused: boolean         // Emergency pause status
  maxSupply: BN            // Maximum tokens that can ever be minted
  totalMinted: BN          // Total tokens minted across all claims
  mint: web3.PublicKey      // Public key of the token mint
}

/**
 * TypeScript interface for claimer information
 * Contains data about each whitelisted user and their claiming activity
 */
type ClaimerInfo = {
  address: PublicKey        // PDA address of the claimer state account
  user: PublicKey          // Public key of the whitelisted user
  totalClaimed: BN         // Total tokens claimed by this user
  lastClaimTimestamp: number  // Unix timestamp of last successful claim
}

/**
 * Main Admin component function
 * Provides the complete administrative dashboard interface
 */
export const Admin = () => {
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
  const [processing, setProcessing] = useState(false)  // Transaction processing
  const [error, setError] = useState<string | null>(null)     // Error messages
  const [success, setSuccess] = useState<string | null>(null) // Success messages

  // Program data states
  const [programState, setProgramState] = useState<ProgramState | null>(null) // Current program state
  const [isAdmin, setIsAdmin] = useState(false)        // Whether current user is admin
  const [claimers, setClaimers] = useState<ClaimerInfo[]>([]) // List of whitelisted claimers
  const [loadingClaimers, setLoadingClaimers] = useState(false) // Claimer list loading

  // Form input states
  const [newClaimerAddress, setNewClaimerAddress] = useState('')     // Address to add as claimer
  const [removeClaimerAddress, setRemoveClaimerAddress] = useState('') // Address to remove from claimers
  const [newClaimAmount, setNewClaimAmount] = useState('')           // New claim amount setting
  const [newCooldown, setNewCooldown] = useState('')                 // New cooldown setting

  /**
   * Refresh all program data from the blockchain
   * Fetches current program state and claimer list if user is admin
   */
  const refreshData = async () => {
    if (!program || !wallet.publicKey) return

    try {
      setRefreshing(true)
      setError(null)

      // Fetch program state from blockchain
      const [statePda] = getStatePDA(programID)
      const stateAccount = await program.account.programState.fetch(statePda) as any

      // Convert to typed ProgramState object
      const state: ProgramState = {
        admin: stateAccount.admin,
        claimAmount: stateAccount.claimAmount,
        claimCooldownSeconds: stateAccount.claimCooldownSeconds,
        isPaused: stateAccount.isPaused,
        maxSupply: stateAccount.maxSupply,
        totalMinted: stateAccount.totalMinted,
        mint: stateAccount.mint
      }

      setProgramState(state)
      // Check if current user is the program admin
      setIsAdmin(state.admin.toString() === wallet.publicKey.toString())

      // Pre-fill form with current values
      setNewClaimAmount(state.claimAmount.toString())
      setNewCooldown(state.claimCooldownSeconds.toString())

      // Fetch claimers if user is admin
      if (state.admin.toString() === wallet.publicKey.toString()) {
        await fetchClaimers()
      }
    } catch (err: any) {
      console.error('Error fetching state:', err)
      setError(`Failed to load program state: ${err.message}`)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  /**
   * Fetch all registered claimers from the blockchain
   * Uses Anchor's getAll method to retrieve all claimer state accounts
   */
  const fetchClaimers = async () => {
    if (!program) return

    try {
      setLoadingClaimers(true)

      // Use Anchor's getAll method to fetch all claimer accounts
      const allAccounts = await (program.account as any).claimerState.all()

      console.log('Found claimer accounts:', allAccounts.length)

      // Filter and map valid claimer accounts
      const claimerList: ClaimerInfo[] = allAccounts
        .filter((account: any) => {
          // Filter out any invalid or default accounts
          return account.account.user &&
                 account.account.user.toString() !== PublicKey.default.toString()
        })
        .map((account: any) => ({
          address: account.publicKey,                    // PDA address of claimer state
          user: account.account.user,                    // User's wallet address
          totalClaimed: account.account.totalClaimed,    // Total tokens claimed
          lastClaimTimestamp: account.account.lastClaimTimestamp, // Last claim time
        }))

      console.log('Valid claimers:', claimerList.length)

      // Sort by total claimed (descending) to show most active users first
      claimerList.sort((a, b) => Number(b.totalClaimed) - Number(a.totalClaimed))
      setClaimers(claimerList)
    } catch (err: any) {
      console.error('Error fetching claimers:', err)
      setError(`Failed to fetch claimers: ${err.message}`)
    } finally {
      setLoadingClaimers(false)
    }
  }

  /**
   * Add a new user to the claimer whitelist
   * Creates a claimer state account and authorizes the user to claim tokens
   */
  const handleAddClaimer = async () => {
    if (!program || !wallet.publicKey || !programState) return

    // Validate input address
    if (!isValidPublicKey(newClaimerAddress)) {
      setError('Invalid Solana address')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setSuccess(null)

      // Parse and validate the user address
      const userPubkey = new PublicKey(newClaimerAddress)

      // Derive PDAs for the transaction
      const [statePda] = getStatePDA(programID)
      const [claimerPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('claimer'), userPubkey.toBuffer()],
        programID
      )

      // Execute the add_claimer instruction
      const tx = await program.methods
        .addClaimer()
        .accounts({
          state: statePda,
          admin: wallet.publicKey,
          user: userPubkey,
          claimerState: claimerPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc()

      // Wait for confirmation
      await connection.confirmTransaction(tx, 'confirmed')
      setSuccess(`Claimer added successfully! TX: ${tx.slice(0, 8)}...`)
      setNewClaimerAddress('')

      // Refresh claimer list to show the new addition
      await fetchClaimers()

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      console.error('Error adding claimer:', err)
      setError(`Failed to add claimer: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  /**
   * Remove a user from the claimer whitelist
   * Closes their claimer state account and refunds the rent
   */
  const handleRemoveClaimer = async () => {
    if (!program || !wallet.publicKey || !programState) return

    if (!isValidPublicKey(removeClaimerAddress)) {
      setError('Invalid Solana address')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setSuccess(null)

      const userPubkey = new PublicKey(removeClaimerAddress)
      const [statePda] = getStatePDA(programID)
      const [claimerPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('claimer'), userPubkey.toBuffer()],
        programID
      )

      const tx = await program.methods
        .removeClaimer()
        .accounts({
          state: statePda,
          admin: wallet.publicKey,
          user: userPubkey,
          claimerState: claimerPda,
        })
        .rpc()

      await connection.confirmTransaction(tx, 'confirmed')
      setSuccess(`Claimer removed successfully! TX: ${tx.slice(0, 8)}...`)
      setRemoveClaimerAddress('')

      // Refresh claimer list to reflect the removal
      await fetchClaimers()

      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      console.error('Error removing claimer:', err)
      setError(`Failed to remove claimer: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  /**
   * Emergency pause the token distribution program
   * Stops all claiming activity until unpaused by admin
   */
  const handlePause = async () => {
    if (!program || !wallet.publicKey || !programState) return

    try {
      setProcessing(true)
      setError(null)
      setSuccess(null)

      const [statePda] = getStatePDA(programID)

      const tx = await program.methods
        .pause()
        .accounts({
          state: statePda,
          admin: wallet.publicKey,
        })
        .rpc()

      await connection.confirmTransaction(tx, 'confirmed')
      setSuccess('Program paused successfully!')

      await refreshData()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      console.error('Error pausing:', err)
      setError(`Failed to pause: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  /**
   * Unpause the token distribution program
   * Resumes normal claiming activity after an emergency pause
   */
  const handleUnpause = async () => {
    if (!program || !wallet.publicKey || !programState) return

    try {
      setProcessing(true)
      setError(null)
      setSuccess(null)

      const [statePda] = getStatePDA(programID)

      const tx = await program.methods
        .unpause()
        .accounts({
          state: statePda,
          admin: wallet.publicKey,
        })
        .rpc()

      await connection.confirmTransaction(tx, 'confirmed')
      setSuccess('Program unpaused successfully!')

      await refreshData()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      console.error('Error unpausing:', err)
      setError(`Failed to unpause: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  /**
   * Update program settings (claim amount and cooldown)
   * Program must be paused before settings can be changed
   */
  const handleUpdateSettings = async () => {
    if (!program || !wallet.publicKey || !programState) return

    const amount = parseInt(newClaimAmount)
    const cooldown = parseInt(newCooldown)

    if (isNaN(amount) || amount <= 0) {
      setError('Claim amount must be a positive number')
      return
    }

    if (isNaN(cooldown) || cooldown < 0) {
      setError('Cooldown must be a non-negative number')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setSuccess(null)

      const [statePda] = getStatePDA(programID)

      const tx = await program.methods
        .updateSettings(new BN(amount), new BN(cooldown))
        .accounts({
          state: statePda,
          admin: wallet.publicKey,
        })
        .rpc()

      await connection.confirmTransaction(tx, 'confirmed')
      setSuccess('Settings updated successfully!')

      await refreshData()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      console.error('Error updating settings:', err)
      setError(`Failed to update settings: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Load initial data when component mounts or dependencies change
   * Automatically fetches program state when wallet connects
   */
  useEffect(() => {
    if (program && wallet.publicKey) {
      refreshData()
    }
  }, [program, wallet.publicKey])

  // ============================================================================
  // RENDERING
  // ============================================================================

  // Show wallet connection prompt if not connected
  if (!wallet.connected) {
    return (
      <div className="admin-container">
        <div className="admin-card">
          <h2>Admin Dashboard</h2>
          <p className="info-text">Please connect your wallet to access admin functions</p>
        </div>
      </div>
    )
  }

  // Show loading spinner during initial data fetch
  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-card">
          <h2>Admin Dashboard</h2>
          <Loading />
        </div>
      </div>
    )
  }

  // Show error state if program state couldn't be loaded
  if (!programState) {
    return (
      <div className="admin-container">
        <div className="admin-card">
          <h2>Error</h2>
          <p>Failed to load program state</p>
          {error && <div className="alert error">{error}</div>}
          <button onClick={() => refreshData()} disabled={refreshing}>
            {refreshing ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  // Show access denied if user is not the admin
  if (!isAdmin) {
    return (
      <div className="admin-container">
        <div className="admin-card">
          <h2>Access Denied</h2>
          <p className="error-text">You are not the program administrator</p>
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">Your Address:</span>
              <span className="info-value mono">{wallet.publicKey && formatAddress(wallet.publicKey, 8)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Admin Address:</span>
              <span className="info-value mono">{formatAddress(programState.admin, 8)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate supply usage percentage for display
  const percentMinted = programState.maxSupply.isZero()
    ? 0
    : (Number(programState.totalMinted) / Number(programState.maxSupply)) * 100

  // ============================================================================
  // MAIN ADMIN DASHBOARD UI
  // ============================================================================

  return (
    <div className="admin-container">
      <div className="admin-card">
        {/* Header with refresh button */}
        <div className="card-header">
          <h2>Admin Dashboard</h2>
          <button onClick={() => refreshData()} disabled={refreshing}>
            {refreshing ? '⟳' : '↻'}
          </button>
        </div>

        {/* Error and success message displays */}
        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        {/* Program Status Section - Shows real-time program statistics */}
        <div className="section">
          <h3>Program Status</h3>
          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">Status</span>
              <span className={`stat-value ${programState.isPaused ? 'paused' : 'active'}`}>
                {programState.isPaused ? '⏸ PAUSED' : '▶ ACTIVE'}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Claim Amount</span>
              <span className="stat-value">
                {formatAmount(programState.claimAmount, TOKEN_DECIMALS_FALLBACK)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Cooldown</span>
              <span className="stat-value">{formatDuration(programState.claimCooldownSeconds)}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Total Minted</span>
              <span className="stat-value">
                {formatAmount(programState.totalMinted, TOKEN_DECIMALS_FALLBACK)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Max Supply</span>
              <span className="stat-value">
                {formatAmount(programState.maxSupply, TOKEN_DECIMALS_FALLBACK)}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Supply Used</span>
              <span className="stat-value">{percentMinted.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* Emergency Controls Section - Pause/Unpause functionality */}
        <div className="section">
          <h3>Emergency Controls</h3>
          <div className="button-group">
            {programState.isPaused ? (
              <button
                onClick={handleUnpause}
                disabled={processing}
                className="btn-success"
              >
                {processing ? 'Processing...' : '▶ Unpause Program'}
              </button>
            ) : (
              <button
                onClick={handlePause}
                disabled={processing}
                className="btn-warning"
              >
                {processing ? 'Processing...' : '⏸ Pause Program'}
              </button>
            )}
          </div>
        </div>

        {/* Settings Update Section - Modify claim parameters */}
        <div className="section">
          <h3>Update Settings</h3>
          <div className="form-group">
            <label>Claim Amount (tokens)</label>
            <input
              type="number"
              value={newClaimAmount}
              onChange={(e) => setNewClaimAmount(e.target.value)}
              placeholder="Enter claim amount"
              disabled={processing}
            />
          </div>
          <div className="form-group">
            <label>Cooldown (seconds)</label>
            <input
              type="number"
              value={newCooldown}
              onChange={(e) => setNewCooldown(e.target.value)}
              placeholder="Enter cooldown in seconds"
              disabled={processing}
            />
          </div>
          <button
            onClick={handleUpdateSettings}
            disabled={processing}
            className="btn-primary"
          >
            {processing ? 'Updating...' : 'Update Settings'}
          </button>
        </div>

        {/* Add Claimer Section - Whitelist new users */}
        <div className="section">
          <h3>Add Claimer</h3>
          <div className="form-group">
            <label>Wallet Address</label>
            <input
              type="text"
              value={newClaimerAddress}
              onChange={(e) => setNewClaimerAddress(e.target.value)}
              placeholder="Enter Solana wallet address"
              disabled={processing}
              className="mono"
            />
          </div>
          <button
            onClick={handleAddClaimer}
            disabled={processing || !newClaimerAddress}
            className="btn-primary"
          >
            {processing ? 'Adding...' : 'Add Claimer'}
          </button>
        </div>

        {/* Remove Claimer Section - Remove users from whitelist */}
        <div className="section">
          <h3>Remove Claimer</h3>
          <div className="form-group">
            <label>Wallet Address</label>
            <input
              type="text"
              value={removeClaimerAddress}
              onChange={(e) => setRemoveClaimerAddress(e.target.value)}
              placeholder="Enter Solana wallet address"
              disabled={processing}
              className="mono"
            />
          </div>
          <button
            onClick={handleRemoveClaimer}
            disabled={processing || !removeClaimerAddress}
            className="btn-danger"
          >
            {processing ? 'Removing...' : 'Remove Claimer'}
          </button>
        </div>

        {/* Claimers List Section - Display all whitelisted users */}
        <div className="section">
          <div className="section-header">
            <h3>Registered Claimers ({claimers.length})</h3>
            <button
              onClick={() => fetchClaimers()}
              disabled={loadingClaimers}
              className="btn-small"
            >
              {loadingClaimers ? '⟳' : '↻'}
            </button>
          </div>

          {loadingClaimers ? (
            <Loading />
          ) : claimers.length === 0 ? (
            <p className="info-text">No claimers registered yet</p>
          ) : (
            <div className="claimers-list">
              {claimers.map((claimer, index) => (
                <div key={claimer.address.toBase58()} className="claimer-item">
                  <div className="claimer-header">
                    <span className="claimer-number">#{index + 1}</span>
                    <span className="claimer-address mono">{formatAddress(claimer.user, 6)}</span>
                  </div>
                  <div className="claimer-stats">
                    <div className="claimer-stat">
                      <span className="claimer-stat-label">Total Claimed:</span>
                      <span className="claimer-stat-value">
                        {formatAmount(claimer.totalClaimed, TOKEN_DECIMALS_FALLBACK)}
                      </span>
                    </div>
                    <div className="claimer-stat">
                      <span className="claimer-stat-label">Last Claim:</span>
                      <span className="claimer-stat-value">
                        {claimer.lastClaimTimestamp === 0
                          ? 'Never'
                          : formatTimestamp(claimer.lastClaimTimestamp)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setRemoveClaimerAddress(claimer.user.toBase58())}
                    className="btn-remove-inline"
                    disabled={processing}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Program Information Section - Display key addresses */}
        <div className="section">
          <h3>Program Information</h3>
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">Program ID:</span>
              <span className="info-value mono">{formatAddress(programID, 8)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Admin:</span>
              <span className="info-value mono">{formatAddress(programState.admin, 8)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Mint:</span>
              <span className="info-value mono">{formatAddress(programState.mint, 8)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
