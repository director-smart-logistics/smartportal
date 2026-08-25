# Smart Portal

A full-stack web application built with React, Express, and Vite, featuring a modern UI with Shadcn/ui and Tailwind CSS.

## 🚀 Tech Stack

- **Frontend:**
  - React 18
  - TypeScript
  - Vite
  - Tailwind CSS
  - Shadcn/ui (Radix UI)
  - React Query (@tanstack/react-query)
  - React Router DOM
  - React Hook Form + Zod

- **Backend:**
  - Node.js
  - Express
  - Drizzle ORM
  - PostgreSQL (via `pg`)

- **Shared:**
  - Zod schemas for type safety across client and server

## 🛠️ Setup & Installation

1.  **Prerequisites:**
    - Node.js (v20+ recommended)
    - **pnpm** (Required package manager)

2.  **Install Dependencies:**
    ```bash
    pnpm install
    ```

3.  **Environment Variables:**
    - Ensure you have a `.env` file in the root directory.
    - Required variables typically include database connection strings and API keys.

4.  **Run Development Server:**
    ```bash
    pnpm run dev
    ```
    This starts the **combined development server** (Frontend + Backend) at `http://localhost:8080`.
    - **Frontend**: Served by Vite.
    - **Backend**: Express server mounted as Vite middleware.
    - **API**: Accessible at `http://localhost:8080/api`.

## 📂 Project Structure

- **`client/`**: Frontend application code.
  - `components/`: Reusable UI components.
    - `ui/`: Shadcn/ui primitive components.
  - `pages/`: Application route pages.
  - `hooks/`: Custom React hooks.
  - `lib/`: Utility functions and configurations.
  - `api/`: API integration logic.

- **`server/`**: Backend application code.
  - `routes.ts`: API route definitions.
  - `storage.ts`: Database storage interface and implementation.

- **`shared/`**: Shared code between client and server.
  - `schema.ts`: Drizzle ORM schema and Zod types.

## 📜 Available Scripts

- `pnpm run dev`: Start the development server.
- `pnpm run build`: Build both client and server for production.
- `pnpm run build:client`: Build only the client.
- `pnpm run build:server`: Build only the server.
- `pnpm start`: Start the production server.
- `pnpm test`: Run tests using Vitest.
- `pnpm run typecheck`: Run TypeScript type checking.
- `pnpm run format.fix`: Format code using Prettier.
