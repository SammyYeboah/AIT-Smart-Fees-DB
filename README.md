# AIT SMART FEE KEEPER

**A Centralised School Fee Management System for AIT Smart School Academy**

[![Live Website](https://img.shields.io/badge/Live-Website-blue?style=for-the-badge)](https://aitsmartfees.netlify.app)

AIT Smart Fee Keeper is a web-based school fee management system designed to help AIT Smart School Academy manage student fee records, track payments, monitor outstanding balances, and improve financial record-keeping.

The system provides authorised school staff with a shared platform where student and payment information can be accessed and managed according to their assigned permissions.

**Live Application:** https://aitsmartfees.netlify.app

**GitHub Repository:** https://github.com/SammyYeboah/AIT-Smart-Fees-DB

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [How the System Works](#-how-the-system-works)
- [User Roles](#-user-roles)
- [Database Setup](#-database-setup)
- [Application Configuration](#-application-configuration)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [Security](#-security)
- [Backup and Maintenance](#-backup-and-maintenance)
- [Accessing the Application](#-accessing-the-application)

---

## 📖 Overview

AIT Smart Fee Keeper replaces fragmented manual fee-recording processes with a centralised digital system.

The application enables authorised school staff to:

- Register and manage student records.
- Record school fee payments.
- View payment histories.
- Monitor outstanding fee balances.
- Configure fees for different classes.
- Generate and export payment reports.
- Manage staff accounts and permissions.
- Review important system activities.

All authorised users work with the same central database, ensuring that changes made by one user are available to other authorised users.

---

## ✨ Key Features

### 👨‍🎓 Student Management

- Add and manage student records.
- Maintain student names and class information.
- View individual student payment status.
- Track outstanding balances.

### 💰 Payment Management

- Record student fee payments.
- View payment histories.
- Monitor amounts paid and outstanding.
- Maintain transaction records.

### 🏫 Class Fee Management

- Configure fees for different classes.
- Track payments against applicable class fees.
- Monitor outstanding balances.

### 📊 Reports and Analytics

- View payment summaries.
- Monitor outstanding fees.
- Generate financial reports.
- Export records in CSV format.

### 👥 Staff Management

- Register staff accounts.
- Approve or disable user accounts.
- Assign access roles.
- Control access to system functions.

### 📝 Activity Logs

- Record important system activities.
- Track actions performed by authorised users.
- Support accountability and record monitoring.

---

## 🛠 Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | User interface and styling |
| JavaScript | Application functionality |
| Supabase | Database and authentication |
| Netlify | Website hosting |
| GitHub | Source code management |

---

## ⚙️ How the System Works

The application consists of two major components:

### 1. Frontend

The frontend is the website users interact with through their browsers. It provides the login page, dashboard, student management, payment recording and reporting interfaces.

### 2. Backend

Supabase provides the backend infrastructure, including:

- User authentication.
- PostgreSQL database.
- Data storage.
- Database access policies.
- User-related information.

### System Workflow

1. A staff member opens the application.
2. The staff member signs in using registered credentials.
3. Supabase authenticates the account.
4. The application checks the user's access permissions.
5. The authorised user accesses the available dashboard features.
6. Student and payment information is retrieved from or saved to the shared database.
7. Updated information becomes available to other authorised users.

---

## 👤 User Roles

The application supports different levels of access.

| Role | Description |
|---|---|
| **Admin** | Manages users, student records, class fees, payments and reports. |
| **Bursar** | Handles student payments, student information and financial records. |
| **View Only** | Views student records, payment information and reports without making changes. |

### Account Registration and Approval

The initial administrator account is intended to be established through the first-user registration process configured in the database.

Subsequent accounts are subject to administrator approval.

Administrators can assign appropriate roles and manage access to the application.

---

## 🗄 Database Setup

The application uses **Supabase PostgreSQL** as its central database.

### Database Tables

The database includes the following main tables:

| Table | Purpose |
|---|---|
| `students` | Stores student information. |
| `payments` | Stores student payment transactions. |
| `class_fees` | Stores fee configurations for classes. |
| `profiles` | Stores user profile and role information. |
| `audit_log` | Stores records of important system activities. |

### Creating the Database

1. Create an account at [Supabase](https://supabase.com).
2. Create a new project.
3. Open the project's SQL Editor.
4. Open `supabase/schema.sql` from this repository.
5. Copy the complete SQL script.
6. Paste it into the Supabase SQL Editor.
7. Execute the script.
8. Confirm that the database tables have been created successfully.

---

## 🔑 Application Configuration

The application connects to Supabase through `config.js`.

### Connecting to Supabase

1. Open your Supabase project.
2. Navigate to **Project Settings → API**.
3. Copy your Project URL.
4. Copy your publishable key or legacy anon public key.
5. Open `config.js` in the project.
6. Enter the appropriate values.

Example:

```javascript
window.AIT_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLIC_KEY"
};



**Note:** This is documentation, not a verification of every feature. We should compare the role permissions and registration workflow against the actual application before presenting them as confirmed functionality.



CREDITS:
Claude AI by Anthropic
OpenAI ChatGPT

SITE: https://aitsmartfees.netlify.app