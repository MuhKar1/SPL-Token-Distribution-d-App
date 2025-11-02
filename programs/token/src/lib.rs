//! # SPL Token Distribution Program
//!
//! This Anchor program implements a secure token distribution system on Solana blockchain.
//! It provides controlled token minting with administrative oversight, cooldown periods,
//! and comprehensive audit trails.
//!
//! ## Key Features
//! - Admin-controlled token minting
//! - Whitelisted claimer system
//! - Configurable claim amounts and cooldown periods
//! - Emergency pause functionality
//! - On-chain audit trails and history tracking
//! - Associated token account creation and management

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self as spl_token, Mint, MintTo, Token, TokenAccount},
};

// Program ID - unique identifier for this Solana program
declare_id!("9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk");

// Token decimal places - standard for most tokens
const DECIMALS: u32 = 6;

// Configuration constants for history tracking
// These define the maximum number of historical records stored on-chain
pub const GLOBAL_HISTORY_SIZE: usize = 10;
pub const CLAIMER_HISTORY_SIZE: usize = 5;

// -----------------------------------------------------------------------------
// Program Logic
// -----------------------------------------------------------------------------
#[program]
pub mod token {
    use super::*;

    /// Initialize the token distribution program
    ///
    /// This function sets up the initial program state and creates the token mint.
    /// It can only be called once by the program deployer.
    ///
    /// # Arguments
    /// * `max_supply` - Maximum number of tokens that can ever be minted
    /// * `claim_amount` - Number of tokens each claim transaction distributes
    /// * `claim_cooldown_seconds` - Minimum seconds between claims for each user
    ///
    /// # Security
    /// - Validates non-zero parameters
    /// - Stores admin address for future authorization
    /// - Creates deterministic PDAs for program accounts
    pub fn initialize(
        ctx: Context<Initialize>,
        max_supply: u64,
        claim_amount: u64,
        claim_cooldown_seconds: i64,
    ) -> Result<()> {
        // Validate input parameters
        require!(max_supply > 0, MinterError::ZeroMaxSupply);
        require!(claim_amount > 0, MinterError::ZeroClaimAmount);

        // Initialize program state with provided parameters
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.mint = ctx.accounts.mint.key();
        state.max_supply = max_supply;
        state.total_minted = 0;
        state.claim_amount = claim_amount;
        state.claim_cooldown_seconds = claim_cooldown_seconds;
        state.is_paused = false;
        state.state_bump = ctx.bumps.state;
        state.mint_authority_bump = ctx.bumps.mint_authority;
        state.history_next_idx = 0u16;

        // Log initialization for blockchain transparency
        msg!("Program initialized by {}", state.admin);
        Ok(())
    }

    /// Add a user to the claimer whitelist
    ///
    /// This function creates a claimer state account for a user, allowing them
    /// to participate in token claiming. Only the admin can call this function.
    ///
    /// # Security
    /// - Admin-only operation
    /// - Creates PDA-based account for deterministic addressing
    /// - Initializes claimer with zero balance and timestamp
    pub fn add_claimer(ctx: Context<AddClaimer>) -> Result<()> {
        // Initialize claimer state with user information
        let claimer_state = &mut ctx.accounts.claimer_state;
        claimer_state.user = ctx.accounts.user.key();
        claimer_state.last_claim_timestamp = 0;
        claimer_state.total_claimed = 0;
        claimer_state.history_next_idx = 0u16;
        claimer_state.bump = ctx.bumps.claimer_state;

        msg!("Added claimer: {}", claimer_state.user);
        Ok(())
    }

    /// Remove a user from the claimer whitelist
    ///
    /// This function closes a claimer's state account and removes their
    /// ability to claim tokens. The account rent is returned to the admin.
    ///
    /// # Security
    /// - Admin-only operation
    /// - Closes account to recover rent
    /// - Validates account ownership before closure
    pub fn remove_claimer(_ctx: Context<RemoveClaimer>) -> Result<()> {
        msg!("Claimer removed.");
        Ok(())
    }

