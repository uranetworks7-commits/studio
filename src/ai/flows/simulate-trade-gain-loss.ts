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
  prompt: `You are simulating a Bitcoin trade. Given the current price of Bitcoin at {{{currentPrice}}}, the trade amount of {{{amount}}}, and a volatility profile, determine the new price and calculate the gain or loss.

Use the adjustVolatility tool to adjust the intensity of price fluctuations based on the selected volatility profile.
Volatility Profile: {{{volatilityProfile}}}

Consider the volatility profile when simulating the price change. Higher volatility should result in more significant price swings.

Calculate the gain or loss based on the change in price relative to the trade amount.

New Price:  Use a bit of randomness to simulate real conditions, but be realistic.
Gain/Loss:  Calculate based on (New Price - Current Price) * Amount.

Output in JSON format.
`,
});

const simulateTradeGainLossFlow = ai.defineFlow(
  {
    name: 'simulateTradeGainLossFlow',
    inputSchema: SimulateTradeGainLossInputSchema,
    outputSchema: SimulateTradeGainLossOutputSchema,
  },
  async input => {
    const {output} = await simulateTradeGainLossPrompt(input);
    return output!;
  }
);
