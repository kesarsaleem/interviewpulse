/**
 * Single source of truth for route paths used with `router.push` /
 * `router.replace`. Expo Router's `(group)` folders don't appear in the
 * resolved URL, so every route below is written the way it actually
 * resolves — screens should import from here instead of typing raw
 * strings, to avoid drift like `/login` vs `/(auth)/login`.
 */
export const ROUTES = {
  // Auth
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  acceptInvite: '/accept-invite',

  // Admin
  adminDashboard: '/admin/dashboard',
  adminJobs: '/admin/jobs',
  adminCreateJob: '/admin/create-job',
  adminJobDetail: '/admin/job-detail',
  adminCandidates: '/admin/candidates',
  adminAddCandidate: '/admin/add-candidate',
  adminCandidateDetail: '/admin/candidate-detail',
  adminSelectJob: '/admin/select-job',
  adminAssignInterviewer: '/admin/assign-interviewer',
  adminInterviewers: '/admin/interviewers',
  adminAddInterviewer: '/admin/add-interviewer',
  adminInterviews: '/admin/interviews',
  adminCompare: '/admin/compare',
  adminReports: '/admin/reports',
  adminNotifications: '/admin/notifications',
  adminProfile: '/admin/profile',
  adminSettings: '/admin/settings',

  // Interviewer
  interviewerHome: '/interviewer',
  interviewerCandidates: '/interviewer/candidates',
  interviewerAddCandidate: '/interviewer/add-candidate',
  interviewerInterviews: '/interviewer/interviews',
  interviewerUpcoming: '/interviewer/upcoming',
  interviewerFeedbackGiven: '/interviewer/feedback-given',
  interviewerFeedbackDetails: '/interviewer/feedback-details',
  interviewerProfile: '/interviewer/profile',
  interviewerSettings: '/interviewer/settings',

  // Shared dynamic routes
  candidatePanel: '/candidates/[id]/panel',
  giveFeedback: '/feedback/[candidateId]',
} as const;