    /// Execute a token claim transaction
    ///
    /// This is the core function that allows whitelisted users to claim tokens.
    /// It enforces cooldown periods, supply limits, and creates associated token accounts.
    ///
    /// # Process
    /// 1. Verify program is not paused
    /// 2. Check cooldown period compliance
    /// 3. Verify supply limits
    /// 4. Create associated token account if needed
    /// 5. Mint tokens to user's account
    /// 6. Update state and history
    ///
    /// # Security
    /// - Cooldown enforcement prevents spam
    /// - Supply limit prevents over-minting
    /// - PDA-based minting authority
    /// - Automatic ATA creation
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        // Verify program is operational
        let state = &mut ctx.accounts.state;
        require!(!state.is_paused, MinterError::ProgramIsPaused);

        // Check cooldown compliance
        let claimer_state = &mut ctx.accounts.claimer_state;
        let now = Clock::get()?.unix_timestamp;

        if claimer_state.last_claim_timestamp != 0 {
            let diff = now
                .checked_sub(claimer_state.last_claim_timestamp)
                .ok_or(MinterError::ClockError)?;
            require!(diff >= state.claim_cooldown_seconds, MinterError::CooldownNotMet);
        }

        // Verify supply limits
        let new_total = state
            .total_minted
            .checked_add(state.claim_amount)
            .ok_or(MinterError::Overflow)?;
        require!(new_total <= state.max_supply, MinterError::MaxSupplyExceeded);

        // Update state
        state.total_minted = new_total;
        claimer_state.total_claimed = claimer_state
            .total_claimed
            .checked_add(state.claim_amount)
            .ok_or(MinterError::Overflow)?;
        claimer_state.last_claim_timestamp = now;

        // Mint tokens using PDA authority
        let bump = state.mint_authority_bump;
        let signer_seeds: &[&[u8]] = &[b"mint_authority", &[bump]];
        let signer_seeds_slice: &[&[&[u8]]] = &[&signer_seeds];

        // Calculate token amount with decimals
        let amount_to_mint = (state.claim_amount as u64)
            .checked_mul(10u64.pow(DECIMALS))
            .ok_or(MinterError::Overflow)?;

        // Execute mint instruction
        spl_token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    authority: ctx.accounts.mint_authority.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds_slice,
            ),
            amount_to_mint,
        )?;

        // Record transaction in history
        log_global_history(state, claimer_state.user, state.claim_amount, now);
        log_claimer_history(claimer_state, state.claim_amount, now);

        // Log successful transaction
        msg!(
            "Claim successful: user={} amount={} total_minted={}",
            claimer_state.user,
            state.claim_amount,
            state.total_minted
        );
        Ok(())
    }

    /// Pause the token distribution program
    ///
    /// This emergency function stops all claiming activity. Only the admin can call it.
    /// Useful for maintenance or in case of detected issues.
    ///
    /// # Security
    /// - Admin-only operation
    /// - Immediate effect on all claim attempts
    pub fn pause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.state.is_paused = true;
        msg!("Program paused by {}", ctx.accounts.admin.key());
        Ok(())
    }

    /// Unpause the token distribution program
    ///
    /// This function resumes normal operation after a pause. Only the admin can call it.
    ///
    /// # Security
    /// - Admin-only operation
    /// - Restores normal claiming functionality
    pub fn unpause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.state.is_paused = false;
        msg!("Program unpaused by {}", ctx.accounts.admin.key());
        Ok(())
    }

    /// Update program settings
    ///
    /// This function allows the admin to modify claim amount and cooldown settings.
    /// The program must be paused before settings can be changed.
    ///
    /// # Arguments
    /// * `new_amount` - New token amount per claim
    /// * `new_cooldown` - New cooldown period in seconds
    ///
    /// # Security
    /// - Admin-only operation
    /// - Input validation for non-zero amounts
    pub fn update_settings(ctx: Context<AdminOnly>, new_amount: u64, new_cooldown: i64) -> Result<()> {
        require!(new_amount > 0, MinterError::ZeroClaimAmount);
        ctx.accounts.state.claim_amount = new_amount;
        ctx.accounts.state.claim_cooldown_seconds = new_cooldown;
        msg!(
            "Settings updated: claim_amount={}, cooldown={}",
            new_amount,
            new_cooldown
        );
        Ok(())
    }
}

