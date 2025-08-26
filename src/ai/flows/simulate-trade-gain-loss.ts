'use server';
/**
 * @fileOverview A flow to simulate a high-stakes trade outcome.
 *
 * - simulateTradeGainLoss - A function that determines if a trade is a win or loss based on probability.
 * - SimulateTradeInput - The input type for the simulateTradeGainLoss function.
 * - SimulateTradeOutput - The return type for the simulateTradeGainLoss function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const SimulateTradeInputSchema = z.object({
  betAmount: z.number().positive('Bet amount must be positive.'),
});
export type SimulateTradeInput = z.infer<typeof SimulateTradeInputSchema>;

const SimulateTradeOutputSchema = z.object({
  isWin: z.boolean().describe('Whether the trade was a win or a loss.'),
  payout: z
    .number()
    .describe(
      'The amount won or lost. Positive for a win, negative for a loss.'
    ),
});
export type SimulateTradeOutput = z.infer<typeof SimulateTradeOutputSchema>;

export async function simulateTradeGainLoss(
  input: SimulateTradeInput
): Promise<SimulateTradeOutput> {
  return simulateTradeGainLossFlow(input);
}

const simulateTradeGainLossFlow = ai.defineFlow(
  {
    name: 'simulateTradeGainLossFlow',
    inputSchema: SimulateTradeInputSchema,
    outputSchema: SimulateTradeOutputSchema,
  },
  async ({ betAmount }) => {
    // 30% chance to win, 70% chance to lose
    const isWin = Math.random() < 0.3;

    let payout = 0;
    if (isWin) {
      // Win 1.9x the bet amount (profit)
      payout = betAmount * 1.9;
    } else {
      // Lose the bet amount
      payout = -betAmount;
    }

    return {
      isWin,
      payout,
    };
  }
);
