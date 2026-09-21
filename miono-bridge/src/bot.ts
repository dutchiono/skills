import { Markup, Telegraf } from "telegraf";
import { getChains, type ChainKey } from "./chains.js";
import { loadWallets } from "./wallets.js";
import { quoteBatch } from "./relay.js";
import { executeBatch } from "./execution.js";
import type { AssetSpec, BatchQuote, BridgeIntent } from "./types.js";

type Session = { from?: ChainKey; to?: ChainKey; selected: Set<string>; pendingQuote?: BatchQuote };
const sessions = new Map<number, Session>();
const chainButtons: Array<[string, ChainKey]> = [["Base","base"],["Robinhood","robinhood"],["Solana","solana"]];

const admins = () => new Set((process.env.TELEGRAM_ADMIN_IDS || "").split(",").map(x => Number(x.trim())).filter(Number.isFinite));
const allowed = (id?: number) => !!id && admins().has(id);
const sessionFor = (id: number) => { if (!sessions.has(id)) sessions.set(id, { selected: new Set() }); return sessions.get(id)!; };
const reset = (s: Session) => { s.from = undefined; s.to = undefined; s.selected.clear(); s.pendingQuote = undefined; };
const chainMenu = (prefix: "from" | "to") => Markup.inlineKeyboard(chainButtons.map(([label,key]) => Markup.button.callback(label, `${prefix}:${key}`)), { columns: 3 });

function walletMenu(s: Session) {
  const rows = loadWallets().map(w => [Markup.button.callback(`${s.selected.has(w.id) ? "✅" : "⬜"} ${w.label}`, `wallet:${w.id}`)]);
  rows.push([Markup.button.callback("Select all", "wallet:all"), Markup.button.callback("Clear", "wallet:none")]);
  rows.push([Markup.button.callback("Continue", "wallet:done"), Markup.button.callback("Cancel", "flow:cancel")]);
  return Markup.inlineKeyboard(rows);
}

function nativeAsset(c: ChainKey): AssetSpec {
  return c === "solana"
    ? { symbol: "SOL", address: "11111111111111111111111111111111", decimals: 9 }
    : { symbol: "ETH", address: "0x0000000000000000000000000000000000000000", decimals: 18 };
}

