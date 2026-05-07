const TREE = '9FL7j28TEYHAPqXZyP82Yc1xriKh9aBKQc9U9dcSrWhU';

(async () => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const {
        mplBubblegum, hashLeafV2, getMerkleRoot,
        findLeafAssetIdPda, fetchTreeConfigFromSeeds,
    } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');

    const umi = createUmi(process.env.HELIUS_DEVNET_RPC).use(mplBubblegum()).use(dasApi());

    const treeConfig = await fetchTreeConfigFromSeeds(umi, { merkleTree: publicKey(TREE) });
    const numMinted = Number(treeConfig.numMinted);

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
    }

    // Current root (no new leaf yet)
    const computedCurrentRoot = getMerkleRoot(leafHashes, 14);
    
    // On-chain current root via DAS
    const [firstAssetId] = findLeafAssetIdPda(umi, { merkleTree: publicKey(TREE), leafIndex: 0 });
    const proof = await umi.rpc.getAssetProof(firstAssetId);

    console.log('computed root:', computedCurrentRoot);
    console.log('on-chain root:', proof.root);
    console.log('MATCH:', computedCurrentRoot === proof.root);
})().catch(e => { console.error(e); process.exit(1); });
