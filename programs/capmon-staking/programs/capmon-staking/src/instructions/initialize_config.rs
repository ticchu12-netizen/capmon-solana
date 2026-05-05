use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;

/// Bootstraps the ProgramConfig PDA.
/// Must be called once after deploy, by the deploy authority.
/// The deploy authority becomes both `admin` (Pattern 1) and
/// `upgrade_authority` (Pattern 2 placeholder, currently unused).
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(
        init,
        payer = deployer,
        space = ProgramConfig::LEN,
        seeds = [PROGRAM_CONFIG_SEED],
        bump
    )]
    pub program_config: Account<'info, ProgramConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>) -> Result<()> {
    let cfg = &mut ctx.accounts.program_config;
    cfg.admin = ctx.accounts.deployer.key();
    cfg.upgrade_authority = ctx.accounts.deployer.key();
    cfg.bump = ctx.bumps.program_config;

    msg!(
        "ProgramConfig initialized. admin = {}, upgrade_authority = {}",
        cfg.admin,
        cfg.upgrade_authority
    );

    Ok(())
}
