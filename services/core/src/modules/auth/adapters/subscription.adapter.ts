/**
 * @deprecated Prefer importing from `modules/subscriptions` — kept for backward compatibility.
 */
export {
  assertCanAddAttachment,
  assertCanCreateAuthenticator,
  assertCanCreateFolder,
  assertCanCreateVaultItem,
  assertCanModifyVault,
  assertCanShareWithRecipients,
  assertCanUploadDocument,
  assertEntitlement,
  getPlanPromptForUser,
  getSubscriptionStateForUser,
  hasEntitlement,
  type PlanPromptInfo,
  type SubscriptionState,
} from '../../subscriptions/services/subscription.service';
