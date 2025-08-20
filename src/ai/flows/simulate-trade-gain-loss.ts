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

The user has set the volatility profile to: {{{volatilityProfile}}}. Use the adjustVolatility tool to get the correct volatility factor.

The current price is {{{currentPrice}}}.
The amount being traded is {{{amount}}} BTC.

Simulate a new price. The new price should be based on the current price and the volatility.
A random factor should be included to simulate market unpredictability. The formula for the new price should be:
newPrice = currentPrice * (1 + (Math.random() - 0.5) * volatilityFactor)

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
    const newPrice = input.currentPrice * (1 + (Math.random() - 0.5) * volatilityFactor);
    const gainLoss = (newPrice - input.currentPrice) * input.amount;

    return {
        newPrice,
        gainLoss
    };
  }
);
