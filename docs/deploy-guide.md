# Sythio — Production Deploy Guide

## 1. Environment Variables (Supabase Dashboard > Settings > Edge Functions > Secrets)

```
GROQ_API_KEY=gsk_...           # Groq API key for Whisper transcription
ANTHROPIC_API_KEY=sk-ant-...   # Anthropic API key for Claude processing
```

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are auto-available.

## 2. Deploy Edge Functions

```bash
# Login to Supabase CLI
supabase login

# Link to your production project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy each function
# --no-verify-jwt: required because the functions verify auth themselves via the Authorization header.
# Without this flag, Supabase would reject requests before they reach your function code.
supabase functions deploy process-audio --no-verify-jwt
supabase functions deploy convert-mode --no-verify-jwt

# Set secrets
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Verify deployment
supabase functions list
```

## 3. Run the SQL Migration

Go to Supabase Dashboard > SQL Editor > New query, paste the contents of:
- `supabase/migrations/20260327_full_schema.sql`
- `supabase/migrations/20260327_retry_count.sql`

Run the verification queries at the bottom of each file to confirm.

## 4. Create Storage Bucket

Supabase Dashboard > Storage:
1. Create bucket `audio-files` (private)
2. Add policies as documented in the migration SQL (section 8)

## 5. Test Edge Functions

```bash
# Watch logs in real-time
supabase functions logs process-audio --scroll

# Test with curl (replace YOUR_URL and YOUR_ANON_KEY)
curl -X POST https://YOUR_URL.supabase.co/functions/v1/process-audio \
  -H "Authorization: Bearer USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note_id": "test-id", "audio_path": "user-id/test.m4a", "primary_mode": "summary"}'
```

### Common errors to look for:
- `transcription_failed: Whisper HTTP 401` → OPENAI_API_KEY is wrong
- `LLM error` → ANTHROPIC_API_KEY is wrong or model name changed
- `download_failed` → Audio file doesn't exist in storage or path is wrong

## 6. Timeouts and Limits

- Supabase Edge Functions default timeout: **150 seconds**
- Whisper for a 30min audio: ~60-90 seconds
- Claude processing: ~10-30 seconds
- Total per note: ~70-120 seconds (within limit)

If timeouts occur for very long audios:
- Use `supabase functions deploy process-audio --no-verify-jwt` (already done)
- Consider chunking audio >20min in a future iteration

## 7. EAS Build for TestFlight

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# First build for TestFlight
eas build --platform ios --profile preview

# Submit to TestFlight
eas submit --platform ios --profile preview
```

### Apple credentials needed:
- **Apple ID**: Your developer account email
- **Team ID**: developer.apple.com > Membership > Team ID
- **App Store Connect App ID**: Create at appstoreconnect.apple.com > My Apps > New App
- **Certificates**: EAS handles these automatically (managed credentials)

### App Store Connect checklist:
- [ ] App created with Bundle ID `com.sythio.app`
- [ ] Privacy Policy URL configured
- [ ] Category: Productivity
- [ ] Age Rating: 4+
- [ ] In-App Purchase configured (via RevenueCat)
- [ ] TestFlight internal test group created

## 8. Cost Estimation per Note (Groq + Haiku)

| Component | 5min audio | Cost |
|-----------|-----------|------|
| Groq Whisper | 5 min × $0.00067/min | $0.0034 |
| Claude Haiku (speaker detection) | ~1K input, ~200 output tokens | $0.0013 |
| Claude Haiku (mode generation) | ~2K input, ~400 output tokens | $0.0046 |
| Supabase Storage | ~2MB audio | negligible |
| **Total per note** | | **~$0.0093** |

### Break-even analysis (updated):
- Revenue per Premium user (mobile): $14.99/month → net $10.49 after Apple 30%
- Revenue per Premium user (web/Stripe): $14.99/month → net $14.55 after Stripe ~3%
- Revenue per Enterprise user (mobile): $29.99/month → net $20.99 after Apple 30%
- Revenue per Enterprise user (web/Stripe): $29.99/month → net $29.10 after Stripe ~3%
- Free user (2/day): 60 notes × $0.0093 = $0.56/month (pure burn)
- Premium user avg (3/day): 90 notes × $0.0093 = $0.84/month → **$2.65 profit**
- Premium power user (120min/day): ~$6.70/month → **still profitable at -$3.21 but rare**

### Cost reduction: 86% vs previous (OpenAI + Sonnet)
