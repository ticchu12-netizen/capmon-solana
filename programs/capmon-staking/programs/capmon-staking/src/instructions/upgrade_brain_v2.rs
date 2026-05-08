use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;
use crate::error::StakingError;

/// Pattern 2: Ed25519 cryptographic proof brain upgrade.
///
/// The transaction must contain an Ed25519 sigverify instruction at index 0.
/// The signer must be program_config.upgrade_authority, and the message must
/// match: PREFIX || asset_id (32) || new_brain_steps (u32 LE) || timestamp (i64 LE).
const IX_SYSVAR_ID: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");
const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

#[derive(Accounts)]
pub struct UpgradeBrainV2<'info> {
    /// Anyone can submit (user or relayer). Pays fees, doesn't authorize the upgrade
    /// — the Ed25519 proof does.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [PROGRAM_CONFIG_SEED],
        bump = program_config.bump,
    )]
    pub program_config: Account<'info, ProgramConfig>,

    /// CHECK: Used as a seed for stake_record PDA.
    pub owner: AccountInfo<'info>,
    /// CHECK: Used as a seed for stake_record PDA.
    pub nft_asset_id: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [STAKE_RECORD_SEED, owner.key().as_ref(), nft_asset_id.key().as_ref()],
        bump = stake_record.bump,
        constraint = stake_record.owner == owner.key() @ StakingError::NotStaker,
        constraint = stake_record.nft_asset_id == nft_asset_id.key() @ StakingError::InvalidAssetId,
    )]
    pub stake_record: Account<'info, StakeRecord>,

    /// CHECK: Validated by address constraint to be the Solana instructions sysvar.
    #[account(address = IX_SYSVAR_ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpgradeBrainV2Params {
    pub new_brain_steps: u32,
    pub timestamp: i64,
}

pub const MESSAGE_PREFIX: &[u8] = b"capmon_upgrade_brain_v1";

#[event]
pub struct BrainUpgradedV2 {
    pub user: Pubkey,
    pub nft_asset_id: Pubkey,
    pub old_brain_steps: u32,
    pub new_brain_steps: u32,
    pub timestamp: i64,
    pub upgrade_method: u8,
}

/// Manually parse the Solana instructions sysvar account at the given index.
/// Returns (program_id, instruction_data).
///
/// Sysvar layout:
///   [0..2]              num_instructions (u16 LE)
///   [2..2+2N]           offset table (one u16 LE per instruction)
///   At offset O for each ix:
///     [O..O+2]          num_accounts (u16 LE)
///     [O+2..]           accounts: 33 bytes each (1 meta + 32 pubkey)
///     [after_accounts]  program_id (32 bytes)
///                       data_len (u16 LE)
///                       data (data_len bytes)
fn load_instruction_at_index(
    sysvar_account: &AccountInfo,
    target_index: usize,
) -> Result<(Pubkey, Vec<u8>)> {
    let data = sysvar_account.try_borrow_data()?;

    require!(data.len() >= 2, StakingError::Ed25519IxMalformed);
    let num_instructions = u16::from_le_bytes([data[0], data[1]]) as usize;
    require!(target_index < num_instructions, StakingError::Ed25519IxMalformed);

    let offset_table_pos = 2 + target_index * 2;
    require!(offset_table_pos + 2 <= data.len(), StakingError::Ed25519IxMalformed);
    let ix_offset = u16::from_le_bytes([data[offset_table_pos], data[offset_table_pos + 1]]) as usize;

    require!(ix_offset + 2 <= data.len(), StakingError::Ed25519IxMalformed);
    let num_accounts = u16::from_le_bytes([data[ix_offset], data[ix_offset + 1]]) as usize;

    let accounts_section_size = num_accounts * 33;
    let after_accounts = ix_offset + 2 + accounts_section_size;
    require!(after_accounts + 32 <= data.len(), StakingError::Ed25519IxMalformed);

    let mut pid_bytes = [0u8; 32];
    pid_bytes.copy_from_slice(&data[after_accounts..after_accounts + 32]);
    let program_id = Pubkey::from(pid_bytes);

    let data_len_offset = after_accounts + 32;
    require!(data_len_offset + 2 <= data.len(), StakingError::Ed25519IxMalformed);
    let data_len = u16::from_le_bytes([data[data_len_offset], data[data_len_offset + 1]]) as usize;

    let ix_data_start = data_len_offset + 2;
    require!(ix_data_start + data_len <= data.len(), StakingError::Ed25519IxMalformed);

    let ix_data = data[ix_data_start..ix_data_start + data_len].to_vec();

    Ok((program_id, ix_data))
}

