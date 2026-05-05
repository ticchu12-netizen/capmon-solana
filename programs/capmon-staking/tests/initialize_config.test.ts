import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { CapmonStaking } from "../target/types/capmon_staking";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("initialize_config", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CapmonStaking as Program<CapmonStaking>;
  const provider = anchor.AnchorProvider.env();

  it("initializes the ProgramConfig PDA with deployer as admin", async () => {
    const [programConfigPda, programConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_config")],
      program.programId
    );

    console.log("ProgramConfig PDA:", programConfigPda.toBase58());

    let alreadyInitialized = false;
    try {
      const existing = await program.account.programConfig.fetch(programConfigPda);
      console.log("ProgramConfig already initialized.");
      console.log("  admin:", existing.admin.toBase58());
      console.log("  upgrade_authority:", existing.upgradeAuthority.toBase58());
      alreadyInitialized = true;
    } catch (err) {
      console.log("ProgramConfig not yet initialized. Creating...");
    }

    if (!alreadyInitialized) {
      const tx = await program.methods
        .initializeConfig()
        .accounts({
          deployer: provider.wallet.publicKey,
          programConfig: programConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("InitializeConfig tx signature:", tx);
    }

    // Verify
    const cfg = await program.account.programConfig.fetch(programConfigPda);
    console.log("Final state:");
    console.log("  admin:", cfg.admin.toBase58());
    console.log("  upgrade_authority:", cfg.upgradeAuthority.toBase58());
    console.log("  bump:", cfg.bump);

    assert.equal(
      cfg.admin.toBase58(),
      provider.wallet.publicKey.toBase58(),
      "Admin should be the deployer"
    );
    assert.equal(
      cfg.upgradeAuthority.toBase58(),
      provider.wallet.publicKey.toBase58(),
      "Upgrade authority should be the deployer"
    );
    assert.equal(cfg.bump, programConfigBump, "Bump mismatch");
  });
});
