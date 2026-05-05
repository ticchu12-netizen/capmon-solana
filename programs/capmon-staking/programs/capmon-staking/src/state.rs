use anchor_lang::prelude::*;

/// Authority PDA. Acts as the leaf_delegate for staked cNFTs (freeze authority).
/// Only the program can sign as this PDA, so only the program can thaw a staked cNFT.
#[account]
pub struct StakeAuthority {
    pub bump: u8,
}

impl StakeAuthority {
    pub const LEN: usize = 8 + 1; // 8 byte discriminator + 1 byte bump
}

/// Program-wide config PDA.
/// Stores admin pubkey (Pattern 1) and upgrade_authority (Pattern 2 future use).
/// Using a config PDA instead of hardcoded constants makes admin rotation possible.
#[account]
pub struct ProgramConfig {
    pub admin: Pubkey,              // 32 — Pattern 1 admin signer
    pub upgrade_authority: Pubkey,  // 32 — Pattern 2 Ed25519 verify target (unused for now)
    pub bump: u8,                   // 1
}

impl ProgramConfig {
    pub const LEN: usize = 8 + 32 + 32 + 1;
}

/// Per-stake record PDA. One per (owner, nft_asset_id) pair while the cNFT is staked.
/// Closed and rent-refunded when user unstakes.
#[account]
pub struct StakeRecord {
    pub owner: Pubkey,        // 32 — original staker (cNFT leaf owner at stake time)
    pub nft_asset_id: Pubkey, // 32 — cNFT asset ID (derived from merkle_tree + nonce)
    pub tier: u8,             // 1  — 0..=3, LOCKED at stake time, never changes
    pub brain_steps: u32,     // 4  — current trained-step level, mutable via upgrade_brain
    pub staked_at: i64,       // 8  — Unix timestamp at stake time
    pub bump: u8,             // 1  — PDA bump seed
}

impl StakeRecord {
    // 8 byte discriminator + 32 + 32 + 1 + 4 + 8 + 1 = 86 bytes
    pub const LEN: usize = 8 + 32 + 32 + 1 + 4 + 8 + 1;
}