pub fn handler(ctx: Context<UpgradeBrainV2>, params: UpgradeBrainV2Params) -> Result<()> {
    // ---- 1. Load Ed25519 sigverify ix at index 0 ----
    let (program_id, ix_data) =
        load_instruction_at_index(&ctx.accounts.instructions_sysvar, 0)?;
    require!(
        program_id == ED25519_PROGRAM_ID,
        StakingError::WrongSigverifyProgram
    );

    // ---- 2. Parse Ed25519 ix data ----
    // Layout produced by Ed25519Program::createInstructionWithPublicKey:
    //   [0..16]    header (1 sig, offsets pointing into the data section below)
    //   [16..48]   public_key (32)
    //   [48..112]  signature (64)
    //   [112..]    message
    require!(ix_data.len() >= 112, StakingError::Ed25519IxMalformed);
    require!(ix_data[0] == 1, StakingError::Ed25519IxMalformed); // num_signatures must be 1

    let signer_pubkey = &ix_data[16..48];
    let expected_pubkey = ctx.accounts.program_config.upgrade_authority;
    require!(
        signer_pubkey == expected_pubkey.as_ref(),
        StakingError::WrongUpgradeAuthority
    );

    let signed_message = &ix_data[112..];

    // ---- 3. Reconstruct expected message ----
    let mut expected = Vec::with_capacity(MESSAGE_PREFIX.len() + 32 + 4 + 8);
    expected.extend_from_slice(MESSAGE_PREFIX);
    expected.extend_from_slice(&ctx.accounts.stake_record.nft_asset_id.to_bytes());
    expected.extend_from_slice(&params.new_brain_steps.to_le_bytes());
    expected.extend_from_slice(&params.timestamp.to_le_bytes());

    require!(
        signed_message == expected.as_slice(),
        StakingError::MessageMismatch
    );

    // ---- 4. Apply business rules (same as Pattern 1) ----
    let record = &mut ctx.accounts.stake_record;
    let (floor, ceiling) = tier_range(record.tier);
    require!(
        params.new_brain_steps >= floor && params.new_brain_steps <= ceiling,
        StakingError::InvalidBrainSteps
    );
    require!(
        params.new_brain_steps > record.brain_steps,
        StakingError::StepsNotMonotonic
    );

    let old_steps = record.brain_steps;
    record.brain_steps = params.new_brain_steps;

    emit!(BrainUpgradedV2 {
        user: record.owner,
        nft_asset_id: record.nft_asset_id,
        old_brain_steps: old_steps,
        new_brain_steps: record.brain_steps,
        timestamp: params.timestamp,
        upgrade_method: 1,
    });

    msg!(
        "[Pattern 2] Brain upgraded for NFT {}: {} -> {} steps (Ed25519 verified)",
        record.nft_asset_id,
        old_steps,
        record.brain_steps
    );
    Ok(())
}

fn tier_range(tier: u8) -> (u32, u32) {
    match tier {
        0 => (EVERGREEN_BRAIN_FLOOR, EVERGREEN_BRAIN_CEILING),
        1 => (AQUASHRINE_BRAIN_FLOOR, AQUASHRINE_BRAIN_CEILING),
        2 => (MAGMAMINE_BRAIN_FLOOR, MAGMAMINE_BRAIN_CEILING),
        3 => (KING_BRAIN_FLOOR, KING_BRAIN_CEILING),
        _ => (0, 0),
    }
}