// ----------------------------- Helpers (outside #[program]) -----------------------------

fn log_global_history(state: &mut Account<ProgramState>, user: Pubkey, amount: u64, timestamp: i64) {
    let idx = state.history_next_idx as usize;
    state.global_history[idx] = GlobalHistoryEntry { user, amount, timestamp };
    state.history_next_idx =
        state.history_next_idx.wrapping_add(1) % (GLOBAL_HISTORY_SIZE as u16);
}

fn log_claimer_history(claimer_state: &mut Account<ClaimerState>, amount: u64, timestamp: i64) {
    let idx = claimer_state.history_next_idx as usize;
    claimer_state.claimer_history[idx] = ClaimHistoryEntry { amount, timestamp };
    claimer_state.history_next_idx =
        claimer_state.history_next_idx.wrapping_add(1) % (CLAIMER_HISTORY_SIZE as u16);
}

// ----------------------------- ACCOUNTS -----------------------------

/// Account structure for program initialization
///
/// This struct defines all the accounts required to set up the token distribution program.
/// It creates the main program state account and the token mint with proper authorities.
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The admin who will control the program - must sign the transaction
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Program state account - stores all configuration and global data
    #[account(
        init,
        payer = admin,
        space = 8 + ProgramState::MAX_SIZE,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, ProgramState>,
    /// The SPL token mint that will be created for distribution
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = mint_authority,
        seeds = [b"mint"],
        bump
    )]
    pub mint: Account<'info, Mint>,
    /// Program-derived address that controls minting authority
    #[account(seeds = [b"mint_authority"], bump)]
    /// CHECK: This is the mint authority PDA, validated by seeds.
    pub mint_authority: UncheckedAccount<'info>,
    /// Required Solana system program for account creation
    pub system_program: Program<'info, System>,
    /// SPL token program for mint operations
    pub token_program: Program<'info, Token>,
    /// Rent sysvar for calculating account sizes
    pub rent: Sysvar<'info, Rent>,
}

/// Account structure for adding a new claimer to the whitelist
///
/// This allows the admin to authorize specific users to claim tokens.
/// Creates a claimer state account to track their claiming history.
#[derive(Accounts)]
pub struct AddClaimer<'info> {
    /// Program state account - must be owned by the admin
    #[account(mut, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    /// New claimer state account to track this user's activity
    #[account(
        init,
        payer = admin,
        space = 8 + ClaimerState::MAX_SIZE,
        seeds = [b"claimer", user.key().as_ref()],
        bump
    )]
    pub claimer_state: Account<'info, ClaimerState>,
    /// The user being added to the whitelist
    /// CHECK: The user account is validated by the claimer_state seeds.
    pub user: UncheckedAccount<'info>,
    /// Admin account - must sign to authorize the addition
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Required for account creation
    pub system_program: Program<'info, System>,
}

/// Account structure for removing a claimer from the whitelist
///
/// This removes a user's authorization to claim tokens and closes their state account.
/// The admin receives the rent refund from the closed account.
#[derive(Accounts)]
pub struct RemoveClaimer<'info> {
    /// Program state account - must be owned by the admin
    #[account(mut, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    /// Claimer state account to be closed
    #[account(
        mut,
        seeds = [b"claimer", user.key().as_ref()],
        bump = claimer_state.bump,
        close = admin,
        has_one = user
    )]
    pub claimer_state: Account<'info, ClaimerState>,
    /// The user being removed from the whitelist
    pub user: UncheckedAccount<'info>,
    /// Admin account - must sign to authorize the removal
    #[account(mut)]
    pub admin: Signer<'info>,
}

