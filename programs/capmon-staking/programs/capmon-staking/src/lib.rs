pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("FSenbAEVTgTdfM2723xkk8A2Y5oD8wtmB2EhiWXzpqSg");

#[program]
pub mod capmon_staking {
    use super::*;

    /// One-time bootstrap: creates the StakeAuthority PDA.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// One-time bootstrap: creates the ProgramConfig PDA.
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handler(ctx)
    }

    /// User stakes a cNFT (delegate + freeze in one atomic CPI to Bubblegum V2).
    pub fn stake<'info>(
        ctx: Context<'info, Stake<'info>>,
        params: StakeParams,
    ) -> Result<()> {
        instructions::stake::handler(ctx, params)
    }

    /// User unstakes their cNFT (thaw + revoke + close StakeRecord).
    pub fn unstake<'info>(
        ctx: Context<'info, Unstake<'info>>,
        params: UnstakeParams,
    ) -> Result<()> {
        instructions::unstake::handler(ctx, params)
    }

    /// Admin emergency unstake (escape hatch).
    pub fn admin_unstake<'info>(
        ctx: Context<'info, AdminUnstake<'info>>,
        params: AdminUnstakeParams,
    ) -> Result<()> {
        instructions::admin_unstake::handler(ctx, params)
    }

    /// Admin tier correction. Resets brain_steps to new tier's floor.
    pub fn update_tier(ctx: Context<UpdateTier>, new_tier: u8) -> Result<()> {
        instructions::update_tier::handler(ctx, new_tier)
    }

    /// Pattern 1: Admin-signed brain step upgrade.
    pub fn upgrade_brain(
        ctx: Context<UpgradeBrain>,
        params: UpgradeBrainParams,
    ) -> Result<()> {
        instructions::upgrade_brain::handler(ctx, params)
    }
}
