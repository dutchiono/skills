import type { ChainKey } from "./chains.js";
export type AssetSpec={symbol:string;address:string;decimals:number};
export type BridgeIntent={walletIds:string[];from:ChainKey;to:ChainKey;input:AssetSpec;output:AssetSpec;amount:string;slippageBps:number};
export type WalletQuote={walletId:string;fromAddress:string;recipient:string;raw:any;expectedOutput?:string;feesUsd?:string};
export type BatchQuote={id:string;createdAt:number;intent:BridgeIntent;quotes:WalletQuote[]};