export function makeBot(token: string) {
  const bot = new Telegraf(token);

  // Kill any legacy persistent reply keyboard. Miono uses contextual inline controls only.
  bot.start(async ctx => {
    if (!allowed(ctx.from?.id)) return;
    reset(sessionFor(ctx.from.id));
    await ctx.reply("Miono ready. Use /bridge when you need bridge controls.", Markup.removeKeyboard());
  });

  bot.command("menu", async ctx => {
    if (!allowed(ctx.from?.id)) return;
    await ctx.reply("No persistent controls. Use /bridge to open the bridge flow.", Markup.removeKeyboard());
  });

  bot.command("cancel", async ctx => {
    if (!allowed(ctx.from?.id)) return;
    reset(sessionFor(ctx.from.id));
    await ctx.reply("Cancelled.", Markup.removeKeyboard());
  });

  bot.command("bridge", async ctx => {
    if (!allowed(ctx.from?.id)) return;
    const s = sessionFor(ctx.from.id); reset(s);
    await ctx.reply("Source chain:", chainMenu("from"));
  });

  bot.action(/^from:(base|robinhood|solana)$/, async ctx => {
    if (!allowed(ctx.from?.id)) return;
    const s = sessionFor(ctx.from.id); s.from = ctx.match[1] as ChainKey;
    await ctx.answerCbQuery();
    await ctx.editMessageText(`Source: ${getChains()[s.from].label}\nDestination:`, chainMenu("to"));
  });

  bot.action(/^to:(base|robinhood|solana)$/, async ctx => {
    if (!allowed(ctx.from?.id)) return;
    const s = sessionFor(ctx.from.id), to = ctx.match[1] as ChainKey;
    if (!s.from || s.from === to) { await ctx.answerCbQuery("Pick a different destination"); return; }
    s.to = to;
    await ctx.answerCbQuery();
    await ctx.editMessageText(`${getChains()[s.from].label} → ${getChains()[to].label}\nSelect wallets:`, walletMenu(s));
  });

  bot.action(/^wallet:(.+)$/, async ctx => {
    if (!allowed(ctx.from?.id)) return;
    const s = sessionFor(ctx.from.id), id = ctx.match[1];
    if (id === "all") s.selected = new Set(loadWallets().map(w => w.id));
    else if (id === "none") s.selected.clear();
    else if (id === "done") {
      if (!s.from || !s.to || !s.selected.size) { await ctx.answerCbQuery("Choose at least one wallet"); return; }
      await ctx.answerCbQuery();
      // editMessageText removes the inline keyboard from the prior step.
      await ctx.editMessageText(`${getChains()[s.from].label} → ${getChains()[s.to].label}\n${s.selected.size} wallet(s) selected.\n\nReply with amount in base units for this first pass.`);
      return;
    } else {
      s.selected.has(id) ? s.selected.delete(id) : s.selected.add(id);
    }
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(walletMenu(s).reply_markup);
  });

  bot.action("flow:cancel", async ctx => {
    if (!allowed(ctx.from?.id)) return;
    reset(sessionFor(ctx.from.id));
    await ctx.answerCbQuery("Cancelled");
    await ctx.editMessageText("Cancelled.");
  });

  bot.on("text", async ctx => {
    if (!allowed(ctx.from?.id)) return;
    const s = sessionFor(ctx.from.id);
    if (!s.from || !s.to || !s.selected.size) return;
    const amount = ctx.message.text.trim();
    if (!/^\d+$/.test(amount)) return;

    const intent: BridgeIntent = { walletIds: [...s.selected], from: s.from, to: s.to, input: nativeAsset(s.from), output: nativeAsset(s.to), amount, slippageBps: 50 };
    await ctx.reply("Quoting routes…", Markup.removeKeyboard());
    try {
      const batch = await quoteBatch(intent); s.pendingQuote = batch;
      const summary = batch.quotes.map(q => `• ${q.walletId}: ${q.expectedOutput || "quoted"}${q.feesUsd ? ` · gas ~$${q.feesUsd}` : ""}`).join("\n");
      await ctx.reply(
        `Quote ready\n\n${getChains()[intent.from].label} → ${getChains()[intent.to].label}\n${summary}\n\nExecution is ${process.env.BRIDGE_EXECUTION_ENABLED === "1" ? "ENABLED" : "DISABLED"}.`,
        Markup.inlineKeyboard([[Markup.button.callback("Execute batch", `execute:${batch.id}`), Markup.button.callback("Cancel", "execute:cancel")]])
      );
    } catch (e) {
      reset(s);
      await ctx.reply(`Quote failed: ${e instanceof Error ? e.message : String(e)}`, Markup.removeKeyboard());
    }
  });

  bot.action(/^execute:(.+)$/, async ctx => {
    if (!allowed(ctx.from?.id)) return;
    const s = sessionFor(ctx.from.id), id = ctx.match[1];
    if (id === "cancel") {
      reset(s);
      await ctx.answerCbQuery("Cancelled");
      await ctx.editMessageText("Cancelled.");
      return;
    }
    if (!s.pendingQuote || s.pendingQuote.id !== id) {
      await ctx.answerCbQuery("Quote expired");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => undefined);
      return;
    }
    await ctx.answerCbQuery();
    await ctx.editMessageText("Executing sequentially…");
    try {
      const result = await executeBatch(s.pendingQuote);
      reset(s);
      await ctx.reply(result.map(r => `${r.ok ? "✅" : "❌"} ${r.walletId}${r.error ? `: ${r.error}` : ""}`).join("\n"), Markup.removeKeyboard());
    } catch (e) {
      reset(s);
      await ctx.reply(`Execution stopped: ${e instanceof Error ? e.message : String(e)}`, Markup.removeKeyboard());
    }
  });

  return bot;
}
