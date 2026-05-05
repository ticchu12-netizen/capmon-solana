use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use anchor_spl::associated_token::AssociatedToken;

use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub nft_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = owner_nft_account.mint == nft_mint.key() @ StakingError::WrongMint,
        constraint = owner_nft_account.owner == owner.key() @ StakingError::WrongOwner,
        constraint = owner_nft_account.amount == 1 @ StakingError::NotAnNft,
    )]
    pub owner_nft_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [STAKE_AUTHORITY_SEED],
        bump = stake_authority.bump
    )]
    pub stake_authority: Account<'info, StakeAuthority>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = nft_mint,
        associated_token::authority = stake_authority,
    )]
    pub vault_nft_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        space = StakeRecord::LEN,
        seeds = [STAKE_RECORD_SEED, owner.key().as_ref(), nft_mint.key().as_ref()],
        bump
    )]
    pub stake_record: Account<'info, StakeRecord>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Stake>, tier: u8) -> Result<()> {
    require!(tier <= MAX_TIER, StakingError::InvalidTier);

    let mint = &ctx.accounts.nft_mint;
    require!(mint.supply == 1, StakingError::NotAnNft);
    require!(mint.decimals == 0, StakingError::NotAnNft);

    // Transfer NFT from owner's token account to vault.
    let cpi_accounts = Transfer {
        from: ctx.accounts.owner_nft_account.to_account_info(),
        to: ctx.accounts.vault_nft_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token::transfer(cpi_ctx, 1)?;

    // Initialize stake record.
    let record = &mut ctx.accounts.stake_record;
    record.owner = ctx.accounts.owner.key();
    record.nft_mint = ctx.accounts.nft_mint.key();
    record.tier = tier;
    record.staked_at = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.stake_record;

    msg!(
        "Staked NFT {} for owner {} with tier {}",
        record.nft_mint,
        record.owner,
        record.tier
    );

    Ok(())
}
