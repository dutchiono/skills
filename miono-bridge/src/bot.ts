import { Markup, Telegraf } from "telegraf";
import { getChains, type ChainKey } from "./chains.js";
import { loadWallets } from "./wallets.js";
import { quoteBatch } from "./relay.js";
import { executeBatch } from "./execution.js";
import type { AssetSpec, BatchQuote, BridgeIntent } from "./types.js";
type Session={from?:ChainKey;to?:ChainKey;selected:Set<string>;pendingQuote?:BatchQuote};
const sessions=new Map<number,Session>();
const buttons:Array<[string,ChainKey]>=[["Base","base"],["Robinhood","robinhood"],["Solana","solana"]];
const admins=()=>new Set((process.env.TELEGRAM_ADMIN_IDS||"").split(",").map(x=>Number(x.trim())).filter(Number.isFinite));
const ok=(id?:number)=>!!id&&admins().has(id);
const sfor=(id:number)=>{if(!sessions.has(id))sessions.set(id,{selected:new Set()});return sessions.get(id)!};
const chainMenu=(p:"from"|"to")=>Markup.inlineKeyboard(buttons.map(([l,k])=>Markup.button.callback(l,`${p}:${k}`)),{columns:3});
function walletMenu(s:Session){ const rows=loadWallets().map(w=>[Markup.button.callback(`${s.selected.has(w.id)?"✅":"⬜"} ${w.label}`,`wallet:${w.id}`)]); rows.push([Markup.button.callback("Select all","wallet:all"),Markup.button.callback("Clear","wallet:none")]); rows.push([Markup.button.callback("Continue","wallet:done")]); return Markup.inlineKeyboard(rows); }
function nativeAsset(c:ChainKey):AssetSpec{ return c==="solana"?{symbol:"SOL",address:"11111111111111111111111111111111",decimals:9}:{symbol:"ETH",address:"0x0000000000000000000000000000000000000000",decimals:18}; }
export function makeBot(token:string){
 const bot=new Telegraf(token);
 bot.command("bridge",async ctx=>{if(!ok(ctx.from?.id))return;const s=sfor(ctx.from.id);s.from=undefined;s.to=undefined;s.selected.clear();s.pendingQuote=undefined;await ctx.reply("Source chain:",chainMenu("from"));});
 bot.action(/^from:(base|robinhood|solana)$/,async ctx=>{if(!ok(ctx.from?.id))return;const s=sfor(ctx.from.id);s.from=ctx.match[1] as ChainKey;await ctx.answerCbQuery();await ctx.editMessageText(`Source: ${getChains()[s.from].label}\nDestination:`,chainMenu("to"));});
 bot.action(/^to:(base|robinhood|solana)$/,async ctx=>{if(!ok(ctx.from?.id))return;const s=sfor(ctx.from.id),to=ctx.match[1] as ChainKey;if(!s.from||s.from===to){await ctx.answerCbQuery("Pick a different destination");return;}s.to=to;await ctx.answerCbQuery();await ctx.editMessageText(`${getChains()[s.from].label} → ${getChains()[to].label}\nSelect wallets:`,walletMenu(s));});
 bot.action(/^wallet:(.+)$/,async ctx=>{if(!ok(ctx.from?.id))return;const s=sfor(ctx.from.id),id=ctx.match[1];if(id==="all")s.selected=new Set(loadWallets().map(w=>w.id));else if(id==="none")s.selected.clear();else if(id==="done"){if(!s.from||!s.to||!s.selected.size){await ctx.answerCbQuery("Choose at least one wallet");return;}await ctx.answerCbQuery();await ctx.editMessageText(`${getChains()[s.from].label} → ${getChains()[s.to].label}\n${s.selected.size} wallet(s) selected.\n\nReply with amount in base units for this first pass.`);return;}else{s.selected.has(id)?s.selected.delete(id):s.selected.add(id);}await ctx.answerCbQuery();await ctx.editMessageReplyMarkup(walletMenu(s).reply_markup);});
 bot.on("text",async ctx=>{if(!ok(ctx.from?.id))return;const s=sfor(ctx.from.id);if(!s.from||!s.to||!s.selected.size)return;const amount=ctx.message.text.trim();if(!/^\d+$/.test(amount))return;const intent:BridgeIntent={walletIds:[...s.selected],from:s.from,to:s.to,input:nativeAsset(s.from),output:nativeAsset(s.to),amount,slippageBps:50};await ctx.reply("Quoting routes…");try{const batch=await quoteBatch(intent);s.pendingQuote=batch;const summary=batch.quotes.map(q=>`• ${q.walletId}: ${q.expectedOutput||"quoted"}${q.feesUsd?` · gas ~$${q.feesUsd}`:""}`).join("\n");await ctx.reply(`Quote ready\n\n${getChains()[intent.from].label} → ${getChains()[intent.to].label}\n${summary}\n\nExecution is ${process.env.BRIDGE_EXECUTION_ENABLED==="1"?"ENABLED":"DISABLED"}.`,Markup.inlineKeyboard([[Markup.button.callback("Execute batch",`execute:${batch.id}`)],[Markup.button.callback("Cancel","execute:cancel")]]));}catch(e){await ctx.reply(`Quote failed: ${e instanceof Error?e.message:String(e)}`);}});
 bot.action(/^execute:(.+)$/,async ctx=>{if(!ok(ctx.from?.id))return;const s=sfor(ctx.from.id),id=ctx.match[1];if(id==="cancel"){s.pendingQuote=undefined;await ctx.answerCbQuery("Cancelled");await ctx.editMessageText("Cancelled.");return;}if(!s.pendingQuote||s.pendingQuote.id!==id){await ctx.answerCbQuery("Quote expired");return;}await ctx.answerCbQuery();await ctx.editMessageText("Executing sequentially…");try{const result=await executeBatch(s.pendingQuote);await ctx.reply(result.map(r=>`${r.ok?"✅":"❌"} ${r.walletId}${r.error?`: ${r.error}`:""}`).join("\n"));s.pendingQuote=undefined;}catch(e){await ctx.reply(`Execution stopped: ${e instanceof Error?e.message:String(e)}`);}});
 return bot;
}
