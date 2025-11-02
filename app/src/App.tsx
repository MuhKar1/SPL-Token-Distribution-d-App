/**
 * Main Application Component
 *
 * This is the root component of the SPL Token Distributor dApp.
 * It provides navigation between different views (Home, Claim, Admin) and
 * manages the overall application state including wallet connection and
 * admin role checking.
 *
 * The app follows a role-based access pattern:
 * - All users can view the home page and claim tokens (if whitelisted)
 * - Only the program admin can access the admin dashboard
 */

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Claim } from './components/Claim'
import { Admin } from './components/Admin'
import { formatAddress } from './utils/formatters'
import { useProgram } from './hooks/useProgram'
import { getStatePDA } from './utils/constants'
import './App.css'

/**
 * Available application views
 * Defines the three main sections of the application
 */
type View = 'home' | 'claim' | 'admin'

/**
 * Main App component function
 * Handles navigation, admin checking, and view rendering
 */
function App() {
  // ============================================================================
  // HOOKS & CONTEXT
  // ============================================================================

  const { publicKey, connected } = useWallet()        // Wallet connection state
  const { program, programID } = useProgram()         // Anchor program instance

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [view, setView] = useState<View>('home')      // Current active view
  const [isAdmin, setIsAdmin] = useState(false)       // Whether current user is admin

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Check if the current user is the program administrator
   * Queries the blockchain to compare user's public key with stored admin address
   */
  useEffect(() => {
    const checkAdmin = async () => {
      if (!program || !publicKey) {
        setIsAdmin(false)
        return
      }

      try {
        // Fetch program state from blockchain
        const [statePda] = getStatePDA(programID)
        const stateAccount = await (program.account as any).programState.fetch(statePda)

        // Check if current user matches admin address
        setIsAdmin(stateAccount.admin.toString() === publicKey.toString())
      } catch (err) {
        console.error('Error checking admin status:', err)
        setIsAdmin(false)
      }
    }

    checkAdmin()
  }, [program, publicKey, programID])

  // ============================================================================
  // RENDERING
  // ============================================================================

  return (
    <div className="app">
      {/* Application Header */}
      <header className="app-header">
        <h1>SPL Token Distributor</h1>
        <WalletMultiButton />  {/* Wallet connection button */}
      </header>

      {/* Navigation Bar - Only shown when wallet is connected */}
      {connected && (
        <nav className="app-nav">
          <button
            onClick={() => setView('home')}
            className={view === 'home' ? 'active' : ''}
          >
            Home
          </button>
          <button
            onClick={() => setView('claim')}
            className={view === 'claim' ? 'active' : ''}
          >
            Claim
          </button>
          <button
            onClick={() => setView('admin')}
            className={view === 'admin' ? 'active' : ''}
          >
            Admin
          </button>
        </nav>
      )}

      {/* Main Content Area */}
      <main className="app-main">
        {!connected ? (
          /* Welcome screen for unconnected users */
          <div className="welcome-card">
            <h2>Welcome to SPL Token Distributor</h2>
            <p>Connect your Solana wallet to get started</p>
            <div className="features">
              <div className="feature">
                <h3>🎯 Secure Claims</h3>
                <p>Claim tokens with built-in cooldown protection</p>
              </div>
              <div className="feature">
                <h3>⚡ Real-time Updates</h3>
                <p>Live balance and claim history tracking</p>
              </div>
              <div className="feature">
                <h3>🔒 On-Chain Security</h3>
                <p>Audited smart contract on Solana devnet</p>
              </div>
            </div>
          </div>
        ) : view === 'home' ? (
          /* Home dashboard for connected users */
          <div className="connected-card">
            <h2>✓ Wallet Connected</h2>
            <p className="wallet-address">
              {publicKey && formatAddress(publicKey, 8)}
            </p>
            <p className="info-text">
              {isAdmin
                ? 'Navigate to Claim to receive tokens or Admin to manage the program'
                : 'Navigate to Claim to receive tokens'}
            </p>
          </div>
        ) : view === 'claim' ? (
          /* Token claiming interface */
          <Claim />
        ) : (
          /* Admin management dashboard */
          <Admin />
        )}
      </main>
    </div>
  )
}

export default App
