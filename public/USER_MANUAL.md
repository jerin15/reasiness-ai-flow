# REAHUB - Complete User Manual

Welcome to REAHUB, a comprehensive task and project management system designed for team collaboration across different roles. This manual covers all features available to each role.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Admin Role](#admin-role)
3. [Estimation Team](#estimation-team)
4. [Designer Role](#designer-role)
5. [Operations Team](#operations-team)
6. [Technical Head](#technical-head)
7. [Client Service Executive](#client-service-executive)
8. [Common Features](#common-features)
9. [Mobile Usage](#mobile-usage)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Logging In
1. Navigate to the REAHUB application URL
2. Enter your email and password on the login screen
3. Click **Sign In**
4. You will be redirected to your role-specific dashboard

### Dashboard Overview
- **Header**: Displays company logo, your name, and role
- **Sidebar**: Contains navigation menu (collapsible on mobile)
- **Main Area**: Shows your tasks in a Kanban board or specialized view

### Navigation Basics
- Use the **sidebar menu** to access different features
- Click **hamburger icon (☰)** on mobile to open the sidebar
- Your **unread message count** appears as a badge on the Team Chat button

---

## Admin Role

As an Admin, you have full access to all system features and can manage the entire team.

### Admin Dashboard
Your dashboard has **4 main tabs**:

#### 1. Overview Tab
- **Stats Cards**: See tasks created by you, pending approvals, and production tasks
- **Admin Cost Approval Pipeline**: Tasks waiting for your cost approval
- **Production Pipeline**: Personal admin tasks and production monitoring
- **Tasks I Created**: Table of all tasks you've assigned to team members

#### 2. Pipeline Analytics Tab
- Visual analytics of the estimation pipeline
- Track task flow through different stages
- Identify bottlenecks in the workflow

#### 3. Whiteboard Tab
- **Operations Whiteboard**: Shared task board for quick notes and daily operations tasks
- Create quick tasks for operations team
- Mark tasks as completed

#### 4. Live Map Tab
- **Real-time location tracking** of Operations team members (6 AM - 8 PM)
- View **last known location** even when team members are offline
- See **route pins** that operations staff have planned for the day
- Toggle route pins visibility on/off
- Click on team member to zoom to their location
- Green pulsing marker = Online, Gray marker = Last known location

### Admin Quick Actions

#### Creating Tasks
1. Click **Create Task** in sidebar
2. Choose between:
   - **Operations Task**: For delivery/collection work
   - **General Task**: For all other task types
3. Fill in task details (title, description, priority, due date)
4. Select assignee from dropdown
5. Click **Create Task**

#### Managing Users
1. Click **Manage Team** in sidebar
2. View all team members and their roles
3. Update user roles or information as needed

#### Creating New Users
1. From the View selector dropdown, click **Create New User**
2. Enter email and password
3. Select role for the new user
4. Click **Create**

### Viewing Other Users' Tasks
1. Use the **View** dropdown in the sidebar
2. Select a team member's name
3. Their Kanban board will load with their tasks
4. You can view and edit their tasks as needed

### Reports & Analytics
- **Team Reports**: View performance reports for all team members
- **Estimation Report**: Detailed reports on estimation team performance
- **Analytics**: Company-wide analytics dashboard
- **Brain Games**: Access team brain games and leaderboards

### Communication
- **Team Chat**: Message any team member directly
- **Admin Communication Panel**: Send urgent notifications or voice announcements
- **Team Status**: View who is online/offline in real-time

---

## Estimation Team

The Estimation team handles quotations, supplier quotes, and cost management.

### Estimation Dashboard
Your Kanban board has **9 columns**:

| Column | Purpose |
|--------|---------|
| **RFQ** | New Request for Quotation tasks (type: quotation) |
| **GENERAL** | General tasks (type: general) |
| **Supplier Quotes** | Getting quotes from suppliers |
| **Client Approval** | Waiting for client to approve |
| **Admin Cost Approval** | Sent to admin for cost review |
| **Quotation Bill** | Creating the quotation document |
| **Production** | Tasks in production phase |
| **Pending Invoices** | Waiting for final invoice |
| **Done** | Completed tasks |

### Key Features

#### Quota Tracker
- Located at the top of your dashboard
- Shows your daily/weekly quotation targets
- Track your progress against goals

#### Mockup Tracker
- View tasks waiting for designer mockups
- Track mockup completion status

#### Working with Tasks

**Moving Tasks:**
1. Drag and drop tasks between columns
2. When moving to "Admin Cost Approval", task goes to Admin for review
3. Once approved by admin, task returns to your pipeline

**Adding Supplier Quotes:**
1. Open a task in "Supplier Quotes" column
2. Click **Add Quote**
3. Enter supplier name, quantity, and price
4. Add notes if needed
5. Click **Save**

**Managing Products:**
1. Open any task
2. Go to **Products** tab
3. Add products with quantities and prices
4. Products need admin approval before production

### Task Types Priority
Tasks are sorted automatically:
1. **Quotation** tasks (highest priority)
2. **Invoice** tasks
3. **Production** tasks
4. **General** tasks (lowest priority)

Within each type, **Urgent** priority tasks appear first.

### Sending to Production
1. Complete all required information
2. Ensure products are approved
3. Click **Send to Production** button
4. Task moves to Production column
5. Operations team will receive the task

---

## Designer Role

Designers handle mockups, client presentations, and production files.

### Designer Kanban Board
Your board has **5 columns**:

| Column | Purpose |
|--------|---------|
| **To-Do List** | New assigned tasks |
| **MOCKUP** | Creating mockup designs |
| **With Client** | Mockup sent to client for approval |
| **PRODUCTION** | Approved designs ready for production |
| **Done** | Completed work |

### Working with Mockups

**Receiving Mockup Requests:**
- Tasks appear in your To-Do when estimation marks for mockup
- Each task shows client name and requirements

**Completing Mockups:**
1. Move task to **MOCKUP** column
2. Work on the design
3. When ready, click **Mark Mockup Complete**
4. Move to **With Client** column

**Client Feedback:**
- If client approves: Move to **PRODUCTION**
- If changes needed: Keep in **MOCKUP** for revisions

### Production Column Special Feature
- In PRODUCTION, you'll see **individual product items** from approved tasks
- Each product shows: Product name, quantity, unit
- Mark each product complete when finished
- Click the **checkmark** to mark a product as done

### Send Back Feature
If you need more information:
1. Open the task
2. Click **Send Back to Estimation**
3. Add notes explaining what's needed
4. Task returns to estimation team

---

## Operations Team

Operations handles deliveries, collections, and field work. Your interface is **mobile-optimized** for field use.

### Operations Mobile Dashboard
Designed for smartphone use with large buttons and clear displays.

### Location Tracking
- **Automatic**: Your location is tracked from **6 AM to 8 PM**
- Required for route planning and admin visibility
- Grant location permission when prompted
- Tracking stops automatically after 8 PM

### Route Planning

**Adding Route Pins:**
1. Open the **Map** view
2. **Long-press** on any location on the map
3. Enter a title for the stop
4. Add notes if needed
5. Pin is added to your route

**Managing Route Pins:**
- View all pins in the **Route Planning** panel
- Pins are numbered in order
- Mark pins as **Completed** when done
- Delete pins you no longer need
- **Navigate**: Click to open in Google Maps

**Adding Current Location as Pin:**
1. Click **Add Current Location** button
2. Pin is added where you currently are
3. Useful for logging unexpected stops

### Task Workflow

**Receiving Tasks:**
- Production tasks appear automatically
- Each task shows:
  - Client name
  - Delivery address
  - Products to deliver/collect
  - Special instructions

**Working on Tasks:**
1. Open the task
2. Review delivery instructions
3. Navigate to location
4. Complete the work
5. Mark as **Done**

### Whiteboard Access
- Access via sidebar: **Operations Whiteboard**
- See daily notes and quick tasks from admin
- Add your own quick notes
- Mark items as completed

---

## Technical Head

The Technical Head manages development, testing, and deployment workflows.

### Technical Kanban Board
Your board has **7 columns**:

| Column | Purpose |
|--------|---------|
| **To-Do** | New tasks to start |
| **Developing** | Currently being developed |
| **Testing** | In testing phase |
| **Under Review** | Code review stage |
| **Deployed** | Pushed to production |
| **Trial and Error** | Experimental features |
| **Done** | Completed |

### Features
- **Team Reports**: View all team member performance
- **Estimation Report**: Monitor estimation efficiency
- **Analytics**: Access full analytics dashboard
- **Brain Games**: Team engagement activities
- **View Selector**: View any team member's board

### Team Management
Similar to Admin, you can:
- View all team members' tasks
- Monitor production pipelines
- Access team communication tools

---

## Client Service Executive

Client Service handles new inquiries, follow-ups, and quotation requests.

### Client Service Kanban Board
Your board has **4 columns**:

| Column | Purpose |
|--------|---------|
| **New Calls** | Fresh leads and inquiries |
| **Follow Up** | Clients to follow up with |
| **Quotation** | Request quotation from estimation |
| **Done** | Completed leads |

### Workflow

**New Lead:**
1. Create task in **New Calls**
2. Add client name and details
3. Set priority based on potential

**Following Up:**
1. Move to **Follow Up** when initial contact made
2. Set reminders for follow-up dates
3. Update notes after each contact

**Requesting Quotation:**
1. Move to **Quotation** when client is interested
2. Task becomes visible to Estimation team
3. They'll prepare the quote

**Closing:**
- Mark as Done when lead is converted or closed

---

## Common Features

### Team Chat
Available to all roles for internal communication.

**Starting a Chat:**
1. Click **Team Chat** in sidebar
2. Select a team member
3. Type your message
4. Press Enter or click Send

**Features:**
- Direct messages to any team member
- Group chats available
- Voice messages supported
- File attachments
- Reply to specific messages
- Emoji reactions

### Task Reminders
Set reminders for important tasks:
1. Open any task
2. Click **Set Reminder**
3. Choose date and time
4. You'll be notified at that time

### My Report
Access your personal performance report:
1. Click **My Report** in sidebar
2. View tasks completed
3. See efficiency metrics
4. Download as PDF if needed

### Personal Analytics
Non-admin users can toggle analytics:
1. Click **Show Analytics** in sidebar
2. View your performance metrics
3. Track trends over time

### Due Date Notifications
- Daily reminders for overdue tasks
- Automatic notifications for upcoming due dates
- Snooze or dismiss reminders

### Search
Filter tasks by searching:
- Type in the search box above your Kanban board
- Searches task titles and descriptions
- Results update in real-time

### Task Priority Colors
| Priority | Color |
|----------|-------|
| Urgent | Red |
| High | Orange |
| Medium | Yellow |
| Low | Green |

### Real-Time Updates
- All changes sync automatically
- See live updates when others modify tasks
- No need to refresh the page

---

## Mobile Usage

### Optimized for Mobile
- Responsive design works on all screen sizes
- Touch-friendly buttons and controls
- Swipe gestures for navigation

### Operations Team Mobile
- Full mobile-first design
- Large touch targets
- Optimized for field conditions
- Works offline with sync when connected

### Tips for Mobile
1. Use **hamburger menu** (☰) to access sidebar
2. **Long-press** on map to add route pins
3. Pull down to **refresh** data
4. Notifications work even when app is in background

---

## Troubleshooting

### Common Issues

**Can't see tasks:**
- Check if you're viewing the correct user (admins)
- Ensure you have the right role assigned
- Try refreshing the page

**Location not updating (Operations):**
- Grant location permission in browser/app
- Ensure GPS is enabled on device
- Check if it's within tracking hours (6 AM - 8 PM)

**Can't move tasks:**
- Some columns have restrictions based on role
- Ensure you have permission for that action
- Check if task is locked by another process

**Messages not sending:**
- Check internet connection
- Try refreshing the page
- Ensure recipient exists in system

**Map not loading:**
- Check internet connection
- Mapbox token may need configuration (admin)
- Try refreshing the page

### Getting Help
- Contact your system administrator
- Use Team Chat to reach Technical Head
- Report bugs through the proper channels

---

## Quick Reference Card

| Role | Primary Columns | Key Actions |
|------|-----------------|-------------|
| **Admin** | All pipelines | Approve costs, manage team, create users |
| **Estimation** | RFQ → Done | Get quotes, manage products, send to production |
| **Designer** | To-Do → Done | Create mockups, work with clients |
| **Operations** | Production → Done | Deliveries, route planning, location tracking |
| **Technical Head** | To-Do → Deployed | Development workflow, team oversight |
| **Client Service** | New Calls → Done | Lead management, follow-ups |

---

*Last Updated: December 2024*
*REAHUB Task Management System*
