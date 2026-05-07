const TEST_ASSET = '69NUMiMhRJAEbKrmx6npGmeZtYSvfqn7M9StdHWC19MA';

(async () => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const {
        mplBubblegum,
        hashLeafV2,
        hashMetadataDataV2,
        hashMetadataCreators,
    } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');

    const HELIUS_RPC = process.env.HELIUS_DEVNET_RPC;
    if (!HELIUS_RPC) { console.error('HELIUS_DEVNET_RPC not set'); process.exit(1); }

    const umi = createUmi(HELIUS_RPC).use(mplBubblegum()).use(dasApi());

    console.log('=== Fetching asset:', TEST_ASSET);
    const asset = await umi.rpc.getAsset(publicKey(TEST_ASSET));
    console.log('  name:', asset.content?.metadata?.name);
    console.log('  symbol:', asset.content?.metadata?.symbol);
    console.log('  uri:', asset.content?.json_uri);
    console.log('  owner:', asset.ownership.owner);
    console.log('  delegate:', asset.ownership.delegate);
    console.log('  leaf_id:', asset.compression.leaf_id);
    console.log('  tree:', asset.compression.tree);
    console.log('  on-chain data_hash:', asset.compression.data_hash);
    console.log('  on-chain creator_hash:', asset.compression.creator_hash);
    console.log('  on-chain asset_hash:', asset.compression.asset_hash);
    console.log('  basis_points:', asset.royalty?.basis_points);
    console.log('  creators:', JSON.stringify(asset.creators));

    console.log('');
    console.log('=== Fetching proof');
    const proof = await umi.rpc.getAssetProof(publicKey(TEST_ASSET));
    console.log('  proof.leaf:', proof.leaf);
    console.log('  proof.root:', proof.root);
    console.log('  proof.proof.length:', proof.proof.length);

    console.log('');
    console.log('=== Reconstructing metadata + hashing');
    const metadata = {
        name: asset.content.metadata.name,
        symbol: asset.content.metadata.symbol,
        uri: asset.content.json_uri,
        sellerFeeBasisPoints: asset.royalty.basis_points,
        collection: null,
        creators: asset.creators || [],
    };

    try {
        const computedDataHash = hashMetadataDataV2(metadata);
        console.log('  computed data_hash:', computedDataHash);
    } catch (e) {
        console.log('  data_hash ERROR:', e.message);
    }

    try {
        const computedCreatorHash = hashMetadataCreators(metadata.creators);
        console.log('  computed creator_hash:', computedCreatorHash);
    } catch (e) {
        console.log('  creator_hash ERROR:', e.message);
    }

    try {
        const computedLeafHash = hashLeafV2(umi, {
            merkleTree: publicKey(asset.compression.tree),
            leafIndex: asset.compression.leaf_id,
            owner: publicKey(asset.ownership.owner),
            delegate: asset.ownership.delegate ? publicKey(asset.ownership.delegate) : undefined,
            metadata,
        });
        console.log('  computed leaf hash:', computedLeafHash);
        console.log('  computed type:', typeof computedLeafHash, computedLeafHash?.constructor?.name);
    } catch (e) {
        console.log('  leaf_hash ERROR:', e.message);
        console.log('  stack:', e.stack?.split('\n').slice(0,5).join('\n'));
    }
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
