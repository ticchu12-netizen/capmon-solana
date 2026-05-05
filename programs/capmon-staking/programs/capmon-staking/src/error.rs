use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Tier must be between 0 and 3")]
    InvalidTier,
    #[msg("Token mint is not a valid NFT (supply != 1 or decimals != 0)")]
    NotAnNft,
    #[msg("Token account does not match the provided NFT mint")]
    WrongMint,
    #[msg("Token account is not owned by the expected wallet")]
    WrongOwner,
    #[msg("Caller is not the original staker")]
    NotStaker,
    #[msg("Caller is not the admin")]
    NotAdmin,
}
