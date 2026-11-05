# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/d46b94fb-98cd-43e3-be33-08aef09ece94

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/d46b94fb-98cd-43e3-be33-08aef09ece94) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/d46b94fb-98cd-43e3-be33-08aef09ece94) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Project documentation

These live in [`docs/`](docs/) and were not linked from anywhere until now.

| Page | What it covers |
|---|---|
| [ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every secret the product reads, what reads it, and what silently degrades when it is missing |
| [DELIVERABILITY.md](docs/DELIVERABILITY.md) | Sender reputation, warmup, placement, and the thresholds behind the scores |
| [BACKGROUND_WORK.md](docs/BACKGROUND_WORK.md) | How long-running jobs survive navigation |
| [AGENT_BATCH_QUEUE.md](docs/AGENT_BATCH_QUEUE.md) | The job queue behind bulk drafting, enrichment and scoring |
| [AGENT_DISCOVERY_EDGE.md](docs/AGENT_DISCOVERY_EDGE.md) | How the agent finds leads |
| [PLAYBOOK_SELECTION.md](docs/PLAYBOOK_SELECTION.md) | Which outreach playbook the agent picks, and why |
| [INBOX_SYNC_SCHEDULE.md](docs/INBOX_SYNC_SCHEDULE.md) | Reply detection and when it runs |
| [SAVED_LEADS_BRIEF.md](docs/SAVED_LEADS_BRIEF.md) | The design brief behind the Saved Leads list |
| [INBOXKIT_INTEGRATION_SCOPE.md](docs/INBOXKIT_INTEGRATION_SCOPE.md) | Proposed in-house domain and mailbox provisioning: costs, guards and phases. Not built |
| [DFY_OFFER_SCOPE.md](docs/DFY_OFFER_SCOPE.md) | The proposed done-for-you offer: rungs, pricing, unit economics and delivery guardrails. Not launched |
