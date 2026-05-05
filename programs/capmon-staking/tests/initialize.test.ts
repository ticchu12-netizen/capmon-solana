import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { CapmonStaking } from "../target/types/capmon_staking";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("initialize", () => {
  // Configure the client to use the cluster from Anchor.toml (devnet)
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CapmonStaking as Program<CapmonStaking>;
  const provider = anchor.AnchorProvider.env();

  it("initializes the StakeAuthority PDA", async () => {
    // Derive the StakeAuthority PDA
    const [stakeAuthorityPda, stakeAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_authority")],
      program.programId
    );

    console.log("StakeAuthority PDA:", stakeAuthorityPda.toBase58());
    console.log("Bump:", stakeAuthorityBump);

    // Check if already initialized (idempotency check for re-runs)
    let alreadyInitialized = false;
    try {
      const existing = await program.account.stakeAuthority.fetch(stakeAuthorityPda);
      console.log("StakeAuthority already initialized. Bump:", existing.bump);
      alreadyInitialized = true;
    } catch (err) {
      console.log("StakeAuthority not yet initialized. Creating...");
    }

    if (!alreadyInitialized) {
      const tx = await program.methods
        .initialize()
        .accounts({
          payer: provider.wallet.publicKey,
          stakeAuthority: stakeAuthorityPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize tx signature:", tx);
    }

    // Fetch and verify
    const stakeAuthorityAccount = await program.account.stakeAuthority.fetch(stakeAuthorityPda);
    console.log("Verified StakeAuthority bump:", stakeAuthorityAccount.bump);
    assert.equal(stakeAuthorityAccount.bump, stakeAuthorityBump, "Bump mismatch");
  });
});
