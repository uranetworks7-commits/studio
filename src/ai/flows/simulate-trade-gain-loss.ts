
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

const simulateTradeGainLossPrompt = ai.definePrompt({
  name: 'simulateTradeGainLossPrompt',
  input: {schema: SimulateTradeGainLossInputSchema},
  output: {schema: SimulateTradeGainLossOutputSchema},
  prompt: `You are a Bitcoin trade simulator. Your difficulty is "moderate".
Given a trade amount, current price, and volatility, determine the new price and the gain/loss.

Volatility: {{{volatilityProfile}}}
Current Price: {{{currentPrice}}}
Amount (BTC): {{{amount}}}

Simulate a new price. The market should have periods of growth, decline, and stability.
Occasionally, introduce a significant price swing (either a heavy gain or a heavy loss, 2-3 times more than usual volatility).

Calculate the gain or loss: (newPrice - currentPrice) * amount.
Respond in the format specified.
`,
});

const simulateTradeGainLossFlow = ai.defineFlow(
  {
    name: 'simulateTradeGainLossFlow',
    inputSchema: SimulateTradeGainLossInputSchema,
    outputSchema: SimulateTradeGainLossOutputSchema,
  },
  async input => {
    // If there's no API key, bypass the AI call and use a simple fallback.
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const result = await simulateTradeGainLossPrompt(input);
    return result.output!;
  }
);
