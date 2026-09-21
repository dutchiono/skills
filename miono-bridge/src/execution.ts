import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { adaptSolanaWallet } from "@relayprotocol/relay-svm-wallet-adapter";
import { getClient } from "@relayprotocol/relay-sdk";
import { getChains } from "./chains.js";
import { getWallet, secretFor } from "./wallets.js";
import type { BatchQuote, WalletQuote } from "./types.js";
function enabled(){ return process.env.BRIDGE_EXECUTION_ENABLED==="1"; }
async function execEvm(q:WalletQuote,b:BatchQuote){
  const pair=getWallet(q.walletId); const pk=secretFor(pair.evmKeyRef) as `0x${string}`; const account=privateKeyToAccount(pk); const source=getChains()[b.intent.from];
  const chain=source.key==="base"?base:{id:4663,name:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[source.rpcUrl]}}} as const;
  const wallet=createWalletClient({account,chain,transport:http(source.rpcUrl)});
  return getClient().actions.execute({quote:q.raw,wallet:wallet as any});
}
async function execSol(q:WalletQuote,b:BatchQuote){
  const pair=getWallet(q.walletId); const kp=Keypair.fromSecretKey(bs58.decode(secretFor(pair.solKeyRef))); const c=getChains().solana; const connection=new Connection(c.rpcUrl,"confirmed");
  const adapted=adaptSolanaWallet(kp.publicKey.toBase58(),c.relayChainId,connection,async(tx:any)=>{ tx.sign([kp]); const signature=await connection.sendRawTransaction(tx.serialize()); return {signature}; });
  return getClient().actions.execute({quote:q.raw,wallet:adapted as any});
}
export async function executeBatch(batch:BatchQuote){
  if(!enabled()) throw new Error("Execution disabled. Set BRIDGE_EXECUTION_ENABLED=1 after tiny-route testing.");
  const results:Array<{walletId:string;ok:boolean;error?:string}>=[];
  for(const q of batch.quotes){ try { const vm=getChains()[batch.intent.from].vm; await (vm==="svm"?execSol(q,batch):execEvm(q,batch)); results.push({walletId:q.walletId,ok:true}); } catch(e){ results.push({walletId:q.walletId,ok:false,error:e instanceof Error?e.message:String(e)}); } }
  return results;
}
