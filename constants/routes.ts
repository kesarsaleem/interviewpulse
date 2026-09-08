/**
 * Single source of truth for route paths used with `router.push` /
 * `router.replace`. Expo Router's `(group)` folders don't appear in the
 * resolved URL, so every route below is written the way it actually
 * resolves — screens should import from here instead of typing raw
 * strings, to avoid drift like `/login` vs `/(auth)/login`.
 */
export const ROUTES = {
  login: '/login',
  forgotPassword: '/forgot-password',
  adminDashboard: '/admin/dashboard',
  adminProfile: '/admin/profile',

  interviewerHome: '/interviewer',
  interviewerCandidates: '/interviewer/candidates',
  interviewerAddCandidate: '/interviewer/add-candidate',
} as const;
