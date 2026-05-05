/**
 * Mints a test V2 compressed NFT into the previously-created Merkle tree.
 *
 * The cNFT is minted to the wallet's address (the wallet becomes the leaf owner).
 * Saves the asset_id and leaf_index to mint-state.json for use by stake.test.ts.
 *
 * Usage:
 *   npx ts-node scripts/mint-cnft.ts
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import {
  mplBubblegum,
  mintV2,
  parseLeafFromMintV2Transaction,
  findLeafAssetIdPda,
} from "@metaplex-foundation/mpl-bubblegum";
import { dasApi } from "@metaplex-foundation/digital-asset-standard-api";
import { writeFileSync, readFileSync } from "fs";
import { config } from "dotenv";

config();

async function main() {
  const rpcUrl = process.env.HELIUS_DEVNET_RPC;
  const walletPath = process.env.WALLET_PATH;

  if (!rpcUrl) throw new Error("HELIUS_DEVNET_RPC not set in .env");
  if (!walletPath) throw new Error("WALLET_PATH not set in .env");

  console.log(
    "Connecting to:",
    rpcUrl.replace(/api-key=[^&]*/, "api-key=REDACTED")
  );

  // Set up Umi
  const umi = createUmi(rpcUrl).use(mplBubblegum()).use(dasApi());

  // Load wallet
  const walletKeyBytes = JSON.parse(readFileSync(walletPath, "utf-8"));
  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(
    new Uint8Array(walletKeyBytes)
  );
  umi.use(keypairIdentity(walletKeypair));

  console.log("Wallet:", walletKeypair.publicKey);

  // Load tree state
  const treeState = JSON.parse(readFileSync("tree-state.json", "utf-8"));
  const merkleTree = publicKey(treeState.treeAddress);
  console.log("Minting into tree:", merkleTree);

  // Mint metadata. For testing we use placeholder values.
  // For real Capmon NFTs the URI would point to Arweave.
  const metadata = {
    name: "Capmon Test #1",
    symbol: "CAPMON",
    uri: "https://arweave.net/placeholder", // valid URI required by Bubblegum, but content doesn't have to exist
    sellerFeeBasisPoints: 500, // 5%
    collection: null,
    creators: [],
  };

  console.log("Minting cNFT...");

  const mintBuilder = await mintV2(umi, {
    leafOwner: walletKeypair.publicKey,
    merkleTree,
    metadata,
  });

  const result = await mintBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "finalized" },
  });

  console.log("Mint transaction confirmed.");

  // Parse the leaf from the transaction to get the asset_id and leaf index.
  // Retry because Helius RPC sometimes has a brief lag between confirming
  // and serving the tx via getTransaction.
  let leaf = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      leaf = await parseLeafFromMintV2Transaction(umi, result.signature);
      break;
    } catch (err) {
      if (attempt === 10) throw err;
      console.log(`  parseLeaf attempt ${attempt} failed, retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!leaf) throw new Error("Failed to parse leaf after 10 attempts");
  console.log("Leaf:", leaf);
  // Derive the asset ID (the cNFT's unique identifier)
  const [assetId, _bump] = findLeafAssetIdPda(umi, {
    merkleTree,
    leafIndex: leaf.nonce,
  });

  console.log("");
  console.log("✅ cNFT minted!");
  console.log("   Asset ID:", assetId);
  console.log("   Leaf index:", leaf.nonce.toString());
  console.log("   Owner:", walletKeypair.publicKey);
  console.log(`   View on explorer: https://explorer.solana.com/address/${assetId}?cluster=devnet`);

  // Save state for use by stake.test.ts
  const mintState = {
    assetId: assetId.toString(),
    leafIndex: leaf.nonce.toString(),
    leafOwner: walletKeypair.publicKey,
    merkleTree: merkleTree.toString(),
    mintedAt: new Date().toISOString(),
  };

  writeFileSync("mint-state.json", JSON.stringify(mintState, null, 2));
  console.log("");
  console.log("Mint state saved to mint-state.json");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
