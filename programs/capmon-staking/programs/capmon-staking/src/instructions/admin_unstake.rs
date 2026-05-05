use anchor_lang::prelude::*;
use mpl_bubblegum::instructions::ThawAndRevokeV2CpiBuilder;

use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

/// Admin emergency escape hatch.
/// Thaws the cNFT and closes the stake record without requiring the original
/// staker's signature. Rent refunds go to the original staker.
#[derive(Accounts)]
#[instruction(params: AdminUnstakeParams)]
pub struct AdminUnstake<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Original staker. Receives rent refund. Validated via stake_record.owner.
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    #[account(
        seeds = [PROGRAM_CONFIG_SEED],
        bump = program_config.bump,
        constraint = program_config.admin == admin.key() @ StakingError::NotAdmin
    )]
    pub program_config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [STAKE_AUTHORITY_SEED],
        bump = stake_authority.bump
    )]
    pub stake_authority: Account<'info, StakeAuthority>,

    #[account(
        mut,
        close = owner,
        seeds = [STAKE_RECORD_SEED, owner.key().as_ref(), nft_asset_id.key().as_ref()],
        bump = stake_record.bump,
        constraint = stake_record.owner == owner.key() @ StakingError::NotStaker,
        constraint = stake_record.nft_asset_id == nft_asset_id.key() @ StakingError::InvalidAssetId,
    )]
    pub stake_record: Account<'info, StakeRecord>,

    /// CHECK: cNFT asset ID. Used as seed.
    pub nft_asset_id: AccountInfo<'info>,

    /// CHECK: Bubblegum tree_config PDA.
    #[account(mut)]
    pub tree_config: AccountInfo<'info>,

    /// CHECK: cNFT's Merkle tree.
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
pub struct AdminUnstakeParams {
    pub root: [u8; 32],
    pub data_hash: [u8; 32],
    pub creator_hash: [u8; 32],
    pub nonce: u64,
    pub index: u32,
}

#[event]
pub struct AdminUnstaked {
    pub admin: Pubkey,
    pub owner: Pubkey,
    pub nft_asset_id: Pubkey,
    pub final_brain_steps: u32,
    pub unstaked_at: i64,
}

pub fn handler<'info>(
    ctx: Context<'info, AdminUnstake<'info>>,
    params: AdminUnstakeParams,
) -> Result<()> {
    let final_brain_steps = ctx.accounts.stake_record.brain_steps;
    let nft_asset_id = ctx.accounts.stake_record.nft_asset_id;
    let owner_key = ctx.accounts.stake_record.owner;
    let admin_key = ctx.accounts.admin.key();

    let auth_bump = ctx.accounts.stake_authority.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[STAKE_AUTHORITY_SEED, &[auth_bump]]];

    // Bind all to_account_info() calls for lifetime
    let admin_info = ctx.accounts.admin.to_account_info();
    let stake_auth_info = ctx.accounts.stake_authority.to_account_info();
    let system_program_info = ctx.accounts.system_program.to_account_info();

    let mut cpi = ThawAndRevokeV2CpiBuilder::new(&ctx.accounts.bubblegum_program);
    cpi.tree_config(&ctx.accounts.tree_config)
        .payer(&admin_info)
        .leaf_delegate(Some(&stake_auth_info))
        .leaf_owner(&ctx.accounts.owner)
        .merkle_tree(&ctx.accounts.merkle_tree)
        .log_wrapper(&ctx.accounts.log_wrapper)
        .compression_program(&ctx.accounts.compression_program)
        .system_program(&system_program_info)
        .root(params.root)
        .data_hash(params.data_hash)
        .creator_hash(params.creator_hash)
        .nonce(params.nonce)
        .index(params.index);

    for account in ctx.remaining_accounts.iter() {
        cpi.add_remaining_account(account, false, false);
    }

    cpi.invoke_signed(signer_seeds)?;

    emit!(AdminUnstaked {
        admin: admin_key,
        owner: owner_key,
        nft_asset_id,
        final_brain_steps,
        unstaked_at: Clock::get()?.unix_timestamp,
    });

    msg!(
        "ADMIN UNSTAKE: cNFT {} returned to original owner {} (final brain_steps: {})",
        nft_asset_id,
        owner_key,
        final_brain_steps
    );

    Ok(())
}
