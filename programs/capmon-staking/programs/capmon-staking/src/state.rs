use anchor_lang::prelude::*;

/// Authority PDA that owns all vault token accounts.
/// Only the program can sign for transfers FROM the vault, using the bump.
#[account]
pub struct StakeAuthority {
    pub bump: u8,
}

impl StakeAuthority {
    // 8 byte discriminator + 1 byte bump
    pub const LEN: usize = 8 + 1;
}

/// Per-stake record. Each (user, NFT) pair has one record while staked.
/// Closed and rent-refunded when user unstakes.
#[account]
pub struct StakeRecord {
    pub owner: Pubkey,        // 32 — who staked it
    pub nft_mint: Pubkey,     // 32 — which NFT was staked
    pub tier: u8,             // 1  — 0..=3 (Evergreen..King)
    pub staked_at: i64,       // 8  — Unix timestamp at stake time
    pub bump: u8,             // 1  — PDA bump seed
}

impl StakeRecord {
    // 8 byte discriminator + 32 + 32 + 1 + 8 + 1 = 82 bytes
    pub const LEN: usize = 8 + 32 + 32 + 1 + 8 + 1;
}
