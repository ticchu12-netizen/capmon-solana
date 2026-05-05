use anchor_lang::prelude::*;

// PDA seed prefixes — must match exactly between Rust and TypeScript clients.
#[constant]
pub const STAKE_AUTHORITY_SEED: &[u8] = b"stake_authority";

#[constant]
pub const STAKE_RECORD_SEED: &[u8] = b"stake_record";

// Number of valid tiers (0..=3 = Evergreen / Aquashrine / Magmamine / King).
pub const MAX_TIER: u8 = 3;

// Hardcoded admin pubkey from `solana address`.
// In production this would be a multisig or DAO authority.
pub const ADMIN_PUBKEY: Pubkey = pubkey!("76B3Eo6g6o2JHj7vrXrQxYANy2e9Ngum8HmPmzQEbuoM");
