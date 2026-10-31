AIT SMART FEE KEEPER

A Centralised School Fee Management System for AIT Smart School Academy

""Live Website" (https://img.shields.io/badge/Live-Website-blue?style=for-the-badge)" (https://aitsmartfees.netlify.app)

AIT Smart Fee Keeper is a web-based school fee management system designed to help AIT Smart School Academy manage student fee records, track payments, monitor outstanding balances, and improve financial record-keeping.

The system provides authorised staff with a shared platform where student and payment information can be accessed and managed according to their assigned permissions.

Live Application: https://aitsmartfees.netlify.app

GitHub Repository: https://github.com/SammyYeboah/AIT-Smart-Fees-DB

---

📌 Table of Contents

- "Overview" (#-overview)
- "Key Features" (#-key-features)
- "Technology Stack" (#-technology-stack)
- "How the System Works" (#-how-the-system-works)
- "User Roles" (#-user-roles)
- "Database Setup" (#-database-setup)
- "Application Configuration" (#-application-configuration)
- "Deployment" (#-deployment)
- "Project Structure" (#-project-structure)
- "Security" (#-security)
- "Backup and Maintenance" (#-backup-and-maintenance)
- "Accessing the Application" (#-accessing-the-application)

---

📖 Overview

AIT Smart Fee Keeper replaces fragmented manual fee-recording processes with a centralised digital system.

The application enables authorised school staff to:

- Register and manage student information.
- Record student fee payments.
- Track payment history.
- Monitor outstanding fee balances.
- Configure fees for different classes.
- Generate and export payment reports.
- Manage staff accounts and permissions.
- Review important system activities.

All authorised users work with the same central database, ensuring that changes made by one user are reflected for other authorised users.

✨ Key Features

👨‍🎓 Student Management

- Add and manage student records.
- Maintain student names and class information.
- View individual student payment status.
- Track outstanding balances.

💰 Payment Management

- Record student fee payments.
- View payment histories.
- Monitor amounts paid and outstanding.
- Maintain transaction records.

🏫 Class Fee Management

- Configure fees for different classes.
- Track payments against applicable class fees.
- Monitor outstanding balances.

📊 Reports and Analytics

- View payment summaries.
- Monitor outstanding fees.
- Generate financial reports.
- Export records in CSV format.

👥 Staff Management

- Register staff accounts.
- Approve or disable user accounts.
- Assign access roles.
- Control access to system functions.

📝 Activity Logs

- Record important system activities.
- Track actions performed by authorised users.
- Support accountability and record monitoring.

---

🛠 Technology Stack

Technology| Purpose
HTML5| Application structure
CSS3| User interface and styling
JavaScript| Application functionality
Supabase| Database and authentication
Netlify| Website hosting
GitHub| Source code management

⚙️ How the System Works

The application consists of two major components:

1. Frontend

The frontend is the website users interact with through their browsers. It provides the login page, dashboard, student management, payment recording and reporting interfaces.

2. Backend

Supabase provides the backend infrastructure, including:

- User authentication.
- PostgreSQL database.
- Data storage.
- Database access policies.
- User-related information.

System Workflow

1. A staff member opens the application.
2. The staff member signs in using their registered credentials.
3. Supabase authenticates the account.
4. The application checks the user's access permissions.
5. The authorised user accesses the available dashboard features.
6. Student and payment information is retrieved from or saved to the shared database.
7. Updated information becomes available to other authorised users.

---

👤 User Roles

The application supports different levels of access.

Role| Description
Admin| Manages users, student records, class fees, payments and reports.
Bursar| Handles student payments, student information and financial records.
View Only| Views student records, payment information and reports without making changes.

Account Registration and Approval

The initial administrator account is intended to be established through the first-user registration process configured in the database.

Subsequent accounts are subject to administrator approval.

Administrators can assign appropriate roles and manage access to the application.

---

🗄 Database Setup

The application uses Supabase PostgreSQL as its central database.

Database Tables

The database includes the following main tables:

Table| Purpose
"students"| Stores student information.
"payments"| Stores student payment transactions.
"class_fees"| Stores fee configurations for classes.
"profiles"| Stores user profile and role information.
"audit_log"| Stores records of important system activities.

Creating the Database

1. Create an account at "Supabase" (https://supabase.com).
2. Create a new project.
3. Open the project's SQL Editor.
4. Open "supabase/schema.sql" from this repository.
5. Copy the complete SQL script.
6. Paste it into the Supabase SQL Editor.
7. Execute the script.
8. Confirm that the database tables have been created successfully.

---

🔑 Application Configuration

The application connects to Supabase through "config.js".

To configure the connection:

1. Open your Supabase project.
2. Navigate to Project Settings → API.
3. Copy your Project URL.
4. Copy your publishable key or legacy anon public key.
5. Open "config.js" in the project.
6. Enter the appropriate values.

Example:

window.AIT_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLIC_KEY"
};

Important: Never expose your Supabase "service_role" key or secret key in frontend code.

Database access must be protected through properly configured Row Level Security (RLS) policies.

Authentication Configuration

In the Supabase dashboard:

1. Open Authentication.
2. Enable Email authentication.
3. Configure email confirmation according to your requirements.
4. Set the minimum password length to at least eight characters.
5. Open URL Configuration.

Set the Site URL to:

"https://aitsmartfees.netlify.app"

Add the application URL to the permitted Redirect URLs.

---

🚀 Deployment

AIT Smart Fee Keeper is hosted on Netlify.

Live Website: https://aitsmartfees.netlify.app

The source code is maintained in the GitHub repository.

Deployment Workflow

1. Make the required changes to the source code.
2. Commit and push the changes to GitHub.
3. Netlify detects changes in the connected repository.
4. Netlify deploys the updated application.
5. The updated version becomes available through the live website.

---

📁 Project Structure

AIT-Smart-Fees-DB/
│
├── index.html
├── styles.css
├── app.js
├── config.js
├── manifest.webmanifest
├── sw.js
│
├── vendor/
│   └── supabase.js
│
├── supabase/
│   └── schema.sql
│
├── icons/
│
└── README.md

File/Folder| Description
"index.html"| Main application page.
"styles.css"| Application styling.
"app.js"| Main JavaScript functionality.
"config.js"| Supabase connection configuration.
"manifest.webmanifest"| Progressive Web App configuration.
"sw.js"| Service worker.
"vendor/"| Supabase browser library.
"supabase/"| Database schema and SQL scripts.
"icons/"| Application icons.
"README.md"| Project documentation.

---

🔐 Security

The system handles student information and financial records, so security is important.

Recommended security practices include:

- Use individual staff accounts.
- Assign permissions according to job responsibilities.
- Protect user passwords.
- Enable and verify Row Level Security policies.
- Never expose secret backend credentials.
- Disable accounts when access is no longer required.
- Regularly review user permissions and activity logs.
- Avoid sharing student financial records with unauthorised persons.

Note: The security of the application depends on the actual database policies and access controls configured in Supabase. These should be tested before official deployment.

---

💾 Backup and Maintenance

To protect important school records:

- Export payment records regularly.
- Store exported reports in a secure location.
- Review Supabase database backup options.
- Keep administrative credentials secure.
- Test changes before deploying them to the live application.
- Review database changes before executing SQL scripts.

CSV exports are useful for record-keeping but do not replace complete database backups.

---

📱 Accessing the Application

The application can be accessed through modern desktop and mobile browsers.

Android

1. Open the website in Google Chrome.
2. Tap the three-dot menu.
3. Select Add to Home screen or Install app, if available.

iPhone

1. Open the website in Safari.
2. Tap the Share icon.
3. Select Add to Home Screen.

The application can then be launched from the device's home screen.

---

📌 Project Information

Item| Details
Project Name| AIT Smart Fee Keeper
Organisation| AIT Smart School Academy
Project Type| Web-Based School Fee Management System
Currency| Ghana Cedi (GH₵)
Frontend| HTML, CSS and JavaScript
Backend| Supabase
Hosting| Netlify
Repository| SammyYeboah/AIT-Smart-Fees-DB
Status| Deployed

---

Developed to support efficient, organised and accountable school fee management at AIT Smart School Academy.

CREDITS:
Claude AI by Anthropic
OpenAI ChatGPT

SITE: https://aitsmartfees.netlify.app