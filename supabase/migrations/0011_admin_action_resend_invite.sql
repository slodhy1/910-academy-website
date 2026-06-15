-- Add 'resend_account_invite' to the admin_actions.action_type CHECK list,
-- so resending the account-creation email can be recorded in the audit log.
-- Idempotent. Apply via scripts/apply-resend-invite-migration.mjs.

alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check check (action_type in (
    'grant_product','revoke_product','update_customer',
    'create_product','update_product','delete_product',
    'update_application','create_lead','update_lead','add_lead_note',
    'resend_account_invite'
  ));
