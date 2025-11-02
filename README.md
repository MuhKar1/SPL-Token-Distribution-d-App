# SPL Token Distribution DApp

A secure, decentralized token distribution platform built on Solana blockchain using Anchor framework. This application enables controlled token minting and claiming with administrative oversight and comprehensive audit trails.

## 📋 Table of Contents

- [🏗️ Architecture Overview](#-architecture-overview)
- [🔧 Backend (Solana Program) Documentation](#-backend-solana-program-documentation)
- [🎨 Frontend (React Application) Documentation](#-frontend-react-application-documentation)
- [🚀 Getting Started](#-getting-started)
- [🧪 Testing](#-testing)
- [🔒 Security](#-security)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🏗️ Architecture Overview

### Backend (Solana Program)
**Location:** `programs/token/src/lib.rs`  
**Language:** Rust with Anchor Framework  
**Purpose:** Smart contract handling token minting, claiming, and administrative functions

### Frontend (React Application)
**Location:** `app/` directory  
**Language:** TypeScript with React  
**Purpose:** User interface for wallet connection, token claiming, and administrative controls

## 🔧 Backend (Solana Program) Documentation

### Program ID
```
9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk
```
**Network:** Solana Devnet
**Token Decimals:** 6

### Core Functionality

#### 1. Program Initialization (`initialize`)
**Purpose:** Sets up the token program with initial parameters
- Creates program state PDA storing configuration
- Initializes SPL token mint with 6 decimals
- Sets up mint authority PDA for controlled token creation

**Security Measures:**
- Admin-only initialization
- Input validation (non-zero max supply, claim amount)
- PDA-based account derivation for deterministic addresses

**Parameters:**
- `max_supply`: Maximum tokens that can be minted
- `claim_amount`: Tokens per claim transaction
- `claim_cooldown_seconds`: Minimum time between claims

#### 2. Claimer Management (`add_claimer`, `remove_claimer`)
**Purpose:** Controls which users can claim tokens
- `add_claimer`: Whitelists users for token claiming
- `remove_claimer`: Removes users and closes their state account

**Security Measures:**
- Admin-only operations
- PDA-based claimer state accounts
- Account closure on removal (funds returned to admin)

#### 3. Token Claiming (`claim`)
**Purpose:** Allows whitelisted users to mint tokens
- Verifies cooldown period compliance
- Mints exact claim amount to user's associated token account
- Updates claim history and timestamps

**Security Measures:**
- Cooldown enforcement using blockchain timestamps
- Supply limit validation
- Associated token account auto-creation
- Program pause functionality for emergency stops

**Process Flow:**
1. Validate program not paused
2. Check cooldown period elapsed
3. Verify supply limits
4. Mint tokens via PDA authority
5. Update state and history
6. Log transaction details

#### 4. Administrative Controls (`pause`, `unpause`, `update_settings`)
**Purpose:** Program governance and emergency controls
- `pause/unpause`: Emergency stop/start functionality
- `update_settings`: Modify claim parameters

**Security Measures:**
- Admin-only access via signer validation
- State account ownership verification
- Input validation for all parameters

### State Management

#### ProgramState Account
```rust
pub struct ProgramState {
    pub admin: Pubkey,                    // Administrator public key
    pub mint: Pubkey,                     // Token mint address
    pub max_supply: u64,                  // Maximum mintable tokens
    pub total_minted: u64,                // Current total supply
    pub claim_amount: u64,                // Tokens per claim
    pub claim_cooldown_seconds: i64,      // Cooldown period
    pub is_paused: bool,                  // Emergency pause flag
    pub state_bump: u8,                   // PDA bump seeds
    pub mint_authority_bump: u8,
    pub history_next_idx: u16,            // Circular buffer index
    pub global_history: [GlobalHistoryEntry; GLOBAL_HISTORY_SIZE],
}
```

#### ClaimerState Account
```rust
pub struct ClaimerState {
    pub user: Pubkey,                     // User public key
    pub last_claim_timestamp: i64,        // Last claim time
    pub total_claimed: u64,               // User's total claims
    pub bump: u8,                         // PDA bump
    pub history_next_idx: u16,            // Circular buffer index
    pub claimer_history: [ClaimHistoryEntry; CLAIMER_HISTORY_SIZE],
}
```

### Security Features

#### 1. Program-Derived Addresses (PDAs)
- Deterministic account addresses using seeds
- No private keys required for program operations
- Collision-resistant account creation

#### 2. Access Control
- Admin-only functions via signer validation
- State account ownership validation
- User-specific claimer state validation

#### 3. Input Validation
- Non-zero value checks for critical parameters
- Supply limit enforcement
- Cooldown period validation
- Mathematical overflow protection

#### 4. Emergency Controls
- Program pause functionality
- Admin can halt all operations
- Graceful error handling and recovery

#### 5. Audit Trail
- Global transaction history (circular buffer)
- Per-user claim history
- Comprehensive logging via `msg!` macro
- Timestamp tracking for all operations

## 🎨 Frontend (React Application) Documentation

### Core Components

#### 1. App.tsx - Main Application
**Purpose:** Root component managing application state and routing
- Role-based interface switching (Claimer/Admin)
- Wallet connection integration
- Responsive navigation between views

**Key Features:**
- User role detection (Claimer vs Admin)
- Responsive layout with header and navigation
- Program status display and error handling

#### 2. Claim.tsx - Token Claiming Interface
**Purpose:** User interface for authorized claimers to receive tokens
- Real-time cooldown countdown display
- Claim status visualization and feedback
- Transaction processing with error handling

**Key Features:**
- Live cooldown timer with automatic updates
- Status-based UI states (ready/cooldown/paused/error)
- Automatic data refresh after successful claims
- Associated token account auto-creation
- Claim history display (recent 5 claims)

#### 3. Admin.tsx - Administrative Dashboard
**Purpose:** Comprehensive administrative controls and monitoring
- Real-time program statistics display
- Claimer management (add/remove users)
- Settings modification with validation
- Emergency pause/unpause controls

**Key Features:**
- Live program stats (supply usage, status, parameters)
- Claimer whitelist management with search/filter
- Settings updates (claim amount, cooldown)
- Emergency controls with confirmation
- Transaction feedback and error handling

### State Management

#### React Hooks Usage
- `useState`: Component-level state management
- `useEffect`: Side effects (data loading, timers, admin checking)
- `useConnection`: Solana RPC connection state
- `useWallet`: Wallet connection and signing state
- `useMemo`: Computed values and performance optimization

#### Data Flow
1. **Wallet Connection** → Enables blockchain interactions
2. **Role Detection** → Determines available UI components
3. **Data Loading** → Fetches program and user state from blockchain
4. **User Actions** → Triggers blockchain transactions with confirmation
5. **State Updates** → Refreshes UI with new blockchain data

### Utility Functions

#### Formatters (`utils/formatters.ts`)
- `formatAddress`: Truncate wallet addresses for display
- `formatAmount`: Format token amounts with proper decimals
- `formatTimestamp`: Convert Unix timestamps to readable dates
- `formatDuration`: Format cooldown periods in human-readable format
- `isValidPublicKey`: Validate Solana address formats

#### Constants (`utils/constants.ts`)
- PDA seed definitions (must match smart contract)
- Token decimal fallbacks
- System program IDs
- PDA derivation helper functions

#### Program Hook (`hooks/useProgram.ts`)
- Anchor provider and program instance management
- Memoized instances for performance
- Null-safe wallet integration

### Security Features

#### 1. Wallet Integration
- Secure wallet adapter connections
- Transaction signing validation
- Public key verification and formatting

#### 2. Input Validation
- Form validation for all user inputs
- Address format verification
- Numerical input constraints and sanitization

#### 3. Error Handling
- Try-catch blocks for all async operations
- User-friendly error messages
- Graceful failure recovery with retry options

#### 4. Access Control
- Role-based component rendering
- Admin-only function restrictions
- Wallet connection requirements

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Rust and Cargo (for smart contract development)
- Solana CLI tools
- Anchor framework
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd spl-token-distribution
   ```

2. **Install backend dependencies**
   ```bash
   # Install Solana CLI (if not already installed)
   sh -c "$(curl -sSfL https://release.solana.com/v1.18.4/install)"

   # Install Anchor
   cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
   avm install latest
   avm use latest
   ```

3. **Install frontend dependencies**
   ```bash
   cd app
   npm install
   ```

### Development Setup

1. **Start local Solana validator**
   ```bash
   solana-test-validator
   ```

2. **Build and deploy the program**
   ```bash
   anchor build
   anchor deploy
   ```

3. **Start the frontend development server**
   ```bash
   cd app
   npm run dev
   ```

4. **Access the application**
   - Open http://localhost:5173 in your browser
   - Connect your Solana wallet
   - Start testing the functionality

### Production Deployment

#### Backend (Solana Program)
```bash
# Switch to devnet
solana config set --url https://api.devnet.solana.com

# Build and deploy
anchor build
anchor deploy

# Note: Update Anchor.toml with the deployed program ID
```

#### Frontend
```bash
cd app
npm run build

# Deploy to Vercel, Netlify, or your preferred hosting platform
# Update environment variables with production program ID
```

## 🧪 Testing

### Backend Testing
```bash
# Run all tests
anchor test

# Run with verbose output
anchor test --verbose
```

### Frontend Testing
- Manual testing checklist included in development
- Component testing with React Testing Library (future enhancement)
- E2E testing with Playwright/Cypress (future enhancement)

## 🔒 Security

### Backend Security
1. **Access Control:** Admin-only functions with signer verification
2. **Input Validation:** Comprehensive parameter checking
3. **PDA Security:** Deterministic, collision-resistant addresses
4. **Overflow Protection:** Mathematical operation safety
5. **Emergency Controls:** Program pause functionality
6. **Audit Trail:** Complete transaction history logging

### Frontend Security
1. **Wallet Security:** Secure adapter integration
2. **Input Validation:** Form validation and sanitization
3. **Error Handling:** Graceful failure management
4. **Access Control:** Role-based UI restrictions
5. **State Security:** Proper React state management

## 🤝 Contributing

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd spl-token-distribution

# Install dependencies
yarn install
cd app && npm install

# Start development
npm run dev
```

### Code Standards
- **Rust/Anchor:** Follow standard Solana development practices
- **TypeScript/React:** ESLint configuration enforced
- **Documentation:** All public functions and components documented
- **Testing:** Critical path coverage required

### Pull Request Process
1. Branch from `main`
2. Implement feature/fix with tests
3. Update documentation
4. Create PR with detailed description
5. Code review and approval
6. Merge after CI/CD validation

## 📄 License

ISC License - See LICENSE file for details.

---

**Built with:** Solana, Anchor, React, TypeScript  
**Security:** Multi-layered validation and access control  
**Scalability:** PDA-based architecture for high throughput  
**Maintainability:** Comprehensive testing and documentation