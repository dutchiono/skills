import fs from "node:fs";
import path from "node:path";
export type WalletPair = { id:string; label:string; evmAddress:`0x${string}`; solAddress:string; evmKeyRef:string; solKeyRef:string; enabled?:boolean };
export function loadWallets(file=process.env.WALLETS_FILE || "./wallets.json"):WalletPair[]{
  const full=path.resolve(file);
  if(!fs.existsSync(full)) throw new Error(`Wallet registry not found: ${full}`);
  const parsed=JSON.parse(fs.readFileSync(full,"utf8")) as WalletPair[];
  return parsed.filter(w=>w.enabled!==false);
}
export function getWallet(id:string){ const w=loadWallets().find(w=>w.id===id); if(!w) throw new Error(`Unknown wallet: ${id}`); return w; }
export function secretFor(ref:string){ const v=process.env[ref]; if(!v) throw new Error(`Missing secret env: ${ref}`); return v; }
