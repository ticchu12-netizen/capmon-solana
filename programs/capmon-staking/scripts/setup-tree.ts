/**
 * Creates a V2 Bubblegum Merkle Tree on devnet.
 *
 * Run once. Saves the tree address + secret key to tree-state.json.
 *
 * Tree size: maxDepth=5 (32 leaves), maxBufferSize=8.
 * Cost: ~0.005 SOL.
 *
 * Usage:
 *   npx ts-node scripts/setup-tree.ts
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import {
  mplBubblegum,
  createTreeV2,
} from "@metaplex-foundation/mpl-bubblegum";
import { dasApi } from "@metaplex-foundation/digital-asset-standard-api";
import { writeFileSync, readFileSync } from "fs";
import { config } from "dotenv";

config(); // Load .env

async function main() {
  const rpcUrl = process.env.HELIUS_DEVNET_RPC;
  const walletPath = process.env.WALLET_PATH;

  if (!rpcUrl) {
    throw new Error("HELIUS_DEVNET_RPC not set in .env");
  }
  if (!walletPath) {
    throw new Error("WALLET_PATH not set in .env");
  }

  console.log("Connecting to:", rpcUrl.replace(/api-key=[^&]*/, "api-key=REDACTED"));

  // Set up Umi
  const umi = createUmi(rpcUrl).use(mplBubblegum()).use(dasApi());

  // Load wallet
  const walletKeyBytes = JSON.parse(readFileSync(walletPath, "utf-8"));
  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(
    new Uint8Array(walletKeyBytes)
  );
  umi.use(keypairIdentity(walletKeypair));

  console.log("Wallet:", walletKeypair.publicKey);

  // Generate a new keypair for the Merkle tree account
  const merkleTree = generateSigner(umi);
  console.log("New tree address:", merkleTree.publicKey);

  // Create the V2 tree
  // maxDepth=5 means 2^5 = 32 leaves max (plenty for testing)
  // maxBufferSize=8 supports concurrent writes within a slot
  console.log("Creating V2 Merkle tree...");

  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth: 5,
    maxBufferSize: 8,
    public: false, // only tree creator/delegate can mint
  });

  const result = await builder.sendAndConfirm(umi, {
    confirm: { commitment: "finalized" },
  });

  console.log("Tree created! Transaction:", result.signature.toString());

  // Save state to tree-state.json so other scripts can use it
  const state = {
    treeAddress: merkleTree.publicKey,
    treeSecretKey: Array.from(merkleTree.secretKey),
    creator: walletKeypair.publicKey,
    network: "devnet",
    createdAt: new Date().toISOString(),
  };

  writeFileSync("tree-state.json", JSON.stringify(state, null, 2));
  console.log("Tree state saved to tree-state.json");
  console.log("");
  console.log("✅ Setup complete!");
  console.log(`   Tree address: ${merkleTree.publicKey}`);
  console.log(`   View on explorer: https://explorer.solana.com/address/${merkleTree.publicKey}?cluster=devnet`);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
