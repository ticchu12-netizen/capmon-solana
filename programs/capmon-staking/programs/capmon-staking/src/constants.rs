use anchor_lang::prelude::*;

// ===== PDA seed prefixes =====
// Must match exactly between Rust and TypeScript clients.

#[constant]
pub const STAKE_AUTHORITY_SEED: &[u8] = b"stake_authority";

#[constant]
pub const STAKE_RECORD_SEED: &[u8] = b"stake_record";

#[constant]
pub const PROGRAM_CONFIG_SEED: &[u8] = b"program_config";

// ===== Tier system =====
// 0 = Evergreen ($79)
// 1 = Aquashrine ($249)
// 2 = Magmamine ($599)
// 3 = King ($1,199)

pub const MAX_TIER: u8 = 3;

// Tier brain-step ranges (lower bound inclusive, upper bound inclusive).
pub const EVERGREEN_BRAIN_FLOOR: u32 = 0;
pub const EVERGREEN_BRAIN_CEILING: u32 = 14_000_000;

pub const AQUASHRINE_BRAIN_FLOOR: u32 = 15_000_000;
pub const AQUASHRINE_BRAIN_CEILING: u32 = 39_000_000;

pub const MAGMAMINE_BRAIN_FLOOR: u32 = 40_000_000;
pub const MAGMAMINE_BRAIN_CEILING: u32 = 59_000_000;

pub const KING_BRAIN_FIXED: u32 = 60_000_000;

// ===== External program IDs =====
// SPL Account Compression program (handles Merkle tree state for cNFTs)
pub const SPL_ACCOUNT_COMPRESSION_ID: Pubkey =
    pubkey!("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");

// SPL Noop program (Bubblegum logs state changes here)
pub const SPL_NOOP_ID: Pubkey =
    pubkey!("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
