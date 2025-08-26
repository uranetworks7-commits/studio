'use server';

import {genkit} from '@genkit-ai/ai';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
});
