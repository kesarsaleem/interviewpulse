// Interviewers use the same validated candidate form as admins. The route
// remains under the interviewer tree so RouteGuard and Supabase RLS both
// enforce the interviewer's access.
export { default } from '../admin/add-candidate';
