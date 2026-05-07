const TEST_ASSET = '69NUMiMhRJAEbKrmx6npGmeZtYSvfqn7M9StdHWC19MA';

(async () => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const { mplBubblegum, hashLeafV2, hashMetadataDataV2, hashMetadataCreators } = await import('@metaplex-foundation/mpl-bubblegum');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
    const bs58 = (await import('bs58')).default;

    const umi = createUmi(process.env.HELIUS_DEVNET_RPC).use(mplBubblegum()).use(dasApi());
    const asset = await umi.rpc.getAsset(publicKey(TEST_ASSET));
    const proof = await umi.rpc.getAssetProof(publicKey(TEST_ASSET));

    const metadata = {
        name: asset.content.metadata.name,
        symbol: asset.content.metadata.symbol,
        uri: asset.content.json_uri,
        sellerFeeBasisPoints: asset.royalty.basis_points,
        collection: null,
        creators: asset.creators || [],
    };

    const dh = hashMetadataDataV2(metadata);
    const ch = hashMetadataCreators(metadata.creators);
    const lh = hashLeafV2(umi, {
        merkleTree: publicKey(asset.compression.tree),
        leafIndex: asset.compression.leaf_id,
        owner: publicKey(asset.ownership.owner),
        delegate: asset.ownership.delegate ? publicKey(asset.ownership.delegate) : undefined,
        metadata,
    });

    const enc = (bytes) => bs58.encode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

    console.log('data_hash    on-chain:', asset.compression.data_hash);
    console.log('data_hash    computed:', enc(dh));
    console.log('              MATCH:', enc(dh) === asset.compression.data_hash);
    console.log('');
    console.log('creator_hash on-chain:', asset.compression.creator_hash);
    console.log('creator_hash computed:', enc(ch));
    console.log('              MATCH:', enc(ch) === asset.compression.creator_hash);
    console.log('');
    console.log('leaf_hash    on-chain:', proof.leaf);
    console.log('leaf_hash    computed:', enc(lh));
    console.log('              MATCH:', enc(lh) === proof.leaf);
})().catch(e => { console.error(e); process.exit(1); });
