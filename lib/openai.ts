import OpenAI from 'openai'

// Shared OpenAI client for the analysis passes. Reads OPENAI_API_KEY from the
// environment (.env.local locally; Vercel env in production). Construction is
// lazy at import — keep imports of this module on server-only code paths.
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