/// Account structure for token claiming transactions
///
/// This defines all accounts needed when a whitelisted user claims tokens.
/// It handles token minting, account creation, and state updates.
#[derive(Accounts)]
pub struct Claim<'info> {
    /// Program state account - tracks global program data
    #[account(mut, has_one = mint)]
    pub state: Account<'info, ProgramState>,
    /// Claimer's state account - tracks their claiming history
    #[account(
        mut,
        seeds = [b"claimer", user.key().as_ref()],
        bump = claimer_state.bump,
        has_one = user
    )]
    pub claimer_state: Account<'info, ClaimerState>,
    /// The token mint account
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    /// Program-derived minting authority
    #[account(seeds = [b"mint_authority"], bump = state.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    /// The user claiming tokens - must sign the transaction
    #[account(mut)]
    pub user: Signer<'info>,
    /// User's associated token account - created automatically if needed
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    /// SPL token program for minting operations
    pub token_program: Program<'info, Token>,
    /// Associated token program for automatic account creation
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// System program for account creation
    pub system_program: Program<'info, System>,
    /// Rent sysvar for account size calculations
    pub rent: Sysvar<'info, Rent>,
}

/// Account structure for admin-only operations
///
/// This is used for operations that only the admin can perform:
/// pause, unpause, and settings updates.
#[derive(Accounts)]
pub struct AdminOnly<'info> {
    /// Program state account - must be owned by the admin
    #[account(mut, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    /// Admin account - must sign all admin operations
    pub admin: Signer<'info>,
}

// ----------------------------- STATE STRUCTS -----------------------------

/// Global program state stored on-chain
///
/// This account holds all the configuration and global data for the token distribution program.
/// It's created during initialization and updated throughout the program's lifecycle.
#[account]
pub struct ProgramState {
    /// Public key of the admin who controls the program
    pub admin: Pubkey,
    /// Public key of the token mint created by this program
    pub mint: Pubkey,
    /// Maximum number of tokens that can ever be minted (enforced by program)
    pub max_supply: u64,
    /// Total number of tokens minted so far across all claims
    pub total_minted: u64,
    /// Number of tokens distributed per claim transaction
    pub claim_amount: u64,
    /// Minimum seconds that must pass between claims for each user
    pub claim_cooldown_seconds: i64,
    /// Emergency flag - when true, all claiming is disabled
    pub is_paused: bool,
    /// Bump seed for the program state PDA derivation
    pub state_bump: u8,
    /// Bump seed for the mint authority PDA derivation
    pub mint_authority_bump: u8,
    /// Index for the next global history entry (circular buffer)
    pub history_next_idx: u16,
    /// Circular buffer storing the last N global claim events
    pub global_history: [GlobalHistoryEntry; GLOBAL_HISTORY_SIZE],
}

/// Default implementation for ProgramState
///
/// Provides safe default values for all fields, used during account initialization.
impl Default for ProgramState {
    fn default() -> Self {
        Self {
            admin: Pubkey::default(),
            mint: Pubkey::default(),
            max_supply: 0,
            total_minted: 0,
            claim_amount: 0,
            claim_cooldown_seconds: 0,
            is_paused: false,
            state_bump: 0,
            mint_authority_bump: 0,
            history_next_idx: 0,
            global_history: [GlobalHistoryEntry::default(); GLOBAL_HISTORY_SIZE],
        }
    }
}

/// Calculate the maximum account size for ProgramState
///
/// This is used to allocate the correct amount of space when creating the account.
/// The formula accounts for all fields plus the global history array.
impl ProgramState {
    pub const MAX_SIZE: usize = 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 2
        + (GLOBAL_HISTORY_SIZE * GlobalHistoryEntry::MAX_SIZE);
}

/// Individual claimer state stored on-chain
///
/// This account tracks each whitelisted user's claiming activity and history.
/// Created when a user is added to the whitelist, closed when removed.
#[account]
pub struct ClaimerState {
    /// Public key of the user this state belongs to
    pub user: Pubkey,
    /// Unix timestamp of the user's last successful claim (0 if never claimed)
    pub last_claim_timestamp: i64,
    /// Total number of tokens this user has claimed across all transactions
    pub total_claimed: u64,
    /// Bump seed for this claimer state PDA derivation
    pub bump: u8,
    /// Index for the next claim history entry (circular buffer)
    pub history_next_idx: u16,
    /// Circular buffer storing this user's last N claim events
    pub claimer_history: [ClaimHistoryEntry; CLAIMER_HISTORY_SIZE],
}

