# Russ Zone — E-commerce Platform

A full-stack online store built from scratch with **Node.js, Express and SQLite**, with a custom design inspired by Russian constructivist posters. Orders are finalized through Telegram support, with automatic order notifications sent by a Telegram bot.

## Features
- **Two roles:** admin and member, with JWT authentication in httpOnly cookies and bcrypt password hashing
- **Accounts:** sign-up with phone number, login, self-service password change, admin password reset
- **Catalog:** categories managed by the admin; products with multiple images, description, and price
- **Cart & orders:** cart management (admins can also manage any user's cart) and order placement
- **Telegram integration:** a bot notifies the store's chat on every new order
- **Audit log:** a full activity log of who did what, and when
- **Deployment:** ready for Render

## Tech stack
Node.js · Express · SQLite (better-sqlite3) · JWT · bcrypt · Vanilla JS / HTML / CSS · Telegram Bot API

## Getting started
```bash
npm install
cp .env.example .env   # fill in your values
npm start               # http://localhost:3000
```
On first run, an admin account is created from `ADMIN_PHONE` / `ADMIN_PASSWORD`. If no password is set, a random one is generated and printed to the console.

## Environment variables
| Variable | Description |
|---|---|
| `JWT_SECRET` | Long random string. **Required in production.** |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Bot used for new-order notifications |
| `TELEGRAM_SUPPORT_USERNAME` | Support account shown to customers |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | Initial admin account |

## Project structure
```
src/
  server.js        Express app
  db/db.js         schema + migrations
  routes/          auth, products, cart, orders, admin
  middleware/      auth guard
  telegram.js      bot notifications
public/            frontend (HTML/CSS/JS)
```
