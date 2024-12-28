import dotenv from "dotenv"; // zero-dependency module that loads environment variables from a .env
import axios from "axios";
import { DateTime } from "luxon";
import { config } from "./config"; // Configuration parameters for our hunter
import { TokenResponseType, detailedTokenResponseType, dexEndpoint, updatedDetailedTokenType } from "./types";
import { selectTokenBoostAmounts, upsertTokenBoost } from "./db";
import chalk from "chalk";

// Load environment variables from the .env file
dotenv.config();

// Helper function to get data from endpoints
export async function getEndpointData(url: string): Promise<false | any> {
  const tokens = await axios.get<TokenResponseType[]>(url, {
    timeout: config.axios.get_timeout,
  });

  if (!tokens.data) return false;

  return tokens.data;
}

// Start requesting data
let firstRun = true;
async function main() {
  const endpoints = config.dex.endpoints || "";

  // Verify if endpoints are provided
  if (endpoints.length === 0) return;

  // Loop through the endpoints
  await Promise.all(
    endpoints.map(async (endpoint) => {
      const ep: dexEndpoint = endpoint;
      const endpointName = ep.name;
      const endpointUrl = ep.url;
      const endpointPlatform = ep.platform;
      const chains = config.settings.chains_to_track;

      // Handle Dexscreener
      if (endpointPlatform === "dexscreener") {
        // Check latest token boosts on dexscreener
        if (endpointName === "boosts-latest") {
          // Get latest boosts
          const data = await getEndpointData(endpointUrl);

          // Check if data was received
          if (!data) console.log(`🚫 No new token boosts received.`);

          // Add tokens database
          if (data) {
            const tokensData: TokenResponseType[] = data;

            // Loop through tokens
            for (const token of tokensData) {
              // Verify chain
              if (!chains.includes(token.chainId.toLowerCase())) continue;

              // Get the current boost amounts for this token
              const returnedAmounts = await selectTokenBoostAmounts(token.tokenAddress);

              // Check if new information was provided
              if (!returnedAmounts || returnedAmounts.amountTotal !== token.totalAmount) {
                // Get latest token information
                const endpoint = endpoints.find((e) => e.platform === endpointPlatform && e.name === "get-token");
                const getTokenEndpointUrl = endpoint ? endpoint.url : null;
                if (!getTokenEndpointUrl) continue;

                // Request latest token information
                const newTokenData = await getEndpointData(`${getTokenEndpointUrl}${token.tokenAddress}`);
                if (!newTokenData) continue;

                // Extract information from returned data
                const detailedTokensData: detailedTokenResponseType = newTokenData;
                const dexPair = detailedTokensData.pairs.find((pair) => pair.dexId === config.settings.dex_to_track);
                if (!dexPair) continue;
                const tokenName = dexPair.baseToken.name || token.tokenAddress;
                const tokenSymbol = dexPair.baseToken.symbol || "N/A";

                // Create record with latest token information
                const updatedTokenProfile: updatedDetailedTokenType = {
                  url: token.url,
                  chainId: token.chainId,
                  tokenAddress: token.tokenAddress,
                  icon: token.icon,
                  header: token.header,
                  openGraph: token.openGraph,
                  description: token.description,
                  links: token.links,
                  amount: token.amount,
                  totalAmount: token.totalAmount,
                  pairsAvailable: detailedTokensData.pairs.length,
                  dexPair: config.settings.dex_to_track,
                  currentPrice: dexPair.priceUsd ? parseFloat(dexPair.priceUsd) : 0,
                  liquidity: dexPair.liquidity.usd ? dexPair.liquidity.usd : 0,
                  marketCap: dexPair.marketCap ? dexPair.marketCap : 0,
                  pairCreatedAt: dexPair.pairCreatedAt ? dexPair.pairCreatedAt : 0,
                  tokenName: tokenName,
                  tokenSymbol: tokenSymbol,
                };

                // Add or update Record
                const x = await upsertTokenBoost(updatedTokenProfile);

                // Confirm
                if (x && !firstRun) {
                  // Check if Golden Ticker
                  let goldenTicker = "⚡";
                  let goldenTickerColor = chalk.bgGray;
                  if (updatedTokenProfile.totalAmount && updatedTokenProfile.totalAmount > 499) {
                    goldenTicker = "🔥";
                    goldenTickerColor = chalk.bgYellowBright;
                  }

                  // Check socials
                  let socialsIcon = "🔴";
                  let socialsColor = chalk.bgGray;
                  if (updatedTokenProfile.links.length > 0) {
                    socialsIcon = "🟢";
                    socialsColor = chalk.greenBright;
                  }

                  // Check age
                  const timeAgo = updatedTokenProfile.pairCreatedAt ? DateTime.fromMillis(updatedTokenProfile.pairCreatedAt).toRelative() : "N/A";

                  // Perform Righ
                  console.log(`\n✅ ${updatedTokenProfile.amount} boosts added for ${updatedTokenProfile.tokenName} (${updatedTokenProfile.tokenSymbol}).`);
                  console.log(goldenTickerColor(`${goldenTicker} Boost Amount: ${updatedTokenProfile.totalAmount}`));
                  console.log(socialsColor(`${socialsIcon} This token has ${updatedTokenProfile.links.length} socials.`));
                  console.log(
                    `🕝 This token pair was created ${timeAgo} and has ${updatedTokenProfile.pairsAvailable} pairs available including ${updatedTokenProfile.dexPair}`
                  );
                  console.log(`🤑 Current Price: $${updatedTokenProfile.currentPrice}`);
                  console.log(`📦 Current Mkt Cap: $${updatedTokenProfile.marketCap}`);
                  console.log(`💦 Current Liquidity: $${updatedTokenProfile.liquidity}`);
                  console.log(`👀 View on Dex https://dexscreener.com/${updatedTokenProfile.chainId}/${updatedTokenProfile.tokenAddress}.`);
                  console.log(`🟣 Buy via Nova https://t.me/TradeonNovaBot?start=r-digitalbenjamins-${updatedTokenProfile.tokenAddress}.`);
                }
              }
            }
          }
        }
      }
    })
  );

  firstRun = false;
  setTimeout(main, config.settings.hunter_timeout); // Call main again after 5 seconds
}

main().catch((err) => {
  console.error(err);
});