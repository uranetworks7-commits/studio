'use server';
/**
 * @fileOverview Simulates realistic Bitcoin trade gain/loss scenarios based on simplified virtual market conditions.
 *
 * - simulateTradeGainLoss - Simulates the gain or loss from a Bitcoin trade.
 * - SimulateTradeGainLossInput - The input type for the simulateTradeGainLoss function.
 * - SimulateTradeGainLossOutput - The return type for the simulateTradeGainLoss function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SimulateTradeGainLossInputSchema = z.object({
  amount: z.number().describe('The amount of Bitcoin to trade.'),
  currentPrice: z.number().describe('The current price of Bitcoin.'),
  volatilityProfile: z
    .enum(['low', 'medium', 'high'])
    .default('medium')
    .describe(
      'The volatility profile, influencing the frequency of price swings.'
    ),
});
export type SimulateTradeGainLossInput = z.infer<
  typeof SimulateTradeGainLossInputSchema
>;

const SimulateTradeGainLossOutputSchema = z.object({
  newPrice: z.number().describe('The new simulated price of Bitcoin.'),
  gainLoss: z.number().describe('The gain or loss from the trade.'),
});
export type SimulateTradeGainLossOutput = z.infer<
  typeof SimulateTradeGainLossOutputSchema
>;

export async function simulateTradeGainLoss(
  input: SimulateTradeGainLossInput
): Promise<SimulateTradeGainLossOutput> {
  return simulateTradeGainLossFlow(input);
}

const adjustVolatility = ai.defineTool(
  {
    name: 'adjustVolatility',
    description:
      'Adjusts the intensity of price fluctuations based on the selected volatility profile.',
    inputSchema: z.object({
      volatilityProfile: z
        .enum(['low', 'medium', 'high'])
        .describe('The desired volatility profile: low, medium, or high.'),
    }),
    outputSchema: z.number().describe('The volatility factor to apply.'),
  },
  async input => {
    switch (input.volatilityProfile) {
      case 'low':
        return 0.01; // 1% volatility
      case 'medium':
        return 0.05; // 5% volatility
      case 'high':
        return 0.10; // 10% volatility
      default:
        return 0.05; // Default to medium volatility
    }
  }
);

const simulateTradeGainLossPrompt = ai.definePrompt({
  name: 'simulateTradeGainLossPrompt',
  tools: [adjustVolatility],
  input: {schema: SimulateTradeGainLossInputSchema},
  output: {schema: SimulateTradeGainLossOutputSchema},
  prompt: `You are simulating a Bitcoin trade to create a moderate difficulty experience. Given the current price of Bitcoin at {{{currentPrice}}}, the trade amount of {{{amount}}}, and a volatility profile, determine the new price and calculate the gain or loss.

The user has set the volatility profile to: {{{volatilityProfile}}}. Use the adjustVolatility tool to get the correct volatility factor.

The current price is {{{currentPrice}}}.
The amount being traded is {{{amount}}} BTC.

Simulate a new price with realistic but challenging market behavior. The market should have periods of continuous growth, decline, and stability. Occasionally, introduce a significant price swing (either a heavy gain or a heavy loss, 2-3 times more than usual volatility) to test the user.

The formula for the new price should be:
newPrice = currentPrice * (1 + (Math.random() - 0.45) * volatilityFactor * marketTrend)
- A random "market event" factor (a small chance of a large multiplier on volatility).
- A "market trend" that can be positive (uptrend), negative (downtrend), or neutral.

Calculate the gain or loss based on the change in price. The formula is:
gainLoss = (newPrice - currentPrice) * amount

Provide the output in the format specified.
`,
});

const simulateTradeGainLossFlow = ai.defineFlow(
  {
    name: 'simulateTradeGainLossFlow',
    inputSchema: SimulateTradeGainLossInputSchema,
    outputSchema: SimulateTradeGainLossOutputSchema,
  },
  async input => {
    const volatilityFactor = await adjustVolatility({volatilityProfile: input.volatilityProfile});
    
    // Introduce more complex market simulation
    const randomFactor = Math.random(); // 0 to 1
    let marketTrend; // -1 for downtrend, 1 for uptrend, 0 for stable
    let eventMultiplier = 1;

    // 20% chance of a strong trend
    if (randomFactor < 0.1) {
        marketTrend = 1.5; // Strong uptrend
    } else if (randomFactor < 0.2) {
        marketTrend = -1.5; // Strong downtrend
    } else if (randomFactor < 0.5) {
        marketTrend = 1; // Normal uptrend
    } else if (randomFactor < 0.8) {
        marketTrend = -1; // Normal downtrend
    } else {
        marketTrend = 0.5; // More stable
    }

    // 10% chance of a major market event (big gain/loss)
    if (Math.random() < 0.1) {
        eventMultiplier = 2 + Math.random(); // 2x to 3x volatility
    }
    
    const priceChange = (Math.random() - 0.45) * volatilityFactor * marketTrend * eventMultiplier;
    const newPrice = input.currentPrice * (1 + priceChange);
    const gainLoss = (newPrice - input.currentPrice) * input.amount;

    return {
        newPrice,
        gainLoss
    };
  }
);
