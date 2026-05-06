"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export default function Home() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    (async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / 1_000_000_000);
      } catch (err) {
        console.error("Balance fetch failed:", err);
        setBalance(null);
      }
    })();
  }, [publicKey, connection]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 bg-black text-white">
      <h1 className="text-4xl font-bold">Capmon</h1>
      <p className="text-gray-400">AI battler with on-chain progression</p>

      <WalletMultiButton />

      {connected && publicKey && (
        <div className="mt-4 p-4 border border-gray-700 rounded-lg space-y-2 text-sm font-mono">
          <div>
            <span className="text-gray-500">Wallet: </span>
            <span>{publicKey.toBase58()}</span>
          </div>
          <div>
            <span className="text-gray-500">SOL Balance: </span>
            <span>{balance === null ? "Loading..." : `${balance.toFixed(4)} SOL`}</span>
          </div>
        </div>
      )}
    </main>
  );
}
