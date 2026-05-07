const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const HELIUS_RPC = defineSecret('HELIUS_DEVNET_RPC');
const CLI_WALLET = defineSecret('CLI_WALLET_KEY');

const MERKLE_TREE = '9FL7j28TEYHAPqXZyP82Yc1xriKh9aBKQc9U9dcSrWhU';

exports.mintCapmonCnft = onRequest(
    {
        secrets: [HELIUS_RPC, CLI_WALLET],
        cors: true,
        timeoutSeconds: 60,
        memory: '512MiB',
    },
    async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'POST only' });
            return;
        }

        const recipient = (req.body && req.body.recipient) || '';
        if (!recipient || typeof recipient !== 'string' || recipient.length < 32 || recipient.length > 44) {
            res.status(400).json({ error: 'Invalid recipient pubkey' });
            return;
        }

        try {
            // Dynamic ESM imports (umi + mpl-bubblegum are ESM-only)
            const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
            const { keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
            const {
                mplBubblegum,
                mintV2,
                parseLeafFromMintV2Transaction,
                findLeafAssetIdPda,
            } = await import('@metaplex-foundation/mpl-bubblegum');
            const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');

            console.log('[mintCapmonCnft] recipient:', recipient);

            const umi = createUmi(HELIUS_RPC.value()).use(mplBubblegum()).use(dasApi());

            const walletKeyBytes = JSON.parse(CLI_WALLET.value());
            const walletKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletKeyBytes));
            umi.use(keypairIdentity(walletKeypair));

            console.log('[mintCapmonCnft] fee_payer:', walletKeypair.publicKey);

            const merkleTree = publicKey(MERKLE_TREE);
            const recipientPk = publicKey(recipient);

            const metadata = {
                name: 'Capmon Test cNFT',
                symbol: 'CAPMON',
                uri: 'https://arweave.net/placeholder',
                sellerFeeBasisPoints: 500,
                collection: null,
                creators: [],
            };

            const mintBuilder = await mintV2(umi, {
                leafOwner: recipientPk,
                merkleTree,
                metadata,
            });

            const result = await mintBuilder.sendAndConfirm(umi, {
                confirm: { commitment: 'confirmed' },
            });

            console.log('[mintCapmonCnft] tx confirmed');

            // Parse leaf with retries (DAS indexing can lag)
            let leaf = null;
            for (let attempt = 1; attempt <= 10; attempt++) {
                try {
                    leaf = await parseLeafFromMintV2Transaction(umi, result.signature);
                    break;
                } catch (err) {
                    if (attempt === 10) throw err;
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            if (!leaf) throw new Error('Failed to parse leaf after retries');

            const [assetId] = findLeafAssetIdPda(umi, {
                merkleTree,
                leafIndex: leaf.nonce,
            });

            console.log('[mintCapmonCnft] success - assetId:', assetId);

            // Convert signature bytes to base58 string
            const bs58 = await import('bs58');
            const signatureB58 = bs58.default.encode(result.signature);

            res.json({
                signature: signatureB58,
                assetId: assetId.toString(),
                leafIndex: leaf.nonce.toString(),
                recipient,
                explorer: `https://explorer.solana.com/address/${assetId}?cluster=devnet`,
            });
        } catch (err) {
            console.error('[mintCapmonCnft] FAILED:', err);
            res.status(500).json({
                error: err.message || 'Mint failed',
                details: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : undefined,
            });
        }
    }
);
