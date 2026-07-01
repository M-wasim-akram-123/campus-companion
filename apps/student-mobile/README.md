# Campus Companion Student Mobile

Expo app for student document upload.

## Setup

Create `apps/student-mobile/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Install and run from this folder:

```bash
npm install
npm run start
```

## Workflow

- Student logs in with phone/email and temporary password created from the web admin student profile.
- Student uploads or scans each required document.
- Pending and approved documents are locked in the mobile app.
- Rejected documents can be uploaded again.
