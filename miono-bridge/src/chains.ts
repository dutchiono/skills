export type ChainKey = "base" | "robinhood" | "solana";
export type ChainConfig = { key: ChainKey; label: string; relayChainId: number; vm: "evm" | "svm"; rpcUrl: string; nativeSymbol: string };
export function getChains(): Record<ChainKey, ChainConfig> {
  return {
    base: { key:"base", label:"Base", relayChainId:8453, vm:"evm", rpcUrl:process.env.BASE_RPC_URL || "https://mainnet.base.org", nativeSymbol:"ETH" },
    robinhood: { key:"robinhood", label:"Robinhood Chain", relayChainId:4663, vm:"evm", rpcUrl:process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com", nativeSymbol:"ETH" },
    solana: { key:"solana", label:"Solana", relayChainId:792703809, vm:"svm", rpcUrl:process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", nativeSymbol:"SOL" }
  };
}
export const ROUTES: Array<[ChainKey,ChainKey]> = [["base","solana"],["solana","base"],["robinhood","solana"],["solana","robinhood"],["base","robinhood"],["robinhood","base"]];
export function isSupportedRoute(from:ChainKey,to:ChainKey){ return from !== to && ROUTES.some(([a,b])=>a===from&&b===to); }
