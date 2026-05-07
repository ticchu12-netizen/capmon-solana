use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::AccountMeta, program::invoke_signed};
use mpl_bubblegum::instructions::{ThawAndRevokeV2, ThawAndRevokeV2InstructionArgs};

use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

#[derive(Accounts)]
#[instruction(params: UnstakeParams)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [STAKE_AUTHORITY_SEED], bump = stake_authority.bump)]
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

    /// CHECK: cNFT asset ID. Used as seed for stake_record PDA.
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
pub struct UnstakeParams {
    pub root: [u8; 32],
    pub data_hash: [u8; 32],
    pub creator_hash: [u8; 32],
    pub collection_hash: [u8; 32],
    pub asset_data_hash: [u8; 32],
    pub flags: u8,
    pub nonce: u64,
    pub index: u32,
}

#[event]
pub struct Unstaked {
    pub owner: Pubkey,
    pub nft_asset_id: Pubkey,
    pub final_brain_steps: u32,
    pub unstaked_at: i64,
}

pub fn handler<'info>(
    ctx: Context<'info, Unstake<'info>>,
    params: UnstakeParams,
) -> Result<()> {
    let final_brain_steps = ctx.accounts.stake_record.brain_steps;
    let nft_asset_id = ctx.accounts.stake_record.nft_asset_id;
    let owner_key = ctx.accounts.stake_record.owner;

    let auth_bump = ctx.accounts.stake_authority.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[STAKE_AUTHORITY_SEED, &[auth_bump]]];

    // Manual CPI for ThawV2. Anchor + Bubblegum CpiBuilder doesn't propagate
    // PDA signer flags (issue #1129), and the CpiBuilder hides asset_data_hash
    // and flags args that are required for V2 leaf hash reconstruction.
    let thaw_struct = ThawAndRevokeV2 {
        tree_config: ctx.accounts.tree_config.key(),
        payer: ctx.accounts.owner.key(),
        leaf_delegate: Some(ctx.accounts.stake_authority.key()),
        leaf_owner: ctx.accounts.owner.key(),
        merkle_tree: ctx.accounts.merkle_tree.key(),
        log_wrapper: ctx.accounts.log_wrapper.key(),
        compression_program: ctx.accounts.compression_program.key(),
        system_program: ctx.accounts.system_program.key(),
    };

    let args = ThawAndRevokeV2InstructionArgs {
        root: params.root,
        data_hash: params.data_hash,
        creator_hash: params.creator_hash,
        collection_hash: Some(params.collection_hash),
        asset_data_hash: Some(params.asset_data_hash),
        flags: Some(params.flags),
        nonce: params.nonce,
        index: params.index,
    };

    let mut ix = thaw_struct.instruction(args);

    for ra in ctx.remaining_accounts.iter() {
        ix.accounts.push(AccountMeta::new_readonly(*ra.key, false));
    }

    // Belt-and-suspenders: ensure stake_authority has signer flag set in metas
    let stake_auth_key = ctx.accounts.stake_authority.key();
    for meta in ix.accounts.iter_mut() {
        if meta.pubkey == stake_auth_key {
            meta.is_signer = true;
        }
    }

    // Account infos in the order of ThawV2 struct fields (Option=None gets
    // bubblegum_program as placeholder, matching Codama generated convention).
    let mut account_infos: Vec<AccountInfo<'info>> = vec![
        ctx.accounts.tree_config.to_account_info(),       // tree_config
        ctx.accounts.stake_authority.to_account_info(),   // authority
        ctx.accounts.owner.to_account_info(),             // payer
        ctx.accounts.stake_authority.to_account_info(),   // leaf_delegate
        ctx.accounts.owner.to_account_info(),             // leaf_owner
        ctx.accounts.merkle_tree.to_account_info(),       // merkle_tree
        ctx.accounts.log_wrapper.to_account_info(),       // log_wrapper
        ctx.accounts.compression_program.to_account_info(), // compression_program
        ctx.accounts.system_program.to_account_info(),    // system_program
    ];

    for ra in ctx.remaining_accounts.iter() {
        account_infos.push(ra.clone());
    }

    invoke_signed(&ix, &account_infos, signer_seeds)?;

    emit!(Unstaked {
        owner: owner_key,
        nft_asset_id,
        final_brain_steps,
        unstaked_at: Clock::get()?.unix_timestamp,
    });

    msg!("Unstaked cNFT {} for owner {}", nft_asset_id, owner_key);

    Ok(())
}
