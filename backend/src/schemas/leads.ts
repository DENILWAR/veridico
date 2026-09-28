import { z } from 'zod';

const opt = (max: number) => z.string().trim().max(max).optional().default('');

export const LeadRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(160),
  role: opt(120),
  email: z.string().trim().toLowerCase().max(200).email(),
  size: z.enum(['', '1-10', '11-50', '51-200', '201-1000', '1000+']).optional().default(''),
  software: opt(200),
  repetitive_process: opt(2000),
  let_veridico_discover: z.boolean().optional().default(false),
  consent: z.literal(true),
  website: z.string().max(200).optional(), // honeypot
  lang: z.enum(['en', 'es', 'de']).optional().default('en'),
  source: z.string().trim().max(60).optional().default('veridico-demo'),
  demo: z.object({
    events: z.number().int().min(0).max(100000),
    executions: z.number().int().min(0).max(10000),
    recurring: z.number().int().min(0).max(100),
    workflow: z.string().max(60).nullable(),
  }).optional(),
});

export type LeadRequest = z.infer<typeof LeadRequestSchema>;
