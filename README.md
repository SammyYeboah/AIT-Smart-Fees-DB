# AIT SMART FEE KEEPER

School fee records for AIT Smart School Academy. Staff sign in, record payments, and see who has paid, when, how much, and what is still owing. Everyone sees the same live records.

- **Website (this repository, GitHub Pages):** the screens. It holds no records.
- **Database and logins (Supabase):** the records, the accounts, and the rules about who can do what.

The setup takes about 20 minutes and costs nothing. Do the steps in order.

---

## 1. Create the database (Supabase)

1. Go to <https://supabase.com>, sign up, and click **New project**.
2. Name it `AIT Fees`. Choose a strong database password and save it somewhere safe. Pick the region closest to Ghana that is offered.
3. When the project is ready, open **SQL Editor**, click **New query**, paste the whole of `supabase/schema.sql`, and click **Run**. You should see "Success". It is safe to run again later.

## 2. Sign-in settings (Supabase)

1. **Authentication > Sign In / Providers** (called just **Providers** in some versions) **> Email**: keep Email enabled. Turn **Confirm email** off if you do not want to set up an email service (new accounts still need an admin's approval, so this is safe). Set the minimum password length to 8 or more.
2. **Authentication > URL Configuration**:
   - **Site URL**: `https://sammyyeboah.github.io/AIT-Smart-Fees-DB/`
   - Add the same address under **Redirect URLs**. This makes the "Forgot password" link work.

## 3. Connect the website to the database

1. In Supabase open **Project Settings > API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `config.js` in this repository and paste them between the quotes. Save and commit.

The anon key is meant to be public. On its own it cannot read or change anything. Never paste the **service_role** key anywhere.

## 4. Publish the website (GitHub Pages)

1. Upload every file and folder from this project to the repository (**Add file > Upload files**, drag everything in, then **Commit changes**).
2. Open **Settings > Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**.
3. After about a minute the app is live at `https://sammyyeboah.github.io/AIT-Smart-Fees-DB/`.

## 5. Create the first admin (do this before sharing the link)

1. Open the website, tap **Request access**, and sign up with your own name and email.
2. **The very first account becomes the admin automatically.** Everyone after you waits for approval.
3. Go to **Fees** and set the fee for each class.
4. Tell your colleagues to open the link and tap **Request access**. Approve them in **More > People** and choose their role.

If you would rather nobody can request access themselves, switch off **Allow new users to sign up** in the same Supabase Authentication settings and add each person under **Authentication > Users > Add user**. They then appear in the app, waiting for your approval.

---

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything: class fees, custom fees, void payments, archive pupils, approve people, read the activity log |
| **Bursar** | Record payments, add pupils, fix names and classes, view all reports |
| **View only** | See pupils, balances and reports. Cannot change anything |

New sign-ups start with no access until an admin approves them. An admin can disable a person at any time, and that person is locked out immediately. The system always keeps at least one active admin.

## What protects the records

These rules are enforced by the database itself, not just by the buttons in the app:

- Nobody can see or change anything without signing in and being approved.
- A pupil's name can exist only once, whatever the capitalisation or word order ("Mensah Kwame" is "Kwame Mensah").
- Payments are never edited or deleted. An admin can void a payment, with a reason, and it stays visible and struck through.
- Pupils are archived with a reason, never deleted.
- Every payment, correction, fee change, approval and archive is written to the activity log with who did it and when. Nobody, including admins, can edit or delete a log entry through the app.
- People are signed out after 30 minutes without use (change `IDLE_MIN` in `app.js`).

## Keeping it reliable

- **Download a copy regularly.** In **More > Regular exports**, download the payments CSV at the end of each week or term and keep it somewhere safe.
- **Free Supabase projects pause after about a week with no activity.** During term time the app keeps it awake. After a long holiday, open your Supabase dashboard and click **Restore** if it shows as paused. Check Supabase's current plan details, because these limits can change.
- **Paid plans add automatic daily backups.** If the school treats this as its official fee record, consider upgrading and having a second person with access to the Supabase account.
- This repository must be **public** for free GitHub Pages. It contains only the app's code, no records.
- Pupil fee records are personal data. Only approve people who need them, and use **View only** wherever possible.

## Changing things

- **Class names:** edit the `CLASSES` list at the top of `app.js`. The new names appear everywhere automatically.
- **Currency symbol:** search `GH₵` in `app.js` and `supabase/schema.sql`.
- **Logo and colours:** replace the files in `icons/`; colours are at the top of `styles.css`.
- After you edit a file on GitHub, wait a minute and refresh. If an old version appears on a phone, close and reopen the app.

## Install on a phone

- **Android (Chrome):** open the site, tap the three dots, then **Add to Home screen** (or **Install on this phone** in More).
- **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.

The app needs an internet connection to record and read payments.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `config.js` | The two Supabase values you fill in |
| `supabase/schema.sql` | Database tables, roles, rules and the activity log |
| `vendor/supabase.js` | The Supabase browser library (MIT licence), included so the app does not depend on another website |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install-as-app support and the school logo |

## First-run checklist

Do this once after setup, with two phones or two browsers:

1. Sign up as the admin. Set one class fee.
2. Request access from a second account and approve it as **Bursar** in More > People.
3. On the bursar's phone, record a payment for a new pupil.
4. On the admin's phone, confirm the pupil, the payment and the owing balance appear without any special steps.
5. Check the activity log (More) shows both people's actions.
6. Sign in as a **View only** person and confirm there is no Record tab.
