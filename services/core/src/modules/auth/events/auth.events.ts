/** Domain events for future audit / notifications / analytics consumers. */
export const AUTH_EVENTS = {
  USER_REGISTERED: 'auth.user.registered',
  USER_LOGGED_IN: 'auth.user.logged_in',
  USER_LOGGED_OUT: 'auth.user.logged_out',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset_requested',
  SESSION_CREATED: 'auth.session.created',
  OAUTH_COMPLETED: 'auth.oauth.completed',
} as const;
