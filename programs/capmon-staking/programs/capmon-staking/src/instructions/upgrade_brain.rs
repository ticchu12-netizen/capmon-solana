use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

/// Pattern 1: Admin-signed brain upgrade.
/// Cloud Function deducts Cap Coins from Firestore (off-chain), then admin signs
/// this instruction to record the new brain_steps on-chain.
///
/// Future Pattern 2 will replace this with Ed25519 signature verification of a
/// burn receipt, allowing the upgrade to be cryptographically proven on-chain
/// without requiring admin to be the signer.
#[derive(Accounts)]
pub struct UpgradeBrain<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROGRAM_CONFIG_SEED],
        bump = program_config.bump,
        constraint = program_config.admin == admin.key() @ StakingError::NotAdmin
    )]
    pub program_config: Account<'info, ProgramConfig>,

    /// CHECK: Used as a seed for stake_record PDA.
    pub owner: AccountInfo<'info>,

    /// CHECK: Used as a seed for stake_record PDA.
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpgradeBrainParams {
    pub new_brain_steps: u32,
    pub timestamp: i64,
    pub nonce: [u8; 16],
}

#[event]
pub struct BrainUpgraded {
    pub user: Pubkey,
    pub nft_asset_id: Pubkey,
    pub old_brain_steps: u32,
    pub new_brain_steps: u32,
    pub timestamp: i64,
    pub upgrade_method: u8, // 0 = admin-signed (Pattern 1), 1 = ed25519 (Pattern 2 future)
}

pub fn handler(ctx: Context<UpgradeBrain>, params: UpgradeBrainParams) -> Result<()> {
    let record = &mut ctx.accounts.stake_record;

    // Validate target steps are within the tier's allowed range
    let (floor, ceiling) = tier_range(record.tier);
    require!(
        params.new_brain_steps >= floor && params.new_brain_steps <= ceiling,
        StakingError::InvalidBrainSteps
    );

    // Validate monotonic increase (no downgrades)
    require!(
        params.new_brain_steps > record.brain_steps,
        StakingError::StepsNotMonotonic
    );

    let old_steps = record.brain_steps;
    record.brain_steps = params.new_brain_steps;

    emit!(BrainUpgraded {
        user: record.owner,
        nft_asset_id: record.nft_asset_id,
        old_brain_steps: old_steps,
        new_brain_steps: record.brain_steps,
        timestamp: params.timestamp,
        upgrade_method: 0, // Pattern 1: admin-signed
    });

    msg!(
        "Brain upgraded for NFT {}: {} -> {} steps",
        record.nft_asset_id,
        old_steps,
        record.brain_steps
    );

    Ok(())
}

/// Returns (floor, ceiling) brain_steps range for a given tier.
fn tier_range(tier: u8) -> (u32, u32) {
    match tier {
        0 => (EVERGREEN_BRAIN_FLOOR, EVERGREEN_BRAIN_CEILING),
        1 => (AQUASHRINE_BRAIN_FLOOR, AQUASHRINE_BRAIN_CEILING),
        2 => (MAGMAMINE_BRAIN_FLOOR, MAGMAMINE_BRAIN_CEILING),
        3 => (KING_BRAIN_FIXED, KING_BRAIN_FIXED), // King is fixed
        _ => (0, 0),
    }
}
