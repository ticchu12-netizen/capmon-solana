use anchor_lang::prelude::*;
use mpl_bubblegum::instructions::DelegateAndFreezeV2CpiBuilder;

use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

/// Stakes a Capmon cNFT by:
/// 1. Delegating freeze authority to the program's StakeAuthority PDA
/// 2. Freezing the cNFT (locks it in user's wallet)
/// 3. Creating a StakeRecord PDA
#[derive(Accounts)]
#[instruction(params: StakeParams)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [STAKE_AUTHORITY_SEED],
        bump = stake_authority.bump
    )]
    pub stake_authority: Account<'info, StakeAuthority>,

    #[account(
        init,
        payer = owner,
        space = StakeRecord::LEN,
        seeds = [STAKE_RECORD_SEED, owner.key().as_ref(), nft_asset_id.key().as_ref()],
        bump
    )]
    pub stake_record: Account<'info, StakeRecord>,

    /// CHECK: cNFT asset ID. Used as seed for stake_record PDA.
    pub nft_asset_id: AccountInfo<'info>,

    /// CHECK: Bubblegum tree_config PDA. Validated by Bubblegum CPI.
    #[account(mut)]
    pub tree_config: AccountInfo<'info>,

    /// CHECK: cNFT's Merkle tree account. Validated by Bubblegum CPI.
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,

    /// CHECK: Bubblegum program.
    #[account(address = mpl_bubblegum::ID)]
    pub bubblegum_program: AccountInfo<'info>,

    /// CHECK: SPL Account Compression program.
    #[account(address = SPL_ACCOUNT_COMPRESSION_ID)]
    pub compression_program: AccountInfo<'info>,

    /// CHECK: SPL Noop log wrapper.
    #[account(address = SPL_NOOP_ID)]
    pub log_wrapper: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StakeParams {
    pub tier: u8,
    pub root: [u8; 32],
    pub data_hash: [u8; 32],
    pub creator_hash: [u8; 32],
    pub nonce: u64,
    pub index: u32,
}

#[event]
pub struct Staked {
    pub owner: Pubkey,
    pub nft_asset_id: Pubkey,
    pub tier: u8,
    pub initial_brain_steps: u32,
    pub staked_at: i64,
}

pub fn handler<'info>(
    ctx: Context<'info, Stake<'info>>,
    params: StakeParams,
) -> Result<()> {
    // 1. Validate tier
    require!(params.tier <= MAX_TIER, StakingError::InvalidTier);

    // 2. Initialize stake record
    let initial_brain_steps = tier_initial_brain_steps(params.tier);

    let record = &mut ctx.accounts.stake_record;
    record.owner = ctx.accounts.owner.key();
    record.nft_asset_id = ctx.accounts.nft_asset_id.key();
    record.tier = params.tier;
    record.brain_steps = initial_brain_steps;
    record.staked_at = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.stake_record;

    // Save these before we drop our mutable borrow on record (used in event below)
    let event_owner = record.owner;
    let event_asset_id = record.nft_asset_id;
    let event_tier = record.tier;
    let event_brain_steps = record.brain_steps;
    let event_staked_at = record.staked_at;

    // 3. CPI: delegate + freeze the cNFT
    // Bind all to_account_info() calls to let variables to extend their lifetimes
    let owner_info = ctx.accounts.owner.to_account_info();
    let stake_auth_info = ctx.accounts.stake_authority.to_account_info();
    let system_program_info = ctx.accounts.system_program.to_account_info();

    let mut cpi = DelegateAndFreezeV2CpiBuilder::new(&ctx.accounts.bubblegum_program);
    cpi.tree_config(&ctx.accounts.tree_config)
        .payer(&owner_info)
        .leaf_owner(Some(&owner_info))
        .new_leaf_delegate(&stake_auth_info)
        .merkle_tree(&ctx.accounts.merkle_tree)
        .log_wrapper(&ctx.accounts.log_wrapper)
        .compression_program(&ctx.accounts.compression_program)
        .system_program(&system_program_info)
        .root(params.root)
        .data_hash(params.data_hash)
        .creator_hash(params.creator_hash)
        .nonce(params.nonce)
        .index(params.index);

    // Merkle proof passed as remaining accounts
    for account in ctx.remaining_accounts.iter() {
        cpi.add_remaining_account(account, false, false);
    }

    cpi.invoke()?;

    // 4. Emit event
    emit!(Staked {
        owner: event_owner,
        nft_asset_id: event_asset_id,
        tier: event_tier,
        initial_brain_steps: event_brain_steps,
        staked_at: event_staked_at,
    });

    msg!(
        "Staked cNFT {} for owner {} at tier {} ({} brain_steps)",
        event_asset_id,
        event_owner,
        event_tier,
        event_brain_steps
    );

    Ok(())
}

fn tier_initial_brain_steps(tier: u8) -> u32 {
    match tier {
        0 => EVERGREEN_BRAIN_FLOOR,
        1 => AQUASHRINE_BRAIN_FLOOR,
        2 => MAGMAMINE_BRAIN_FLOOR,
        3 => KING_BRAIN_FIXED,
        _ => 0,
    }
}
