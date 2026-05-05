use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Tier must be between 0 and 3")]
    InvalidTier,
    #[msg("Brain steps are not within the current tier's allowed range")]
    InvalidBrainSteps,
    #[msg("Brain steps must increase, not decrease")]
    StepsNotMonotonic,
    #[msg("Caller is not the original staker")]
    NotStaker,
    #[msg("Caller is not the admin")]
    NotAdmin,
    #[msg("ProgramConfig has not been initialized")]
    ConfigNotInitialized,
    #[msg("Invalid asset ID")]
    InvalidAssetId,
}
