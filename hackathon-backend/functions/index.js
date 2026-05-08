const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const HELIUS_RPC = defineSecret('HELIUS_DEVNET_RPC');
const CLI_WALLET = defineSecret('CLI_WALLET_KEY');

const MERKLE_TREE = 'E56FVXmnTqfm7TjmeLJtUdBaB32B5wEQEexFVf3ktB7r';
const PROGRAM_ID = 'FSenbAEVTgTdfM2723xkk8A2Y5oD8wtmB2EhiWXzpqSg';
const STAKE_DISCRIMINATOR = [206, 176, 202, 18, 200, 209, 179, 108];
const BUBBLEGUM = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY';
const COMPRESSION = 'mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW';
const NOOP_PROG = 'mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

const TIER_METADATA = {
    0: { name: 'Capmon Evergreen NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/OTEo9cS.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
    1: { name: 'Capmon Aquashrine NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/hb8f8fA.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
    2: { name: 'Capmon Magmamine NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/XqG8png.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
    3: { name: 'Capmon King NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/sCHbEol.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
};
const TIER_INFO = {
    0: { displayName: 'Evergreen', mult: '1.0×', steps: '0M' },
    1: { displayName: 'Aquashrine', mult: '1.4×', steps: '15M' },
    2: { displayName: 'Magmamine', mult: '1.9×', steps: '40M' },
    3: { displayName: 'King', mult: '2.8×', steps: '60M' },
};

// ============== Existing: mintCapmonCnft ==============
exports.mintCapmonCnft = onRequest(
    { secrets: [HELIUS_RPC, CLI_WALLET], cors: true, timeoutSeconds: 60, memory: '512MiB' },
    async (req, res) => {
        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
        if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
        const recipient = (req.body && req.body.recipient) || '';
        if (!recipient || typeof recipient !== 'string' || recipient.length < 32 || recipient.length > 44) {
            res.status(400).json({ error: 'Invalid recipient pubkey' }); return;
        }
        try {
            const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
            const { keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
            const { mplBubblegum, mintV2, parseLeafFromMintV2Transaction, findLeafAssetIdPda } = await import('@metaplex-foundation/mpl-bubblegum');
            const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
            console.log('[mintCapmonCnft] recipient:', recipient);
            const umi = createUmi(HELIUS_RPC.value()).use(mplBubblegum()).use(dasApi());
            const walletKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(CLI_WALLET.value())));
            umi.use(keypairIdentity(walletKeypair));
            const merkleTree = publicKey(MERKLE_TREE);
            const recipientPk = publicKey(recipient);
            const metadata = { name: 'Capmon Test cNFT', symbol: 'CAPMON', uri: 'https://arweave.net/placeholder', sellerFeeBasisPoints: 500, collection: null, creators: [] };
            const mintBuilder = await mintV2(umi, { leafOwner: recipientPk, merkleTree, metadata });
            const result = await mintBuilder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
            let leaf = null;
            for (let attempt = 1; attempt <= 10; attempt++) {
                try { leaf = await parseLeafFromMintV2Transaction(umi, result.signature); break; }
                catch (err) { if (attempt === 10) throw err; await new Promise(r => setTimeout(r, 2000)); }
            }
            if (!leaf) throw new Error('Failed to parse leaf');
            const [assetId] = findLeafAssetIdPda(umi, { merkleTree, leafIndex: leaf.nonce });
            const bs58 = await import('bs58');
            res.json({
                signature: bs58.default.encode(result.signature),
                assetId: assetId.toString(),
                leafIndex: leaf.nonce.toString(),
                recipient,
                explorer: `https://explorer.solana.com/address/${assetId}?cluster=devnet`,
            });
        } catch (err) {
            console.error('[mintCapmonCnft] FAILED:', err);
            res.status(500).json({ error: err.message || 'Mint failed' });
        }
    }
);

// ============== New: actionMintStake (Solana Action / Blink) ==============
exports.actionMintStake = onRequest(
    { secrets: [HELIUS_RPC, CLI_WALLET], cors: false, timeoutSeconds: 60, memory: '512MiB' },
    async (req, res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, Accept-Encoding');
        res.set('Access-Control-Expose-Headers', 'X-Action-Version, X-Blockchain-Ids');
        res.set('X-Action-Version', '2.4');
        res.set('X-Blockchain-Ids', 'solana:devnet');
        res.set('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

        const tier = parseInt(req.query.tier ?? '0');
        if (![0, 1, 2, 3].includes(tier)) {
            res.status(400).json({ error: 'Invalid tier (0-3)' }); return;
        }
        const info = TIER_INFO[tier];
        const meta = TIER_METADATA[tier];

        if (req.method === 'GET') {
            res.json({
                type: 'action',
                icon: meta.uri,
                label: `Mint ${info.displayName}`,
                title: `Capmon ${info.displayName} — ${info.steps} Brain`,
                description: `Mint and stake a Capmon ${info.displayName} cNFT in one click. Earn ${info.mult} battle multiplier on devnet.`,
            });
            return;
        }

        if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

        const account = req.body?.account;
        if (!account || typeof account !== 'string' || account.length < 32 || account.length > 44) {
            res.status(400).json({ error: 'Invalid account pubkey' }); return;
        }

        try {
            console.log('[actionMintStake] tier:', tier, 'account:', account);
            const txBase64 = await buildAtomicMintStakeBase64({ userPubkey: account, tier });
            res.json({
                transaction: txBase64,
                message: `Minted Capmon ${info.displayName} cNFT and staked at tier ${tier} (${info.mult} multiplier)!`,
            });
        } catch (err) {
            console.error('[actionMintStake] FAILED:', err);
            res.status(500).json({ error: err.message || 'Build failed' });
        }
    }
);

async function buildAtomicMintStakeBase64({ userPubkey, tier }) {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey, keypairIdentity, transactionBuilder, createNoopSigner } = await import('@metaplex-foundation/umi');
    const {
        mplBubblegum, mintV2, hashLeafV2, hashMetadataDataV2, hashMetadataCreators,
        getMerkleRoot, getMerkleProofAtIndex,
        findLeafAssetIdPda, fetchTreeConfigFromSeeds,
    } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
    const { PublicKey } = await import('@solana/web3.js');

    const umi = createUmi(HELIUS_RPC.value()).use(mplBubblegum()).use(dasApi());
    const cliKp = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(CLI_WALLET.value())));
    umi.use(keypairIdentity(cliKp));

    const userPub = publicKey(userPubkey);
    const treePub = publicKey(MERKLE_TREE);
    const meta = TIER_METADATA[tier];

    const tc = await fetchTreeConfigFromSeeds(umi, { merkleTree: treePub });
    const numMinted = Number(tc.numMinted);
    console.log('[buildAtomicMintStakeBase64] numMinted:', numMinted);

    const leafHashes = [];
    for (let i = 0; i < numMinted; i++) {
        const [aid] = findLeafAssetIdPda(umi, { merkleTree: treePub, leafIndex: i });
        const a = await umi.rpc.getAsset(aid);
        const m = {
            name: a.content.metadata.name, symbol: a.content.metadata.symbol,
            uri: a.content.json_uri, sellerFeeBasisPoints: a.royalty.basis_points,
            collection: null, creators: a.creators || [],
        };
        const lh = hashLeafV2(umi, {
            merkleTree: publicKey(a.compression.tree), leafIndex: a.compression.leaf_id,
            owner: publicKey(a.ownership.owner),
            delegate: a.ownership.delegate ? publicKey(a.ownership.delegate) : undefined,
            metadata: m,
        });
        leafHashes.push(publicKey(lh));
    }

    const newLeaf = hashLeafV2(umi, {
        merkleTree: treePub, leafIndex: numMinted,
        owner: userPub, delegate: userPub, metadata: meta,
    });
    leafHashes.push(publicKey(newLeaf));
    const root = getMerkleRoot(leafHashes, 14);
    const fullProof = getMerkleProofAtIndex(leafHashes, 14, numMinted);
    const proof = fullProof.slice(0, 4);
    const [newAssetId] = findLeafAssetIdPda(umi, { merkleTree: treePub, leafIndex: numMinted });
    const programIdW = new PublicKey(PROGRAM_ID);
    const userPubW = new PublicKey(userPubkey);
    const [stakeAuthW] = PublicKey.findProgramAddressSync([new TextEncoder().encode('stake_authority')], programIdW);
    const [stakeRecW] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode('stake_record'), userPubW.toBytes(), new PublicKey(newAssetId).toBytes()],
        programIdW
    );
    const [treeCfgW] = PublicKey.findProgramAddressSync([new PublicKey(MERKLE_TREE).toBytes()], new PublicKey(BUBBLEGUM));

    const dh = hashMetadataDataV2(meta);
    const ch = hashMetadataCreators(meta.creators);
    const nonceBuf = Buffer.alloc(8); nonceBuf.writeBigUInt64LE(BigInt(numMinted));
    const indexBuf = Buffer.alloc(4); indexBuf.writeUInt32LE(numMinted);
    const stakeData = Buffer.concat([
        Buffer.from(STAKE_DISCRIMINATOR),
        Buffer.from([tier]),
        Buffer.from(new PublicKey(root).toBytes()),
        Buffer.from(dh), Buffer.from(ch),
        nonceBuf, indexBuf,
    ]);

    const stakeInstr = {
        programId: publicKey(PROGRAM_ID),
        keys: [
            { pubkey: userPub, isSigner: true, isWritable: true },
            { pubkey: publicKey(stakeAuthW.toBase58()), isSigner: false, isWritable: false },
            { pubkey: publicKey(stakeRecW.toBase58()), isSigner: false, isWritable: true },
            { pubkey: newAssetId, isSigner: false, isWritable: false },
            { pubkey: publicKey(treeCfgW.toBase58()), isSigner: false, isWritable: true },
            { pubkey: treePub, isSigner: false, isWritable: true },
            { pubkey: publicKey(BUBBLEGUM), isSigner: false, isWritable: false },
            { pubkey: publicKey(COMPRESSION), isSigner: false, isWritable: false },
            { pubkey: publicKey(NOOP_PROG), isSigner: false, isWritable: false },
            { pubkey: publicKey(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
            ...proof.map(p => ({ pubkey: p, isSigner: false, isWritable: false })),
        ],
        data: new Uint8Array(stakeData),
    };

    const cbBuf = Buffer.alloc(4); cbBuf.writeUInt32LE(600_000);
    const cbInstr = {
        programId: publicKey(COMPUTE_BUDGET_PROGRAM),
        keys: [],
        data: new Uint8Array(Buffer.concat([Buffer.from([2]), cbBuf])),
    };

    const mintBuilder = await mintV2(umi, {
        leafOwner: userPub,
        payer: createNoopSigner(userPub),
        treeCreatorOrDelegate: umi.identity,
        merkleTree: treePub,
        metadata: meta,
    });

    let b = transactionBuilder().add({ instruction: cbInstr, signers: [], bytesCreatedOnChain: 0 });
    for (const it of mintBuilder.items) b = b.add(it);
    b = b.add({ instruction: stakeInstr, signers: [createNoopSigner(userPub)], bytesCreatedOnChain: 0 });
    b = b.setFeePayer(createNoopSigner(userPub));

    const tx = await b.buildAndSign(umi);
    const serialized = umi.transactions.serialize(tx);
    return Buffer.from(serialized).toString('base64');
}
