/**
 * Main Application Component
 *
 * This is the root component of the SPL Token Distributor dApp.
 * It provides navigation between different views (Claim, Admin) and
 * manages wallet connection. Users go directly to the claim interface
 * after connecting their wallet.
 *
 * The app follows a role-based access pattern:
 * - All users can access the claim interface (if whitelisted)
 * - Only the program admin can access the admin dashboard
 */

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Claim } from './components/Claim'
import { Admin } from './components/Admin'
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

  const { connected } = useWallet()        // Wallet connection state

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [view, setView] = useState<View>('claim')      // Current active view

  // ============================================================================
  // EFFECTS
  // ============================================================================

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
          /* Enhanced pre-connection onboarding */
          <div className="welcome-section">
            {/* App Purpose Overview */}
            <div className="app-overview">
              <h2>🎯 SPL Token Distribution Platform</h2>
              <p className="overview-text">
                This platform allows whitelisted users to securely claim SPL tokens on Solana with built-in cooldown protection.
                Admins can manage claimers, set distribution parameters, and monitor activity.
              </p>
              <div className="key-benefits">
                <div className="benefit">
                  <h4>✅ Secure Token Claims</h4>
                  <p>Claim whitelisted tokens with automatic cooldown protection</p>
                </div>
                <div className="benefit">
                  <h4>🔐 Admin Controls</h4>
                  <p>Manage claimers, pause distributions, and update settings</p>
                </div>
                <div className="benefit">
                  <h4>📊 Real-time Tracking</h4>
                  <p>Monitor balances, claim history, and program status</p>
                </div>
              </div>
            </div>

            {/* Wallet Connection Rationale */}
            <div className="wallet-explanation">
              <h3>� Why Connect Your Wallet?</h3>
              <p>
                Wallet connection is required to securely interact with the Solana blockchain for token claiming.
                Your wallet enables:
              </p>
              <ul>
                <li>Secure authentication and transaction signing</li>
                <li>Direct token transfers to your wallet</li>
                <li>Verification of your claim eligibility</li>
              </ul>
              <p className="security-note">
                <strong>Security Guarantee:</strong> Only approved transactions are processed.
                Your private keys remain secure in your wallet - your funds cannot be acccessed.
              </p>
            </div>
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
