# Knowledge Center Project Instructions

The following is a compilation of all instructions and requirements provided for fixing and updating the Knowledge Center application:

## 1. Search & Indexing
- The application cannot perform search for data already present in the `863301644` folder. The indexing mechanism needs to recognize and index these existing files properly.

## 2. Authentication & Public Access
- The landing screen to search for articles **must not** require a login.
- The Knowledge Center must function as a public repository for end-users to search and read articles without needing an account.
- The admin user (credentials: `admin` / `admin`) which has its own admin panel is currently unable to log in. This needs to be fixed.

## 3. UI/UX Fixes
- The application logo is being cropped on the UI and must be fixed to display properly without distortion or cutoff.

## 4. Pin Document Feature & Permissions
- The "Pin article" option was missing/removed along with the edit option for non-admin users. This needs to be fixed.
- The "Pin Document" button must be **visible and functional** for **every user type**, including all logged-in users and non-logged-in (guest) users as well.

## 5. Core Directives
- **Critical Instruction:** Make absolutely sure not to break any existing functionality while implementing these fixes.
