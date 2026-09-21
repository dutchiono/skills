import crypto from "node:crypto";
import { getChains, isSupportedRoute } from "./chains.js";
import { getWallet } from "./wallets.js";
import type { BatchQuote, BridgeIntent, WalletQuote } from "./types.js";
const RELAY_QUOTE_URL="https://api.relay.link/quote/v2";
function sourceAddress(i:BridgeIntent,id:string){ const w=getWallet(id); return getChains()[i.from].vm==="svm"?w.solAddress:w.evmAddress; }
function destinationAddress(i:BridgeIntent,id:string){ const w=getWallet(id); return getChains()[i.to].vm==="svm"?w.solAddress:w.evmAddress; }
export async function quoteOne(intent:BridgeIntent,walletId:string):Promise<WalletQuote>{
  if(!isSupportedRoute(intent.from,intent.to)) throw new Error(`Unsupported route: ${intent.from} -> ${intent.to}`);
  const chains=getChains(); const user=sourceAddress(intent,walletId); const recipient=destinationAddress(intent,walletId);
  const body={user,recipient,originChainId:chains[intent.from].relayChainId,destinationChainId:chains[intent.to].relayChainId,originCurrency:intent.input.address,destinationCurrency:intent.output.address,amount:intent.amount,tradeType:"EXACT_INPUT",slippageTolerance:String(intent.slippageBps)};
  const res=await fetch(RELAY_QUOTE_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const raw=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`${walletId}: ${(raw as any)?.message || (raw as any)?.errorCode || `Relay quote failed ${res.status}`}`);
  return {walletId,fromAddress:user,recipient,raw,expectedOutput:(raw as any)?.details?.currencyOut?.amountFormatted,feesUsd:(raw as any)?.fees?.gas?.amountUsd};
}
export async function quoteBatch(intent:BridgeIntent):Promise<BatchQuote>{ const quotes:WalletQuote[]=[]; for(const id of intent.walletIds) quotes.push(await quoteOne(intent,id)); return {id:crypto.randomUUID(),createdAt:Date.now(),intent,quotes}; }
