import { z } from 'zod';

export const feedbackFormSchema = z.object({
  overall_verdict: z.enum(['strong_yes', 'maybe', 'no'], {
    required_error: 'Select an overall impression',
  }),
  scores: z
    .array(
      z.object({
        criterion_id: z.string().uuid(),
        score: z.number().int().min(0, 'Rate this criterion (0-5 stars)').max(5),
        note: z.string().max(280).optional(),
      })
    )
    .min(1, 'At least one criterion score is required'),
  positives: z
    .string()
    .trim()
    .min(10, 'Tell us what stood out positively (at least 10 characters)'),
  concerns: z
    .string()
    .trim()
    .min(10, 'Tell us what concerned you (at least 10 characters)'),
  questions: z
    .string()
    .trim()
    .min(10, 'Add at least one question for the next round'),
  duration_minutes: z
    .number({ invalid_type_error: 'Enter the interview duration in minutes' })
    .int()
    .positive()
    .max(480, 'Duration seems too long — check the value'),
  interview_mode: z.enum(['onsite', 'video', 'phone'], {
    required_error: 'Select how the interview was conducted',
  }),
  would_hire_solo: z.boolean({ required_error: 'Answer would you hire them solo' }),
});

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

export const candidateFormSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  current_role: z.string().trim().optional(),
  current_company: z.string().trim().optional(),
  referral_source: z.enum(['linkedin', 'referral', 'website', 'other']),
  current_stage_id: z.string().uuid('Select a stage'),
  interview_date: z.string().optional(),
  interview_time: z.string().optional(),
});

export type CandidateFormValues = z.infer<typeof candidateFormSchema>;
