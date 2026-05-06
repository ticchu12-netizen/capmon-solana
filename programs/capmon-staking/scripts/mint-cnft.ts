/**
 * Mints a test V2 compressed NFT into the previously-created Merkle tree.
 *
 * Default: cNFT minted to the CLI wallet (becomes leaf owner).
 * With CLI arg: cNFT minted to the specified recipient pubkey.
 * The CLI wallet always remains the fee payer + tree authority signer.
 *
 * Usage:
 *   npx ts-node scripts/mint-cnft.ts                    # mints to CLI wallet
 *   npx ts-node scripts/mint-cnft.ts <RECIPIENT_PUBKEY> # mints to external wallet
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

  const umi = createUmi(rpcUrl).use(mplBubblegum()).use(dasApi());

  const walletKeyBytes = JSON.parse(readFileSync(walletPath, "utf-8"));
  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(
    new Uint8Array(walletKeyBytes)
  );
  umi.use(keypairIdentity(walletKeypair));

  console.log("Fee payer / signer:", walletKeypair.publicKey);

  const recipientArg = process.argv[2];
  const recipient = recipientArg
    ? publicKey(recipientArg)
    : walletKeypair.publicKey;
  console.log("Recipient (leaf owner):", recipient);
  if (recipientArg) {
    console.log("  -> minting to external wallet");
  }

  const treeState = JSON.parse(readFileSync("tree-state.json", "utf-8"));
  const merkleTree = publicKey(treeState.treeAddress);
  console.log("Minting into tree:", merkleTree);

  const metadata = {
    name: "Capmon Test cNFT",
    symbol: "CAPMON",
    uri: "https://arweave.net/placeholder",
    sellerFeeBasisPoints: 500,
    collection: null,
    creators: [],
  };

  console.log("Minting cNFT...");

  const mintBuilder = await mintV2(umi, {
    leafOwner: recipient,
    merkleTree,
    metadata,
  });

  const result = await mintBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "finalized" },
  });

  console.log("Mint transaction confirmed.");

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

  const [assetId, _bump] = findLeafAssetIdPda(umi, {
    merkleTree,
    leafIndex: leaf.nonce,
  });

  console.log("");
  console.log("cNFT minted!");
  console.log("   Asset ID:", assetId);
  console.log("   Leaf index:", leaf.nonce.toString());
  console.log("   Owner:", recipient);
  console.log(
    `   Explorer: https://explorer.solana.com/address/${assetId}?cluster=devnet`
  );

  const mintState = {
    assetId: assetId.toString(),
    leafIndex: leaf.nonce.toString(),
    leafOwner: recipient.toString(),
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
