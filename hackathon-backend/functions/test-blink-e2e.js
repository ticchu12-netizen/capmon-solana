const fs = require('fs');

(async () => {
    const { Connection, Keypair, VersionedTransaction } = await import('@solana/web3.js');
    const ACTION_URL = 'https://us-central1-capmon-hackathon.cloudfunctions.net/actionMintStake?tier=2';

    const cliKey = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf-8'));
    const cliKp = Keypair.fromSecretKey(new Uint8Array(cliKey));
    console.log('User pubkey:', cliKp.publicKey.toBase58());

    console.log('Calling actionMintStake POST...');
    const r = await fetch(ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: cliKp.publicKey.toBase58() }),
    });
    const data = await r.json();
    if (!data.transaction) { console.error('No tx:', data); process.exit(1); }
    console.log('Got tx, base64 len:', data.transaction.length);

    const bytes = new Uint8Array(Buffer.from(data.transaction, 'base64'));
    const tx = VersionedTransaction.deserialize(bytes);
    console.log('Sigs before user sign:', tx.signatures.map(s => Buffer.from(s).every(b => b === 0) ? 'EMPTY' : 'FILLED'));

    tx.sign([cliKp]);
    console.log('Sigs after user sign:', tx.signatures.map(s => Buffer.from(s).every(b => b === 0) ? 'EMPTY' : 'FILLED'));

    const conn = new Connection(process.env.HELIUS_DEVNET_RPC, 'confirmed');
    console.log('Submitting...');
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    console.log('Sent. Confirming...');
    await conn.confirmTransaction(sig, 'confirmed');
    console.log('');
    console.log('SUCCESS! tx:', sig);
    console.log('Explorer: https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
})().catch(e => { console.error('FATAL:', e.message || e); if (e.logs) e.logs.forEach(l => console.log('  ' + l)); process.exit(1); });
