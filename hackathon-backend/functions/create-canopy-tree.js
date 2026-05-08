// create-canopy-tree.js — one-time script.
// Creates a new merkle tree with canopy_depth=10 so atomic mint+stake fits
// under Solana's 1232-byte tx limit. Run once. Paste output pubkey back to Claude.
//
// Run: cd ~/capmon-solana/hackathon-backend/functions && node create-canopy-tree.js

const fs = require('fs');
const path = require('path');

const HELIUS_RPC = process.env.HELIUS_RPC || 'https://devnet.helius-rpc.com/?api-key=cfd79774-43dd-4cf4-a2dd-aefefe55e6f1';
const CLI_WALLET_PATH = process.env.CLI_WALLET_PATH || path.join(process.env.HOME, '.config/solana/id.json');

(async () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CAPMON — CANOPY TREE CREATION');
    console.log('  max_depth=14, max_buffer_size=64, canopy_depth=10');
    console.log('  → wire proof shrinks from 14 → 4 levels (~320 bytes saved)');
    console.log('═══════════════════════════════════════════════════════\n');

    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { keypairIdentity, generateSigner } = await import('@metaplex-foundation/umi');
    const { mplBubblegum, createTreeV2 } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
    const bs58 = await import('bs58');

    const umi = createUmi(HELIUS_RPC).use(mplBubblegum()).use(dasApi());

    // Load CLI wallet — must be the same authority used by the deployed mint+stake function
    let walletBytes;
    try {
        const raw = fs.readFileSync(CLI_WALLET_PATH, 'utf-8');
        walletBytes = new Uint8Array(JSON.parse(raw));
    } catch (e) {
        console.error('✗ Could not read CLI wallet at:', CLI_WALLET_PATH);
        console.error('  Set CLI_WALLET_PATH env var to your keypair file path.');
        console.error('  Detail:', e.message);
        process.exit(1);
    }

    const walletKp = umi.eddsa.createKeypairFromSecretKey(walletBytes);
    umi.use(keypairIdentity(walletKp));

    console.log('✓ CLI wallet:', walletKp.publicKey.toString());
    console.log('  (this becomes the tree authority — must match Firebase CLI_WALLET_KEY secret)\n');

    // Confirm wallet balance
    const balanceObj = await umi.rpc.getBalance(walletKp.publicKey);
    const balanceSol = Number(balanceObj.basisPoints) / 1_000_000_000;
    console.log('✓ Devnet SOL balance:', balanceSol.toFixed(4));

    if (balanceSol < 0.3) {
        console.error('\n✗ Insufficient SOL. Tree rent + fees ≈ 0.22 SOL.');
        console.error('  Top up: solana airdrop 1 -u devnet');
        console.error('  Or:    https://faucet.solana.com');
        process.exit(1);
    }

    // Generate the new tree keypair (the tree IS a keypair)
    const merkleTree = generateSigner(umi);
    console.log('\n✓ Generated new tree pubkey:', merkleTree.publicKey.toString());

    console.log('\n→ Submitting createTreeV2 (~10-15s on devnet)...');
    console.log('  max_depth:        14');
    console.log('  max_buffer_size:  64');
    console.log('  canopy_depth:     10');

    const builder = await createTreeV2(umi, {
        merkleTree,
        maxDepth: 14,
        maxBufferSize: 64,
        canopyDepth: 10,
    });

    const result = await builder.sendAndConfirm(umi, {
        confirm: { commitment: 'confirmed' },
    });

    const sig = bs58.default.encode(result.signature);
    console.log('\n✓ Tree created on-chain!');
    console.log('  tx:', `https://solana.fm/tx/${sig}?cluster=devnet-solana`);

    const newBalanceObj = await umi.rpc.getBalance(walletKp.publicKey);
    const newBalanceSol = Number(newBalanceObj.basisPoints) / 1_000_000_000;
    const cost = balanceSol - newBalanceSol;
    console.log(`  Cost:        ${cost.toFixed(4)} SOL (rent + fees)`);
    console.log(`  New balance: ${newBalanceSol.toFixed(4)} SOL`);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ⚡ NEW TREE PUBKEY — paste this back to Claude:');
    console.log('  ', merkleTree.publicKey.toString());
    console.log('═══════════════════════════════════════════════════════');

    process.exit(0);
})().catch(err => {
    console.error('\n✗ FAILED:', err.message || err);
    if (err.logs) {
        console.error('On-chain logs:');
        err.logs.forEach(l => console.error('  ', l));
    }
    process.exit(1);
});