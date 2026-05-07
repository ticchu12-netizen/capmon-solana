const TREE = '9FL7j28TEYHAPqXZyP82Yc1xriKh9aBKQc9U9dcSrWhU';
const NEW_OWNER = '6z5gqTxdeBZBbTBtw1tT3QJT4mREmF15soR2GGxPK95f';

(async () => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const {
        mplBubblegum, hashLeafV2, getMerkleProofAtIndex,
        findLeafAssetIdPda, fetchTreeConfigFromSeeds,
    } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');

    const umi = createUmi(process.env.HELIUS_DEVNET_RPC).use(mplBubblegum()).use(dasApi());

    // 1. Tree config → num_minted
    const treeConfig = await fetchTreeConfigFromSeeds(umi, { merkleTree: publicKey(TREE) });
    const numMinted = Number(treeConfig.numMinted);
    console.log('num_minted:', numMinted);

    // 2. Build leafHashes[] for indices 0..numMinted-1
    const leafHashes = [];
    for (let i = 0; i < numMinted; i++) {
        const [assetId] = findLeafAssetIdPda(umi, { merkleTree: publicKey(TREE), leafIndex: i });
        const asset = await umi.rpc.getAsset(assetId);
        const meta = {
            name: asset.content.metadata.name,
            symbol: asset.content.metadata.symbol,
            uri: asset.content.json_uri,
            sellerFeeBasisPoints: asset.royalty.basis_points,
            collection: null,
            creators: asset.creators || [],
        };
        const lh = hashLeafV2(umi, {
            merkleTree: publicKey(asset.compression.tree),
            leafIndex: asset.compression.leaf_id,
            owner: publicKey(asset.ownership.owner),
            delegate: asset.ownership.delegate ? publicKey(asset.ownership.delegate) : undefined,
            metadata: meta,
        });
        leafHashes.push(publicKey(lh));
        console.log(`  leaf ${i}: ${publicKey(lh)}`);
    }

    // 3. Hypothetical next leaf (King-tier mint to NEW_OWNER)
    const newMeta = {
        name: 'Capmon King NFT',
        symbol: 'CAPMON',
        uri: 'https://i.imgur.com/sCHbEol.jpeg',
        sellerFeeBasisPoints: 500,
        collection: null,
        creators: [],
    };
    const newLeafHash = hashLeafV2(umi, {
        merkleTree: publicKey(TREE),
        leafIndex: numMinted,
        owner: publicKey(NEW_OWNER),
        delegate: publicKey(NEW_OWNER),
        metadata: newMeta,
    });
    leafHashes.push(publicKey(newLeafHash));
    console.log('  new leaf:', publicKey(newLeafHash));

    // 4. Proof for new leaf
    const proof = getMerkleProofAtIndex(leafHashes, 14, numMinted);
    console.log('');
    console.log('Proof for new leaf at index', numMinted + ':');
    proof.forEach((p, i) => console.log(`  [${i.toString().padStart(2)}] ${p}`));
    console.log('');
    console.log('proof.length:', proof.length);
})().catch(e => { console.error(e); process.exit(1); });