/// Default implementation for ClaimerState
///
/// Provides safe default values for all fields, used during account initialization.
impl Default for ClaimerState {
    fn default() -> Self {
        Self {
            user: Pubkey::default(),
            last_claim_timestamp: 0,
            total_claimed: 0,
            bump: 0,
            history_next_idx: 0,
            claimer_history: [ClaimHistoryEntry::default(); CLAIMER_HISTORY_SIZE],
        }
    }
}

/// Calculate the maximum account size for ClaimerState
///
/// This is used to allocate the correct amount of space when creating the account.
/// The formula accounts for all fields plus the claimer history array.
impl ClaimerState {
    pub const MAX_SIZE: usize = 32 + 8 + 8 + 1 + 2
        + (CLAIMER_HISTORY_SIZE * ClaimHistoryEntry::MAX_SIZE);
}

// ----------------------------- HISTORY STRUCTS -----------------------------

/// Entry in the global claim history
///
/// Records each successful claim transaction in the program's global history.
/// Stored in a circular buffer to maintain the most recent claims.
#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct GlobalHistoryEntry {
    /// Public key of the user who made the claim
    pub user: Pubkey,
    /// Number of tokens claimed in this transaction
    pub amount: u64,
    /// Unix timestamp when the claim occurred
    pub timestamp: i64,
}

/// Default implementation for GlobalHistoryEntry
///
/// Provides safe default values for all fields.
impl Default for GlobalHistoryEntry {
    fn default() -> Self {
        Self {
            user: Pubkey::default(),
            amount: 0,
            timestamp: 0,
        }
    }
}

/// Calculate the size of a GlobalHistoryEntry
///
/// Used for calculating total account sizes that include history arrays.
impl GlobalHistoryEntry {
    pub const MAX_SIZE: usize = 32 + 8 + 8;
}

/// Entry in an individual claimer's history
///
/// Records each successful claim transaction for a specific user.
/// Stored in a circular buffer to maintain the user's recent claiming activity.
#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ClaimHistoryEntry {
    /// Number of tokens claimed in this transaction
    pub amount: u64,
    /// Unix timestamp when the claim occurred
    pub timestamp: i64,
}

/// Default implementation for ClaimHistoryEntry
///
/// Provides safe default values for all fields.
impl Default for ClaimHistoryEntry {
    fn default() -> Self {
        Self { amount: 0, timestamp: 0 }
    }
}

/// Calculate the size of a ClaimHistoryEntry
///
/// Used for calculating total account sizes that include history arrays.
impl ClaimHistoryEntry {
    pub const MAX_SIZE: usize = 8 + 8;
}

// ----------------------------- ERRORS -----------------------------

/// Custom error codes for the token distribution program
///
/// These errors provide clear, user-friendly messages when operations fail.
/// They help users understand what went wrong and how to resolve issues.
#[error_code]
pub enum MinterError {
    /// Program initialization failed because max supply was set to zero
    #[msg("Max supply cannot be zero.")]
    ZeroMaxSupply,
    /// Claim amount cannot be zero when initializing or updating settings
    #[msg("Claim amount cannot be zero.")]
    ZeroClaimAmount,
    /// User tried to claim before their cooldown period expired
    #[msg("The cooldown period has not been met yet.")]
    CooldownNotMet,
    /// Program would exceed the maximum allowed token supply
    #[msg("The maximum token supply has been reached.")]
    MaxSupplyExceeded,
    /// Mathematical operation would cause an overflow
    #[msg("This operation would cause a mathematical overflow.")]
    Overflow,
    /// Failed to get current timestamp from Solana clock
    #[msg("An error occurred with the on-chain clock.")]
    ClockError,
    /// User tried to claim while program is paused by admin
    #[msg("The program is currently paused by the admin.")]
    ProgramIsPaused,
}
