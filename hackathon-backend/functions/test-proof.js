const ASSETS = [
    '69NUMiMhRJAEbKrmx6npGmeZtYSvfqn7M9StdHWC19MA',
    '7tsWPgvsySXunS2mb5juQqVGAqQfm1j1NQAT3T24BDNL',
];

(async () => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const { mplBubblegum, hashLeafV2, getMerkleProofAtIndex } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');

    const umi = createUmi(process.env.HELIUS_DEVNET_RPC).use(mplBubblegum()).use(dasApi());

    const leafHashes = [];
    for (const id of ASSETS) {
        const asset = await umi.rpc.getAsset(publicKey(id));
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
        leafHashes[asset.compression.leaf_id] = publicKey(lh);
    }

    console.log('leaves array length:', leafHashes.length);

    // Compute proof for leaf 0 from off-chain tree
    const computedProof = getMerkleProofAtIndex(leafHashes, 14, 0);
    const dasProof = await umi.rpc.getAssetProof(publicKey(ASSETS[0]));

    console.log('');
    console.log('Proof for leaf 0:');
    console.log('  computed length:', computedProof.length);
    console.log('  DAS length:     ', dasProof.proof.length);
    let allMatch = true;
    for (let i = 0; i < 14; i++) {
        const c = computedProof[i];
        const d = dasProof.proof[i];
        const ok = c === d;
        if (!ok) allMatch = false;
        console.log(`  [${i.toString().padStart(2)}] ${ok ? 'OK ' : 'NO '} computed=${c} das=${d}`);
    }
    console.log('');
    console.log('FULL MATCH:', allMatch);
})().catch(e => { console.error(e); process.exit(1); });
