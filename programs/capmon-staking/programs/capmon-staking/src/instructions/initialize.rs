use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = StakeAuthority::LEN,
        seeds = [STAKE_AUTHORITY_SEED],
        bump
    )]
    pub stake_authority: Account<'info, StakeAuthority>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let auth = &mut ctx.accounts.stake_authority;
    auth.bump = ctx.bumps.stake_authority;
    msg!("StakeAuthority initialized at {}", auth.key());
    Ok(())
}
