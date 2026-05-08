use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

/// Admin-only: rotate the upgrade_authority pubkey on ProgramConfig.
/// Used to install the Capbot server's hot key for Pattern 2 brain upgrades.
#[derive(Accounts)]
pub struct SetUpgradeAuthority<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PROGRAM_CONFIG_SEED],
        bump = program_config.bump,
        constraint = program_config.admin == admin.key() @ StakingError::NotAdmin,
    )]
    pub program_config: Account<'info, ProgramConfig>,
}

pub fn handler(ctx: Context<SetUpgradeAuthority>, new_authority: Pubkey) -> Result<()> {
    let cfg = &mut ctx.accounts.program_config;
    let old = cfg.upgrade_authority;
    cfg.upgrade_authority = new_authority;
    msg!("upgrade_authority rotated: {} -> {}", old, new_authority);
    Ok(())
}
