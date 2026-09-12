/**
 * Base/quote tokens that show up as the "other side" of nearly every swap.
 * Their own price swings reflect routing/fee noise, not a trader's actual
 * conviction bet — excluded from memecoin-focused candidate discovery and
 * from wallet-detail displays alike.
 */
export const BASE_TOKEN_MINTS = new Set([
  "So11111111111111111111111111111111111111112", // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

/**
 * Same idea as BASE_TOKEN_MINTS, but keyed by symbol — the Alert model only
 * stores `tokenSymbol` (no mint), so mint-based filtering isn't possible
 * there. Symbol matching is inherently a little fuzzier (ticker squatting is
 * common on Solana), but fine for this: a fake "USDC" showing up as a
 * memecoin alert would itself be an edge case worth filtering out too.
 */
export const BASE_TOKEN_SYMBOLS = new Set(["SOL", "USDC", "USDT", "USD1"]);
