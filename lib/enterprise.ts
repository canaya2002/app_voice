/**
 * Enterprise utilities — auto-join by domain, org checks.
 */

import { supabase } from '@/lib/supabase';

/**
 * Check if a user's email domain matches an active organization.
 * If it does, auto-join the user as a member.
 * Returns the org_id or null.
 */
export async function checkDomainAutoJoin(email: string, userId: string): Promise<string | null> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Skip common personal email domains
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'live.com', 'aol.com'];
  if (personalDomains.includes(domain)) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('id, max_seats, seats_used')
    .eq('domain', domain)
    .eq('active', true)
    .single();

  if (!org) return null;

  // Check if org has seats available
  if (org.seats_used >= org.max_seats) return null;

  // Check if user is already a member
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('org_id', org.id)
    .eq('user_id', userId)
    .single();

  if (existing) return org.id;

  // Add user as member
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      org_id: org.id,
      user_id: userId,
      role: 'member',
      status: 'active',
      joined_at: new Date().toISOString(),
    });

  if (memberError) {
    console.warn('[enterprise] Auto-join failed:', memberError.message);
    return null;
  }

  // Update user profile with org_id and enterprise plan
  await supabase
    .from('profiles')
    .update({ org_id: org.id, plan: 'enterprise' })
    .eq('id', userId);

  return org.id;
}
