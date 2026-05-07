const fs = require('fs');

const TIER_METADATA = {
    0: { name: 'Capmon Evergreen NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/OTEo9cS.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
    1: { name: 'Capmon Aquashrine NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/hb8f8fA.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
    2: { name: 'Capmon Magmamine NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/XqG8png.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
    3: { name: 'Capmon King NFT', symbol: 'CAPMON', uri: 'https://i.imgur.com/sCHbEol.jpeg', sellerFeeBasisPoints: 500, collection: null, creators: [] },
};
const PROGRAM_ID = 'FSenbAEVTgTdfM2723xkk8A2Y5oD8wtmB2EhiWXzpqSg';
const TREE = '9FL7j28TEYHAPqXZyP82Yc1xriKh9aBKQc9U9dcSrWhU';
const STAKE_DISCRIMINATOR = [206, 176, 202, 18, 200, 209, 179, 108];
const BUBBLEGUM = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY';
const COMPRESSION = 'mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW';
const NOOP_PROG = 'mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

(async () => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey, keypairIdentity, transactionBuilder } = await import('@metaplex-foundation/umi');
    const {
        mplBubblegum, mintV2, hashLeafV2, hashMetadataDataV2, hashMetadataCreators,
        getMerkleRoot, getMerkleProofAtIndex,
        findLeafAssetIdPda, fetchTreeConfigFromSeeds,
    } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
    const { PublicKey } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;

    const TIER = parseInt(process.argv[2] || '3'); // King by default
    console.log('=== Atomic mint+stake test, tier=', TIER, '(' + TIER_METADATA[TIER].name + ')');

    const umi = createUmi(process.env.HELIUS_DEVNET_RPC).use(mplBubblegum()).use(dasApi());
    const cliKeyBytes = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf-8'));
    const cliKp = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(cliKeyBytes));
    umi.use(keypairIdentity(cliKp));
    const userPub = publicKey(cliKp.publicKey);
    const treePub = publicKey(TREE);
    const meta = TIER_METADATA[TIER];
    console.log('CLI/user pubkey:', userPub);

    // Tree state
    const tc = await fetchTreeConfigFromSeeds(umi, { merkleTree: treePub });
    const numMinted = Number(tc.numMinted);
    console.log('numMinted (current):', numMinted);

    // Existing leaf hashes
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

    // New leaf hash
    const newLeaf = hashLeafV2(umi, {
        merkleTree: treePub, leafIndex: numMinted,
        owner: userPub, delegate: userPub, metadata: meta,
    });
    leafHashes.push(publicKey(newLeaf));
    const root = getMerkleRoot(leafHashes, 14);
    const proof = getMerkleProofAtIndex(leafHashes, 14, numMinted);
    console.log('Predicted root:', root);
    console.log('Proof len:', proof.length);

    // PDAs
    const programIdW = new PublicKey(PROGRAM_ID);
    const [newAssetId] = findLeafAssetIdPda(umi, { merkleTree: treePub, leafIndex: numMinted });
    const userPubW = new PublicKey(cliKp.publicKey);
    const [stakeAuthW] = PublicKey.findProgramAddressSync([new TextEncoder().encode('stake_authority')], programIdW);
    const [stakeRecW] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode('stake_record'), userPubW.toBytes(), new PublicKey(newAssetId).toBytes()],
        programIdW
    );
    const [treeCfgW] = PublicKey.findProgramAddressSync([new PublicKey(TREE).toBytes()], new PublicKey(BUBBLEGUM));
    console.log('newAssetId:', newAssetId);
    console.log('stakeRecord:', stakeRecW.toBase58());

    // Hashes for stake params
    const dh = hashMetadataDataV2(meta);
    const ch = hashMetadataCreators(meta.creators);
    const rootBytes = new PublicKey(root).toBytes();

    // Stake ix data
    const nonceBuf = Buffer.alloc(8); nonceBuf.writeBigUInt64LE(BigInt(numMinted));
    const indexBuf = Buffer.alloc(4); indexBuf.writeUInt32LE(numMinted);
    const stakeData = Buffer.concat([
        Buffer.from(STAKE_DISCRIMINATOR),
        Buffer.from([TIER]),
        Buffer.from(rootBytes),
        Buffer.from(dh),
        Buffer.from(ch),
        nonceBuf, indexBuf,
    ]);
    console.log('stakeData length:', stakeData.length, '(expected 117)');

    // Stake instruction
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

    // ComputeBudget
    const cbBuf = Buffer.alloc(4); cbBuf.writeUInt32LE(600_000);
    const cbInstr = {
        programId: publicKey(COMPUTE_BUDGET_PROGRAM),
        keys: [],
        data: new Uint8Array(Buffer.concat([Buffer.from([2]), cbBuf])),
    };

    // Mint builder
    const mintBuilder = await mintV2(umi, {
        leafOwner: userPub, merkleTree: treePub, metadata: meta,
    });
    console.log('mint builder items:', mintBuilder.items.length);

    // Compose
    let b = transactionBuilder().add({ instruction: cbInstr, signers: [], bytesCreatedOnChain: 0 });
    for (const it of mintBuilder.items) b = b.add(it);
    b = b.add({ instruction: stakeInstr, signers: [umi.identity], bytesCreatedOnChain: 0 });

    console.log('total items:', b.items.length);
    console.log('Sending atomic mint+stake to devnet...');
    const result = await b.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    const sig = bs58.encode(result.signature);
    console.log('');
    console.log('SUCCESS!');
    console.log('  tx:', sig);
    console.log('  explorer: https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
    console.log('  asset:', newAssetId);
})().catch(e => {
    console.error('FATAL:', e.message || e);
    if (e.logs) e.logs.forEach(l => console.log('  ' + l));
    process.exit(1);
});
