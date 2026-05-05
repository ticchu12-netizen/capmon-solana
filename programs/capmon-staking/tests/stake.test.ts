import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { CapmonStaking } from "../target/types/capmon_staking";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey, publicKeyBytes } from "@metaplex-foundation/umi";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { dasApi } from "@metaplex-foundation/digital-asset-standard-api";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { assert } from "chai";

config();

const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
);
const SPL_ACCOUNT_COMPRESSION_ID = new PublicKey(
  "mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW"
);
const SPL_NOOP_ID = new PublicKey(
  "mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3"
);

describe("stake", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.CapmonStaking as Program<CapmonStaking>;
  const provider = anchor.AnchorProvider.env();
  const owner = provider.wallet.publicKey;

  it("stakes a cNFT via Bubblegum V2 freeze", async () => {
    // 1. Set up Umi for DAS API access
    const rpcUrl = process.env.HELIUS_DEVNET_RPC;
    if (!rpcUrl) throw new Error("HELIUS_DEVNET_RPC not set in .env");
    const umi = createUmi(rpcUrl).use(mplBubblegum()).use(dasApi());

    // 2. Load mint state from previous mint script
    const mintState = JSON.parse(readFileSync("mint-state.json", "utf-8"));
    const assetIdStr: string = mintState.assetId;
    const merkleTreeStr: string = mintState.merkleTree;

    console.log("Asset ID:", assetIdStr);
    console.log("Merkle tree:", merkleTreeStr);

    // 3. Fetch asset from DAS to get compression hashes
    console.log("Fetching asset...");
    const asset = await umi.rpc.getAsset(publicKey(assetIdStr));
    console.log("Compressed:", asset.compression.compressed);

    // 4. Fetch Merkle proof
    console.log("Fetching Merkle proof...");
    const proofResp = await umi.rpc.getAssetProof(publicKey(assetIdStr));
    console.log("Proof depth:", proofResp.proof.length);
    console.log("node_index:", proofResp.node_index);

    // 5. Convert all hashes to byte arrays for the StakeParams.
    // Anchor expects [u8; 32] which serializes as a JS array of numbers.
    const rootBytes = Array.from(publicKeyBytes(proofResp.root));
    const dataHashBytes = Array.from(
      publicKeyBytes(asset.compression.data_hash)
    );
    const creatorHashBytes = Array.from(
      publicKeyBytes(asset.compression.creator_hash)
    );

    // 6. Convert Umi PublicKeys (strings) to web3.js PublicKeys for accounts
    const merkleTree = new PublicKey(merkleTreeStr);
    const nftAssetId = new PublicKey(assetIdStr);

    // 7. Derive PDAs
    const [stakeAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_authority")],
      program.programId
    );
    const [stakeRecord] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake_record"),
        owner.toBuffer(),
        nftAssetId.toBuffer(),
      ],
      program.programId
    );
    const [treeConfig] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );

    console.log("StakeAuthority PDA:", stakeAuthority.toBase58());
    console.log("StakeRecord PDA:", stakeRecord.toBase58());
    console.log("TreeConfig PDA:", treeConfig.toBase58());

    // 8. Convert Merkle proof to remainingAccounts.
    // Each node is read-only and not a signer.
    const remainingAccounts = proofResp.proof.map((node) => ({
      pubkey: new PublicKey(node.toString()),
      isWritable: false,
      isSigner: false,
    }));
    console.log("Remaining accounts:", remainingAccounts.length);

    // 9. Build StakeParams
    // Note: leaf_id from compression is the NONCE.
    // node_index from proof is the position in the underlying Merkle tree
    // (which differs from leaf_id in V2 trees). We pass leaf_id for both.
    const leafId = asset.compression.leaf_id;
    console.log("Leaf ID (nonce):", leafId);

    const params = {
      tier: 0, // Evergreen
      root: rootBytes,
      dataHash: dataHashBytes,
      creatorHash: creatorHashBytes,
      nonce: new anchor.BN(leafId),
      index: leafId,
    };

    // 10. Build instruction (bypassing Anchor 1.0's broken .rpc() wrapper)
    console.log("Building stake instruction...");
    const ix = await program.methods
      .stake(params as any)
      .accounts({
        owner,
        stakeAuthority,
        stakeRecord,
        nftAssetId,
        treeConfig,
        merkleTree,
        bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_ID,
        logWrapper: SPL_NOOP_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts(remainingAccounts)
      .instruction();

    // 10b. Send transaction manually so we can see the real error if it fails
    console.log("Sending transaction...");
    const { Transaction, ComputeBudgetProgram } = anchor.web3;
    const tx = new Transaction();
    // Bump compute budget — Bubblegum CPIs need more than the 200k default
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ix);

    let txSig: string;
    try {
      txSig = await provider.sendAndConfirm(tx, []);
    } catch (err: any) {
      console.error("=== TRANSACTION FAILED ===");
      console.error("Error message:", err.message);
      if (err.logs) {
        console.error("Logs:");
        for (const log of err.logs) console.error("  " + log);
      }
      if (err.signature) {
        console.error("Signature:", err.signature);
        console.error(`View: https://explorer.solana.com/tx/${err.signature}?cluster=devnet`);
      }
      throw err;
    }

    console.log("Stake tx signature:", txSig);

    // 11. Verify StakeRecord PDA was created with correct fields
    const record = await program.account.stakeRecord.fetch(stakeRecord);
    console.log("StakeRecord state:");
    console.log("  owner:", record.owner.toBase58());
    console.log("  nft_asset_id:", record.nftAssetId.toBase58());
    console.log("  tier:", record.tier);
    console.log("  brain_steps:", record.brainSteps);
    console.log("  staked_at:", record.stakedAt.toString());

    assert.equal(record.tier, 0, "Should be tier 0 (Evergreen)");
    assert.equal(record.brainSteps, 0, "Initial brain_steps should be 0");
    assert.equal(
      record.owner.toBase58(),
      owner.toBase58(),
      "Owner should match wallet"
    );
    assert.equal(
      record.nftAssetId.toBase58(),
      assetIdStr,
      "Asset ID should match"
    );

    console.log("✅ Stake test passed!");
  });
});
