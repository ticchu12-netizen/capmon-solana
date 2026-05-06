use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

/// Admin-only correction of a stake's tier.
/// Used if a user's NFT was staked at the wrong tier (rare).
/// Does NOT change brain_steps — admin must call upgrade_brain separately if needed.
#[derive(Accounts)]
pub struct UpdateTier<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROGRAM_CONFIG_SEED],
        bump = program_config.bump,
        constraint = program_config.admin == admin.key() @ StakingError::NotAdmin
    )]
    pub program_config: Account<'info, ProgramConfig>,

    /// CHECK: Used as a seed for stake_record PDA. Not deserialized.
    pub owner: AccountInfo<'info>,

    /// CHECK: Used as a seed for stake_record PDA. Verified via stake_record.nft_asset_id.
    pub nft_asset_id: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [STAKE_RECORD_SEED, owner.key().as_ref(), nft_asset_id.key().as_ref()],
        bump = stake_record.bump,
        constraint = stake_record.owner == owner.key() @ StakingError::NotStaker,
        constraint = stake_record.nft_asset_id == nft_asset_id.key() @ StakingError::InvalidAssetId,
    )]
    pub stake_record: Account<'info, StakeRecord>,
}

pub fn handler(ctx: Context<UpdateTier>, new_tier: u8) -> Result<()> {
    require!(new_tier <= MAX_TIER, StakingError::InvalidTier);

    let record = &mut ctx.accounts.stake_record;
    let old_tier = record.tier;
    record.tier = new_tier;

    // Reset brain_steps to the new tier's floor (admin must use upgrade_brain to raise it)
    record.brain_steps = tier_floor(new_tier);

    msg!(
        "Tier updated for NFT {}: {} -> {}, brain_steps reset to {}",
        record.nft_asset_id,
        old_tier,
        new_tier,
        record.brain_steps
    );

    Ok(())
}

/// Returns the floor (minimum) brain_steps for a given tier.
fn tier_floor(tier: u8) -> u32 {
    match tier {
        0 => EVERGREEN_BRAIN_FLOOR,
        1 => AQUASHRINE_BRAIN_FLOOR,
        2 => MAGMAMINE_BRAIN_FLOOR,
        3 => KING_BRAIN_FLOOR,
        _ => 0, // Should never hit due to MAX_TIER check
    }
}
