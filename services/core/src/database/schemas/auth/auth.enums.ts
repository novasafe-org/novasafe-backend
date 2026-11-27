export enum OtpPurpose {
  Signup = 'signup',
  SignupProof = 'signup_proof',
  GoogleOauth = 'google_oauth',
  AppleOauth = 'apple_oauth',
  PasswordReset = 'password_reset',
  PasswordResetProof = 'password_reset_proof',
  ExtensionPairing = 'extension_pairing',
  /** Step-up when biometric refresh rotation fails or is unavailable. */
  SessionStepUp = 'session_step_up',
  /** Allow-login when no live trusted device can approve It’s me / Not me. */
  DeviceLoginApproval = 'device_login_approval',
  /** Confirm public web account-deletion request (landing /account/deletion). */
  AccountDeletion = 'account_deletion',
}
