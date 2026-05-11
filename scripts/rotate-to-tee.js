const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

// ============ CONFIG ============
const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("FSenbAEVTgTdfM2723xkk8A2Y5oD8wtmB2EhiWXzpqSg");
const OLD_AUTHORITY_KEYPAIR_PATH = "/home/harmeet/.config/solana/id.json";
const NEW_TEE_AUTHORITY = new PublicKey("xu29nEios298MsDQCCYtcR4NfZTX84zD4WMMG9Mrivo");
const IDL_PATH = "/home/harmeet/capmon-solana/programs/capmon-staking/target/idl/capmon_staking.json";
// ================================

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  // Load OLD authority (signer)
  const oldAuthority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(OLD_AUTHORITY_KEYPAIR_PATH, "utf-8")))
  );
  console.log("Old authority signer:", oldAuthority.publicKey.toBase58());
  console.log("New TEE authority:   ", NEW_TEE_AUTHORITY.toBase58());

  // Setup Anchor
  const wallet = new anchor.Wallet(oldAuthority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new anchor.Program(idl, provider);

  // Find ProgramConfig PDA (adjust seeds if yours differ)
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_config")],
    PROGRAM_ID
  );
  console.log("Config PDA:", configPda.toBase58());

  // Print current authority before
  const beforeAcct = await program.account.programConfig.fetch(configPda);
  console.log("BEFORE upgrade_authority:", beforeAcct.upgradeAuthority.toBase58());
console.log("ADMIN:", beforeAcct.admin.toBase58());

  // Call set_upgrade_authority
  const sig = await program.methods
    .setUpgradeAuthority(NEW_TEE_AUTHORITY)
    .accounts({
      config: configPda,
      authority: oldAuthority.publicKey,
    })
    .signers([oldAuthority])
    .rpc();

  console.log("✅ Tx:", sig);
  console.log("Explorer:", `https://solscan.io/tx/${sig}?cluster=devnet`);

  // Verify
  const afterAcct = await program.account.programConfig.fetch(configPda);
  console.log("AFTER upgrade_authority:", afterAcct.upgradeAuthority.toBase58());

  if (afterAcct.upgradeAuthority.equals(NEW_TEE_AUTHORITY)) {
    console.log("🎉 Rotation confirmed on-chain");
  } else {
    console.log("⚠️  Mismatch — investigate");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
