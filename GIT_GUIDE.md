# 🚀 Magic Knowledge Center: Git & VM Deployment Guide

Welcome! This guide explains **how Git works** in plain, easy-to-understand terms, and provides a step-by-step workflow to develop locally and deploy/update on your office Windows VM.

---

## 🧭 1. Understanding Git in 60 Seconds

Think of **Git** as a high-speed **time machine and synchronization engine** for your project files:

```
+------------------------+      git push      +------------------------+      git pull      +------------------------+
|   Your Laptop / PC     |  --------------->  |  Central Cloud Repo    |  --------------->  |     Office VM          |
| (Local Development)    |                    | (GitHub / Azure/GitLab)|                    | (Production Server)    |
+------------------------+                    +------------------------+                    +------------------------+
```

### The 4 Key Git Terms:
1. **Working Directory**: The actual files you see and edit on your computer.
2. **Commit (`git commit`)**: A snapshot / save point of your code changes with a note explaining what you changed (e.g. *"Fixed Add User button"*).
3. **Push (`git push`)**: Uploading your saved commits from your laptop up to the central cloud repository.
4. **Pull (`git pull`)**: Downloading the latest changes from the cloud repository onto your Office VM.

---

## ⚡ 2. One-Click Daily Workflow (Folder: `git_tools/` | Branch: `Dev-Abhishek`)

All Git batch scripts are organized in the **`git_tools/`** folder and include automatic Git path detection (they work even if Git is not in your system PATH):

* **Repository**: `https://github.com/abhishekpawar2324/Knowledge-Center-MSE.git`
* **Target Branch**: **`Dev-Abhishek`**

### Inside `git_tools/`:
* **`1_commit_and_push.bat`**: 1-Click Commit + Push to `Dev-Abhishek` on GitHub.
* **`2_commit.bat`**: Stages and commits changes locally.
* **`3_push.bat`**: Uploads your local commits to GitHub.
* **`4_pull_updates.bat`**: Pulls the latest changes from GitHub (for use on your VM or laptop).
* **`5_check_status.bat`**: Checks which files have been modified and confirms the active branch.

---

## ⌨️ 3. Standard Git Command Cheat Sheet (For Reference)

If you ever want to run Git commands directly in the terminal:

| Action | Command Line | What it does |
| :--- | :--- | :--- |
| **Check modified files** | `git status` | Shows which files have been changed or added. |
| **Stage all changes** | `git add .` | Prepares all changed files to be saved. |
| **Save a snapshot** | `git commit -m "Your note here"` | Records a permanent save point with your message. |
| **Send code to cloud** | `git push origin main` | Uploads your commits to the remote branch. |
| **Download latest code** | `git pull origin main` | Downloads and merges changes from remote. |
| **View history** | `git log --oneline -n 5` | Shows the last 5 commit save points. |

---

## 📦 4. First-Time Migration to Office VM

Follow these simple steps when your IT team provisions your new VM:

### Step 1: Copy or Clone the Code to the VM
* **Method A (Via Git - Recommended)**:
  ```cmd
  git clone <YOUR-REPO-URL> "C:\KnowledgeCenter"
  ```
* **Method B (Offline Folder Copy)**:
  1. On your laptop, double-click **`bundle_offline_packages.bat`** (downloads all dependencies into `vendor\wheels`).
  2. Copy the `Knowledge-Center-MSE1` folder directly to the VM via Shared Folder or Remote Desktop copy-paste.

### Step 2: Choose How to Run on the VM

#### 🌟 Option A: Run 24/7 as a Windows Service (Best for Production)
1. Right-click **`install_service.bat`** and select **"Run as administrator"**.
2. Done! The service is registered as `MagicKnowledgeCenter`.
3. It will run in the background **24 hours a day, 7 days a week**, even when nobody is logged into Remote Desktop (RDP).
4. Auto-starts on VM restart/reboot.

#### 🛠️ Option B: Run in Console Mode (For Testing / Debugging)
1. Double-click **`deploy_vm.bat`**.
2. It automatically sets up `.venv`, installs offline wheels in 2 seconds, and launches the portal at `http://localhost:8000`.

---

## 🌐 5. Accessing the Knowledge Center

Once running on the VM:
* **From VM itself**: `http://localhost:8000`
* **From other office computers**: `http://<VM-IP-ADDRESS>:8000` (or `http://<HOSTNAME>:8000`)
* **Default Super Admin**: `superadmin` / `admin@123`

---

## ❓ Frequently Asked Questions

**Q: If the VM reboots over the weekend, do I need to manually start the server?**
> **No.** If you installed it with `install_service.bat`, Windows will automatically launch the Knowledge Center in the background upon reboot.

**Q: Do I need Node.js or npm on the VM?**
> **No.** The Python FastAPI backend serves both the REST API and the complete web frontend UI directly on port 8000.

**Q: Where is the database and uploaded documents stored?**
> All master documents are safely stored in `uploads/` (`uploads/xpi`, `uploads/xpa`, `uploads/cloud_native`) and metadata is indexed in `kb_system.db`.
